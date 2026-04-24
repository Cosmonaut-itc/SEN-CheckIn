import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';

describe('app CORS configuration', () => {
	it('allows and exposes the recognition diagnostic headers used by the client', async () => {
		const { createApiCorsPlugin } = await import('./cors-config.js');
		const app = new Elysia()
			.use(createApiCorsPlugin())
			.options('/recognition/identify', ({ set }) => {
				set.headers['x-request-id'] = 'req-123';
				set.headers['server-timing'] = 'total;dur=12.5';
				return new Response(null, { status: 204 });
			})
			.get('/recognition/identify', ({ set }) => {
				set.headers['x-request-id'] = 'req-123';
				set.headers['server-timing'] = 'total;dur=12.5';
				return new Response(null, { status: 200 });
			});
		const preflightResponse = await app.handle(
			new Request('http://localhost/recognition/identify', {
				method: 'OPTIONS',
				headers: {
					origin: 'http://localhost:3000',
					'access-control-request-method': 'POST',
					'access-control-request-headers': 'content-type, x-client-platform, x-client-network-type',
				},
			}),
		);
		const actualResponse = await app.handle(
			new Request('http://localhost/recognition/identify', {
				method: 'GET',
				headers: {
					origin: 'http://localhost:3000',
				},
			}),
		);
		const allowHeaders = preflightResponse.headers.get('access-control-allow-headers') ?? '';
		const exposeHeaders = actualResponse.headers.get('access-control-expose-headers') ?? '';

		expect(preflightResponse.status).toBe(204);
		expect(actualResponse.status).toBe(200);
		expect(allowHeaders.toLowerCase()).toContain('x-client-platform');
		expect(allowHeaders.toLowerCase()).toContain('x-client-network-type');
		expect(allowHeaders.toLowerCase()).not.toContain('x-image-payload-bytes');
		expect(exposeHeaders.toLowerCase()).toContain('x-request-id');
		expect(exposeHeaders.toLowerCase()).toContain('server-timing');
	});
});

describe('app server time route', () => {
	it('returns the API server clock as an ISO timestamp', async () => {
		const { serverTimeRoutes } = await import('./routes/server-time.js');
		const before = Date.now();

		const response = await serverTimeRoutes.handle(new Request('http://localhost/server-time'));
		const after = Date.now();
		const payload = (await response.json()) as { data?: { now?: unknown } };
		const parsedNow =
			typeof payload.data?.now === 'string' ? Date.parse(payload.data.now) : Number.NaN;

		expect(response.status).toBe(200);
		expect(typeof payload.data?.now).toBe('string');
		expect(Number.isNaN(parsedNow)).toBe(false);
		expect(parsedNow).toBeGreaterThanOrEqual(before);
		expect(parsedNow).toBeLessThanOrEqual(after);
	});
});
