import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import db from '../db/index.js';
import {
	aguinaldoRun,
	aguinaldoRunEmployee,
	employee,
	location,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { calculateAguinaldo } from '../services/aguinaldo-calculation.js';
import {
	aguinaldoCalculateSchema,
	aguinaldoEmployeeOverrideSchema,
	aguinaldoRunCancelSchema,
	aguinaldoRunCreateSchema,
	aguinaldoRunQuerySchema,
	aguinaldoRunUpdateSchema,
} from '../schemas/extra-payments.js';
import { resolveYearDays } from '../utils/year-days.js';
import { toDateKeyUtc } from '../utils/date-key.js';

/**
 * Employee payroll aggregation for Aguinaldo calculations.
 */
interface EmployeePayrollAggregation {
	/** Employee identifier. */
	employeeId: string;
	/** Total gross pay across the year. */
	totalGrossPay: number;
	/** Total days across payroll runs. */
	totalDays: number;
}

/**
 * Latest payroll base used for RLISR 174.
 */
interface LatestPayrollBase {
	/** Ordinary monthly income value. */
	ordinaryMonthlyIncome: number;
}

/**
 * Builds a calendar year date range for queries.
 *
 * @param calendarYear - Calendar year
 * @returns Date range boundaries
 */
function buildYearRange(calendarYear: number): { start: Date; end: Date } {
	const start = new Date(Date.UTC(calendarYear, 0, 1, 0, 0, 0));
	const end = new Date(Date.UTC(calendarYear, 11, 31, 23, 59, 59));
	return { start, end };
}

/**
 * Calculates inclusive day count between two dates.
 *
 * @param start - Start date
 * @param end - End date
 * @returns Inclusive day count
 */
function getInclusiveDayCount(start: Date, end: Date): number {
	const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
	const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
	const diffDays = Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
	return Math.max(0, diffDays);
}

/**
 * Extracts gross pay from a payroll tax breakdown payload.
 *
 * @param taxBreakdown - Raw tax breakdown JSON
 * @param totalPay - Fallback total pay value
 * @returns Gross pay value
 */
function resolveGrossPay(taxBreakdown: unknown, totalPay: number): number {
	if (!taxBreakdown || typeof taxBreakdown !== 'object') {
		return totalPay;
	}
	const candidate = (taxBreakdown as { grossPay?: number }).grossPay;
	return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : totalPay;
}

/**
 * Builds payroll aggregates per employee for a calendar year.
 *
 * @param args - Aggregation inputs
 * @param args.organizationId - Organization identifier
 * @param args.calendarYear - Calendar year
 * @returns Aggregation maps
 */
async function loadPayrollAggregates(args: {
	organizationId: string;
	calendarYear: number;
}): Promise<{
	byEmployee: Map<string, EmployeePayrollAggregation>;
	latestPayroll: Map<string, LatestPayrollBase>;
}> {
	const { start, end } = buildYearRange(args.calendarYear);

	const payrollRows = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			totalPay: payrollRunEmployee.totalPay,
			taxBreakdown: payrollRunEmployee.taxBreakdown,
			periodStart: payrollRun.periodStart,
			periodEnd: payrollRun.periodEnd,
		})
		.from(payrollRunEmployee)
		.leftJoin(payrollRun, eq(payrollRunEmployee.payrollRunId, payrollRun.id))
		.where(
			and(
				eq(payrollRun.organizationId, args.organizationId),
				eq(payrollRun.status, 'PROCESSED'),
				gte(payrollRun.periodEnd, start),
				lte(payrollRun.periodEnd, end),
			)!,
		)
		.orderBy(desc(payrollRun.periodEnd));

	const byEmployee = new Map<string, EmployeePayrollAggregation>();
	for (const row of payrollRows) {
		if (!row.periodStart || !row.periodEnd) {
			continue;
		}
		const daysInPeriod = getInclusiveDayCount(row.periodStart, row.periodEnd);
		const grossPay = resolveGrossPay(row.taxBreakdown, Number(row.totalPay ?? 0));
		const current = byEmployee.get(row.employeeId) ?? {
			employeeId: row.employeeId,
			totalGrossPay: 0,
			totalDays: 0,
		};
		current.totalGrossPay += grossPay;
		current.totalDays += daysInPeriod;
		byEmployee.set(row.employeeId, current);
	}

	const latestRows = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			totalPay: payrollRunEmployee.totalPay,
			taxBreakdown: payrollRunEmployee.taxBreakdown,
			periodStart: payrollRun.periodStart,
			periodEnd: payrollRun.periodEnd,
		})
		.from(payrollRunEmployee)
		.leftJoin(payrollRun, eq(payrollRunEmployee.payrollRunId, payrollRun.id))
		.where(
			and(
				eq(payrollRun.organizationId, args.organizationId),
				eq(payrollRun.status, 'PROCESSED'),
			)!,
		)
		.orderBy(desc(payrollRun.periodEnd));

	const latestPayroll = new Map<string, LatestPayrollBase>();
	for (const row of latestRows) {
		if (latestPayroll.has(row.employeeId)) {
			continue;
		}
		if (!row.periodStart || !row.periodEnd) {
			continue;
		}
		const daysInPeriod = getInclusiveDayCount(row.periodStart, row.periodEnd);
		const grossPay = resolveGrossPay(row.taxBreakdown, Number(row.totalPay ?? 0));
		const ordinaryMonthlyIncome =
			daysInPeriod > 0 ? (grossPay / daysInPeriod) * 30.4 : grossPay;
		latestPayroll.set(row.employeeId, { ordinaryMonthlyIncome });
	}

	return { byEmployee, latestPayroll };
}

