import { NextResponse } from 'next/server';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_QUERY_LENGTH = 3;
const RESULTS_LIMIT = 6;
const CACHE_SECONDS = 60 * 60;

export const revalidate = CACHE_SECONDS;

type NominatimResult = {
	display_name: string;
	lat: string;
	lon: string;
};

type GeocodeSuggestion = {
	displayName: string;
	lat: number;
	lng: number;
};

/**
 * Builds the Nominatim search URL for a query.
 *
 * @param query - The search string to look up.
 * @returns The fully-qualified Nominatim URL.
 */
function buildNominatimUrl(query: string): string {
	const searchParams = new URLSearchParams({
		q: query,
		format: 'json',
		limit: RESULTS_LIMIT.toString(),
		addressdetails: '0',
	});

	return `${NOMINATIM_URL}?${searchParams.toString()}`;
}

/**
 * Normalizes Nominatim results into the expected response shape.
 *
 * @param results - Raw results from the Nominatim API.
 * @returns Normalized geocode suggestions.
 */
function normalizeResults(results: NominatimResult[]): GeocodeSuggestion[] {
	return results
		.map((result) => {
			const lat = Number.parseFloat(result.lat);
			const lng = Number.parseFloat(result.lon);

			if (Number.isNaN(lat) || Number.isNaN(lng)) {
				return null;
			}

			return {
				displayName: result.display_name,
				lat,
				lng,
			};
		})
		.filter((result): result is GeocodeSuggestion => result !== null);
}

/**
 * GET handler for geocoding queries via Nominatim.
 *
 * @param request - The incoming request object.
 * @returns A JSON response with geocode suggestions.
 */
export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get('q')?.trim() ?? '';

	if (query.length < MIN_QUERY_LENGTH) {
		return NextResponse.json(
			{ errorCode: 'QUERY_TOO_SHORT' },
			{ status: 400 },
		);
	}

	const url = buildNominatimUrl(query);

	try {
		const response = await fetch(url, {
			next: { revalidate: CACHE_SECONDS },
			headers: {
				'accept-language': 'es',
				'user-agent': 'sen-checkin/1.0',
			},
		});

		if (!response.ok) {
			return NextResponse.json(
				{ errorCode: 'UPSTREAM_ERROR' },
				{ status: response.status },
			);
		}

		const data = (await response.json()) as NominatimResult[];
		const normalized = normalizeResults(data);

		return NextResponse.json({ data: normalized });
	} catch (error) {
		console.error('Geocode request failed:', error);
		return NextResponse.json({ errorCode: 'UNKNOWN_ERROR' }, { status: 500 });
	}
}