import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
	addDays,
	differenceInMinutes,
	format,
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
	scheduleException,
	scheduleTemplateDay,
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

type TemplateDayRow = {
	templateId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
};

type ScheduleExceptionRow = typeof scheduleException.$inferSelect;

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
	normalPay: number;
	overtimeDoublePay: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	totalPay: number;
	warnings: {
		type: 'OVERTIME_DAILY_EXCEEDED' | 'OVERTIME_WEEKLY_EXCEEDED' | 'BELOW_MINIMUM_WAGE';
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
 * Computes duration in hours between start/end HH:mm (supports overnight).
 *
 * @param startTime - Start time HH:mm
 * @param endTime - End time HH:mm
 * @returns Duration in hours (0 when invalid)
 */
const computeDurationHours = (startTime: string, endTime: string): number => {
	const startMinutes = parseTimeToMinutes(startTime);
	const endMinutes = parseTimeToMinutes(endTime);
	if (endMinutes > startMinutes) {
		return (endMinutes - startMinutes) / 60;
	}
	if (endMinutes < startMinutes) {
		const untilMidnight = 24 * 60 - startMinutes;
		return (untilMidnight + endMinutes) / 60;
	}
	return 0;
};

/**
 * Formats a date key using local time to align with stored start-of-day values.
 *
 * @param date - Date instance to format
 * @returns Local date string in yyyy-MM-dd format
 */
const formatLocalDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

/**
 * Calculates expected hours for a period based on schedule entries.
 *
 * @param schedule - Weekly schedule entries
 * @param periodStart - Start date of the period
 * @param periodEnd - End date of the period
 * @returns Expected hours in the period
 */
const calculateExpectedHoursWithOverrides = (args: {
	templateId?: string | null;
	schedule: ScheduleRow[];
	templateDaysMap: Map<string, TemplateDayRow[]>;
	exceptionMap: Map<string, ScheduleExceptionRow>;
	employeeId: string;
	periodStart: Date;
	periodEnd: Date;
}): number => {
	const { templateId, schedule, templateDaysMap, exceptionMap, employeeId, periodStart, periodEnd } = args;
	let minutes = 0;

	for (
		let current = new Date(periodStart);
		!isAfter(current, periodEnd);
		current = addDays(current, 1)
	) {
		const dayOfWeek = current.getDay();
		const dayKey = formatLocalDateKey(current);
		const exception = exceptionMap.get(`${employeeId}-${dayKey}`);

		// Determine base day from template or manual schedule
		const baseDay =
			(templateId ? templateDaysMap.get(templateId)?.find((d) => d.dayOfWeek === dayOfWeek) : undefined) ??
			schedule.find((s) => s.dayOfWeek === dayOfWeek);

		if (exception) {
			if (exception.exceptionType === 'DAY_OFF') {
				continue;
			}
			if (exception.startTime && exception.endTime) {
				minutes += computeDurationHours(exception.startTime, exception.endTime) * 60;
				continue;
			}
		}

		if (baseDay && (baseDay.isWorkingDay ?? true)) {
			minutes += computeDurationHours(baseDay.startTime, baseDay.endTime) * 60;
		}
	}

	return minutes / 60;
};

/**
 * Calculates worked hours grouped by local day (yyyy-MM-dd).
 *
 * @param attendance - Attendance records
 * @returns Map of date string to hours worked
 */
const calculateDailyWorkedHours = (attendance: AttendanceRow[]): Map<string, number> => {
        const sorted = [...attendance].sort(
                (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );
        const dayMinutes = new Map<string, number>();
        let openCheckIn: Date | null = null;

        /**
         * Returns the next local midnight for a given date.
         *
         * @param date - Date instance to evaluate
         * @returns Date set to the following midnight in local time
         */
        const nextLocalMidnight = (date: Date): Date =>
                new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);

        for (const record of sorted) {
                if (record.type === 'CHECK_IN') {
                        openCheckIn = record.timestamp;
                } else if (record.type === 'CHECK_OUT' && openCheckIn) {
			const checkIn = openCheckIn;
			const checkOut = record.timestamp;

                        if (isAfter(checkOut, checkIn)) {
                                let segmentStart = checkIn;

                                while (isAfter(checkOut, segmentStart)) {
                                        const currentDayKey = formatLocalDateKey(segmentStart);
                                        const nextMidnight = nextLocalMidnight(segmentStart);
                                        const segmentEnd = isBefore(checkOut, nextMidnight) ? checkOut : nextMidnight;
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
			scheduleTemplateId: employee.scheduleTemplateId,
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

	const templateIds = filteredEmployees
		.map((emp) => emp.scheduleTemplateId)
		.filter((id): id is string => Boolean(id));

	const templateDays =
		templateIds.length === 0
			? []
			: await db
					.select()
					.from(scheduleTemplateDay)
					.where(inArray(scheduleTemplateDay.templateId, templateIds));

	const templateDaysMap = new Map<string, TemplateDayRow[]>();
	for (const row of templateDays) {
		const current = templateDaysMap.get(row.templateId) ?? [];
		current.push({
			templateId: row.templateId,
			dayOfWeek: row.dayOfWeek,
			startTime: row.startTime,
			endTime: row.endTime,
			isWorkingDay: row.isWorkingDay,
		});
		templateDaysMap.set(row.templateId, current);
	}

	const exceptions =
		employeeIds.length === 0
			? []
			: await db
					.select()
					.from(scheduleException)
					.where(
						and(
							inArray(scheduleException.employeeId, employeeIds),
							gte(scheduleException.exceptionDate, periodStart),
							lte(scheduleException.exceptionDate, periodEnd),
						)!,
					);

	const exceptionMap = new Map<string, ScheduleExceptionRow>();
	for (const ex of exceptions) {
		const key = `${ex.employeeId}-${formatLocalDateKey(ex.exceptionDate)}`;
		exceptionMap.set(key, ex);
	}

	const results: PayrollCalculationRow[] = [];
	let totalAmount = 0;

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

		const dailyHoursMap = calculateDailyWorkedHours(attendance as AttendanceRow[]);
		const hoursWorked = Array.from(dailyHoursMap.values()).reduce(
			(sum, hours) => sum + hours,
			0,
		);

		const expectedHours = calculateExpectedHoursWithOverrides({
			templateId: emp.scheduleTemplateId,
			schedule: scheduleMap.get(emp.id) ?? [],
			templateDaysMap,
			exceptionMap,
			employeeId: emp.id,
			periodStart,
			periodEnd,
		});

		const shiftKey = (emp.shiftType ?? 'DIURNA') as keyof typeof SHIFT_LIMITS;
		const shiftLimits = SHIFT_LIMITS[shiftKey];

		let normalHours = 0;
		let overtimeFromDaily = 0;
		let sundayHoursWorked = 0;
		let sundaysWorkedCount = 0;
		const warnings: PayrollCalculationRow['warnings'] = [];

		for (const [dateKey, dayHours] of dailyHoursMap.entries()) {
                        const dayDate = new Date(`${dateKey}T00:00:00`);
                        const dayNormal = Math.min(dayHours, shiftLimits.dailyHours);
                        const dayOvertime = Math.max(0, dayHours - shiftLimits.dailyHours);

			normalHours += dayNormal;
			overtimeFromDaily += dayOvertime;

                        const dayOfWeek = dayDate.getDay();
			if (dayOfWeek === 0) {
				sundayHoursWorked += dayHours;
				if (dayHours > 0) {
					sundaysWorkedCount += 1;
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

		const weeklyNormalExcess = Math.max(0, normalHours - shiftLimits.weeklyHours);
		const adjustedNormalHours = normalHours - weeklyNormalExcess;
		const totalOvertimeHours = overtimeFromDaily + weeklyNormalExcess;

		if (totalOvertimeHours > OVERTIME_LIMITS.MAX_WEEKLY_HOURS) {
			warnings.push({
				type: 'OVERTIME_WEEKLY_EXCEEDED',
				message: `Overtime exceeds weekly legal limit (${totalOvertimeHours.toFixed(2)}h > ${OVERTIME_LIMITS.MAX_WEEKLY_HOURS}h)`,
				severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
			});
		}

		const overtimeDoubleHours = Math.min(totalOvertimeHours, OVERTIME_LIMITS.MAX_WEEKLY_HOURS);
		const overtimeTripleHours = Math.max(0, totalOvertimeHours - OVERTIME_LIMITS.MAX_WEEKLY_HOURS);

		const divisor = shiftLimits.divisor || 8;
		const effectiveDailyPay =
			Number(emp.dailyPay ?? 0) > 0
				? Number(emp.dailyPay ?? 0)
				: Number(emp.hourlyPay ?? 0) * divisor;
		const hourlyRate =
			Number(emp.hourlyPay ?? 0) > 0
				? Number(emp.hourlyPay ?? 0)
				: divisor > 0
					? effectiveDailyPay / divisor
					: 0;

		const normalPay = adjustedNormalHours * hourlyRate;
		const overtimeDoublePay =
			overtimeDoubleHours * hourlyRate * OVERTIME_LIMITS.DOUBLE_RATE_MULTIPLIER;
		const overtimeTriplePay =
			overtimeTripleHours * hourlyRate * OVERTIME_LIMITS.TRIPLE_RATE_MULTIPLIER;
		const sundayPremiumAmount =
			sundaysWorkedCount > 0 ? sundaysWorkedCount * effectiveDailyPay * SUNDAY_PREMIUM_RATE : 0;

		const totalPay = normalPay + overtimeDoublePay + overtimeTriplePay + sundayPremiumAmount;
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
			normalPay,
			overtimeDoublePay,
			overtimeTriplePay,
			sundayPremiumAmount,
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

