import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import { vacationRequest, vacationRequestDay } from '../db/schema.js';
import type { VacationRequestStatus } from '../schemas/vacations.js';
import {
	calculateAvailableVacationDays,
	calculateVacationAccrual,
	getServiceYearNumber,
} from './vacations.js';
import { toDateKeyInTimeZone } from '../utils/time-zone.js';
import type { EmployeeVacationBalance } from '@sen-checkin/types';

/**
 * Aggregates used vacation days by service year.
 *
 * @param args - Organization and filter inputs
 * @param args.organizationId - Organization identifier
 * @param args.employeeId - Employee identifier
 * @param args.statuses - Vacation request statuses to include
 * @param args.excludeRequestId - Optional request ID to exclude
 * @returns Map of serviceYearNumber -> used days count
 */
export async function getVacationUsageByServiceYear(args: {
	organizationId: string;
	employeeId: string;
	statuses: VacationRequestStatus[];
	excludeRequestId?: string;
}): Promise<Map<number, number>> {
	const conditions: SQL<unknown>[] = [
		eq(vacationRequest.organizationId, args.organizationId),
		eq(vacationRequestDay.employeeId, args.employeeId),
		eq(vacationRequestDay.countsAsVacationDay, true),
		inArray(vacationRequest.status, args.statuses),
	];

	if (args.excludeRequestId) {
		conditions.push(ne(vacationRequest.id, args.excludeRequestId));
	}

	const rows = await db
		.select({
			serviceYearNumber: vacationRequestDay.serviceYearNumber,
		})
		.from(vacationRequestDay)
		.leftJoin(vacationRequest, eq(vacationRequestDay.requestId, vacationRequest.id))
		.where(and(...conditions)!);

	const map = new Map<number, number>();
	for (const row of rows) {
		const year = row.serviceYearNumber ?? null;
		if (!year || year <= 0) {
			continue;
		}
		map.set(year, (map.get(year) ?? 0) + 1);
	}
	return map;
}

/**
 * Builds a vacation balance snapshot for an employee.
 *
 * @param args - Balance inputs
 * @param args.employeeId - Employee identifier
 * @param args.organizationId - Organization identifier
 * @param args.hireDate - Employee hire date
 * @param args.timeZone - Time zone for the as-of date key
 * @param args.asOfDate - Optional as-of timestamp (defaults to now)
 * @returns Vacation balance snapshot
 */
export async function buildEmployeeVacationBalance(args: {
	employeeId: string;
	organizationId: string;
	hireDate: Date;
	timeZone: string;
	asOfDate?: Date;
}): Promise<EmployeeVacationBalance> {
	const asOfDateKey = toDateKeyInTimeZone(args.asOfDate ?? new Date(), args.timeZone);
	const currentServiceYear = getServiceYearNumber(args.hireDate, asOfDateKey) ?? 0;

	const approvedDays = await getVacationUsageByServiceYear({
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		statuses: ['APPROVED'],
	});
	const pendingDays = await getVacationUsageByServiceYear({
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		statuses: ['SUBMITTED'],
	});

	const usedDays = approvedDays.get(currentServiceYear) ?? 0;
	const pending = pendingDays.get(currentServiceYear) ?? 0;
	const accrual = calculateVacationAccrual({
		hireDate: args.hireDate,
		serviceYearNumber: currentServiceYear,
		asOfDateKey,
	});
	const availableDays = calculateAvailableVacationDays({
		accruedDays: accrual.accruedDays,
		usedDays,
		pendingDays: pending,
	});

	return {
		employeeId: args.employeeId,
		hireDate: args.hireDate,
		asOfDateKey,
		serviceYearNumber: currentServiceYear,
		serviceYearStartDateKey: accrual.serviceYearStartDateKey,
		serviceYearEndDateKey: accrual.serviceYearEndDateKey,
		entitledDays: accrual.entitledDays,
		accruedDays: accrual.accruedDays,
		usedDays,
		pendingDays: pending,
		availableDays,
	};
}
