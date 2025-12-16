import './utils/disable-pg-native.js';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';

import { type Context, Elysia } from 'elysia';
import { auth } from '../utils/auth.js';

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

// Plugin imports
import { configureLogger, logger } from './logger/index.js';
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

// Configure logger based on environment
configureLogger({
	level: (process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') ?? 'INFO',
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
 * Protected routes plugin that requires authentication.
 * Groups all domain entity CRUD routes under authentication middleware.
 * Accepts both session-based authentication and API key authentication.
 *
 * All routes under this plugin require a valid session cookie or API key.
 * The authenticated user/session or API key info is available in the route context.
 */
const protectedRoutes = new Elysia({ name: 'protected-routes' })
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
	// Face recognition routes (requires authentication)
	.use(recognitionRoutes);

/**
 * Main Elysia application instance.
 * Configured with CORS, OpenAPI documentation, OpenTelemetry, authentication,
 * error handling, request logging, CRUD routes for all domain entities,
 * and face recognition routes.
 *
 * Route authentication:
 * - `/api/auth/*` - Public routes for BetterAuth (sign-in, sign-up, etc.)
 * - All other routes require authentication via session or API key
 */
const app = new Elysia()
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
	.use(protectedRoutes);

const hostname = process.env.HOST ?? '0.0.0.0';
const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;

const server = app.listen({ hostname, port });

export type App = typeof app;

// Export error classes for use in routes
export * from './errors/index.js';

logger.info(`🦊 Elysia is running at ${hostname}:${server.server?.port ?? port}`);
