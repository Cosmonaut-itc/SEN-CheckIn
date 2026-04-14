/**
 * Client-side API functions for guided tour progress.
 *
 * @module tour-client-functions
 */

import { api } from '@/lib/api';
import { getApiResponseData } from '@/lib/api-response';

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
 */
export async function fetchTourProgress(): Promise<TourProgressRecord[]> {
	const response = await api.tours.progress.get();
	const payload = getApiResponseData(response);
	return (
		payload?.data?.tours.map((tour) => ({
			tourId: tour.tourId,
			status: tour.status,
			completedAt:
				tour.completedAt instanceof Date ? tour.completedAt.toISOString() : tour.completedAt,
		})) ?? []
	);
}

/**
 * Marks a tour as completed or skipped.
 *
 * @param tourId - The tour identifier
 * @param status - Whether the tour was completed or skipped
 * @returns Promise that resolves when the request completes
 */
export async function completeTour(
	tourId: string,
	status: 'completed' | 'skipped',
): Promise<void> {
	await api.tours[tourId].complete.post({ status });
}
