import { z } from 'zod';

/**
 * Build a trimmed URL schema with a custom error message.
 *
 * @param message - Error message for invalid URLs.
 * @returns Zod string schema for a trimmed URL.
 */
const trimmedUrl = (message: string) => z.string().trim().url(message);

const API_URL_SCHEMA = trimmedUrl(
	'EXPO_PUBLIC_API_URL must be a valid URL (e.g., http://10.0.2.2:3000)',
);
const WEB_VERIFY_URL_SCHEMA = trimmedUrl(
	'EXPO_PUBLIC_WEB_VERIFY_URL must be a valid URL (e.g., http://localhost:300/device)',
);
const VERIFY_URL_SCHEMA = trimmedUrl(
	'EXPO_PUBLIC_VERIFY_URL must be a valid URL (e.g., http://localhost:3001/device)',
);
const LEGACY_VERIFY_URL_SCHEMA = trimmedUrl(
	'VERIFY_URL must be a valid URL (e.g., http://localhost:3001/device)',
);

interface ParsedEnvField {
	value: string | null;
	errors: string[];
}

/**
 * Parse a required URL environment variable.
 *
 * @param key - Environment variable name for error reporting.
 * @param value - Raw environment value.
 * @param schema - Zod schema used to validate the URL.
 * @returns Parsed field value plus validation errors.
 */
function parseRequiredUrlField(
	key: string,
	value: string | undefined,
	schema: z.ZodString,
): ParsedEnvField {
	const result = schema.safeParse(value);

	if (result.success) {
		return {
			value: result.data,
			errors: [],
		};
	}

	return {
		value: null,
		errors: result.error.issues.map((issue) => `${key}: ${issue.message}`),
	};
}

/**
 * Parse an optional URL environment variable.
 * Empty strings are treated as omitted values instead of invalid configuration.
 *
 * @param key - Environment variable name for error reporting.
 * @param value - Raw environment value.
 * @param schema - Zod schema used to validate the URL.
 * @returns Parsed field value plus validation errors.
 */
function parseOptionalUrlField(
	key: string,
	value: string | undefined,
	schema: z.ZodString,
): ParsedEnvField {
	if (value === undefined || value.trim().length === 0) {
		return {
			value: null,
			errors: [],
		};
	}

	const result = schema.safeParse(value);

	if (result.success) {
		return {
			value: result.data,
			errors: [],
		};
	}

	return {
		value: null,
		errors: result.error.issues.map((issue) => `${key}: ${issue.message}`),
	};
}

const parsedApiUrl = parseRequiredUrlField(
	'EXPO_PUBLIC_API_URL',
	process.env.EXPO_PUBLIC_API_URL,
	API_URL_SCHEMA,
);
const parsedWebVerifyUrl = parseOptionalUrlField(
	'EXPO_PUBLIC_WEB_VERIFY_URL',
	process.env.EXPO_PUBLIC_WEB_VERIFY_URL,
	WEB_VERIFY_URL_SCHEMA,
);
const parsedVerifyUrl = parseOptionalUrlField(
	'EXPO_PUBLIC_VERIFY_URL',
	process.env.EXPO_PUBLIC_VERIFY_URL,
	VERIFY_URL_SCHEMA,
);
const parsedLegacyVerifyUrl = parseOptionalUrlField(
	'VERIFY_URL',
	process.env.VERIFY_URL,
	LEGACY_VERIFY_URL_SCHEMA,
);

const allEnvErrors = [
	...parsedApiUrl.errors,
	...parsedWebVerifyUrl.errors,
	...parsedVerifyUrl.errors,
	...parsedLegacyVerifyUrl.errors,
];

export const envErrors = allEnvErrors.length > 0 ? allEnvErrors : null;
export const envIsValid = parsedApiUrl.value !== null;
export const ENV = {
	apiUrl: parsedApiUrl.value,
	webVerifyUrl:
		parsedWebVerifyUrl.value ?? parsedVerifyUrl.value ?? parsedLegacyVerifyUrl.value ?? null,
};
