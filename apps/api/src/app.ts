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
import { buildErrorResponse } from './utils/error-response.js';

// Route imports
import { attendanceRoutes } from './routes/attendance.js';
import { deviceRoutes } from './routes/devices.js';
import { employeeRoutes } from './routes/employees.js';
import { employeeDeductionRoutes } from './routes/employee-deductions.js';
import { employeeDocumentRoutes } from './routes/employee-documents.js';
import { disciplinaryMeasuresRoutes } from './routes/disciplinary-measures.js';
import { incapacityRoutes } from './routes/incapacities.js';
import { jobPositionRoutes } from './routes/job-positions.js';
import { locationRoutes } from './routes/locations.js';
import { recognitionRoutes } from './routes/recognition.js';
import { organizationRoutes } from './routes/organization.js';
import { payrollRoutes } from './routes/payroll.js';
import { payrollHolidaysRoutes } from './routes/payroll-holidays.js';
import { payrollSettingsRoutes } from './routes/payroll-settings.js';
import { overtimeAuthorizationRoutes } from './routes/overtime-authorizations.js';
import { ptuRoutes } from './routes/ptu.js';
import { aguinaldoRoutes } from './routes/aguinaldo.js';
import { scheduleTemplateRoutes } from './routes/schedule-templates.js';
import { scheduleExceptionRoutes } from './routes/schedule-exceptions.js';
import { schedulingRoutes } from './routes/scheduling.js';
import { vacationRoutes } from './routes/vacations.js';
import { internalHolidayRoutes } from './routes/internal-holidays.js';
import { buildCorsOriginAllowlist, isOriginAllowed } from './utils/origin-allowlist.js';

const corsAllowedOrigins: string[] = buildCorsOriginAllowlist({
	authBaseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
	corsOrigin: process.env.CORS_ORIGIN,
});

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
): ReturnType<typeof auth.handler> | { error: { message: string; code: string } } => {
	const BETTER_AUTH_ACCEPT_METHODS = ['POST', 'GET', 'OPTIONS'];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	context.set.status = 405;
	return buildErrorResponse('Method not allowed', 405);
};

/**
 * Builds the protected routes plugin for authenticated endpoints.
 *
 * @returns Elysia plugin containing authenticated domain routes
 */
const createProtectedRoutes = () => {
	return (
		new Elysia({ name: 'protected-routes' })
			.use(combinedAuthPlugin)
			// Domain entity CRUD routes (all require authentication)
			.use(locationRoutes)
			.use(jobPositionRoutes)
			.use(employeeRoutes)
			.use(employeeDeductionRoutes)
			.use(employeeDocumentRoutes)
			.use(disciplinaryMeasuresRoutes)
			.use(deviceRoutes)
			.use(attendanceRoutes)
			.use(organizationRoutes)
			.use(payrollSettingsRoutes)
			.use(payrollHolidaysRoutes)
			.use(overtimeAuthorizationRoutes)
			.use(payrollRoutes)
			.use(ptuRoutes)
			.use(aguinaldoRoutes)
			.use(scheduleTemplateRoutes)
			.use(scheduleExceptionRoutes)
			.use(schedulingRoutes)
			.use(vacationRoutes)
			.use(incapacityRoutes)
	);
};

/**
 * Builds the main Elysia application instance without calling listen().
 *
 * @returns Configured Elysia application instance
 */
export const createApp = () => {
	// Configure logger based on environment
	configureLogger({
		level: (process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') ?? 'INFO',
		colorize: process.env.NODE_ENV !== 'production',
	});

	return (
		new Elysia()
			// Core plugins - order matters: CORS, error handler and logger should be first
			.use(
				cors({
					origin: (request: Request) =>
						isOriginAllowed(request.headers.get('origin'), {
							configuredOrigins: corsAllowedOrigins,
							nodeEnv: process.env.NODE_ENV,
						}),
					methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
					credentials: true,
					allowedHeaders: [
						'Content-Type',
						'Authorization',
						'x-api-key',
						'x-internal-token',
					],
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
			.use(internalHolidayRoutes)
			.use(recognitionRoutes)
			// All protected routes (require authentication)
			.use(createProtectedRoutes())
	);
};

export type App = ReturnType<typeof createApp>;
