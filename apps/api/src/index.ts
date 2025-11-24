import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';
import { employeeRoutes } from './routes/employees.js';
import { recognitionRoutes } from './routes/recognition.js';

/**
 * BetterAuth view handler for authentication endpoints.
 *
 * @param context - Elysia request context
 * @returns BetterAuth handler response
 * @throws Error if request method is not allowed
 */
const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET'];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	throw new Error('Method not allowed, missing auth token');
};

/**
 * Main Elysia application instance.
 * Configured with OpenAPI documentation, OpenTelemetry, authentication, and face recognition routes.
 */
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
	.use(employeeRoutes)
	.use(recognitionRoutes)
	.listen(3000);

export type App = typeof app;

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
