import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET'];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	throw new Error('Method not allowed, missing auth token');
};

const app = new Elysia()
	.use(
		openapi({
			documentation: {
				info: {
					title: 'Sen Checkin API Documentation',
					version: '0.0.1',
				},
			},
		}),
	)
	.use(opentelemetry())
	.all('/api/auth/*', betterAuthView)
	.listen(3000);

export type App = typeof app;

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
