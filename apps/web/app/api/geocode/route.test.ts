import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

type GeocodeSuggestion = {
	displayName: string;
	lat: number;
	lng: number;
};

type GeocodeResponsePayload = {
	data?: GeocodeSuggestion[];
	errorCode?: 'QUERY_TOO_SHORT' | 'UPSTREAM_ERROR' | 'UNKNOWN_ERROR';
};

const mockFetch = vi.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

/**
 * Builds a request object for the geocode route.
 *
 * @param query - Query string value.
 * @returns Request object targeting the route handler.
 */
function createRequest(query: string): Request {
	const url = new URL('https://sen-checkin.test/api/geocode');
	url.searchParams.set('q', query);
	return new Request(url.toString());
}

/**
 * Creates a JSON HTTP response for fetch mocks.
 *
 * @param payload - JSON payload to serialize.
 * @param status - HTTP status code.
 * @returns Serialized JSON response.
 */
function createJsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

/**
 * Parses the JSON body returned by the route.
 *
 * @param response - HTTP response returned by the route handler.
 * @returns Parsed JSON payload.
 */
async function readResponsePayload(response: Response): Promise<GeocodeResponsePayload> {
	return (await response.json()) as GeocodeResponsePayload;
}

describe('GET /api/geocode', () => {
	beforeEach(() => {
		mockFetch.mockReset();
		globalThis.fetch = mockFetch as typeof fetch;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it('returns 400 when query is shorter than minimum length', async () => {
		const response = await GET(createRequest('ab'));
		const payload = await readResponsePayload(response);

		expect(response.status).toBe(400);
		expect(payload).toEqual({ errorCode: 'QUERY_TOO_SHORT' });
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('requests Nominatim with Mexico filter and expected parameters', async () => {
		mockFetch.mockResolvedValue(createJsonResponse([]));

		await GET(createRequest('Avenida Reforma 100, Ciudad de Mexico'));

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [calledInput, calledOptions] = mockFetch.mock.calls[0] as [
			RequestInfo | URL,
			RequestInit | undefined,
		];
		const calledUrl =
			typeof calledInput === 'string'
				? calledInput
				: calledInput instanceof URL
					? calledInput.toString()
					: calledInput.url;
		const url = new URL(calledUrl);
		const headers = (calledOptions?.headers ?? {}) as Record<string, string>;

		expect(url.searchParams.get('format')).toBe('jsonv2');
		expect(url.searchParams.get('countrycodes')).toBe('mx');
		expect(url.searchParams.get('addressdetails')).toBe('1');
		expect(url.searchParams.get('dedupe')).toBe('1');
		expect(url.searchParams.get('limit')).toBe('15');
		expect(headers['accept-language']).toBe('es');
		expect(headers['user-agent']).toBe('sen-checkin/1.0');
	});

	it('filters out results with invalid coordinates', async () => {
		mockFetch.mockResolvedValue(
			createJsonResponse([
				{
					display_name: 'Direccion valida 1, Monterrey, Nuevo Leon, Mexico',
					lat: '25.6866',
					lon: '-100.3161',
				},
				{
					display_name: 'Direccion invalida sin lat',
					lat: 'NaN',
					lon: '-99.1332',
				},
				{
					display_name: 'Direccion invalida sin lon',
					lat: '19.4326',
					lon: 'nope',
				},
			]),
		);

		const response = await GET(createRequest('Direccion valida Monterrey'));
		const payload = await readResponsePayload(response);

		expect(response.status).toBe(200);
		expect(payload.data).toEqual([
			{
				displayName: 'Direccion valida 1, Monterrey, Nuevo Leon, Mexico',
				lat: 25.6866,
				lng: -100.3161,
			},
		]);
	});

	it('prioritizes exact street-number match over generic matches', async () => {
		mockFetch.mockResolvedValue(
			createJsonResponse([
				{
					display_name: 'Avenida Reforma, Ciudad de Mexico, Mexico',
					lat: '19.4326',
					lon: '-99.1332',
					importance: 0.9,
					address: { road: 'Avenida Reforma', city: 'Ciudad de Mexico' },
				},
				{
					display_name: 'Avenida Reforma 123, Juarez, Ciudad de Mexico, Mexico',
					lat: '19.4300',
					lon: '-99.1600',
					importance: 0.1,
					address: { house_number: '123', road: 'Avenida Reforma' },
				},
			]),
		);

		const response = await GET(createRequest('Avenida Reforma 123 Ciudad de Mexico'));
		const payload = await readResponsePayload(response);

		expect(response.status).toBe(200);
		expect(payload.data?.[0]?.displayName).toBe(
			'Avenida Reforma 123, Juarez, Ciudad de Mexico, Mexico',
		);
	});

	it('returns a stable order for equivalent result sets', async () => {
		const first = {
			display_name: 'Calle Fresa 10, Monterrey, Nuevo Leon, Mexico',
			lat: '25.6900',
			lon: '-100.3000',
			importance: 0.4,
			address: { road: 'Calle Fresa', house_number: '10', city: 'Monterrey' },
		};
		const second = {
			display_name: 'Calle Manzana 10, Monterrey, Nuevo Leon, Mexico',
			lat: '25.6950',
			lon: '-100.3050',
			importance: 0.4,
			address: { road: 'Calle Manzana', house_number: '10', city: 'Monterrey' },
		};

		mockFetch.mockResolvedValueOnce(createJsonResponse([second, first]));
		const responseA = await GET(createRequest('Calle 10 Monterrey'));
		const payloadA = await readResponsePayload(responseA);

		mockFetch.mockResolvedValueOnce(createJsonResponse([first, second]));
		const responseB = await GET(createRequest('Calle 10 Monterrey'));
		const payloadB = await readResponsePayload(responseB);

		expect(payloadA.data).toEqual(payloadB.data);
		expect(payloadA.data?.map((item) => item.displayName)).toEqual([
			'Calle Fresa 10, Monterrey, Nuevo Leon, Mexico',
			'Calle Manzana 10, Monterrey, Nuevo Leon, Mexico',
		]);
	});

	it('deduplicates normalized display names', async () => {
		mockFetch.mockResolvedValue(
			createJsonResponse([
				{
					display_name: 'Av. Alvaro Obregon 101, Roma Norte, Ciudad de Mexico, Mexico',
					lat: '19.4190',
					lon: '-99.1700',
					importance: 0.8,
				},
				{
					display_name: 'Av Alvaro Obregon 101 Roma Norte Ciudad de Mexico Mexico',
					lat: '19.4190',
					lon: '-99.1700',
					importance: 0.7,
				},
				{
					display_name: 'Avenida Chapultepec 50, Ciudad de Mexico, Mexico',
					lat: '19.4230',
					lon: '-99.1640',
					importance: 0.6,
				},
			]),
		);

		const response = await GET(createRequest('Alvaro Obregon 101 Ciudad de Mexico'));
		const payload = await readResponsePayload(response);
		const obregonCount =
			payload.data?.filter((item) => item.displayName.toLowerCase().includes('obregon'))
				.length ?? 0;

		expect(response.status).toBe(200);
		expect(obregonCount).toBe(1);
		expect(payload.data).toHaveLength(2);
	});

	it('propagates UPSTREAM_ERROR with upstream status when response is not ok', async () => {
		mockFetch.mockResolvedValue(new Response('rate limited', { status: 429 }));

		const response = await GET(createRequest('Avenida Juarez 20'));
		const payload = await readResponsePayload(response);

		expect(response.status).toBe(429);
		expect(payload).toEqual({ errorCode: 'UPSTREAM_ERROR' });
	});

	it('returns UNKNOWN_ERROR on network failure', async () => {
		mockFetch.mockRejectedValue(new Error('network down'));

		const response = await GET(createRequest('Avenida Juarez 20'));
		const payload = await readResponsePayload(response);

		expect(response.status).toBe(500);
		expect(payload).toEqual({ errorCode: 'UNKNOWN_ERROR' });
	});
});
