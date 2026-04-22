import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import db from '../db/index.js';
import { location } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

const OPEN_WEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const PARTIAL_WEATHER_CACHE_TTL_MS = 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 5_000;

type WeatherResponseItem = {
	locationId: string;
	locationName: string;
	temperature: number;
	condition: string;
	high: number;
	low: number;
	humidity: number;
};

type WeatherRouteResponse = {
	data: WeatherResponseItem[];
	cachedAt: string | null;
};

type WeatherCacheEntry = {
	response: WeatherRouteResponse;
	expiresAt: number;
};

type OpenWeatherResponse = {
	weather?: Array<{
		description?: string;
	}>;
	main?: {
		temp?: number;
		temp_max?: number;
		temp_min?: number;
		humidity?: number;
	};
};

type ValidOpenWeatherResponse = OpenWeatherResponse & {
	main: {
		temp: number;
		temp_max: number;
		temp_min: number;
		humidity: number;
	};
};

const weatherQuerySchema = z.object({
	organizationId: z.string().optional(),
});

/**
 * Process-local TTL cache for weather snapshots, including partial snapshots.
 *
 * This reduces duplicate provider calls on a single replica, but the cache
 * resets on restart and is not shared across horizontally scaled instances.
 */
const weatherCache = new Map<string, WeatherCacheEntry>();

/**
 * Clears the in-memory weather cache.
 *
 * @returns Nothing
 */
export function resetWeatherCache(): void {
	weatherCache.clear();
}

/**
 * Returns the standardized empty weather payload used for graceful degradation.
 *
 * @returns Empty weather response payload
 */
function buildEmptyWeatherResponse(): WeatherRouteResponse {
	return {
		data: [],
		cachedAt: null,
	};
}

/**
 * Resolves a valid cache entry when it is still fresh.
 *
 * @param organizationId - Organization identifier used as cache key
 * @returns Cached payload when valid, otherwise null
 */
function getFreshWeatherCache(organizationId: string): WeatherRouteResponse | null {
	const cachedEntry = weatherCache.get(organizationId);
	if (!cachedEntry) {
		return null;
	}

	if (cachedEntry.expiresAt <= Date.now()) {
		weatherCache.delete(organizationId);
		return null;
	}

	return cachedEntry.response;
}

/**
 * Stores a weather payload in the cache.
 *
 * @param organizationId - Organization identifier used as cache key
 * @param response - Weather payload to cache
 * @param ttlMs - Cache lifetime for the payload
 * @returns Nothing
 */
function storeWeatherCache(
	organizationId: string,
	response: WeatherRouteResponse,
	ttlMs: number = WEATHER_CACHE_TTL_MS,
): void {
	weatherCache.set(organizationId, {
		response,
		expiresAt: Date.now() + ttlMs,
	});
}

/**
 * Stores the latest successful weather payload for an organization.
 *
 * @param organizationId - Organization identifier used as cache key
 * @param data - Weather rows to cache
 * @returns Cached payload shape
 */
function setWeatherCache(
	organizationId: string,
	data: WeatherResponseItem[],
): WeatherRouteResponse {
	const cachedAt = new Date().toISOString();
	const response = {
		data,
		cachedAt,
	};
	storeWeatherCache(organizationId, response);
	return response;
}

/**
 * Stores a partial or empty weather payload in the cache while preserving the
 * public `cachedAt: null` contract for incomplete responses. Partial snapshots
 * use a short TTL so the API avoids tight retry loops without pinning missing
 * locations or complete provider failures for the full weather cache window.
 *
 * @param organizationId - Organization identifier used as cache key
 * @param data - Partial weather rows to cache
 * @returns Cached partial response
 */
function setPartialWeatherCache(
	organizationId: string,
	data: WeatherResponseItem[],
): WeatherRouteResponse {
	const response = {
		data,
		cachedAt: null,
	};
	storeWeatherCache(organizationId, response, PARTIAL_WEATHER_CACHE_TTL_MS);
	return response;
}

/**
 * Validates that the provider returned the required numeric weather fields.
 *
 * @param payload - Provider payload to inspect
 * @returns True when the payload includes the required fields
 */
function hasValidWeatherPayload(payload: OpenWeatherResponse): payload is ValidOpenWeatherResponse {
	return (
		typeof payload.main?.temp === 'number' &&
		typeof payload.main?.temp_max === 'number' &&
		typeof payload.main?.temp_min === 'number' &&
		typeof payload.main?.humidity === 'number'
	);
}

