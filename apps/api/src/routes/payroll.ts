import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { addDays, isBefore } from 'date-fns';

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
	vacationRequest,
	vacationRequestDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import {
	payrollCalculateSchema,
	payrollProcessSchema,
	payrollRunQuerySchema,
} from '../schemas/payroll.js';
import { isValidIanaTimeZone } from '../utils/time-zone.js';
import {
	calculatePayrollFromData,
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollCalculationRow,
} from '../services/payroll-calculation.js';
import {
	buildEmployeeAuditSnapshot,
	createEmployeeAuditEvent,
	getEmployeeAuditChangedFields,
	resolveEmployeeAuditActor,
	setEmployeeAuditSkip,
} from '../services/employee-audit.js';

/**
 * Calculates payroll for employees within the organization and period.
 *
 * @param args - Organization and period parameters
 * @returns Employees with hours/expected hours and total amount
 */
const calculatePayroll = async (args: {
	organizationId: string;
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}): Promise<{
	employees: PayrollCalculationRow[];
	totalAmount: number;
	taxSummary: {
		grossTotal: number;
		employeeWithholdingsTotal: number;
		employerCostsTotal: number;
		netPayTotal: number;
		companyCostTotal: number;
	};
	overtimeEnforcement: 'WARN' | 'BLOCK';
	timeZone: string;
	periodStartUtc: Date;
	periodEndInclusiveUtc: Date;
	periodEndExclusiveUtc: Date;
	payrollSettingsSnapshot: {
		riskWorkRate: number;
		statePayrollTaxRate: number;
		absorbImssEmployeeShare: boolean;
		absorbIsr: boolean;
		aguinaldoDays: number;
		vacationPremiumRate: number;
		enableSeventhDayPay: boolean;
	};
}> => {
	const { organizationId, periodStartDateKey, periodEndDateKey, paymentFrequency } = args;

	const orgSettings = await db
		.select()
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	const overtimeEnforcement = orgSettings[0]?.overtimeEnforcement ?? 'WARN';
	const weekStartDay = orgSettings[0]?.weekStartDay ?? 1;
	const additionalMandatoryRestDays = orgSettings[0]?.additionalMandatoryRestDays ?? [];
	const resolvedTimeZone = orgSettings[0]?.timeZone ?? 'America/Mexico_City';
	const timeZone = isValidIanaTimeZone(resolvedTimeZone)
		? resolvedTimeZone
		: 'America/Mexico_City';
	const payrollSettingsSnapshot = {
		riskWorkRate: Number(orgSettings[0]?.riskWorkRate ?? 0),
		statePayrollTaxRate: Number(orgSettings[0]?.statePayrollTaxRate ?? 0),
		absorbImssEmployeeShare: Boolean(orgSettings[0]?.absorbImssEmployeeShare ?? false),
		absorbIsr: Boolean(orgSettings[0]?.absorbIsr ?? false),
		aguinaldoDays: Number(orgSettings[0]?.aguinaldoDays ?? 15),
		vacationPremiumRate: Number(orgSettings[0]?.vacationPremiumRate ?? 0.25),
		enableSeventhDayPay: Boolean(orgSettings[0]?.enableSeventhDayPay ?? false),
	};

	const periodBounds = getPayrollPeriodBounds({
		periodStartDateKey,
		periodEndDateKey,
		timeZone,
	});

	const employees = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
			jobPositionId: employee.jobPositionId,
			lastPayrollDate: employee.lastPayrollDate,
			hireDate: employee.hireDate,
			sbcDailyOverride: employee.sbcDailyOverride,
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
		if (emp.lastPayrollDate && !isBefore(emp.lastPayrollDate, periodBounds.periodStartUtc)) {
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

	const attendanceRangeStart = addDays(periodBounds.periodStartUtc, -2);
	const attendanceRangeEnd = addDays(periodBounds.periodEndExclusiveUtc, 2);
	const attendanceRows: AttendanceRow[] =
		employeeIds.length === 0
			? []
			: await db
					.select({
						employeeId: attendanceRecord.employeeId,
						timestamp: attendanceRecord.timestamp,
						type: attendanceRecord.type,
					})
					.from(attendanceRecord)
					.where(
						and(
							inArray(attendanceRecord.employeeId, employeeIds),
							gte(attendanceRecord.timestamp, attendanceRangeStart),
							lte(attendanceRecord.timestamp, attendanceRangeEnd),
						),
					)
					.orderBy(attendanceRecord.employeeId, attendanceRecord.timestamp);

	const vacationDayRows =
		employeeIds.length === 0
			? []
			: await db
					.select({
						employeeId: vacationRequestDay.employeeId,
					})
					.from(vacationRequestDay)
					.leftJoin(vacationRequest, eq(vacationRequestDay.requestId, vacationRequest.id))
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							inArray(vacationRequestDay.employeeId, employeeIds),
							eq(vacationRequestDay.countsAsVacationDay, true),
							eq(vacationRequest.status, 'APPROVED'),
							gte(vacationRequestDay.dateKey, periodStartDateKey),
							lte(vacationRequestDay.dateKey, periodEndDateKey),
						),
					);

	const vacationDayCounts: Record<string, number> = {};
	for (const row of vacationDayRows) {
		vacationDayCounts[row.employeeId] = (vacationDayCounts[row.employeeId] ?? 0) + 1;
	}

	const { employees: results, totalAmount, taxSummary } = calculatePayrollFromData({
		employees: filteredEmployees,
		schedules,
		attendanceRows,
		periodStartDateKey,
		periodEndDateKey,
		periodBounds,
		overtimeEnforcement,
		weekStartDay,
		additionalMandatoryRestDays,
		defaultTimeZone: timeZone,
		payrollSettings: payrollSettingsSnapshot,
		vacationDayCounts,
	});

	return {
		employees: results,
		totalAmount,
		taxSummary,
		overtimeEnforcement,
		timeZone,
		periodStartUtc: periodBounds.periodStartUtc,
		periodEndInclusiveUtc: periodBounds.periodEndInclusiveUtc,
		periodEndExclusiveUtc: periodBounds.periodEndExclusiveUtc,
		payrollSettingsSnapshot,
	};
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

			const { employees, totalAmount, overtimeEnforcement, timeZone, taxSummary } =
				await calculatePayroll({
					organizationId,
					periodStartDateKey: body.periodStartDateKey,
					periodEndDateKey: body.periodEndDateKey,
					paymentFrequency: body.paymentFrequency,
				});

			return {
				data: {
					employees,
					totalAmount,
					taxSummary,
					periodStartDateKey: body.periodStartDateKey,
					periodEndDateKey: body.periodEndDateKey,
					overtimeEnforcement,
					timeZone,
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
				periodStartDateKey: body.periodStartDateKey,
				periodEndDateKey: body.periodEndDateKey,
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
					periodStart: calculation.periodStartUtc,
					periodEnd: calculation.periodEndInclusiveUtc,
					paymentFrequency: body.paymentFrequency ?? 'MONTHLY',
					status: 'PROCESSED',
					totalAmount: calculation.totalAmount.toFixed(2),
					employeeCount: calculation.employees.length,
					taxSummary: {
						totals: calculation.taxSummary,
						settings: calculation.payrollSettingsSnapshot,
					},
					processedAt: new Date(),
				});

				if (calculation.employees.length > 0) {
					const employeeIds = calculation.employees.map((entry) => entry.employeeId);
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
						vacationDaysPaid: row.vacationDaysPaid,
						vacationPayAmount: row.vacationPayAmount.toFixed(2),
						vacationPremiumAmount: row.vacationPremiumAmount.toFixed(2),
						taxBreakdown: {
							grossPay: row.grossPay,
							seventhDayPay: row.seventhDayPay,
							bases: row.bases,
							employeeWithholdings: row.employeeWithholdings,
							employerCosts: row.employerCosts,
							informationalLines: row.informationalLines,
							netPay: row.netPay,
							companyCost: row.companyCost,
						},
						periodStart: calculation.periodStartUtc,
						periodEnd: calculation.periodEndInclusiveUtc,
					}));
					await tx.insert(payrollRunEmployee).values(rows);

					const beforeRows = await tx
						.select()
						.from(employee)
						.where(inArray(employee.id, employeeIds));
					const beforeSnapshots = new Map(
						beforeRows.map((row) => [row.id, buildEmployeeAuditSnapshot(row)]),
					);
					const auditActor = resolveEmployeeAuditActor(authType, session);

					await setEmployeeAuditSkip(tx);
					await tx
						.update(employee)
						.set({ lastPayrollDate: calculation.periodEndInclusiveUtc })
						.where(inArray(employee.id, employeeIds));

					const afterRows = await tx
						.select()
						.from(employee)
						.where(inArray(employee.id, employeeIds));

					for (const row of afterRows) {
						const beforeSnapshot = beforeSnapshots.get(row.id) ?? null;
						const afterSnapshot = buildEmployeeAuditSnapshot(row);
						const changedFields = beforeSnapshot
							? getEmployeeAuditChangedFields(beforeSnapshot, afterSnapshot)
							: ['lastPayrollDate'];
						if (!changedFields.includes('lastPayrollDate')) {
							changedFields.push('lastPayrollDate');
						}
						await createEmployeeAuditEvent(tx, {
							employeeId: row.id,
							organizationId: row.organizationId,
							action: 'payroll_updated',
							actorType: auditActor.actorType,
							actorUserId: auditActor.actorUserId,
							before: beforeSnapshot,
							after: afterSnapshot,
							changedFields,
						});
					}
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
