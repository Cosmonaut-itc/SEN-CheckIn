import { z } from 'zod';

/**
 * Path parameter schema for tour-specific endpoints.
 */
export const tourIdParamSchema = z.object({
	tourId: z.string().min(1, 'tourId is required'),
});

/**
 * Body schema for marking a tour as completed or skipped.
 */
export const completeTourBodySchema = z.object({
	status: z.enum(['completed', 'skipped']),
});

export type TourIdParam = z.infer<typeof tourIdParamSchema>;
export type CompleteTourBody = z.infer<typeof completeTourBodySchema>;
