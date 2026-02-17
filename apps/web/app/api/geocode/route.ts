import { NextResponse } from 'next/server';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_QUERY_LENGTH = 3;
const RESULTS_LIMIT = 6;
const UPSTREAM_RESULTS_LIMIT = 15;
export const revalidate = 3600;
const CACHE_SECONDS = revalidate;

type NominatimAddress = Partial<Record<string, string>>;

type NominatimResult = {
	display_name: string;
	lat: string;
	lon: string;
	importance?: number | string;
	address?: NominatimAddress;
};

type GeocodeSuggestion = {
	displayName: string;
	lat: number;
	lng: number;
};

type RankedResult = {
	displayName: string;
	lat: number;
	lng: number;
	normalizedDisplayName: string;
	fullNumberMatch: boolean;
	numberMatchCount: number;
	hasExactPhrase: boolean;
	tokenCoverage: number;
	importance: number;
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
		format: 'jsonv2',
		limit: UPSTREAM_RESULTS_LIMIT.toString(),
		addressdetails: '1',
		countrycodes: 'mx',
		dedupe: '1',
	});

	return `${NOMINATIM_URL}?${searchParams.toString()}`;
}

/**
 * Normalizes free text for deterministic matching/ranking.
 *
 * @param value - Raw text value.
 * @returns Normalized text.
 */
function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Extracts number tokens from a normalized string.
 *
 * @param value - Normalized text value.
 * @returns Unique number tokens preserving first-seen order.
 */
function extractNumberTokens(value: string): string[] {
	const matches = value.match(/\d+/g) ?? [];
	return [...new Set(matches)];
}

/**
 * Parses Nominatim importance into a numeric value.
 *
 * @param importance - Raw importance field from Nominatim.
 * @returns Numeric importance (0 when invalid).
 */
