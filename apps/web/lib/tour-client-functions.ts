/**
 * Client-side API functions for guided tour progress.
 *
 * @module tour-client-functions
 */

import { api } from '@/lib/api';
import { requireApiResponseData } from '@/lib/api-response';

/**
 * Shape of a single tour progress record from the API.
 */
export interface TourProgressRecord {
	tourId: string;
	status: 'completed' | 'skipped';
	completedAt: string;
}

/**
 * Fetches all tour progress for the current user in the active organization.
 *
 * @returns Array of tour progress records
 * @throws Error when the tour progress response is missing or invalid
 */
export async function fetchTourProgress(): Promise<TourProgressRecord[]> {
	const response = await api.tours.progress.get();
	const payload = requireApiResponseData(
		response,
		'No se pudo cargar el progreso de los tutoriales.',
	);
	return payload.data.tours.map((tour) => ({
			tourId: tour.tourId,
			status: tour.status,
			completedAt:
				tour.completedAt instanceof Date ? tour.completedAt.toISOString() : tour.completedAt,
		}));
}

/**
 * Marks a tour as completed or skipped.
 *
 * @param tourId - The tour identifier
 * @param status - Whether the tour was completed or skipped
 * @returns Promise that resolves when the request completes
 * @throws Error when the completion response is missing or invalid
 */
export async function completeTour(
	tourId: string,
	status: 'completed' | 'skipped',
): Promise<void> {
	const response = await api.tours[tourId].complete.post({ status });
	requireApiResponseData(response, 'No se pudo guardar el progreso del tutorial.');
}
