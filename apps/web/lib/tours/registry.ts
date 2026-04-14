import { dashboardTour } from './dashboard';
import type { TourConfig } from './types';

const tours: TourConfig[] = [dashboardTour];

/**
 * Looks up a tour by its unique identifier.
 *
 * @param tourId - Tour identifier
 * @returns Matching tour config when registered
 */
export function getTourById(tourId: string): TourConfig | undefined {
	return tours.find((tour) => tour.id === tourId);
}

/**
 * Looks up the best matching tour for a pathname.
 *
 * @param pathname - Current pathname
 * @returns Longest prefix match when a tour is registered
 */
export function getTourByPath(pathname: string): TourConfig | undefined {
	return tours
		.filter((tour) => pathname.startsWith(tour.section))
		.sort((left, right) => right.section.length - left.section.length)[0];
}

/**
 * Returns all registered tour identifiers.
 *
 * @returns Ordered list of tour ids
 */
export function getAllTourIds(): string[] {
	return tours.map((tour) => tour.id);
}
