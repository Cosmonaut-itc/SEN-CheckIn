import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /api/server-time', () => {
	it('returns the web server clock with the CDMX timezone contract', async () => {
		const before = Date.now();

		const response = await GET();
		const after = Date.now();
		const payload = (await response.json()) as { data?: { now?: unknown; timeZone?: unknown } };
		const parsedNow =
			typeof payload.data?.now === 'string' ? Date.parse(payload.data.now) : Number.NaN;

		expect(response.status).toBe(200);
		expect(typeof payload.data?.now).toBe('string');
		expect(payload.data?.timeZone).toBe('America/Mexico_City');
		expect(Number.isNaN(parsedNow)).toBe(false);
		expect(parsedNow).toBeGreaterThanOrEqual(before);
		expect(parsedNow).toBeLessThanOrEqual(after);
	});
});
