import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';

// Route imports
import { clientRoutes } from './routes/clients.js';
import { locationRoutes } from './routes/locations.js';
import { jobPositionRoutes } from './routes/job-positions.js';
import { employeeRoutes } from './routes/employees.js';
import { deviceRoutes } from './routes/devices.js';
import { attendanceRoutes } from './routes/attendance.js';
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
 * Configured with OpenAPI documentation, OpenTelemetry, authentication,
 * CRUD routes for all domain entities, and face recognition routes.
 */
const app = new Elysia()
	.use(
		openapi({
			documentation: {
				info: {
					title: 'Sen Checkin API Documentation',
					version: '0.0.2',
				},
			},
		}),
	)
	.use(opentelemetry())
	// Authentication
	.all('/api/auth/*', betterAuthView)
	// Domain entity CRUD routes
	.use(clientRoutes)
	.use(locationRoutes)
	.use(jobPositionRoutes)
	.use(employeeRoutes)
	.use(deviceRoutes)
	.use(attendanceRoutes)
	// Face recognition routes
	.use(recognitionRoutes)
	.listen(3000);

export type App = typeof app;

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
