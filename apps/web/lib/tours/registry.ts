import { apiKeysTour } from './api-keys';
import { attendanceTour } from './attendance';
import { dashboardTour } from './dashboard';
import { deductionsTour } from './deductions';
import { devicesTour } from './devices';
import { disciplinaryMeasuresTour } from './disciplinary-measures';
import { employeesTour } from './employees';
import { incapacitiesTour } from './incapacities';
import { jobPositionsTour } from './job-positions';
import { locationsTour } from './locations';
import { organizationsTour } from './organizations';
import { overtimeAuthorizationsTour } from './overtime-authorizations';
import { payrollTour } from './payroll';
import { payrollSettingsTour } from './payroll-settings';
import { schedulesTour } from './schedules';
import type { TourConfig } from './types';
import { usersTour } from './users';
import { vacationsTour } from './vacations';

const tours: TourConfig[] = [
	dashboardTour,
	employeesTour,
	locationsTour,
	devicesTour,
	jobPositionsTour,
	attendanceTour,
	schedulesTour,
	vacationsTour,
	incapacitiesTour,
	payrollTour,
	payrollSettingsTour,
	usersTour,
	organizationsTour,
	apiKeysTour,
	overtimeAuthorizationsTour,
	deductionsTour,
	disciplinaryMeasuresTour,
];

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
