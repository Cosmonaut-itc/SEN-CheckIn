import { HttpStatus } from '../errors/index.js';

type ErrorDetails = Record<string, unknown>;

type ErrorResponseOptions = {
	code?: string;
	details?: ErrorDetails;
};

const STATUS_CODE_MAP: Record<number, string> = {
	[HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
	[HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
	[HttpStatus.FORBIDDEN]: 'FORBIDDEN',
	[HttpStatus.NOT_FOUND]: 'NOT_FOUND',
	[HttpStatus.CONFLICT]: 'CONFLICT',
	[HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
	[HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
	[HttpStatus.SERVICE_UNAVAILABLE]: 'EXTERNAL_SERVICE_ERROR',
	405: 'METHOD_NOT_ALLOWED',
};

/**
 * Resolves a default error code for the provided HTTP status.
 *
 * @param status - HTTP status code
 * @returns Error code string
 */
function resolveErrorCode(status: number): string {
	return STATUS_CODE_MAP[status] ?? 'INTERNAL_ERROR';
}

/**
 * Builds a standardized error response payload.
 *
 * @param message - Human-readable error message
 * @param status - HTTP status code for the error
 * @param options - Optional error code override and details
 * @returns Structured error response payload
 */
export function buildErrorResponse(
	message: string,
	status: number,
	options?: ErrorResponseOptions,
): { error: { message: string; code: string; details?: ErrorDetails } } {
	const resolvedCode = options?.code ?? resolveErrorCode(status);
	return {
		error: {
			message,
			code: resolvedCode,
			...(options?.details ? { details: options.details } : {}),
		},
	};
}

export type { ErrorDetails, ErrorResponseOptions };
