import { z } from 'zod';

/**
 * Build a trimmed URL schema with a custom error message.
 *
 * @param message - Error message for invalid URLs.
 * @returns Zod string schema for a trimmed URL.
 */
const trimmedUrl = (message: string) => z.string().trim().url(message);

const envSchema = z.object({
	EXPO_PUBLIC_API_URL: trimmedUrl(
		'EXPO_PUBLIC_API_URL must be a valid URL (e.g., http://10.0.2.2:3000)',
	),
	EXPO_PUBLIC_WEB_VERIFY_URL: trimmedUrl(
		'EXPO_PUBLIC_WEB_VERIFY_URL must be a valid URL (e.g., http://localhost:300/device)',
	).optional(),
	EXPO_PUBLIC_VERIFY_URL: trimmedUrl(
		'EXPO_PUBLIC_VERIFY_URL must be a valid URL (e.g., http://localhost:3001/device)',
	).optional(),
	VERIFY_URL: trimmedUrl(
		'VERIFY_URL must be a valid URL (e.g., http://localhost:3001/device)',
	).optional(),
});

const parsed = envSchema.safeParse({
	EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
	EXPO_PUBLIC_WEB_VERIFY_URL: process.env.EXPO_PUBLIC_WEB_VERIFY_URL,
	EXPO_PUBLIC_VERIFY_URL: process.env.EXPO_PUBLIC_VERIFY_URL,
	VERIFY_URL: process.env.VERIFY_URL,
});

export const envErrors = parsed.success ? null : parsed.error;
export const envIsValid = parsed.success;
export const ENV = {
	apiUrl: parsed.success ? parsed.data.EXPO_PUBLIC_API_URL : null,
	webVerifyUrl: parsed.success
		? (parsed.data.EXPO_PUBLIC_WEB_VERIFY_URL ??
			parsed.data.EXPO_PUBLIC_VERIFY_URL ??
			parsed.data.VERIFY_URL ??
			null)
		: null,
};
