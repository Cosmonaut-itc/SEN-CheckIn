import { Buffer } from 'node:buffer';

import { imageBodySchema } from '../schemas/recognition.js';

/**
 * Error type for request payloads that should return a 400 response.
 */
export class RecognitionBadRequestError extends Error {
	/** Stable client-facing error code. */
	public readonly errorCode: 'INVALID_REQUEST_BODY' | 'INVALID_IMAGE_BASE64';

	/** Client-facing message. */
	public readonly clientMessage: string;

	/**
	 * Creates a new RecognitionBadRequestError instance.
	 *
	 * @param message - Internal error message for logs
	 * @param errorCode - Stable client-facing error code
	 * @param clientMessage - Human-readable client-facing message
	 */
	constructor(
		message: string,
		errorCode: 'INVALID_REQUEST_BODY' | 'INVALID_IMAGE_BASE64',
		clientMessage: string,
	) {
		super(message);
		this.name = 'RecognitionBadRequestError';
		this.errorCode = errorCode;
		this.clientMessage = clientMessage;
	}
}

/**
 * Parses the already-materialized recognition request body and measures its payload size.
 *
 * @param body - Request body that Elysia already validated and deserialized
 * @returns Parsed image payload and serialized payload size in bytes
 * @throws RecognitionBadRequestError when the body no longer matches the schema
 */
export function parseRecognitionRequestBody(
	body: unknown,
): {
	image: string;
	payloadBytes: number;
} {
	const payloadBytes = Buffer.byteLength(JSON.stringify(body));
	const parsedResult = imageBodySchema.safeParse(body);

	if (!parsedResult.success) {
		throw new RecognitionBadRequestError(
			'Recognition request body failed validation',
			'INVALID_REQUEST_BODY',
			'Invalid request body',
		);
	}

	return {
		image: parsedResult.data.image,
		payloadBytes,
	};
}
