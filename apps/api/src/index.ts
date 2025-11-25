import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';

// Plugin imports
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { loggerPlugin } from './plugins/logger.js';
import { logger, configureLogger } from './logger/index.js';

// Route imports
import { clientRoutes } from './routes/clients.js';
import { locationRoutes } from './routes/locations.js';
import { jobPositionRoutes } from './routes/job-positions.js';
import { employeeRoutes } from './routes/employees.js';
import { deviceRoutes } from './routes/devices.js';
import { attendanceRoutes } from './routes/attendance.js';
import { recognitionRoutes } from './routes/recognition.js';

// Configure logger based on environment
configureLogger({
	level: process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT' ?? 'INFO',
	colorize: process.env.NODE_ENV !== 'production',
});

/**
 * BetterAuth view handler for authentication endpoints.
 * Handles GET, POST, and OPTIONS requests for authentication routes.
 * OPTIONS requests are handled by CORS middleware but we accept them here as well.
 *
 * @param context - Elysia request context
 * @returns BetterAuth handler response
 * @throws Error if request method is not allowed
 */
const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET', 'OPTIONS'];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	context.set.status = 405;
	return { error: 'Method not allowed' };
};

/**
 * Main Elysia application instance.
 * Configured with CORS, OpenAPI documentation, OpenTelemetry, authentication,
 * error handling, request logging, CRUD routes for all domain entities,
 * and face recognition routes.
 */
const app = new Elysia()
	// Core plugins - order matters: CORS, error handler and logger should be first
	.use(
		cors({
			origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			credentials: true,
			allowedHeaders: ['Content-Type', 'Authorization'],
		}),
	)
	.use(errorHandlerPlugin)
	.use(loggerPlugin)
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

// Export error classes for use in routes
export * from './errors/index.js';

logger.info(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
