import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
	addDays,
	differenceInMinutes,
	isAfter,
	isBefore,
} from 'date-fns';

import db from '../db/index.js';
import {
	attendanceRecord,
	employee,
	employeeSchedule,
	jobPosition,
	location,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import {
	payrollCalculateSchema,
	payrollProcessSchema,
	payrollRunQuerySchema,
} from '../schemas/payroll.js';
import {
	MINIMUM_WAGES,
	OVERTIME_LIMITS,
	SHIFT_LIMITS,
	SUNDAY_PREMIUM_RATE,
} from '../utils/mexico-labor-constants.js';
import { addDaysToDateKey } from '../utils/date-key.js';
import { getMexicoMandatoryRestDayKeysForYear } from '../utils/mexico-mandatory-rest-days.js';
import {
	getUtcDateForZonedMidnight,
	isValidIanaTimeZone,
	toDateKeyInTimeZone,
} from '../utils/time-zone.js';

type AttendanceRow = {
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT';
};

type ScheduleRow = {
	employeeId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
};

	type PayrollCalculationRow = {
		employeeId: string;
		name: string;
		shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
		dailyPay: number;
		hourlyPay: number;
		paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
		hoursWorked: number;
		expectedHours: number;
		normalHours: number;
		overtimeDoubleHours: number;
		overtimeTripleHours: number;
		sundayHoursWorked: number;
		mandatoryRestDaysWorkedCount: number;
		normalPay: number;
		overtimeDoublePay: number;
		overtimeTriplePay: number;
		sundayPremiumAmount: number;
		mandatoryRestDayPremiumAmount: number;
		totalPay: number;
		warnings: {
			type:
				| 'OVERTIME_DAILY_EXCEEDED'
				| 'OVERTIME_WEEKLY_EXCEEDED'
				| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
				| 'BELOW_MINIMUM_WAGE';
			message: string;
			severity: 'warning' | 'error';
		}[];
	};

/**
 * Parses an HH:mm string into total minutes.
 *
 * @param timeString - Time string in HH:mm format
 * @returns Total minutes from midnight
 */
const parseTimeToMinutes = (timeString: string): number => {
	const [hours = 0, minutes = 0] = timeString.split(':').map(Number);
	return hours * 60 + minutes;
};

/**
 * Calculates expected hours for a period based on schedule entries.
 *
 * @param schedule - Weekly schedule entries
 * @param periodStart - Start date of the period
 * @param periodEnd - End date of the period
 * @returns Expected hours in the period
 */
const calculateExpectedHours = (
	schedule: ScheduleRow[],
	periodStart: Date,
	periodEnd: Date,
): number => {
	let minutes = 0;
	for (
		let current = new Date(periodStart);
		!isAfter(current, periodEnd);
		current = addDays(current, 1)
	) {
		const dayOfWeek = current.getDay();
		const entry = schedule.find((s) => s.dayOfWeek === dayOfWeek);
		if (!entry || !entry.isWorkingDay) {
			continue;
		}
		const startMinutes = parseTimeToMinutes(entry.startTime);
		const endMinutes = parseTimeToMinutes(entry.endTime);
		if (endMinutes > startMinutes) {
			minutes += endMinutes - startMinutes;
		} else if (endMinutes < startMinutes) {
			// Overnight shift that crosses midnight (e.g., 22:00–06:00)
			const minutesUntilMidnight = 24 * 60 - startMinutes;
			minutes += minutesUntilMidnight + endMinutes;
		}
	}
	return minutes / 60;
};

/**
 * Calculates worked hours grouped by local calendar day (YYYY-MM-DD).
 *
 * @param attendance - Attendance records
 * @param timeZone - IANA timezone used to cut day boundaries
 * @returns Map of date key string to hours worked
 */
	const calculateDailyWorkedHours = (
		attendance: AttendanceRow[],
		timeZone: string,
	): Map<string, number> => {
		const resolvedTimeZone = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
		const sorted = [...attendance].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
		const dayMinutes = new Map<string, number>();
		let openCheckIn: Date | null = null;

		for (const record of sorted) {
			if (record.type === 'CHECK_IN') {
				openCheckIn = record.timestamp;
			} else if (record.type === 'CHECK_OUT' && openCheckIn) {
				const checkIn = openCheckIn;
				const checkOut = record.timestamp;

				if (isAfter(checkOut, checkIn)) {
					let segmentStart = checkIn;

					while (isAfter(checkOut, segmentStart)) {
						const currentDayKey = toDateKeyInTimeZone(segmentStart, resolvedTimeZone);
						const nextDayKey = addDaysToDateKey(currentDayKey, 1);
						const nextMidnight = getUtcDateForZonedMidnight(nextDayKey, resolvedTimeZone);
						const segmentEnd = isBefore(checkOut, nextMidnight) ? checkOut : nextMidnight;

						if (segmentEnd.getTime() === segmentStart.getTime()) {
							break;
						}

						const segmentMinutes = differenceInMinutes(segmentEnd, segmentStart);
						if (segmentMinutes > 0) {
							const current = dayMinutes.get(currentDayKey) ?? 0;
							dayMinutes.set(currentDayKey, current + segmentMinutes);
						}

						segmentStart = segmentEnd;
					}
				}
				openCheckIn = null;
			}
		}

		const result = new Map<string, number>();
		for (const [key, minutes] of dayMinutes.entries()) {
			result.set(key, minutes / 60);
		}

		return result;
	};

	/**
	 * Computes the week start key (YYYY-MM-DD) for a given UTC day key.
	 *
	 * Weeks are cut using the configured `weekStartDay` (0 = Sunday … 6 = Saturday) and
	 * UTC day boundaries. This is used to reset weekly overtime limits inside a pay period.
	 *
	 * @param dateKey - Date key in YYYY-MM-DD format (UTC)
	 * @param weekStartDay - Week start day index (0=Sunday..6=Saturday)
	 * @returns Week start date key in YYYY-MM-DD format (UTC)
	 * @throws When `dateKey` is invalid or `weekStartDay` is outside 0..6
	 */
	const getWeekStartKey = (dateKey: string, weekStartDay: number): string => {
		if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
			throw new Error(`Invalid weekStartDay "${weekStartDay}". Expected an integer 0..6.`);
		}

		const dayDate = new Date(`${dateKey}T00:00:00Z`);
		if (Number.isNaN(dayDate.getTime())) {
			throw new Error(`Invalid dateKey "${dateKey}". Expected format YYYY-MM-DD.`);
		}

		const dayOfWeek = dayDate.getUTCDay();
		const diff = (dayOfWeek - weekStartDay + 7) % 7;
		const weekStart = new Date(dayDate);
		weekStart.setUTCDate(weekStart.getUTCDate() - diff);
		return weekStart.toISOString().slice(0, 10);
	};

	/**
	 * Calculates payroll for employees within the organization and period.
	 *
	 * @param args - Organization and period parameters
 * @returns Employees with hours/expected hours and total amount
 */
