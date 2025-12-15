import { z } from 'zod';

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

const parsed = envSchema.safeParse(process.env);

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
