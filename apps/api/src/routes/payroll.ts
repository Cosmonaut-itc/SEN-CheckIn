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
	payrollRun,
	payrollRunEmployee,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import {
	payrollCalculateSchema,
	payrollProcessSchema,
	payrollRunQuerySchema,
} from '../schemas/payroll.js';

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
	hourlyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	hoursWorked: number;
	expectedHours: number;
	totalPay: number;
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
		}
	}
	return minutes / 60;
};

const calculateWorkedHours = (attendance: AttendanceRow[]): number => {
	if (attendance.length === 0) {
		return 0;
	}
	const sorted = [...attendance].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);

	let minutes = 0;
	let openCheckIn: Date | null = null;
	for (const record of sorted) {
		if (record.type === 'CHECK_IN') {
			openCheckIn = record.timestamp;
		} else if (record.type === 'CHECK_OUT' && openCheckIn) {
			const diffMinutes = differenceInMinutes(record.timestamp, openCheckIn);
			if (diffMinutes > 0) {
				minutes += diffMinutes;
			}
			openCheckIn = null;
		}
	}
	return minutes / 60;
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
}): Promise<{ employees: PayrollCalculationRow[]; totalAmount: number }> => {
	const { organizationId, periodEnd, periodStart, paymentFrequency } = args;

	const employees = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
			jobPositionId: employee.jobPositionId,
			lastPayrollDate: employee.lastPayrollDate,
			hourlyPay: jobPosition.hourlyPay,
			paymentFrequency: jobPosition.paymentFrequency,
		})
		.from(employee)
		.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
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

		const hoursWorked = calculateWorkedHours(attendance as AttendanceRow[]);
		const expectedHours = calculateExpectedHours(
			scheduleMap.get(emp.id) ?? [],
			periodStart,
			periodEnd,
		);
		const totalPay = Number(emp.hourlyPay ?? 0) * hoursWorked;

		results.push({
			employeeId: emp.id,
			name: `${emp.firstName} ${emp.lastName}`,
			hourlyPay: Number(emp.hourlyPay ?? 0),
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			hoursWorked,
			expectedHours,
			totalPay,
		});
	}

	const totalAmount = results.reduce((sum, row) => sum + row.totalPay, 0);

	return { employees: results, totalAmount };
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

			const { employees, totalAmount } = await calculatePayroll({
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