const calculatePayroll = async (args: {
	organizationId: string;
	periodStart: Date;
	periodEnd: Date;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}): Promise<{
	employees: PayrollCalculationRow[];
	totalAmount: number;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	}> => {
		const { organizationId, periodEnd, periodStart, paymentFrequency } = args;

		const orgSettings = await db
		.select()
		.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, organizationId))
			.limit(1);
			const overtimeEnforcement = orgSettings[0]?.overtimeEnforcement ?? 'WARN';
			const weekStartDay = orgSettings[0]?.weekStartDay ?? 1;
			const additionalMandatoryRestDays = orgSettings[0]?.additionalMandatoryRestDays ?? [];
			const additionalMandatoryRestDaySet = new Set<string>(additionalMandatoryRestDays);

		const employees = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
			jobPositionId: employee.jobPositionId,
			lastPayrollDate: employee.lastPayrollDate,
			hourlyPay: jobPosition.hourlyPay,
			dailyPay: jobPosition.dailyPay,
			paymentFrequency: jobPosition.paymentFrequency,
				shiftType: employee.shiftType,
				locationGeographicZone: location.geographicZone,
				locationTimeZone: location.timeZone,
			})
		.from(employee)
		.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
		.leftJoin(location, eq(employee.locationId, location.id))
		.where(eq(employee.organizationId, organizationId));

	const filteredEmployees = employees.filter((emp) => {
		if (paymentFrequency && emp.paymentFrequency !== paymentFrequency) {
			return false;
		}
		if (emp.lastPayrollDate && !isBefore(emp.lastPayrollDate, periodStart)) {
			return false;
		}
		return true;
	});

	const employeeIds = filteredEmployees.map((emp) => emp.id);

	const schedules =
		employeeIds.length === 0
			? []
			: await db
					.select()
					.from(employeeSchedule)
					.where(inArray(employeeSchedule.employeeId, employeeIds));

	const scheduleMap = new Map<string, ScheduleRow[]>();
	for (const entry of schedules) {
		const current = scheduleMap.get(entry.employeeId) ?? [];
		current.push(entry as ScheduleRow);
		scheduleMap.set(entry.employeeId, current);
	}

		const results: PayrollCalculationRow[] = [];
		let totalAmount = 0;

		const mandatoryRestDayCache = new Map<number, Set<string>>();

		/**
		 * Retrieves Mexico mandatory rest day keys for a year with caching (LFT Art. 74).
		 *
		 * @param year - Calendar year
		 * @returns Set of YYYY-MM-DD date keys
		 */
		const getMandatoryRestDayKeysForYearCached = (year: number): Set<string> => {
			const cached = mandatoryRestDayCache.get(year);
			if (cached) {
				return cached;
			}
			const keys = getMexicoMandatoryRestDayKeysForYear(year);
			mandatoryRestDayCache.set(year, keys);
			return keys;
		};

		for (const emp of filteredEmployees) {
		const attendance = await db
			.select({
				timestamp: attendanceRecord.timestamp,
				type: attendanceRecord.type,
			})
			.from(attendanceRecord)
			.where(
				and(
					eq(attendanceRecord.employeeId, emp.id),
					gte(attendanceRecord.timestamp, periodStart),
					lte(attendanceRecord.timestamp, periodEnd),
				),
			);

			const timeZone = emp.locationTimeZone ?? 'America/Mexico_City';
			const dailyHoursMap = calculateDailyWorkedHours(attendance as AttendanceRow[], timeZone);
		const hoursWorked = Array.from(dailyHoursMap.values()).reduce(
			(sum, hours) => sum + hours,
			0,
		);

		const expectedHours = calculateExpectedHours(
			scheduleMap.get(emp.id) ?? [],
			periodStart,
			periodEnd,
		);

			const shiftKey = (emp.shiftType ?? 'DIURNA') as keyof typeof SHIFT_LIMITS;
			const shiftLimits = SHIFT_LIMITS[shiftKey];

			type WeeklyOvertimeBucket = {
				normalHours: number;
				overtimeFromDaily: number;
				overtimeDays: number;
			};

				const weeklyBuckets = new Map<string, WeeklyOvertimeBucket>();
				let sundayHoursWorked = 0;
				let sundaysWorkedCount = 0;
				let mandatoryRestDaysWorkedCount = 0;
				const warnings: PayrollCalculationRow['warnings'] = [];

			for (const [dateKey, dayHours] of dailyHoursMap.entries()) {
				const dayDate = new Date(`${dateKey}T00:00:00Z`);
				const dayNormal = Math.min(dayHours, shiftLimits.dailyHours);
				const dayOvertime = Math.max(0, dayHours - shiftLimits.dailyHours);

				const weekKey = getWeekStartKey(dateKey, weekStartDay);
				const current = weeklyBuckets.get(weekKey) ?? {
					normalHours: 0,
					overtimeFromDaily: 0,
					overtimeDays: 0,
				};
				current.normalHours += dayNormal;
				current.overtimeFromDaily += dayOvertime;
				if (dayOvertime > 0) {
					current.overtimeDays += 1;
				}
				weeklyBuckets.set(weekKey, current);

				const dayOfWeek = dayDate.getUTCDay();
					if (dayOfWeek === 0) {
						sundayHoursWorked += dayHours;
					if (dayHours > 0) {
						sundaysWorkedCount += 1;
					}
				}

					if (dayHours > 0) {
						const year = dayDate.getUTCFullYear();
						const isMandatoryRestDay =
							additionalMandatoryRestDaySet.has(dateKey) ||
							getMandatoryRestDayKeysForYearCached(year).has(dateKey);
						if (isMandatoryRestDay) {
							mandatoryRestDaysWorkedCount += 1;
						}
					}

				if (dayOvertime > OVERTIME_LIMITS.MAX_DAILY_HOURS) {
					warnings.push({
						type: 'OVERTIME_DAILY_EXCEEDED',
					message: `Overtime exceeds daily legal limit (${dayOvertime.toFixed(2)}h > ${OVERTIME_LIMITS.MAX_DAILY_HOURS}h)`,
					severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
					});
				}
			}

			let adjustedNormalHours = 0;
			let overtimeDoubleHours = 0;
			let overtimeTripleHours = 0;

			const sortedWeeks = Array.from(weeklyBuckets.entries()).sort(([a], [b]) =>
				a.localeCompare(b),
			);

			for (const [weekKey, bucket] of sortedWeeks) {
				const weeklyNormalExcess = Math.max(0, bucket.normalHours - shiftLimits.weeklyHours);
				const weekAdjustedNormalHours = bucket.normalHours - weeklyNormalExcess;
				const weekTotalOvertimeHours = bucket.overtimeFromDaily + weeklyNormalExcess;

				adjustedNormalHours += weekAdjustedNormalHours;
				overtimeDoubleHours += Math.min(weekTotalOvertimeHours, OVERTIME_LIMITS.MAX_WEEKLY_HOURS);
				overtimeTripleHours += Math.max(
					0,
					weekTotalOvertimeHours - OVERTIME_LIMITS.MAX_WEEKLY_HOURS,
				);

				if (bucket.overtimeDays > 3) {
					warnings.push({
						type: 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
						message: `Overtime exceeds weekly frequency limit (week ${weekKey}: ${bucket.overtimeDays} days > 3 days)`,
						severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
					});
				}

				if (weekTotalOvertimeHours > OVERTIME_LIMITS.MAX_WEEKLY_HOURS) {
					warnings.push({
						type: 'OVERTIME_WEEKLY_EXCEEDED',
						message: `Overtime exceeds weekly legal limit (week ${weekKey}: ${weekTotalOvertimeHours.toFixed(2)}h > ${OVERTIME_LIMITS.MAX_WEEKLY_HOURS}h)`,
						severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
					});
				}
			}

			const divisor = shiftLimits.divisor || 8;
			const effectiveDailyPay =
				Number(emp.dailyPay ?? 0) > 0
					? Number(emp.dailyPay ?? 0)
					: Number(emp.hourlyPay ?? 0) * divisor;
			const hourlyRate = divisor > 0 ? effectiveDailyPay / divisor : 0;

			const normalPay = adjustedNormalHours * hourlyRate;
			const overtimeDoublePay =
				overtimeDoubleHours * hourlyRate * OVERTIME_LIMITS.DOUBLE_RATE_MULTIPLIER;
			const overtimeTriplePay =
				overtimeTripleHours * hourlyRate * OVERTIME_LIMITS.TRIPLE_RATE_MULTIPLIER;
			const sundayPremiumAmount =
				sundaysWorkedCount > 0 ? sundaysWorkedCount * effectiveDailyPay * SUNDAY_PREMIUM_RATE : 0;
			const mandatoryRestDayPremiumAmount =
				mandatoryRestDaysWorkedCount > 0 ? mandatoryRestDaysWorkedCount * effectiveDailyPay * 2 : 0;

			const totalPay =
				normalPay +
				overtimeDoublePay +
				overtimeTriplePay +
				sundayPremiumAmount +
				mandatoryRestDayPremiumAmount;
			totalAmount += totalPay;

		const zone = (emp.locationGeographicZone ?? 'GENERAL') as keyof typeof MINIMUM_WAGES;
		if (effectiveDailyPay < MINIMUM_WAGES[zone]) {
			warnings.push({
				type: 'BELOW_MINIMUM_WAGE',
				message: `Daily pay ${effectiveDailyPay.toFixed(
					2,
				)} is below minimum wage for ${zone} (${MINIMUM_WAGES[zone]}).`,
				severity: 'warning',
			});
		}

		results.push({
			employeeId: emp.id,
			name: `${emp.firstName} ${emp.lastName}`,
			shiftType: shiftKey,
			dailyPay: effectiveDailyPay,
			hourlyPay: hourlyRate,
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			hoursWorked,
			expectedHours,
			normalHours: adjustedNormalHours,
				overtimeDoubleHours,
				overtimeTripleHours,
				sundayHoursWorked,
				mandatoryRestDaysWorkedCount,
				normalPay,
				overtimeDoublePay,
				overtimeTriplePay,
				sundayPremiumAmount,
				mandatoryRestDayPremiumAmount,
				totalPay,
				warnings,
			});
	}

	return { employees: results, totalAmount, overtimeEnforcement };
};