/**
 * Aguinaldo routes for calculation and processing.
 */
export const aguinaldoRoutes = new Elysia({ prefix: '/aguinaldo' })
	.use(combinedAuthPlugin)
	.post(
		'/calculate',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const settings = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);
			const setting = settings[0];
			if (!setting?.aguinaldoEnabled) {
				set.status = 409;
				return buildErrorResponse('Aguinaldo is disabled for this organization', 409);
			}

			const minimumPolicy = Math.max(15, Number(setting?.aguinaldoDays ?? 15));
			const overridesByEmployee = new Map<
				string,
				z.infer<typeof aguinaldoEmployeeOverrideSchema>
			>();
			if (body.employeeOverrides) {
				for (const override of body.employeeOverrides) {
					if (
						override.aguinaldoDaysPolicy !== undefined &&
						override.aguinaldoDaysPolicy < minimumPolicy
					) {
						set.status = 400;
						return buildErrorResponse(
							'Employee aguinaldo days override must be at least policy minimum',
							400,
						);
					}
					overridesByEmployee.set(override.employeeId, override);
				}
			}

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					hireDate: employee.hireDate,
					terminationDateKey: employee.terminationDateKey,
					dailyPay: employee.dailyPay,
					aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				calendarYear: body.calendarYear,
			});
			const yearDays = resolveYearDays(body.calendarYear);
			const yearStartKey = `${body.calendarYear}-01-01`;
			const yearEndKey = `${body.calendarYear}-12-31`;

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				const hireDateKey = row.hireDate ? toDateKeyUtc(row.hireDate) : null;
				const startKey = hireDateKey && hireDateKey > yearStartKey ? hireDateKey : yearStartKey;
				const endKey =
					row.terminationDateKey && row.terminationDateKey < yearEndKey
						? row.terminationDateKey
						: yearEndKey;
				const startDate = new Date(`${startKey}T00:00:00Z`);
				const endDate = new Date(`${endKey}T00:00:00Z`);
				const daysCounted =
					startKey <= endKey ? getInclusiveDayCount(startDate, endDate) : 0;
				const dailySalaryBase =
					aggregate && aggregate.totalDays > 0
						? aggregate.totalGrossPay / aggregate.totalDays
						: 0;
				const basePolicy = row.aguinaldoDaysOverride ?? Number(setting?.aguinaldoDays ?? 15);
				const aguinaldoDaysPolicy = override?.aguinaldoDaysPolicy ?? basePolicy;
				return {
					employeeId: row.id,
					status: row.status,
					dailySalaryBase: override?.dailySalaryBase ?? dailySalaryBase,
					daysCounted: override?.daysCounted ?? daysCounted,
					aguinaldoDaysPolicy,
					yearDays,
					minimumWageZone: (row.locationZone ?? null) as 'GENERAL' | 'ZLFN' | null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
				};
			});

			const calculation = calculateAguinaldo({
				calendarYear: body.calendarYear,
				paymentDateKey: body.paymentDateKey,
				includeInactive: body.includeInactive ?? false,
				smgDailyOverride: body.smgDailyOverride ?? null,
				employees: inputs,
			});

			return {
				data: {
					run: {
						id: crypto.randomUUID(),
						organizationId,
						calendarYear: body.calendarYear,
						paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
						includeInactive: body.includeInactive ?? false,
						status: 'DRAFT',
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							aguinaldoEnabled: setting?.aguinaldoEnabled ?? false,
							aguinaldoDays: setting?.aguinaldoDays ?? 15,
						},
						processedAt: null,
						cancelledAt: null,
						cancelReason: null,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					employees: calculation.employees,
					warnings: calculation.warnings,
				},
			};
		},
		{ body: aguinaldoCalculateSchema },
	)
	.post(
		'/runs',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const settings = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);
			const setting = settings[0];
			if (!setting?.aguinaldoEnabled) {
				set.status = 409;
				return buildErrorResponse('Aguinaldo is disabled for this organization', 409);
			}

			const minimumPolicy = Math.max(15, Number(setting?.aguinaldoDays ?? 15));
			const overridesByEmployee = new Map<
				string,
				z.infer<typeof aguinaldoEmployeeOverrideSchema>
			>();
			if (body.employeeOverrides) {
				for (const override of body.employeeOverrides) {
					if (
						override.aguinaldoDaysPolicy !== undefined &&
						override.aguinaldoDaysPolicy < minimumPolicy
					) {
						set.status = 400;
						return buildErrorResponse(
							'Employee aguinaldo days override must be at least policy minimum',
							400,
						);
					}
					overridesByEmployee.set(override.employeeId, override);
				}
			}

			const existingProcessed = await db
				.select({ id: aguinaldoRun.id })
				.from(aguinaldoRun)
				.where(
					and(
						eq(aguinaldoRun.organizationId, organizationId),
						eq(aguinaldoRun.calendarYear, body.calendarYear),
						eq(aguinaldoRun.status, 'PROCESSED'),
					)!,
				)
				.limit(1);
			if (existingProcessed[0]) {
				set.status = 409;
				return buildErrorResponse(
					'Aguinaldo run already processed for this calendar year',
					409,
				);
			}

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					hireDate: employee.hireDate,
					terminationDateKey: employee.terminationDateKey,
					dailyPay: employee.dailyPay,
					aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				calendarYear: body.calendarYear,
			});
			const yearDays = resolveYearDays(body.calendarYear);
			const yearStartKey = `${body.calendarYear}-01-01`;
			const yearEndKey = `${body.calendarYear}-12-31`;

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				const hireDateKey = row.hireDate ? toDateKeyUtc(row.hireDate) : null;
				const startKey = hireDateKey && hireDateKey > yearStartKey ? hireDateKey : yearStartKey;
				const endKey =
					row.terminationDateKey && row.terminationDateKey < yearEndKey
						? row.terminationDateKey
						: yearEndKey;
				const startDate = new Date(`${startKey}T00:00:00Z`);
				const endDate = new Date(`${endKey}T00:00:00Z`);
				const daysCounted =
					startKey <= endKey ? getInclusiveDayCount(startDate, endDate) : 0;
				const dailySalaryBase =
					aggregate && aggregate.totalDays > 0
						? aggregate.totalGrossPay / aggregate.totalDays
						: 0;
				const basePolicy = row.aguinaldoDaysOverride ?? Number(setting?.aguinaldoDays ?? 15);
				const aguinaldoDaysPolicy = override?.aguinaldoDaysPolicy ?? basePolicy;
				return {
					employeeId: row.id,
					status: row.status,
					dailySalaryBase: override?.dailySalaryBase ?? dailySalaryBase,
					daysCounted: override?.daysCounted ?? daysCounted,
					aguinaldoDaysPolicy,
					yearDays,
					minimumWageZone: (row.locationZone ?? null) as 'GENERAL' | 'ZLFN' | null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
				};
			});

			const calculation = calculateAguinaldo({
				calendarYear: body.calendarYear,
				paymentDateKey: body.paymentDateKey,
				includeInactive: body.includeInactive ?? false,
				smgDailyOverride: body.smgDailyOverride ?? null,
				employees: inputs,
			});

			const runId = crypto.randomUUID();
			await db.transaction(async (tx) => {
				await tx.insert(aguinaldoRun).values({
					id: runId,
					organizationId,
					calendarYear: body.calendarYear,
					paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
					includeInactive: body.includeInactive ?? false,
					status: 'DRAFT',
					totalAmount: calculation.totals.netTotal.toFixed(2),
					employeeCount: calculation.totals.employeeCount,
					taxSummary: calculation.totals,
					settingsSnapshot: {
						aguinaldoEnabled: setting?.aguinaldoEnabled ?? false,
						aguinaldoDays: setting?.aguinaldoDays ?? 15,
					},
				});

				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						aguinaldoRunId: runId,
						employeeId: row.employeeId,
						isEligible: row.isEligible,
						eligibilityReasons: row.eligibilityReasons,
						daysCounted: row.daysCounted,
						dailySalaryBase: row.dailySalaryBase.toFixed(2),
						aguinaldoDaysPolicy: row.aguinaldoDaysPolicy,
						yearDays: row.yearDays,
						grossAmount: row.grossAmount.toFixed(2),
						exemptAmount: row.tax.exemptAmount.toFixed(2),
						taxableAmount: row.tax.taxableAmount.toFixed(2),
						withheldIsr: row.tax.withheldIsr.toFixed(2),
						netAmount: row.tax.netAmount.toFixed(2),
						warnings: row.warnings as unknown as Record<string, unknown>[],
					}));
					await tx.insert(aguinaldoRunEmployee).values(rows);
				}
			});

			return {
				data: {
					run: {
						id: runId,
						organizationId,
						calendarYear: body.calendarYear,
						paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
						includeInactive: body.includeInactive ?? false,
						status: 'DRAFT',
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							aguinaldoEnabled: setting?.aguinaldoEnabled ?? false,
							aguinaldoDays: setting?.aguinaldoDays ?? 15,
						},
						processedAt: null,
						cancelledAt: null,
						cancelReason: null,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					employees: calculation.employees,
					warnings: calculation.warnings,
				},
			};
		},
		{ body: aguinaldoRunCreateSchema },
	)
	.put(
		'/runs/:id',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;
			const runRows = await db.select().from(aguinaldoRun).where(eq(aguinaldoRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('Aguinaldo run not found', 404);
			}
			if (runRecord.status !== 'DRAFT') {
				set.status = 409;
				return buildErrorResponse('Aguinaldo run is not editable', 409);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: runRecord.organizationId ?? null,
			});
			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return buildErrorResponse('Organization is required or not permitted', set.status);
			}

			const settings = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);
			const setting = settings[0];
			if (!setting?.aguinaldoEnabled) {
				set.status = 409;
				return buildErrorResponse('Aguinaldo is disabled for this organization', 409);
			}

			const minimumPolicy = Math.max(15, Number(setting?.aguinaldoDays ?? 15));
			const overridesByEmployee = new Map<
				string,
				z.infer<typeof aguinaldoEmployeeOverrideSchema>
			>();
			if (body.employeeOverrides) {
				for (const override of body.employeeOverrides) {
					if (
						override.aguinaldoDaysPolicy !== undefined &&
						override.aguinaldoDaysPolicy < minimumPolicy
					) {
						set.status = 400;
						return buildErrorResponse(
							'Employee aguinaldo days override must be at least policy minimum',
							400,
						);
					}
					overridesByEmployee.set(override.employeeId, override);
				}
			}

			const calendarYear = body.calendarYear ?? runRecord.calendarYear;
			const paymentDateKey = body.paymentDateKey ?? runRecord.paymentDate.toISOString().slice(0, 10);
			const includeInactive = body.includeInactive ?? runRecord.includeInactive ?? false;
			const yearDays = resolveYearDays(calendarYear);
			const yearStartKey = `${calendarYear}-01-01`;
			const yearEndKey = `${calendarYear}-12-31`;

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					hireDate: employee.hireDate,
					terminationDateKey: employee.terminationDateKey,
					dailyPay: employee.dailyPay,
					aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				calendarYear,
			});

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				const hireDateKey = row.hireDate ? toDateKeyUtc(row.hireDate) : null;
				const startKey = hireDateKey && hireDateKey > yearStartKey ? hireDateKey : yearStartKey;
				const endKey =
					row.terminationDateKey && row.terminationDateKey < yearEndKey
						? row.terminationDateKey
						: yearEndKey;
				const startDate = new Date(`${startKey}T00:00:00Z`);
				const endDate = new Date(`${endKey}T00:00:00Z`);
				const daysCounted =
					startKey <= endKey ? getInclusiveDayCount(startDate, endDate) : 0;
				const dailySalaryBase =
					aggregate && aggregate.totalDays > 0
						? aggregate.totalGrossPay / aggregate.totalDays
						: 0;
				const basePolicy = row.aguinaldoDaysOverride ?? Number(setting?.aguinaldoDays ?? 15);
				const aguinaldoDaysPolicy = override?.aguinaldoDaysPolicy ?? basePolicy;
				return {
					employeeId: row.id,
					status: row.status,
					dailySalaryBase: override?.dailySalaryBase ?? dailySalaryBase,
					daysCounted: override?.daysCounted ?? daysCounted,
					aguinaldoDaysPolicy,
					yearDays,
					minimumWageZone: (row.locationZone ?? null) as 'GENERAL' | 'ZLFN' | null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
				};
			});

			const calculation = calculateAguinaldo({
				calendarYear,
				paymentDateKey,
				includeInactive,
				smgDailyOverride: body.smgDailyOverride ?? null,
				employees: inputs,
			});

			await db.transaction(async (tx) => {
				await tx
					.update(aguinaldoRun)
					.set({
						calendarYear,
						paymentDate: new Date(`${paymentDateKey}T00:00:00Z`),
						includeInactive,
						totalAmount: calculation.totals.netTotal.toFixed(2),
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							aguinaldoEnabled: setting?.aguinaldoEnabled ?? false,
							aguinaldoDays: setting?.aguinaldoDays ?? 15,
						},
					})
					.where(eq(aguinaldoRun.id, id));
				await tx
					.delete(aguinaldoRunEmployee)
					.where(eq(aguinaldoRunEmployee.aguinaldoRunId, id));
				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						aguinaldoRunId: id,
						employeeId: row.employeeId,
						isEligible: row.isEligible,
						eligibilityReasons: row.eligibilityReasons,
						daysCounted: row.daysCounted,
						dailySalaryBase: row.dailySalaryBase.toFixed(2),
						aguinaldoDaysPolicy: row.aguinaldoDaysPolicy,
						yearDays: row.yearDays,
						grossAmount: row.grossAmount.toFixed(2),
						exemptAmount: row.tax.exemptAmount.toFixed(2),
						taxableAmount: row.tax.taxableAmount.toFixed(2),
						withheldIsr: row.tax.withheldIsr.toFixed(2),
						netAmount: row.tax.netAmount.toFixed(2),
						warnings: row.warnings as unknown as Record<string, unknown>[],
					}));
					await tx.insert(aguinaldoRunEmployee).values(rows);
				}
			});

			return {
				data: {
					run: {
						...runRecord,
						calendarYear,
						paymentDate: new Date(`${paymentDateKey}T00:00:00Z`),
						includeInactive,
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							aguinaldoEnabled: setting?.aguinaldoEnabled ?? false,
							aguinaldoDays: setting?.aguinaldoDays ?? 15,
						},
					},
					employees: calculation.employees,
					warnings: calculation.warnings,
				},
			};
		},
		{ body: aguinaldoRunUpdateSchema },
	)
	.post(
		'/runs/:id/process',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;
			const runRows = await db.select().from(aguinaldoRun).where(eq(aguinaldoRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('Aguinaldo run not found', 404);
			}
			if (runRecord.status !== 'DRAFT') {
				set.status = 409;
				return buildErrorResponse('Aguinaldo run is not editable', 409);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: runRecord.organizationId ?? null,
			});
			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return buildErrorResponse('Organization is required or not permitted', set.status);
			}

			const settings = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);
			const setting = settings[0];
			if (!setting?.aguinaldoEnabled) {
				set.status = 409;
				return buildErrorResponse('Aguinaldo is disabled for this organization', 409);
			}

			const employeeRows = await db
				.select({ warnings: aguinaldoRunEmployee.warnings })
				.from(aguinaldoRunEmployee)
				.where(eq(aguinaldoRunEmployee.aguinaldoRunId, id));
			const hasErrors = employeeRows.some((row) =>
				(Array.isArray(row.warnings) ? row.warnings : []).some(
					(entry) =>
						entry &&
						typeof entry === 'object' &&
						(entry as { severity?: string }).severity === 'error'
				)
			);
			if (hasErrors) {
				set.status = 409;
				return buildErrorResponse('Resolve errors before processing Aguinaldo run', 409);
			}

			if (Number(runRecord.totalAmount ?? 0) <= 0) {
				set.status = 409;
				return buildErrorResponse('Aguinaldo total amount must be greater than 0', 409);
			}

			await db
				.update(aguinaldoRun)
				.set({ status: 'PROCESSED', processedAt: new Date() })
				.where(eq(aguinaldoRun.id, id));

			return { data: { success: true } };
		}
	)
	.post(
		'/runs/:id/cancel',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;
			const runRows = await db.select().from(aguinaldoRun).where(eq(aguinaldoRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('Aguinaldo run not found', 404);
			}
			if (runRecord.status === 'CANCELLED') {
				return { data: { success: true } };
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: runRecord.organizationId ?? null,
			});
			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return buildErrorResponse('Organization is required or not permitted', set.status);
			}

			await db
				.update(aguinaldoRun)
				.set({
					status: 'CANCELLED',
					cancelReason: body.reason,
					cancelledAt: new Date(),
				})
				.where(eq(aguinaldoRun.id, id));

			return { data: { success: true } };
		},
		{ body: aguinaldoRunCancelSchema },
	)
	.get(
		'/runs',
		async ({
			query,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const conditions = [
				eq(aguinaldoRun.organizationId, organizationId),
				query.calendarYear ? eq(aguinaldoRun.calendarYear, query.calendarYear) : null,
			].filter(Boolean);
			const rows = await db
				.select()
				.from(aguinaldoRun)
				.where(and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))!)
				.orderBy(desc(aguinaldoRun.paymentDate))
				.limit(query.limit)
				.offset(query.offset);

			return { data: rows };
		},
		{ query: aguinaldoRunQuerySchema },
	)
	.get(
		'/runs/:id',
		async ({ params, set, authType, session, sessionOrganizationIds, apiKeyOrganizationId, apiKeyOrganizationIds }) => {
			const { id } = params;
			const runRows = await db.select().from(aguinaldoRun).where(eq(aguinaldoRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('Aguinaldo run not found', 404);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: runRecord.organizationId ?? null,
			});
			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return buildErrorResponse('Organization is required or not permitted', set.status);
			}

			const employees = await db
				.select({
					id: aguinaldoRunEmployee.id,
					aguinaldoRunId: aguinaldoRunEmployee.aguinaldoRunId,
					employeeId: aguinaldoRunEmployee.employeeId,
					isEligible: aguinaldoRunEmployee.isEligible,
					eligibilityReasons: aguinaldoRunEmployee.eligibilityReasons,
					daysCounted: aguinaldoRunEmployee.daysCounted,
					dailySalaryBase: aguinaldoRunEmployee.dailySalaryBase,
					aguinaldoDaysPolicy: aguinaldoRunEmployee.aguinaldoDaysPolicy,
					yearDays: aguinaldoRunEmployee.yearDays,
					grossAmount: aguinaldoRunEmployee.grossAmount,
					exemptAmount: aguinaldoRunEmployee.exemptAmount,
					taxableAmount: aguinaldoRunEmployee.taxableAmount,
					withheldIsr: aguinaldoRunEmployee.withheldIsr,
					netAmount: aguinaldoRunEmployee.netAmount,
					warnings: aguinaldoRunEmployee.warnings,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					employeeNss: employee.nss,
					employeeRfc: employee.rfc,
				})
				.from(aguinaldoRunEmployee)
				.leftJoin(employee, eq(aguinaldoRunEmployee.employeeId, employee.id))
				.where(eq(aguinaldoRunEmployee.aguinaldoRunId, id));

			const normalizedEmployees = employees.map((row) => ({
				...row,
				employeeName: `${row.employeeName ?? ''} ${row.employeeLastName ?? ''}`.trim(),
			}));

			return { data: { run: runRecord, employees: normalizedEmployees } };
		},
	)
	.get(
		'/runs/:id/csv',
		async ({ params, set, authType, session, sessionOrganizationIds, apiKeyOrganizationId, apiKeyOrganizationIds }) => {
			const { id } = params;
			const runRows = await db.select().from(aguinaldoRun).where(eq(aguinaldoRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('Aguinaldo run not found', 404);
			}
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: runRecord.organizationId ?? null,
			});
			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return buildErrorResponse('Organization is required or not permitted', set.status);
			}

			const employees = await db
				.select({
					employeeId: aguinaldoRunEmployee.employeeId,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					daysCounted: aguinaldoRunEmployee.daysCounted,
					dailySalaryBase: aguinaldoRunEmployee.dailySalaryBase,
					aguinaldoDaysPolicy: aguinaldoRunEmployee.aguinaldoDaysPolicy,
					grossAmount: aguinaldoRunEmployee.grossAmount,
					exemptAmount: aguinaldoRunEmployee.exemptAmount,
					taxableAmount: aguinaldoRunEmployee.taxableAmount,
					withheldIsr: aguinaldoRunEmployee.withheldIsr,
					netAmount: aguinaldoRunEmployee.netAmount,
				})
				.from(aguinaldoRunEmployee)
				.leftJoin(employee, eq(aguinaldoRunEmployee.employeeId, employee.id))
				.where(eq(aguinaldoRunEmployee.aguinaldoRunId, id));

			const header = [
				'employeeId',
				'employeeName',
				'employeeCode',
				'daysCounted',
				'dailySalaryBase',
				'aguinaldoDaysPolicy',
				'grossAmount',
				'exemptAmount',
				'taxableAmount',
				'withheldIsr',
				'netAmount',
			];
			const lines = employees.map((row) => [
				row.employeeId,
				`${row.employeeName ?? ''} ${row.employeeLastName ?? ''}`.trim(),
				row.employeeCode ?? '',
				row.daysCounted ?? 0,
				row.dailySalaryBase ?? 0,
				row.aguinaldoDaysPolicy ?? 0,
				row.grossAmount ?? 0,
				row.exemptAmount ?? 0,
				row.taxableAmount ?? 0,
				row.withheldIsr ?? 0,
				row.netAmount ?? 0,
			]);
			const csv = [header.join(','), ...lines.map((line) => line.join(','))].join('\n');
			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="aguinaldo_${runRecord.calendarYear}.csv"`,
					'Cache-Control': 'no-store',
				},
			});
		},
	);
