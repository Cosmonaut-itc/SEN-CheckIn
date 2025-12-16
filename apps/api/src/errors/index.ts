/**
 * Custom error classes for the SEN CheckIn API.
 * These errors integrate with Elysia's error handling system for type-safe error responses.
 *
 * @module errors
 */

/**
 * HTTP status codes used by custom errors.
 */
export const HttpStatus = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	UNPROCESSABLE_ENTITY: 422,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503,
} as const;

/** Type representing valid HTTP status codes */
export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * Base API error class that all custom errors extend from.
 * Provides a consistent structure for error responses.
 *
 * @extends Error
 */
export class ApiError extends Error {
	/** HTTP status code for this error */
	public readonly status: HttpStatusCode;

	/** Error code identifier for client-side handling */
	public readonly code: string;

	/** Additional details about the error */
	public readonly details?: Record<string, unknown>;

	/**
	 * Creates a new ApiError instance.
	 *
	 * @param message - Human-readable error message
	 * @param status - HTTP status code (default: 500)
	 * @param code - Error code identifier (default: 'INTERNAL_ERROR')
	 * @param details - Additional error details
	 */
	constructor(
		message: string,
		status: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
		code: string = 'INTERNAL_ERROR',
		details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.details = details;

		// Maintains proper stack trace for where error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Converts the error to a JSON-serializable response object.
	 *
	 * @returns Structured error response
	 */
	toResponse(): Response {
		return Response.json(
			{
				error: {
					message: this.message,
					code: this.code,
					...(this.details && { details: this.details }),
				},
			},
			{ status: this.status },
		);
	}
}

/**
 * Error thrown when a requested resource is not found.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new NotFoundError('Client', 'abc-123');
 * // Results in: { error: { message: 'Client with id abc-123 not found', code: 'NOT_FOUND' } }
 * ```
 */
export class NotFoundError extends ApiError {
	/**
	 * Creates a new NotFoundError instance.
	 *
	 * @param resource - Name of the resource that was not found
	 * @param identifier - Optional identifier of the resource
	 */
	constructor(resource: string, identifier?: string) {
		const message = identifier
			? `${resource} with id ${identifier} not found`
			: `${resource} not found`;
		super(message, HttpStatus.NOT_FOUND, 'NOT_FOUND', { resource, identifier });
		this.name = 'NotFoundError';
	}
}

/**
 * Error thrown when request validation fails.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new ValidationError('Invalid email format', { field: 'email' });
 * ```
 */
export class ValidationError extends ApiError {
	/**
	 * Creates a new ValidationError instance.
	 *
	 * @param message - Validation error message
	 * @param details - Additional validation details (e.g., field names, constraints)
	 */
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', details);
		this.name = 'ValidationError';
	}
}

/**
 * Error thrown when authentication is required but not provided or invalid.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new UnauthorizedError('Invalid API key');
 * ```
 */
export class UnauthorizedError extends ApiError {
	/**
	 * Creates a new UnauthorizedError instance.
	 *
	 * @param message - Error message (default: 'Authentication required')
	 */
	constructor(message: string = 'Authentication required') {
		super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
		this.name = 'UnauthorizedError';
	}
}

/**
 * Error thrown when the user lacks permission to perform an action.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new ForbiddenError('You do not have permission to delete this resource');
 * ```
 */
export class ForbiddenError extends ApiError {
	/**
	 * Creates a new ForbiddenError instance.
	 *
	 * @param message - Error message (default: 'Access forbidden')
	 */
	constructor(message: string = 'Access forbidden') {
		super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
		this.name = 'ForbiddenError';
	}
}

/**
 * Error thrown when a resource conflict occurs (e.g., duplicate entry).
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new ConflictError('A client with this name already exists');
 * ```
 */
export class ConflictError extends ApiError {
	/**
	 * Creates a new ConflictError instance.
	 *
	 * @param message - Conflict error message
	 * @param details - Additional conflict details
	 */
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, HttpStatus.CONFLICT, 'CONFLICT', details);
		this.name = 'ConflictError';
	}
}

/**
 * Error thrown when an external service (e.g., AWS Rekognition) fails.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new ExternalServiceError('AWS Rekognition', 'Face detection failed');
 * ```
 */
export class ExternalServiceError extends ApiError {
	/**
	 * Creates a new ExternalServiceError instance.
	 *
	 * @param service - Name of the external service
	 * @param message - Error message from the service
	 * @param originalError - Original error from the service (for logging)
	 */
	constructor(service: string, message: string, originalError?: unknown) {
		super(
			`${service} error: ${message}`,
			HttpStatus.SERVICE_UNAVAILABLE,
			'EXTERNAL_SERVICE_ERROR',
			{
				service,
				...(originalError instanceof Error && { originalMessage: originalError.message }),
			},
		);
		this.name = 'ExternalServiceError';
	}
}

/**
 * Error thrown for database-related failures.
 *
 * @extends ApiError
 * @example
 * ```typescript
 * throw new DatabaseError('Failed to insert record');
 * ```
 */
export class DatabaseError extends ApiError {
	/**
	 * Creates a new DatabaseError instance.
	 *
	 * @param message - Database error message
	 * @param originalError - Original database error (for logging)
	 */
	constructor(message: string, originalError?: unknown) {
		super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'DATABASE_ERROR', {
			...(originalError instanceof Error && { originalMessage: originalError.message }),
		});
		this.name = 'DatabaseError';
	}
}
