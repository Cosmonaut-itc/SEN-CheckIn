import './utils/disable-pg-native.js';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';

// Plugin imports
import { configureLogger } from './logger/index.js';
import { combinedAuthPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { loggerPlugin } from './plugins/logger.js';

// Route imports
import { attendanceRoutes } from './routes/attendance.js';
import { deviceRoutes } from './routes/devices.js';
import { employeeRoutes } from './routes/employees.js';
import { jobPositionRoutes } from './routes/job-positions.js';
import { locationRoutes } from './routes/locations.js';
import { recognitionRoutes } from './routes/recognition.js';
import { organizationRoutes } from './routes/organization.js';
import { payrollRoutes } from './routes/payroll.js';
import { payrollSettingsRoutes } from './routes/payroll-settings.js';
import { scheduleTemplateRoutes } from './routes/schedule-templates.js';
import { scheduleExceptionRoutes } from './routes/schedule-exceptions.js';
import { schedulingRoutes } from './routes/scheduling.js';
import { vacationRoutes } from './routes/vacations.js';

const defaultCorsOrigins: string[] = [
	'http://localhost:3001',
	'http://localhost:3000',
	'http://127.0.0.1:3001',
	'http://127.0.0.1:3000',
	'https://sen-check-in.vercel.app',
];

const envCorsOrigins: string[] = (process.env.CORS_ORIGIN ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean)
	.map((origin) => origin.replace(/\/$/, ''));

const corsAllowedOrigins: string[] = Array.from(
	new Set([...defaultCorsOrigins, ...envCorsOrigins]),
);

/**
 * BetterAuth view handler for authentication endpoints.
 * Handles GET, POST, and OPTIONS requests for authentication routes.
 * OPTIONS requests are handled by CORS middleware but we accept them here as well.
 *
 * @param context - Elysia request context
 * @returns BetterAuth handler response or an error payload
 * @throws Error if request method is not allowed
 */
const betterAuthView = (
	context: Context,
): ReturnType<typeof auth.handler> | { error: string } => {
	const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET', 'OPTIONS'];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	context.set.status = 405;
	return { error: 'Method not allowed' };
};

/**
 * Validates whether the incoming request origin is in the configured allowlist.
 *
 * @param origin - Origin header value from the incoming request
 * @returns True when the origin is permitted for CORS responses
 */
const isOriginAllowed = (origin?: string | null): boolean => {
	if (!origin) {
		return false;
	}
	const normalizedOrigin = origin.replace(/\/$/, '');
	return corsAllowedOrigins.includes(normalizedOrigin);
};

/**
 * Builds the protected routes plugin for authenticated endpoints.
 *
 * @returns Elysia plugin containing authenticated domain routes
 */
const createProtectedRoutes = (): Elysia => {
	return new Elysia({ name: 'protected-routes' })
		.use(combinedAuthPlugin)
		// Domain entity CRUD routes (all require authentication)
		.use(locationRoutes)
		.use(jobPositionRoutes)
		.use(employeeRoutes)
		.use(deviceRoutes)
		.use(attendanceRoutes)
		.use(organizationRoutes)
		.use(payrollSettingsRoutes)
		.use(payrollRoutes)
		.use(scheduleTemplateRoutes)
		.use(scheduleExceptionRoutes)
		.use(schedulingRoutes)
		.use(vacationRoutes)
		// Face recognition routes (requires authentication)
		.use(recognitionRoutes);
};

/**
 * Builds the main Elysia application instance without calling listen().
 *
 * @returns Configured Elysia application instance
 */
export const createApp = (): Elysia => {
	// Configure logger based on environment
	configureLogger({
		level:
			(process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') ?? 'INFO',
		colorize: process.env.NODE_ENV !== 'production',
	});

	return new Elysia()
		// Core plugins - order matters: CORS, error handler and logger should be first
		.use(
			cors({
				origin: (request: Request) => isOriginAllowed(request.headers.get('origin')),
				methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
				credentials: true,
				allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
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
					components: {
						securitySchemes: {
							bearerAuth: {
								type: 'http',
								scheme: 'bearer',
								description: 'Session token or API key',
							},
							apiKey: {
								type: 'apiKey',
								in: 'header',
								name: 'x-api-key',
								description: 'API key for machine-to-machine authentication',
							},
						},
					},
					security: [{ bearerAuth: [] }, { apiKey: [] }],
				},
			}),
		)
		.use(opentelemetry())
		// Public authentication routes (sign-in, sign-up, etc.)
		.all('/api/auth/*', betterAuthView)
		// All protected routes (require authentication)
		.use(createProtectedRoutes());
};

export type App = ReturnType<typeof createApp>;