/**
 * Fetches current weather for a single location.
 *
 * @param args - Location coordinates and display info
 * @returns Weather row for the location
 * @throws Error when the provider request fails or returns an invalid payload
 */
async function fetchLocationWeather(args: {
	locationId: string;
	locationName: string;
	latitude: number;
	longitude: number;
	apiKey: string;
}): Promise<WeatherResponseItem> {
	const url = new URL(OPEN_WEATHER_BASE_URL);
	url.searchParams.set('lat', String(args.latitude));
	url.searchParams.set('lon', String(args.longitude));
	url.searchParams.set('appid', args.apiKey);
	url.searchParams.set('units', 'metric');
	url.searchParams.set('lang', 'es');

	const response = await fetch(url, {
		signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Weather provider request failed with status ${response.status}`);
	}

	const payload = (await response.json()) as OpenWeatherResponse;
	if (!hasValidWeatherPayload(payload)) {
		throw new Error('Weather provider returned an invalid payload');
	}
	const main = payload.main;

	return {
		locationId: args.locationId,
		locationName: args.locationName,
		temperature: main.temp,
		condition: payload.weather?.[0]?.description ?? '',
		high: main.temp_max,
		low: main.temp_min,
		humidity: main.humidity,
	};
}

/**
 * Fetches weather for one location while isolating provider failures.
 *
 * @param args - Location coordinates and provider config
 * @returns Weather row when successful, otherwise null
 */
async function fetchLocationWeatherSafely(args: {
	locationId: string;
	locationName: string;
	latitude: number;
	longitude: number;
	apiKey: string;
}): Promise<WeatherResponseItem | null> {
	try {
		return await fetchLocationWeather(args);
	} catch (error) {
		console.error('[weather] Failed to fetch location weather', {
			locationId: args.locationId,
			error,
		});
		return null;
	}
}

/**
 * Weather routes for organization-scoped location forecasts.
 */
export const weatherRoutes = new Elysia({ prefix: '/weather' })
	.use(combinedAuthPlugin)
	/**
	 * Lists current weather for all organization locations with coordinates.
	 *
	 * @route GET /weather
	 * @returns Weather rows and cache timestamp, or an empty payload when the provider fails
	 */
	.get('/', async ({
		query,
		authType,
		session,
		sessionOrganizationIds,
		set,
		apiKeyOrganizationId,
		apiKeyOrganizationIds,
	}) => {
		const organizationId = resolveOrganizationId({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			requestedOrganizationId: query.organizationId ?? null,
		});

		if (!organizationId) {
			const status = authType === 'apiKey' ? 403 : 400;
			set.status = status;
			return buildErrorResponse('Organization is required or not permitted', status);
		}

		const cachedResponse = getFreshWeatherCache(organizationId);
		if (cachedResponse) {
			return cachedResponse;
		}

		const apiKey = process.env.OPENWEATHERMAP_API_KEY;
		if (!apiKey) {
			return setPartialWeatherCache(organizationId, []);
		}

		try {
			const locations = await db
				.select({
					id: location.id,
					name: location.name,
					latitude: location.latitude,
					longitude: location.longitude,
				})
				.from(location)
				.where(eq(location.organizationId, organizationId))
				.orderBy(location.name);

			const locationsWithCoordinates = locations.filter(
				(record): record is {
					id: string;
					name: string;
					latitude: number;
					longitude: number;
				} => typeof record.latitude === 'number' && typeof record.longitude === 'number',
			);

			if (locationsWithCoordinates.length === 0) {
				return setWeatherCache(organizationId, []);
			}

			const weatherResults = await Promise.all(
				locationsWithCoordinates.map((record) =>
					fetchLocationWeatherSafely({
						locationId: record.id,
						locationName: record.name,
						latitude: record.latitude,
						longitude: record.longitude,
						apiKey,
					}),
				),
			);
			const weatherRows = weatherResults.filter(
				(record): record is WeatherResponseItem => record !== null,
			);
			const hadPartialFailures = weatherRows.length !== locationsWithCoordinates.length;

			if (weatherRows.length === 0) {
				return setPartialWeatherCache(organizationId, []);
			}

			if (hadPartialFailures) {
				return setPartialWeatherCache(organizationId, weatherRows);
			}

			return setWeatherCache(organizationId, weatherRows);
		} catch (error) {
			console.error('[weather] Failed to build weather summary', { organizationId, error });
			// Keep unexpected internal failures uncached so recovery is immediate
			// once the underlying DB/query issue clears.
			return buildEmptyWeatherResponse();
		}
	}, {
		query: weatherQuerySchema,
	});
