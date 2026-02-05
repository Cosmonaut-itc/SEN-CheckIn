import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { z } from 'zod';

import db from '../db/index.js';
import {
	employee,
	location,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
	ptuHistory,
	ptuRun,
	ptuRunEmployee,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { calculatePtu } from '../services/ptu-calculation.js';
import {
	ptuCalculateSchema,
	ptuEmployeeOverrideSchema,
	ptuRunCancelSchema,
	ptuRunCreateSchema,
	ptuRunQuerySchema,
	ptuRunUpdateSchema,
} from '../schemas/extra-payments.js';

/**
 * Employee payroll aggregation for PTU calculations.
 */
interface EmployeePayrollAggregation {
	/** Employee identifier. */
	employeeId: string;
	/** Total days counted from payroll runs. */
	daysCounted: number;
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
 * @param fiscalYear - Fiscal year
 * @returns Date range boundaries
 */
function buildYearRange(fiscalYear: number): { start: Date; end: Date } {
	const start = new Date(Date.UTC(fiscalYear, 0, 1, 0, 0, 0));
	const end = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));
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
 * Builds payroll aggregates per employee for a fiscal year.
 *
 * @param args - Aggregation inputs
 * @param args.organizationId - Organization identifier
 * @param args.fiscalYear - Fiscal year
 * @returns Aggregation maps
 */
async function loadPayrollAggregates(args: {
	organizationId: string;
	fiscalYear: number;
}): Promise<{
	byEmployee: Map<string, EmployeePayrollAggregation>;
	latestPayroll: Map<string, LatestPayrollBase>;
}> {
	const { start, end } = buildYearRange(args.fiscalYear);

	const payrollRows = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			totalPay: payrollRunEmployee.totalPay,
			taxBreakdown: payrollRunEmployee.taxBreakdown,
			periodStart: payrollRun.periodStart,
			periodEnd: payrollRun.periodEnd,
			paymentFrequency: payrollRun.paymentFrequency,
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
			daysCounted: 0,
			totalGrossPay: 0,
			totalDays: 0,
		};
		current.daysCounted += daysInPeriod;
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
 * Loads PTU history amounts for the last 3 years.
 *
 * @param args - History lookup inputs
 * @param args.organizationId - Organization identifier
 * @param args.employeeIds - Employee identifiers
 * @param args.fiscalYear - Fiscal year
 * @returns Map of employeeId to PTU history amounts
 */
async function loadPtuHistory(args: {
	organizationId: string;
	employeeIds: string[];
	fiscalYear: number;
}): Promise<Map<string, number[]>> {
	if (args.employeeIds.length === 0) {
		return new Map();
	}
	const minYear = args.fiscalYear - 3;
	const rows = await db
		.select({
			employeeId: ptuHistory.employeeId,
			fiscalYear: ptuHistory.fiscalYear,
			amount: ptuHistory.amount,
		})
		.from(ptuHistory)
		.where(
			and(
				eq(ptuHistory.organizationId, args.organizationId),
				inArray(ptuHistory.employeeId, args.employeeIds),
				gte(ptuHistory.fiscalYear, minYear),
				lte(ptuHistory.fiscalYear, args.fiscalYear - 1),
			)!,
		);

	const map = new Map<string, number[]>();
	for (const row of rows) {
		const amount = Number(row.amount ?? 0);
		if (!Number.isFinite(amount) || amount <= 0) {
			continue;
		}
		const values = map.get(row.employeeId) ?? [];
		values.push(amount);
		map.set(row.employeeId, values);
	}
	return map;
}

/**
 * Applies overrides to PTU employee calculations.
 *
 * @param employee - Calculation employee
 * @param override - Override payload
 * @returns Updated employee calculation
 */
function resolveOverrideMap(
	overrides?: Array<z.infer<typeof ptuEmployeeOverrideSchema>>,
): Map<string, z.infer<typeof ptuEmployeeOverrideSchema>> {
	const map = new Map<string, z.infer<typeof ptuEmployeeOverrideSchema>>();
	if (!overrides) {
		return map;
	}
	for (const override of overrides) {
		map.set(override.employeeId, override);
	}
	return map;
}

/**
 * PTU routes for calculation and processing.
 */
export const ptuRoutes = new Elysia({ prefix: '/ptu' })
	.use(combinedAuthPlugin)
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
			if (!setting?.ptuEnabled) {
				set.status = 409;
				return buildErrorResponse('PTU is disabled for this organization', 409);
			}

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					employmentType: employee.employmentType,
					dailyPay: employee.dailyPay,
					isTrustEmployee: employee.isTrustEmployee,
					isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
					isDomesticWorker: employee.isDomesticWorker,
					isPlatformWorker: employee.isPlatformWorker,
					platformHoursYear: employee.platformHoursYear,
					ptuEligibilityOverride: employee.ptuEligibilityOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const employeeIds = employees.map((row) => row.id);
			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				fiscalYear: body.fiscalYear,
			});
			const historyMap = await loadPtuHistory({
				organizationId,
				employeeIds,
				fiscalYear: body.fiscalYear,
			});

			const overridesByEmployee = resolveOverrideMap(body.employeeOverrides);

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				return {
					employeeId: row.id,
					status: row.status,
					employmentType: row.employmentType ?? 'PERMANENT',
					dailyPay: Number(row.dailyPay ?? 0),
					dailyQuotaOverride: override?.dailyQuota ?? null,
					daysCounted: override?.daysCounted ?? aggregate?.daysCounted ?? 0,
					annualSalaryBaseOverride: override?.annualSalaryBase ?? null,
					isTrustEmployee: Boolean(row.isTrustEmployee ?? false),
					isDirectorAdminGeneralManager: Boolean(row.isDirectorAdminGeneralManager ?? false),
					isDomesticWorker: Boolean(row.isDomesticWorker ?? false),
					isPlatformWorker: Boolean(row.isPlatformWorker ?? false),
					platformHoursYear: Number(row.platformHoursYear ?? 0),
					ptuEligibilityOverride:
						override?.eligibilityOverride ?? row.ptuEligibilityOverride ?? 'DEFAULT',
					minimumWageZone: (row.locationZone ?? null) as
						| 'GENERAL'
						| 'ZLFN'
						| null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
					ptuHistoryAmounts: historyMap.get(row.id) ?? [],
				};
			});

			const calculation = calculatePtu({
				fiscalYear: body.fiscalYear,
				paymentDateKey: body.paymentDateKey,
				taxableIncome: body.taxableIncome,
				ptuPercentage: body.ptuPercentage ?? 0.1,
				includeInactive: body.includeInactive ?? false,
				ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
				smgDailyOverride: body.smgDailyOverride ?? null,
				monthDaysForCaps: 30,
				employees: inputs,
			});

			return {
				data: {
					run: {
						id: crypto.randomUUID(),
						organizationId,
						fiscalYear: body.fiscalYear,
						paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
						taxableIncome: body.taxableIncome,
						ptuPercentage: body.ptuPercentage ?? 0.1,
						includeInactive: body.includeInactive ?? false,
						status: 'DRAFT',
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
							ptuIsExempt: setting?.ptuIsExempt ?? false,
							ptuEnabled: setting?.ptuEnabled ?? false,
							employerType: setting?.employerType ?? 'PERSONA_MORAL',
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
		{
			body: ptuCalculateSchema,
		},
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
			if (!setting?.ptuEnabled) {
				set.status = 409;
				return buildErrorResponse('PTU is disabled for this organization', 409);
			}

			const existingProcessed = await db
				.select({ id: ptuRun.id })
				.from(ptuRun)
				.where(
					and(
						eq(ptuRun.organizationId, organizationId),
						eq(ptuRun.fiscalYear, body.fiscalYear),
						eq(ptuRun.status, 'PROCESSED'),
					)!,
				)
				.limit(1);
			if (existingProcessed[0]) {
				set.status = 409;
				return buildErrorResponse(
					'PTU run already processed for this fiscal year',
					409,
				);
			}

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					employmentType: employee.employmentType,
					dailyPay: employee.dailyPay,
					isTrustEmployee: employee.isTrustEmployee,
					isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
					isDomesticWorker: employee.isDomesticWorker,
					isPlatformWorker: employee.isPlatformWorker,
					platformHoursYear: employee.platformHoursYear,
					ptuEligibilityOverride: employee.ptuEligibilityOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const employeeIds = employees.map((row) => row.id);
			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				fiscalYear: body.fiscalYear,
			});
			const historyMap = await loadPtuHistory({
				organizationId,
				employeeIds,
				fiscalYear: body.fiscalYear,
			});

			const overridesByEmployee = resolveOverrideMap(body.employeeOverrides);

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				return {
					employeeId: row.id,
					status: row.status,
					employmentType: row.employmentType ?? 'PERMANENT',
					dailyPay: Number(row.dailyPay ?? 0),
					dailyQuotaOverride: override?.dailyQuota ?? null,
					daysCounted: override?.daysCounted ?? aggregate?.daysCounted ?? 0,
					annualSalaryBaseOverride: override?.annualSalaryBase ?? null,
					isTrustEmployee: Boolean(row.isTrustEmployee ?? false),
					isDirectorAdminGeneralManager: Boolean(row.isDirectorAdminGeneralManager ?? false),
					isDomesticWorker: Boolean(row.isDomesticWorker ?? false),
					isPlatformWorker: Boolean(row.isPlatformWorker ?? false),
					platformHoursYear: Number(row.platformHoursYear ?? 0),
					ptuEligibilityOverride:
						override?.eligibilityOverride ?? row.ptuEligibilityOverride ?? 'DEFAULT',
					minimumWageZone: (row.locationZone ?? null) as
						| 'GENERAL'
						| 'ZLFN'
						| null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
					ptuHistoryAmounts: historyMap.get(row.id) ?? [],
				};
			});

			const calculation = calculatePtu({
				fiscalYear: body.fiscalYear,
				paymentDateKey: body.paymentDateKey,
				taxableIncome: body.taxableIncome,
				ptuPercentage: body.ptuPercentage ?? 0.1,
				includeInactive: body.includeInactive ?? false,
				ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
				smgDailyOverride: body.smgDailyOverride ?? null,
				monthDaysForCaps: 30,
				employees: inputs,
			});

			const runId = crypto.randomUUID();
			await db.transaction(async (tx) => {
				await tx.insert(ptuRun).values({
					id: runId,
					organizationId,
					fiscalYear: body.fiscalYear,
					paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
					taxableIncome: body.taxableIncome.toFixed(2),
					ptuPercentage: (body.ptuPercentage ?? 0.1).toFixed(4),
					includeInactive: body.includeInactive ?? false,
					status: 'DRAFT',
					totalAmount: calculation.totals.netTotal.toFixed(2),
					employeeCount: calculation.totals.employeeCount,
					taxSummary: calculation.totals,
					settingsSnapshot: {
						ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
						ptuIsExempt: setting?.ptuIsExempt ?? false,
						ptuEnabled: setting?.ptuEnabled ?? false,
						employerType: setting?.employerType ?? 'PERSONA_MORAL',
					},
				});

				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						ptuRunId: runId,
						employeeId: row.employeeId,
						isEligible: row.isEligible,
						eligibilityReasons: row.eligibilityReasons,
						daysCounted: row.daysCounted,
						dailyQuota: row.dailyQuota.toFixed(2),
						annualSalaryBase: row.annualSalaryBase.toFixed(2),
						ptuByDays: row.ptuByDays.toFixed(2),
						ptuBySalary: row.ptuBySalary.toFixed(2),
						ptuPreCap: row.ptuPreCap.toFixed(2),
						capThreeMonths: row.capThreeMonths.toFixed(2),
						capAvgThreeYears: row.capAvgThreeYears.toFixed(2),
						capFinal: row.capFinal.toFixed(2),
						ptuFinal: row.ptuFinal.toFixed(2),
						exemptAmount: row.tax.exemptAmount.toFixed(2),
						taxableAmount: row.tax.taxableAmount.toFixed(2),
						withheldIsr: row.tax.withheldIsr.toFixed(2),
						netAmount: row.tax.netAmount.toFixed(2),
						warnings: row.warnings as unknown as Record<string, unknown>[],
					}));
					await tx.insert(ptuRunEmployee).values(rows);
				}
			});

			return {
				data: {
					run: {
						id: runId,
						organizationId,
						fiscalYear: body.fiscalYear,
						paymentDate: new Date(`${body.paymentDateKey}T00:00:00Z`),
						taxableIncome: body.taxableIncome,
						ptuPercentage: body.ptuPercentage ?? 0.1,
						includeInactive: body.includeInactive ?? false,
						status: 'DRAFT',
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
							ptuIsExempt: setting?.ptuIsExempt ?? false,
							ptuEnabled: setting?.ptuEnabled ?? false,
							employerType: setting?.employerType ?? 'PERSONA_MORAL',
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
		{ body: ptuRunCreateSchema },
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
			const runRows = await db.select().from(ptuRun).where(eq(ptuRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('PTU run not found', 404);
			}
			if (runRecord.status !== 'DRAFT') {
				set.status = 409;
				return buildErrorResponse('PTU run is not editable', 409);
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
			if (!setting?.ptuEnabled) {
				set.status = 409;
				return buildErrorResponse('PTU is disabled for this organization', 409);
			}

			const fiscalYear = body.fiscalYear ?? runRecord.fiscalYear;
			const paymentDateKey = body.paymentDateKey ?? runRecord.paymentDate.toISOString().slice(0, 10);
			const taxableIncome = body.taxableIncome ?? Number(runRecord.taxableIncome ?? 0);
			const ptuPercentage = body.ptuPercentage ?? Number(runRecord.ptuPercentage ?? 0.1);
			const includeInactive = body.includeInactive ?? runRecord.includeInactive ?? false;
			const existingProcessed = await db
				.select({ id: ptuRun.id })
				.from(ptuRun)
				.where(
					and(
						eq(ptuRun.organizationId, organizationId),
						eq(ptuRun.fiscalYear, fiscalYear),
						eq(ptuRun.status, 'PROCESSED'),
						ne(ptuRun.id, id),
					)!,
				)
				.limit(1);
			if (existingProcessed[0]) {
				set.status = 409;
				return buildErrorResponse('PTU run already processed for this fiscal year', 409);
			}

			const employees = await db
				.select({
					id: employee.id,
					status: employee.status,
					employmentType: employee.employmentType,
					dailyPay: employee.dailyPay,
					isTrustEmployee: employee.isTrustEmployee,
					isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
					isDomesticWorker: employee.isDomesticWorker,
					isPlatformWorker: employee.isPlatformWorker,
					platformHoursYear: employee.platformHoursYear,
					ptuEligibilityOverride: employee.ptuEligibilityOverride,
					locationZone: location.geographicZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.organizationId, organizationId));

			const employeeIds = employees.map((row) => row.id);
			const { byEmployee, latestPayroll } = await loadPayrollAggregates({
				organizationId,
				fiscalYear,
			});
			const historyMap = await loadPtuHistory({
				organizationId,
				employeeIds,
				fiscalYear,
			});

			const overridesByEmployee = resolveOverrideMap(body.employeeOverrides);

			const inputs = employees.map((row) => {
				const aggregate = byEmployee.get(row.id);
				const latest = latestPayroll.get(row.id);
				const override = overridesByEmployee.get(row.id);
				const fallbackMonthlyIncome = Number(row.dailyPay ?? 0) * 30.4;
				return {
					employeeId: row.id,
					status: row.status,
					employmentType: row.employmentType ?? 'PERMANENT',
					dailyPay: Number(row.dailyPay ?? 0),
					dailyQuotaOverride: override?.dailyQuota ?? null,
					daysCounted: override?.daysCounted ?? aggregate?.daysCounted ?? 0,
					annualSalaryBaseOverride: override?.annualSalaryBase ?? null,
					isTrustEmployee: Boolean(row.isTrustEmployee ?? false),
					isDirectorAdminGeneralManager: Boolean(row.isDirectorAdminGeneralManager ?? false),
					isDomesticWorker: Boolean(row.isDomesticWorker ?? false),
					isPlatformWorker: Boolean(row.isPlatformWorker ?? false),
					platformHoursYear: Number(row.platformHoursYear ?? 0),
					ptuEligibilityOverride:
						override?.eligibilityOverride ?? row.ptuEligibilityOverride ?? 'DEFAULT',
					minimumWageZone: (row.locationZone ?? null) as
						| 'GENERAL'
						| 'ZLFN'
						| null,
					ordinaryMonthlyIncome: latest?.ordinaryMonthlyIncome ?? fallbackMonthlyIncome,
					ptuHistoryAmounts: historyMap.get(row.id) ?? [],
				};
			});

			const calculation = calculatePtu({
				fiscalYear,
				paymentDateKey,
				taxableIncome,
				ptuPercentage,
				includeInactive,
				ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
				smgDailyOverride: body.smgDailyOverride ?? null,
				monthDaysForCaps: 30,
				employees: inputs,
			});

			await db.transaction(async (tx) => {
				await tx
					.update(ptuRun)
					.set({
						fiscalYear,
						paymentDate: new Date(`${paymentDateKey}T00:00:00Z`),
						taxableIncome: taxableIncome.toFixed(2),
						ptuPercentage: ptuPercentage.toFixed(4),
						includeInactive,
						totalAmount: calculation.totals.netTotal.toFixed(2),
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
							ptuIsExempt: setting?.ptuIsExempt ?? false,
							ptuEnabled: setting?.ptuEnabled ?? false,
							employerType: setting?.employerType ?? 'PERSONA_MORAL',
						},
					})
					.where(eq(ptuRun.id, id));
				await tx.delete(ptuRunEmployee).where(eq(ptuRunEmployee.ptuRunId, id));
				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						ptuRunId: id,
						employeeId: row.employeeId,
						isEligible: row.isEligible,
						eligibilityReasons: row.eligibilityReasons,
						daysCounted: row.daysCounted,
						dailyQuota: row.dailyQuota.toFixed(2),
						annualSalaryBase: row.annualSalaryBase.toFixed(2),
						ptuByDays: row.ptuByDays.toFixed(2),
						ptuBySalary: row.ptuBySalary.toFixed(2),
						ptuPreCap: row.ptuPreCap.toFixed(2),
						capThreeMonths: row.capThreeMonths.toFixed(2),
						capAvgThreeYears: row.capAvgThreeYears.toFixed(2),
						capFinal: row.capFinal.toFixed(2),
						ptuFinal: row.ptuFinal.toFixed(2),
						exemptAmount: row.tax.exemptAmount.toFixed(2),
						taxableAmount: row.tax.taxableAmount.toFixed(2),
						withheldIsr: row.tax.withheldIsr.toFixed(2),
						netAmount: row.tax.netAmount.toFixed(2),
						warnings: row.warnings as unknown as Record<string, unknown>[],
					}));
					await tx.insert(ptuRunEmployee).values(rows);
				}
			});

			return {
				data: {
					run: {
						...runRecord,
						fiscalYear,
						paymentDate: new Date(`${paymentDateKey}T00:00:00Z`),
						taxableIncome,
						ptuPercentage,
						includeInactive,
						totalAmount: calculation.totals.netTotal,
						employeeCount: calculation.totals.employeeCount,
						taxSummary: calculation.totals,
						settingsSnapshot: {
							ptuMode: setting?.ptuMode ?? 'DEFAULT_RULES',
							ptuIsExempt: setting?.ptuIsExempt ?? false,
							ptuEnabled: setting?.ptuEnabled ?? false,
							employerType: setting?.employerType ?? 'PERSONA_MORAL',
						},
					},
					employees: calculation.employees,
					warnings: calculation.warnings,
				},
			};
		},
		{ body: ptuRunUpdateSchema },
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
			const runRows = await db.select().from(ptuRun).where(eq(ptuRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('PTU run not found', 404);
			}
			if (runRecord.status !== 'DRAFT') {
				set.status = 409;
				return buildErrorResponse('PTU run is not editable', 409);
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
			if (!setting?.ptuEnabled) {
				set.status = 409;
				return buildErrorResponse('PTU is disabled for this organization', 409);
			}
			if (setting?.ptuIsExempt) {
				set.status = 409;
				return buildErrorResponse('Organization is exempt from PTU', 409);
			}
			const existingProcessed = await db
				.select({ id: ptuRun.id })
				.from(ptuRun)
				.where(
					and(
						eq(ptuRun.organizationId, organizationId),
						eq(ptuRun.fiscalYear, runRecord.fiscalYear),
						eq(ptuRun.status, 'PROCESSED'),
						ne(ptuRun.id, id),
					)!,
				)
				.limit(1);
			if (existingProcessed[0]) {
				set.status = 409;
				return buildErrorResponse('PTU run already processed for this fiscal year', 409);
			}

			if (Number(runRecord.taxableIncome ?? 0) <= 0) {
				set.status = 409;
				return buildErrorResponse('Taxable income must be greater than 0', 409);
			}

			const employeeRows = await db
				.select({ warnings: ptuRunEmployee.warnings })
				.from(ptuRunEmployee)
				.where(eq(ptuRunEmployee.ptuRunId, id));
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
				return buildErrorResponse('Resolve errors before processing PTU run', 409);
			}

			if (Number(runRecord.totalAmount ?? 0) <= 0) {
				set.status = 409;
				return buildErrorResponse('PTU total amount must be greater than 0', 409);
			}

			await db.transaction(async (tx) => {
				await tx
					.update(ptuRun)
					.set({ status: 'PROCESSED', processedAt: new Date() })
					.where(eq(ptuRun.id, id));
				const runEmployees = await tx
					.select({
						employeeId: ptuRunEmployee.employeeId,
						ptuFinal: ptuRunEmployee.ptuFinal,
						isEligible: ptuRunEmployee.isEligible,
					})
					.from(ptuRunEmployee)
					.where(eq(ptuRunEmployee.ptuRunId, id));
				for (const row of runEmployees) {
					const amount = Number(row.ptuFinal ?? 0);
					if (!row.isEligible || !Number.isFinite(amount) || amount <= 0) {
						continue;
					}
					const amountValue = amount.toFixed(2);
					await tx
						.insert(ptuHistory)
						.values({
							organizationId,
							employeeId: row.employeeId,
							fiscalYear: runRecord.fiscalYear,
							amount: amountValue,
						})
						.onConflictDoUpdate({
							target: [ptuHistory.employeeId, ptuHistory.fiscalYear],
							set: {
								amount: amountValue,
								updatedAt: new Date(),
							},
						});
				}
			});

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
			const runRows = await db.select().from(ptuRun).where(eq(ptuRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('PTU run not found', 404);
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
				.update(ptuRun)
				.set({
					status: 'CANCELLED',
					cancelReason: body.reason,
					cancelledAt: new Date(),
				})
				.where(eq(ptuRun.id, id));

			return { data: { success: true } };
		},
		{ body: ptuRunCancelSchema },
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
				eq(ptuRun.organizationId, organizationId),
				query.fiscalYear ? eq(ptuRun.fiscalYear, query.fiscalYear) : null,
			].filter(Boolean);
			const rows = await db
				.select()
				.from(ptuRun)
				.where(and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))!)
				.orderBy(desc(ptuRun.paymentDate))
				.limit(query.limit)
				.offset(query.offset);

			return { data: rows };
		},
		{ query: ptuRunQuerySchema },
	)
	.get(
		'/runs/:id',
		async ({ params, set, authType, session, sessionOrganizationIds, apiKeyOrganizationId, apiKeyOrganizationIds }) => {
			const { id } = params;
			const runRows = await db.select().from(ptuRun).where(eq(ptuRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('PTU run not found', 404);
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
					id: ptuRunEmployee.id,
					ptuRunId: ptuRunEmployee.ptuRunId,
					employeeId: ptuRunEmployee.employeeId,
					isEligible: ptuRunEmployee.isEligible,
					eligibilityReasons: ptuRunEmployee.eligibilityReasons,
					daysCounted: ptuRunEmployee.daysCounted,
					dailyQuota: ptuRunEmployee.dailyQuota,
					annualSalaryBase: ptuRunEmployee.annualSalaryBase,
					ptuByDays: ptuRunEmployee.ptuByDays,
					ptuBySalary: ptuRunEmployee.ptuBySalary,
					ptuPreCap: ptuRunEmployee.ptuPreCap,
					capThreeMonths: ptuRunEmployee.capThreeMonths,
					capAvgThreeYears: ptuRunEmployee.capAvgThreeYears,
					capFinal: ptuRunEmployee.capFinal,
					ptuFinal: ptuRunEmployee.ptuFinal,
					exemptAmount: ptuRunEmployee.exemptAmount,
					taxableAmount: ptuRunEmployee.taxableAmount,
					withheldIsr: ptuRunEmployee.withheldIsr,
					netAmount: ptuRunEmployee.netAmount,
					warnings: ptuRunEmployee.warnings,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					employeeNss: employee.nss,
					employeeRfc: employee.rfc,
				})
				.from(ptuRunEmployee)
				.leftJoin(employee, eq(ptuRunEmployee.employeeId, employee.id))
				.where(eq(ptuRunEmployee.ptuRunId, id));

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
			const runRows = await db.select().from(ptuRun).where(eq(ptuRun.id, id)).limit(1);
			const runRecord = runRows[0];
			if (!runRecord) {
				set.status = 404;
				return buildErrorResponse('PTU run not found', 404);
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
					employeeId: ptuRunEmployee.employeeId,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					daysCounted: ptuRunEmployee.daysCounted,
					dailyQuota: ptuRunEmployee.dailyQuota,
					annualSalaryBase: ptuRunEmployee.annualSalaryBase,
					ptuFinal: ptuRunEmployee.ptuFinal,
					exemptAmount: ptuRunEmployee.exemptAmount,
					taxableAmount: ptuRunEmployee.taxableAmount,
					withheldIsr: ptuRunEmployee.withheldIsr,
					netAmount: ptuRunEmployee.netAmount,
				})
				.from(ptuRunEmployee)
				.leftJoin(employee, eq(ptuRunEmployee.employeeId, employee.id))
				.where(eq(ptuRunEmployee.ptuRunId, id));

			const header = [
				'employeeId',
				'employeeName',
				'employeeCode',
				'daysCounted',
				'dailyQuota',
				'annualSalaryBase',
				'ptuFinal',
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
				row.dailyQuota ?? 0,
				row.annualSalaryBase ?? 0,
				row.ptuFinal ?? 0,
				row.exemptAmount ?? 0,
				row.taxableAmount ?? 0,
				row.withheldIsr ?? 0,
				row.netAmount ?? 0,
			]);
			const csv = [header.join(','), ...lines.map((line) => line.join(','))].join('\n');
			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="ptu_${runRecord.fiscalYear}.csv"`,
					'Cache-Control': 'no-store',
				},
			});
		},
	);