/**
 * Payroll routes for calculation and processing.
 */
export const payrollRoutes = new Elysia({ prefix: '/payroll' })
	.use(combinedAuthPlugin)
	/**
	 * Calculate payroll for a period (preview only).
	 */
	.post(
		'/calculate',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const { employees, totalAmount, overtimeEnforcement } = await calculatePayroll({
				organizationId,
				periodStart: body.periodStart,
				periodEnd: body.periodEnd,
				paymentFrequency: body.paymentFrequency,
			});

			return {
				data: {
					employees,
					totalAmount,
					periodStart: body.periodStart,
					periodEnd: body.periodEnd,
					overtimeEnforcement,
				},
			};
		},
		{
			body: payrollCalculateSchema,
		},
	)
	/**
	 * Process payroll (persist run, mark employees paid).
	 */
	.post(
		'/process',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const calculation = await calculatePayroll({
				organizationId,
				periodStart: body.periodStart,
				periodEnd: body.periodEnd,
				paymentFrequency: body.paymentFrequency,
			});

			const hasBlockingWarnings =
				calculation.overtimeEnforcement === 'BLOCK' &&
				calculation.employees.some((emp) =>
					emp.warnings.some((w) => w.severity === 'error'),
				);

			if (hasBlockingWarnings) {
				set.status = 400;
				return {
					error: 'Overtime limits exceeded. Resolve errors to process payroll.',
					data: calculation,
				};
			}

			const runResult = await db.transaction(async (tx) => {
				const runId = crypto.randomUUID();

				await tx.insert(payrollRun).values({
					id: runId,
					organizationId,
					periodStart: body.periodStart,
					periodEnd: body.periodEnd,
					paymentFrequency: body.paymentFrequency ?? 'MONTHLY',
					status: 'PROCESSED',
					totalAmount: calculation.totalAmount.toFixed(2),
					employeeCount: calculation.employees.length,
					processedAt: new Date(),
				});

				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						payrollRunId: runId,
						employeeId: row.employeeId,
						hoursWorked: row.hoursWorked.toFixed(2),
						hourlyPay: row.hourlyPay.toFixed(2),
						totalPay: row.totalPay.toFixed(2),
						normalHours: row.normalHours.toFixed(2),
						normalPay: row.normalPay.toFixed(2),
						overtimeDoubleHours: row.overtimeDoubleHours.toFixed(2),
						overtimeDoublePay: row.overtimeDoublePay.toFixed(2),
						overtimeTripleHours: row.overtimeTripleHours.toFixed(2),
						overtimeTriplePay: row.overtimeTriplePay.toFixed(2),
						sundayPremiumAmount: row.sundayPremiumAmount.toFixed(2),
						mandatoryRestDayPremiumAmount: row.mandatoryRestDayPremiumAmount.toFixed(2),
						periodStart: body.periodStart,
						periodEnd: body.periodEnd,
					}));
					await tx.insert(payrollRunEmployee).values(rows);

					await tx
						.update(employee)
						.set({ lastPayrollDate: body.periodEnd })
						.where(inArray(employee.id, calculation.employees.map((e) => e.employeeId)));
				}

				const savedRun = await tx
					.select()
					.from(payrollRun)
					.where(eq(payrollRun.id, runId))
					.limit(1);

				return savedRun[0];
			});

			return { data: { run: runResult, calculation } };
		},
		{
			body: payrollProcessSchema,
		},
	)
	/**
	 * List payroll runs.
	 */
	.get(
		'/runs',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const runs = await db
				.select()
				.from(payrollRun)
				.where(eq(payrollRun.organizationId, organizationId))
				.limit(query.limit)
				.offset(query.offset)
				.orderBy(payrollRun.createdAt);

			return { data: runs };
		},
		{
			query: payrollRunQuerySchema,
		},
	)
	/**
	 * Get payroll run detail with employees.
	 */
	.get(
		'/runs/:id',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;

			const run = await db.select().from(payrollRun).where(eq(payrollRun.id, id)).limit(1);
			const record = run[0];
			if (!record) {
				set.status = 404;
				return { error: 'Payroll run not found' };
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: record.organizationId,
			});

			if (!organizationId || organizationId !== record.organizationId) {
				set.status = 403;
				return { error: 'You do not have access to this payroll run' };
			}

			const lines = await db
				.select()
				.from(payrollRunEmployee)
				.where(eq(payrollRunEmployee.payrollRunId, id));

			return { data: { run: record, employees: lines } };
		},
	);
