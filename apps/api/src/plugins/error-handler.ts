/**
 * Global error handler plugin for Elysia.
 * Provides centralized error handling with custom error type support and logging.
 *
 * @module plugins/error-handler
 */

import { Elysia } from 'elysia';

import {
	ApiError,
	NotFoundError,
	ValidationError,
	UnauthorizedError,
	ForbiddenError,
	ConflictError,
	ExternalServiceError,
	DatabaseError,
	HttpStatus,
} from '../errors/index.js';
import { logger } from '../logger/index.js';

/**
 * Error response structure returned by the API.
 */
export interface ErrorResponse {
	error: {
		message: string;
		code: string;
		details?: Record<string, unknown>;
	};
}

/**
 * Creates a standardized error response object.
 *
 * @param message - Error message
 * @param code - Error code identifier
 * @param details - Additional error details
 * @returns Structured error response
 */
function createErrorResponse(
	message: string,
	code: string,
	details?: Record<string, unknown>,
): ErrorResponse {
	return {
		error: {
			message,
			code,
			...(details && { details }),
		},
	};
}

/**
 * Elysia plugin that provides global error handling.
 * Registers custom error types and handles all errors consistently.
 *
 * Features:
 * - Type-safe custom error handling with auto-completion
 * - Automatic logging of all errors
 * - Validation error detail extraction
 * - Consistent error response format
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { errorHandlerPlugin } from './plugins/error-handler.js';
 *
 * const app = new Elysia()
 *   .use(errorHandlerPlugin)
 *   .get('/example', () => {
 *     throw new NotFoundError('Resource', 'abc-123');
 *   });
 * ```
 */
export const errorHandlerPlugin = new Elysia({ name: 'error-handler' })
	// Register custom error types for type-safe error handling
	.error({
		ApiError,
		NotFoundError,
		ValidationError,
		UnauthorizedError,
		ForbiddenError,
		ConflictError,
		ExternalServiceError,
		DatabaseError,
	})
	// Global error handler - use 'scoped' to apply to parent and descendants
	.onError({ as: 'scoped' }, ({ code, error, set, request }) => {
		const method = request.method;
		const path = new URL(request.url).pathname;

		// Handle Elysia's built-in NOT_FOUND error
		if (code === 'NOT_FOUND') {
			logger.warn(`Route not found: ${method} ${path}`);
			set.status = HttpStatus.NOT_FOUND;
			return createErrorResponse(`Route ${method} ${path} not found`, 'ROUTE_NOT_FOUND');
		}

		// Handle Elysia's built-in VALIDATION error
		if (code === 'VALIDATION') {
			logger.warn(`Validation error: ${method} ${path}`, {
				validationErrors: error.all,
			});
			set.status = HttpStatus.BAD_REQUEST;

			// Extract validation details - use summary for Elysia validation errors
			const validationDetails = error.all.map((err) => ({
				summary: err.summary,
			}));

			return createErrorResponse('Validation failed', 'VALIDATION_ERROR', {
				errors: validationDetails,
			});
		}

		// Handle custom ApiError and its subclasses
		if (error instanceof ApiError) {
			logger.error(`${error.name}: ${error.message}`, error, {
				method,
				path,
				code: error.code,
				status: error.status,
			});
			set.status = error.status;
			return createErrorResponse(error.message, error.code, error.details);
		}

		// Handle specific custom error types by code (for type narrowing)
		switch (code) {
			case 'NotFoundError':
			case 'ValidationError':
			case 'UnauthorizedError':
			case 'ForbiddenError':
			case 'ConflictError':
			case 'ExternalServiceError':
			case 'DatabaseError':
			case 'ApiError': {
				// These are already handled by instanceof check above
				// but we include them for exhaustive type checking
				const apiError = error as ApiError;
				set.status = apiError.status;
				return createErrorResponse(apiError.message, apiError.code, apiError.details);
			}
		}

		// Handle unknown errors
		logger.error('Unhandled error', error, { method, path });

		// In production, don't expose internal error details
		const isProduction = process.env.NODE_ENV === 'production';
		set.status = HttpStatus.INTERNAL_SERVER_ERROR;

		// Safely extract error message and name
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorName = error instanceof Error ? error.name : 'Error';

		return createErrorResponse(
			isProduction ? 'An unexpected error occurred' : errorMessage,
			'INTERNAL_ERROR',
			isProduction ? undefined : { errorType: errorName },
		);
	});

export default errorHandlerPlugin;