function parseImportance(importance: NominatimResult['importance']): number {
	if (typeof importance === 'number' && Number.isFinite(importance)) {
		return importance;
	}

	if (typeof importance === 'string') {
		const parsed = Number.parseFloat(importance);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
}

/**
 * Builds a normalized searchable text from display name and address details.
 *
 * @param result - Raw Nominatim result.
 * @returns Normalized searchable text.
 */
function buildSearchableText(result: NominatimResult): string {
	const addressParts = Object.values(result.address ?? {}).filter(
		(part): part is string => typeof part === 'string',
	);
	return normalizeText([result.display_name, ...addressParts].join(' '));
}

/**
 * Splits normalized text into tokens.
 *
 * @param value - Normalized text value.
 * @returns Non-empty token list.
 */
function tokenizeNormalizedText(value: string): string[] {
	return value.split(' ').filter((token) => token.length > 0);
}

/**
 * Checks whether query tokens appear as a contiguous token phrase.
 *
 * @param queryTokens - Query tokens.
 * @param searchableTokens - Searchable text tokens.
 * @returns True when query tokens match exactly with token boundaries.
 */
function hasExactTokenPhrase(
	queryTokens: readonly string[],
	searchableTokens: readonly string[],
): boolean {
	if (queryTokens.length === 0 || queryTokens.length > searchableTokens.length) {
		return false;
	}

	const lastStartIndex = searchableTokens.length - queryTokens.length;
	for (let startIndex = 0; startIndex <= lastStartIndex; startIndex += 1) {
		let isMatch = true;

		for (let queryIndex = 0; queryIndex < queryTokens.length; queryIndex += 1) {
			if (searchableTokens[startIndex + queryIndex] !== queryTokens[queryIndex]) {
				isMatch = false;
				break;
			}
		}

		if (isMatch) {
			return true;
		}
	}

	return false;
}

/**
 * Calculates token coverage score for a result with token-level matching.
 *
 * @param queryTokens - Normalized query tokens.
 * @param searchableTokens - Normalized searchable tokens.
 * @returns Ratio of matched query tokens.
 */
function calculateTokenCoverage(
	queryTokens: readonly string[],
	searchableTokens: readonly string[],
): number {
	if (queryTokens.length === 0) {
		return 0;
	}

	const searchableTokenSet = new Set(searchableTokens);
	const matchedTokens = queryTokens.reduce((matchedCount, token) => {
		return searchableTokenSet.has(token) ? matchedCount + 1 : matchedCount;
	}, 0);

	return matchedTokens / queryTokens.length;
}

/**
 * Builds a ranked candidate from a raw Nominatim result.
 *
 * @param result - Raw Nominatim result.
 * @param normalizedQuery - Normalized search query.
 * @param queryTokens - Query tokens.
 * @param queryNumbers - Number tokens extracted from query.
 * @returns Ranked result candidate or null when coordinates are invalid.
 */
function buildRankedResult(
	result: NominatimResult,
	normalizedQuery: string,
	queryTokens: readonly string[],
	queryNumbers: readonly string[],
): RankedResult | null {
	const lat = Number.parseFloat(result.lat);
	const lng = Number.parseFloat(result.lon);

	if (Number.isNaN(lat) || Number.isNaN(lng)) {
		return null;
	}

	const normalizedDisplayName = normalizeText(result.display_name);
	const searchableText = buildSearchableText(result);
	const searchableTokens = tokenizeNormalizedText(searchableText);
	const resultNumbers = new Set(extractNumberTokens(searchableText));
	const numberMatchCount = queryNumbers.reduce((count, numberToken) => {
		return resultNumbers.has(numberToken) ? count + 1 : count;
	}, 0);
	const fullNumberMatch = queryNumbers.length > 0 && numberMatchCount === queryNumbers.length;

	return {
		displayName: result.display_name,
		lat,
		lng,
		normalizedDisplayName,
		fullNumberMatch,
		numberMatchCount,
		hasExactPhrase: hasExactTokenPhrase(queryTokens, searchableTokens),
		tokenCoverage: calculateTokenCoverage(queryTokens, searchableTokens),
		importance: parseImportance(result.importance),
	};
}

/**
 * Compares two ranked results using deterministic ordering rules.
 *
 * @param left - Left result candidate.
 * @param right - Right result candidate.
 * @returns Sorting value compatible with Array.sort.
 */
function compareRankedResults(left: RankedResult, right: RankedResult): number {
	if (left.hasExactPhrase !== right.hasExactPhrase) {
		return Number(right.hasExactPhrase) - Number(left.hasExactPhrase);
	}

	if (left.tokenCoverage !== right.tokenCoverage) {
		return right.tokenCoverage - left.tokenCoverage;
	}

	if (left.fullNumberMatch !== right.fullNumberMatch) {
		return Number(right.fullNumberMatch) - Number(left.fullNumberMatch);
	}

	if (left.numberMatchCount !== right.numberMatchCount) {
		return right.numberMatchCount - left.numberMatchCount;
	}

	if (left.importance !== right.importance) {
		return right.importance - left.importance;
	}

	const displayNameComparison = left.displayName.localeCompare(right.displayName, 'es', {
		sensitivity: 'base',
	});
	if (displayNameComparison !== 0) {
		return displayNameComparison;
	}

	if (left.lat !== right.lat) {
		return left.lat - right.lat;
	}

	return left.lng - right.lng;
}

/**
 * Converts raw Nominatim results into deterministic, deduplicated suggestions.
 *
 * @param query - Original user query.
 * @param results - Raw results from Nominatim.
 * @returns Ranked and normalized geocode suggestions.
 */
function rankAndNormalizeResults(query: string, results: NominatimResult[]): GeocodeSuggestion[] {
	const normalizedQuery = normalizeText(query);
	const queryTokens = normalizedQuery.split(' ').filter((token) => token.length > 0);
	const queryNumbers = extractNumberTokens(normalizedQuery);
	const rankedResults = results
		.map((result) => buildRankedResult(result, normalizedQuery, queryTokens, queryNumbers))
		.filter((result): result is RankedResult => result !== null)
		.sort(compareRankedResults);
	const uniqueDisplayNames = new Set<string>();
	const suggestions: GeocodeSuggestion[] = [];

	for (const result of rankedResults) {
		if (uniqueDisplayNames.has(result.normalizedDisplayName)) {
			continue;
		}

		uniqueDisplayNames.add(result.normalizedDisplayName);
		suggestions.push({
			displayName: result.displayName,
			lat: result.lat,
			lng: result.lng,
		});

		if (suggestions.length >= RESULTS_LIMIT) {
			break;
		}
	}

	return suggestions;
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
		return NextResponse.json({ errorCode: 'QUERY_TOO_SHORT' }, { status: 400 });
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
			return NextResponse.json({ errorCode: 'UPSTREAM_ERROR' }, { status: response.status });
		}

		const data = (await response.json()) as NominatimResult[];
		const normalized = rankAndNormalizeResults(query, data);

		return NextResponse.json({ data: normalized });
	} catch (error) {
		console.error('Geocode request failed:', error);
		return NextResponse.json({ errorCode: 'UNKNOWN_ERROR' }, { status: 500 });
	}
}
