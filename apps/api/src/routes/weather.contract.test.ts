import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
} from '../test-utils/contract-helpers.js';

type MockWeatherApiResponse = {
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

const OPEN_WEATHER_PATH = '/data/2.5/weather';

/**
 * Builds a mocked OpenWeatherMap response payload.
 *
 * @param overrides - Partial fields overriding the default payload
 * @returns Mock provider response
 */
function createMockWeatherResponse(
	overrides: MockWeatherApiResponse = {},
): MockWeatherApiResponse {
	return {
		weather: [{ description: 'cielo claro' }],
		main: {
			temp: 27.4,
			temp_max: 31.2,
			temp_min: 22.1,
			humidity: 56,
		},
		...overrides,
	};
}

describe('weather route (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let locationTable: typeof import('../db/schema.js').location;
	let database: typeof import('../db/index.js').default;
	const originalFetch = globalThis.fetch;
	const originalOpenWeatherApiKey = process.env.OPENWEATHERMAP_API_KEY;
	const insertedLocationIds: string[] = [];

	beforeAll(async () => {
		process.env.OPENWEATHERMAP_API_KEY = 'test-openweathermap-key';
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
		({ default: database } = await import('../db/index.js'));
		({ location: locationTable } = await import('../db/schema.js'));

		await database
			.update(locationTable)
			.set({
				latitude: 19.4326,
				longitude: -99.1332,
			})
			.where(eq(locationTable.id, seed.locationId));
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('returns weather data for the active organization locations', async () => {
		globalThis.fetch = (async (input, init) => {
			const url =
				typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

			if (!url.includes(OPEN_WEATHER_PATH)) {
				return originalFetch(input as RequestInfo | URL, init);
			}

			const parsedUrl = new URL(url);
			expect(parsedUrl.searchParams.get('appid')).toBe('test-openweathermap-key');
			expect(parsedUrl.searchParams.get('units')).toBe('metric');
			expect(parsedUrl.searchParams.get('lang')).toBe('es');
			expect(parsedUrl.searchParams.get('lat')).not.toBeNull();
			expect(parsedUrl.searchParams.get('lon')).not.toBeNull();

			return new Response(JSON.stringify(createMockWeatherResponse()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}) as typeof fetch;

		const response = await client.weather.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
		expect(payload.data.length).toBeGreaterThan(0);
		expect(payload.data[0]).toMatchObject({
			locationId: expect.any(String),
			locationName: expect.any(String),
			temperature: 27.4,
			condition: 'cielo claro',
			high: 31.2,
			low: 22.1,
			humidity: 56,
		});
		expect(typeof payload.cachedAt).toBe('string');
	});

	it('returns an empty payload when the weather provider fails', async () => {
		globalThis.fetch = (async (input, init) => {
			const url =
				typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

			if (!url.includes(OPEN_WEATHER_PATH)) {
				return originalFetch(input as RequestInfo | URL, init);
			}

			throw new Error('Weather provider unavailable');
		}) as typeof fetch;

		const response = await client.weather.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload).toEqual({
			data: [],
			cachedAt: null,
		});
	});

	it('returns partial weather results when one location provider call fails', async () => {
		const extraLocationId = randomUUID();
		insertedLocationIds.push(extraLocationId);
		await database.insert(locationTable).values({
			id: extraLocationId,
			name: 'Sucursal Norte',
			code: `LOC-${extraLocationId.slice(0, 8)}`,
			organizationId: seed.organizationId,
			latitude: 20.6736,
			longitude: -103.344,
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
		});

		globalThis.fetch = (async (input, init) => {
			const url =
				typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

			if (!url.includes(OPEN_WEATHER_PATH)) {
				return originalFetch(input as RequestInfo | URL, init);
			}

			const parsedUrl = new URL(url);
			if (parsedUrl.searchParams.get('lat') === '20.6736') {
				throw new Error('Weather provider unavailable for one location');
			}

			return new Response(JSON.stringify(createMockWeatherResponse()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}) as typeof fetch;

		const response = await client.weather.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data.length).toBeGreaterThan(0);
		expect(payload.data.some((record: { locationId: string }) => record.locationId === seed.locationId)).toBe(true);
		expect(
			payload.data.some((record: { locationId: string }) => record.locationId === extraLocationId),
		).toBe(false);
		expect(payload.cachedAt).toBeNull();
	});

	afterEach(async () => {
		const { resetWeatherCache: resetCache } = await import('./weather.js');
		resetCache();
		while (insertedLocationIds.length > 0) {
			await database
				.delete(locationTable)
				.where(eq(locationTable.id, insertedLocationIds.pop() as string));
		}
	});

	afterAll(() => {
		process.env.OPENWEATHERMAP_API_KEY = originalOpenWeatherApiKey;
	});
});
