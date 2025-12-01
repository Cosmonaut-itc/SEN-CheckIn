import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z
    .string()
    .url('EXPO_PUBLIC_API_URL must be a valid URL (e.g., http://10.0.2.2:3000)'),
  EXPO_PUBLIC_WEB_VERIFY_URL: z
    .string()
    .url('EXPO_PUBLIC_WEB_VERIFY_URL must be a valid URL (e.g., http://127.0.0.1:3001/device)')
    .optional(),
});

const parsed = envSchema.safeParse(process.env);

export const envErrors = parsed.success ? null : parsed.error;
export const envIsValid = parsed.success;
export const ENV = {
  apiUrl: parsed.success ? parsed.data.EXPO_PUBLIC_API_URL : null,
  webVerifyUrl: parsed.success ? parsed.data.EXPO_PUBLIC_WEB_VERIFY_URL ?? null : null,
};
