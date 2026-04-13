import 'dotenv/config';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import '../src/utils/disable-pg-native.js';
import {
	employee,
	employeeDeduction,
	organization,
	payrollRun,
	payrollRunEmployee,
} from '../src/db/schema.js';

type CliArgs = {
	organizationQuery: string;
	apply: boolean;
	runId: string | null;
};

type OrganizationRow = {
	id: string;
	name: string;
	slug: string;
};

type EmployeeDeductionStatus = typeof employeeDeduction.$inferSelect.status;

type TargetPayrollRun = {
	id: string;
	organizationId: string;
	periodStart: Date;
	periodEnd: Date;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	status: 'DRAFT' | 'PROCESSED';
	totalAmount: string;
	employeeCount: number;
	processedAt: Date | null;
	createdAt: Date;
};

type PayrollRunEmployeeRow = {
	employeeId: string;
	deductionsBreakdown: unknown;
};

type EmployeePayrollStateRow = {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	lastPayrollDate: Date | null;
};

type EmployeeRollbackPlan = {
	employeeId: string;
	employeeLabel: string;
	currentLastPayrollDate: Date | null;
	nextLastPayrollDate: Date | null;
};

type DeductionRollbackPlan = {
	deductionId: string;
	employeeId: string;
	statusBefore: EmployeeDeductionStatus;
	statusAfter: EmployeeDeductionStatus;
	completedInstallmentsBefore: number;
	completedInstallmentsAfter: number;
	remainingAmountBefore: string | null;
	remainingAmountAfter: string | null;
	calculationMethod: string;
	frequency: string;
	sourceValue: string;
	sourceTotalInstallments: number | null;
	sourceTotalAmount: string | null;
	sourceStartDateKey: string;
	sourceEndDateKey: string | null;
};

const deductionBreakdownItemSchema = z.object({
	deductionId: z.string().min(1),
	calculationMethod: z.string().min(1),
	frequency: z.string().min(1),
	sourceValue: z.number(),
	sourceTotalInstallments: z.number().int().nullable(),
	completedInstallmentsBefore: z.number().int(),
	completedInstallmentsAfter: z.number().int(),
	remainingAmountBefore: z.number().nullable(),
	remainingAmountAfter: z.number().nullable(),
	sourceTotalAmount: z.number().nullable(),
	statusBefore: z.string().min(1),
	statusAfter: z.string().min(1),
	sourceStartDateKey: z.string().min(1),
	sourceEndDateKey: z.string().nullable(),
});

type DeductionBreakdownItem = z.infer<typeof deductionBreakdownItemSchema>;

/**
 * Reads the Postgres connection string from environment variables.
 *
 * @returns Connection string sourced from `SEN_DB_URL`
 * @throws {Error} When `SEN_DB_URL` is missing
 */
function getDatabaseUrl(): string {
	const databaseUrl = process.env.SEN_DB_URL;
	if (!databaseUrl) {
		throw new Error(
			'SEN_DB_URL environment variable is required but not set. Please set it in your environment before running this script.',
		);
	}
	return databaseUrl;
}

/**
 * Parses CLI arguments for the payroll rollback script.
 *
 * @param argv - Raw process arguments without the node/bun executable prefix
 * @returns Normalized CLI options
 * @throws {Error} When required flags are missing or invalid
 */
function parseCliArgs(argv: string[]): CliArgs {
	let organizationQuery: string | null = null;
	let apply = false;
	let runId: string | null = null;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === '--apply') {
			apply = true;
			continue;
		}

		if (arg === '--organization' || arg === '--org') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error(`Expected a value after ${arg}.`);
			}
			organizationQuery = value.trim();
			i += 1;
			continue;
		}

		if (arg === '--run-id') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error('Expected a value after --run-id.');
			}
			runId = value.trim();
			i += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!organizationQuery) {
		throw new Error('Missing required flag --organization <slug-or-name>.');
	}

	return {
		organizationQuery,
		apply,
		runId,
	};
}

/**
 * Normalizes a string for case-insensitive organization matching.
 *
 * @param value - Raw organization identifier
 * @returns Lower-cased, trimmed value
 */
function normalizeSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase('es-MX');
}

/**
 * Formats a date for console output.
 *
 * @param value - Date to format
 * @returns ISO string or `null`
 */
function formatDate(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

/**
 * Formats a money-like numeric value to 2 decimals for Postgres numeric comparisons.
 *
 * @param value - Numeric value from JSON payload
 * @returns Fixed 2-decimal string or `null`
 */
function formatMoney(value: number | null): string | null {
	return value === null ? null : value.toFixed(2);
}

/**
 * Normalizes a persisted Postgres money-like numeric string to 2 decimals.
 *
 * @param value - Database numeric value
 * @returns Fixed 2-decimal string or `null`
 */
function normalizeDatabaseMoney(value: string | number | null): string | null {
	return value === null ? null : Number(value).toFixed(2);
}

/**
 * Formats a rate/value numeric field to 4 decimals for Postgres numeric comparisons.
 *
 * @param value - Numeric value from JSON payload
 * @returns Fixed 4-decimal string
 */
function formatDecimal4(value: number): string {
	return value.toFixed(4);
}

/**
 * Normalizes a persisted Postgres decimal string to 4 decimals.
 *
 * @param value - Database numeric value
 * @returns Fixed 4-decimal string
 */
function normalizeDatabaseDecimal4(value: string | number): string {
	return Number(value).toFixed(4);
}

/**
 * Resolves an organization from a case-insensitive slug or name query.
 *
 * @param organizations - Available organizations
 * @param query - User-provided organization identifier
 * @returns Single resolved organization row
 * @throws {Error} When no organization or multiple ambiguous matches are found
 */
function resolveOrganization(
	organizations: OrganizationRow[],
	query: string,
): OrganizationRow {
	const normalizedQuery = normalizeSearchValue(query);
	const exactMatches = organizations.filter((row) => {
		return (
			normalizeSearchValue(row.slug) === normalizedQuery ||
			normalizeSearchValue(row.name) === normalizedQuery
		);
	});

	if (exactMatches.length === 1) {
		const [match] = exactMatches;
		if (!match) {
			throw new Error(`No organization found for "${query}".`);
		}
		return match;
	}

	if (exactMatches.length > 1) {
		throw new Error(
			`Organization query "${query}" is ambiguous. Exact matches: ${exactMatches
				.map((row) => `${row.name} (${row.slug})`)
				.join(', ')}`,
		);
	}

	const partialMatches = organizations.filter((row) => {
		return (
			normalizeSearchValue(row.slug).includes(normalizedQuery) ||
			normalizeSearchValue(row.name).includes(normalizedQuery)
		);
	});

	if (partialMatches.length === 1) {
		const [match] = partialMatches;
		if (!match) {
			throw new Error(`No organization found for "${query}".`);
		}
		return match;
	}

	if (partialMatches.length > 1) {
		throw new Error(
			`Organization query "${query}" matched multiple organizations: ${partialMatches
				.map((row) => `${row.name} (${row.slug})`)
				.join(', ')}`,
		);
	}

	throw new Error(`No organization found for "${query}".`);
}

/**
 * Parses persisted payroll deduction breakdown rows from JSONB.
 *
 * @param value - Raw JSONB value from `payroll_run_employee.deductions_breakdown`
 * @returns Validated deduction breakdown items
 * @throws {Error} When persisted deduction data is malformed
 */
function parseDeductionBreakdown(value: unknown): DeductionBreakdownItem[] {
	return z.array(deductionBreakdownItemSchema).parse(value);
}

/**
 * Resolves the target payroll run to rollback for an organization.
 *
 * @param args - Script CLI arguments
 * @param organizationId - Organization identifier
 * @returns Latest processed payroll run or the explicitly requested run
 * @throws {Error} When the target run is missing or does not belong to the organization
 */
async function resolveTargetPayrollRun(
	args: CliArgs,
	organizationId: string,
): Promise<TargetPayrollRun> {
	if (args.runId) {
		const explicitRun = await db
			.select({
				id: payrollRun.id,
				organizationId: payrollRun.organizationId,
				periodStart: payrollRun.periodStart,
				periodEnd: payrollRun.periodEnd,
				paymentFrequency: payrollRun.paymentFrequency,
				status: payrollRun.status,
				totalAmount: payrollRun.totalAmount,
				employeeCount: payrollRun.employeeCount,
				processedAt: payrollRun.processedAt,
				createdAt: payrollRun.createdAt,
			})
			.from(payrollRun)
			.where(and(eq(payrollRun.id, args.runId), eq(payrollRun.organizationId, organizationId)))
			.limit(1);

		const record = explicitRun[0];
		if (!record) {
			throw new Error(
				`Payroll run "${args.runId}" was not found for organization "${organizationId}".`,
			);
		}
		return record;
	}

	const latestRun = await db
		.select({
			id: payrollRun.id,
			organizationId: payrollRun.organizationId,
			periodStart: payrollRun.periodStart,
			periodEnd: payrollRun.periodEnd,
			paymentFrequency: payrollRun.paymentFrequency,
			status: payrollRun.status,
			totalAmount: payrollRun.totalAmount,
			employeeCount: payrollRun.employeeCount,
			processedAt: payrollRun.processedAt,
			createdAt: payrollRun.createdAt,
		})
		.from(payrollRun)
		.where(and(eq(payrollRun.organizationId, organizationId), eq(payrollRun.status, 'PROCESSED')))
		.orderBy(desc(payrollRun.processedAt), desc(payrollRun.createdAt))
		.limit(1);

	const record = latestRun[0];
	if (!record) {
		throw new Error(`No processed payroll runs were found for organization "${organizationId}".`);
	}

	return record;
}

/**
 * Builds employee rollback targets for `last_payroll_date`.
 *
 * @param runId - Payroll run that will be removed
 * @returns Planned `last_payroll_date` values per employee in the target run
 */
async function buildEmployeeRollbackPlan(runId: string): Promise<EmployeeRollbackPlan[]> {
	const targetEmployees = await db
		.select({
			id: employee.id,
			code: employee.code,
			firstName: employee.firstName,
			lastName: employee.lastName,
			lastPayrollDate: employee.lastPayrollDate,
		})
		.from(payrollRunEmployee)
		.innerJoin(employee, eq(payrollRunEmployee.employeeId, employee.id))
		.where(eq(payrollRunEmployee.payrollRunId, runId));

	const uniqueEmployeeIds = [...new Set(targetEmployees.map((row) => row.id))];
	if (uniqueEmployeeIds.length === 0) {
		return [];
	}

	const remainingRuns = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			periodEnd: payrollRun.periodEnd,
		})
		.from(payrollRunEmployee)
		.innerJoin(payrollRun, eq(payrollRunEmployee.payrollRunId, payrollRun.id))
		.where(
			and(
				inArray(payrollRunEmployee.employeeId, uniqueEmployeeIds),
				eq(payrollRun.status, 'PROCESSED'),
				// Exclude the run being rolled back so we can compute the next effective payroll date.
				// Each employee will fall back to the newest remaining processed run, if any.
				// If none remains, `last_payroll_date` becomes `null`.
				ne(payrollRun.id, runId),
			),
		)
		.orderBy(desc(payrollRun.periodEnd), desc(payrollRun.processedAt), desc(payrollRun.createdAt));

	const latestPeriodEndByEmployee = new Map<string, Date>();
	for (const row of remainingRuns) {
		if (row.periodEnd === null) {
			continue;
		}
		if (!latestPeriodEndByEmployee.has(row.employeeId)) {
			latestPeriodEndByEmployee.set(row.employeeId, row.periodEnd);
		}
	}

	return targetEmployees.map((row: EmployeePayrollStateRow) => {
		const employeeLabel = `${row.code} - ${row.firstName} ${row.lastName}`;
		const plannedDate = latestPeriodEndByEmployee.get(row.id) ?? null;
		return {
			employeeId: row.id,
			employeeLabel,
			currentLastPayrollDate: row.lastPayrollDate,
			nextLastPayrollDate: plannedDate,
		};
	});
}

/**
 * Builds deduction rollback operations from the target payroll run line items.
 *
 * @param runId - Payroll run that will be removed
 * @returns Deduction rollback plan derived from persisted breakdown snapshots
 * @throws {Error} When the persisted deduction JSON is malformed
 */
async function buildDeductionRollbackPlan(runId: string): Promise<DeductionRollbackPlan[]> {
	const rows = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			deductionsBreakdown: payrollRunEmployee.deductionsBreakdown,
		})
		.from(payrollRunEmployee)
		.where(eq(payrollRunEmployee.payrollRunId, runId));

	const rollbacks: DeductionRollbackPlan[] = [];

	for (const row of rows as PayrollRunEmployeeRow[]) {
		const items = parseDeductionBreakdown(row.deductionsBreakdown ?? []);
		for (const item of items) {
			const stateChanged =
				item.statusBefore !== item.statusAfter ||
				item.completedInstallmentsBefore !== item.completedInstallmentsAfter ||
				item.remainingAmountBefore !== item.remainingAmountAfter;

			if (!stateChanged) {
				continue;
			}

			rollbacks.push({
				deductionId: item.deductionId,
				employeeId: row.employeeId,
				statusBefore: item.statusBefore as EmployeeDeductionStatus,
				statusAfter: item.statusAfter as EmployeeDeductionStatus,
				completedInstallmentsBefore: item.completedInstallmentsBefore,
				completedInstallmentsAfter: item.completedInstallmentsAfter,
				remainingAmountBefore: formatMoney(item.remainingAmountBefore),
				remainingAmountAfter: formatMoney(item.remainingAmountAfter),
				calculationMethod: item.calculationMethod,
				frequency: item.frequency,
				sourceValue: formatDecimal4(item.sourceValue),
				sourceTotalInstallments: item.sourceTotalInstallments,
				sourceTotalAmount: formatMoney(item.sourceTotalAmount),
				sourceStartDateKey: item.sourceStartDateKey,
				sourceEndDateKey: item.sourceEndDateKey,
			});
		}
	}

	return rollbacks;
}

/**
 * Prints a dry-run summary before any destructive mutation happens.
 *
 * @param organizationRecord - Organization selected for the rollback
 * @param targetRun - Payroll run that would be removed
 * @param employeePlans - Planned employee `last_payroll_date` updates
 * @param deductionPlans - Planned deduction state rollbacks
 * @returns Nothing
 */
function printDryRunSummary(
	organizationRecord: OrganizationRow,
	targetRun: TargetPayrollRun,
	employeePlans: EmployeeRollbackPlan[],
	deductionPlans: DeductionRollbackPlan[],
): void {
	console.log('DRY RUN: no changes were applied.');
	console.log(
		JSON.stringify(
			{
				organization: {
					id: organizationRecord.id,
					name: organizationRecord.name,
					slug: organizationRecord.slug,
				},
				targetRun: {
					id: targetRun.id,
					status: targetRun.status,
					paymentFrequency: targetRun.paymentFrequency,
					periodStart: formatDate(targetRun.periodStart),
					periodEnd: formatDate(targetRun.periodEnd),
					processedAt: formatDate(targetRun.processedAt),
					createdAt: formatDate(targetRun.createdAt),
					totalAmount: targetRun.totalAmount,
					employeeCount: targetRun.employeeCount,
				},
				employeeUpdates: employeePlans.map((plan) => ({
					employeeId: plan.employeeId,
					employeeLabel: plan.employeeLabel,
					currentLastPayrollDate: formatDate(plan.currentLastPayrollDate),
					nextLastPayrollDate: formatDate(plan.nextLastPayrollDate),
				})),
				deductionUpdates: deductionPlans.map((plan) => ({
					deductionId: plan.deductionId,
					employeeId: plan.employeeId,
					statusBefore: plan.statusBefore,
					statusAfter: plan.statusAfter,
					completedInstallmentsBefore: plan.completedInstallmentsBefore,
					completedInstallmentsAfter: plan.completedInstallmentsAfter,
					remainingAmountBefore: plan.remainingAmountBefore,
					remainingAmountAfter: plan.remainingAmountAfter,
				})),
			},
			null,
			2,
		),
	);
	console.log('\nRun again with --apply to execute this rollback.');
}

/**
 * Applies the payroll rollback inside one transaction.
 *
 * @param targetRun - Payroll run that will be removed
 * @param employeePlans - Planned employee `last_payroll_date` updates
 * @param deductionPlans - Planned deduction state rollbacks
 * @returns Summary of applied mutations
 * @throws {Error} When current database state no longer matches the planned rollback
 */
async function applyRollback(
	targetRun: TargetPayrollRun,
	employeePlans: EmployeeRollbackPlan[],
	deductionPlans: DeductionRollbackPlan[],
): Promise<{ deletedRuns: number; updatedEmployees: number; updatedDeductions: number }> {
	return db.transaction(async (tx) => {
		if (deductionPlans.length > 0) {
			const deductionIds = deductionPlans.map((plan) => plan.deductionId);
			const currentDeductions = await tx
				.select({
					id: employeeDeduction.id,
					status: employeeDeduction.status,
					completedInstallments: employeeDeduction.completedInstallments,
					remainingAmount: employeeDeduction.remainingAmount,
					calculationMethod: employeeDeduction.calculationMethod,
					frequency: employeeDeduction.frequency,
					value: employeeDeduction.value,
					totalInstallments: employeeDeduction.totalInstallments,
					totalAmount: employeeDeduction.totalAmount,
					startDateKey: employeeDeduction.startDateKey,
					endDateKey: employeeDeduction.endDateKey,
				})
				.from(employeeDeduction)
				.where(inArray(employeeDeduction.id, deductionIds));

			const currentById = new Map(currentDeductions.map((row) => [row.id, row]));
			for (const plan of deductionPlans) {
				const current = currentById.get(plan.deductionId);
				if (!current) {
					throw new Error(`Deduction "${plan.deductionId}" no longer exists.`);
				}

				const currentRemainingAmount =
					normalizeDatabaseMoney(current.remainingAmount);
				const currentValue = normalizeDatabaseDecimal4(current.value);
				const currentTotalAmount = normalizeDatabaseMoney(current.totalAmount);

				if (
					current.status !== plan.statusAfter ||
					current.completedInstallments !== plan.completedInstallmentsAfter ||
					currentRemainingAmount !== plan.remainingAmountAfter ||
					current.calculationMethod !== plan.calculationMethod ||
					current.frequency !== plan.frequency ||
					currentValue !== plan.sourceValue ||
					current.totalInstallments !== plan.sourceTotalInstallments ||
					currentTotalAmount !== plan.sourceTotalAmount ||
					current.startDateKey !== plan.sourceStartDateKey ||
					current.endDateKey !== plan.sourceEndDateKey
				) {
					throw new Error(
						`Deduction "${plan.deductionId}" changed since the dry run. Aborting rollback.`,
					);
				}
			}
		}

		let updatedEmployees = 0;
		for (const plan of employeePlans) {
			await tx
				.update(employee)
				.set({ lastPayrollDate: plan.nextLastPayrollDate })
				.where(eq(employee.id, plan.employeeId));
			updatedEmployees += 1;
		}

		let updatedDeductions = 0;
		for (const plan of deductionPlans) {
			const updatedRows = await tx
				.update(employeeDeduction)
				.set({
					status: plan.statusBefore,
					completedInstallments: plan.completedInstallmentsBefore,
					remainingAmount: plan.remainingAmountBefore,
				})
				.where(eq(employeeDeduction.id, plan.deductionId))
				.returning({ id: employeeDeduction.id });

			if (updatedRows.length !== 1) {
				throw new Error(`Failed to rollback deduction "${plan.deductionId}".`);
			}

			updatedDeductions += 1;
		}

		const deletedRuns = await tx
			.delete(payrollRun)
			.where(eq(payrollRun.id, targetRun.id))
			.returning({ id: payrollRun.id });

		if (deletedRuns.length !== 1) {
			throw new Error(`Failed to delete payroll run "${targetRun.id}".`);
		}

		return {
			deletedRuns: deletedRuns.length,
			updatedEmployees,
			updatedDeductions,
		};
	});
}

/**
 * Script entry point.
 *
 * @returns Promise that resolves when the script completes
 * @throws {Error} When the organization, target run, or rollback state is invalid
 */
async function main(): Promise<void> {
	const args = parseCliArgs(process.argv.slice(2));

	const organizations = await db
		.select({ id: organization.id, name: organization.name, slug: organization.slug })
		.from(organization);
	const organizationRecord = resolveOrganization(organizations, args.organizationQuery);
	const targetRun = await resolveTargetPayrollRun(args, organizationRecord.id);
	const employeePlans = await buildEmployeeRollbackPlan(targetRun.id);
	const deductionPlans = await buildDeductionRollbackPlan(targetRun.id);

	if (!args.apply) {
		printDryRunSummary(organizationRecord, targetRun, employeePlans, deductionPlans);
		return;
	}

	const result = await applyRollback(targetRun, employeePlans, deductionPlans);
	console.log(
		JSON.stringify(
			{
				applied: true,
				organization: {
					id: organizationRecord.id,
					name: organizationRecord.name,
					slug: organizationRecord.slug,
				},
				targetRun: {
					id: targetRun.id,
					periodStart: formatDate(targetRun.periodStart),
					periodEnd: formatDate(targetRun.periodEnd),
				},
				result,
			},
			null,
			2,
		),
	);
}

const pool = new Pool({ connectionString: getDatabaseUrl() });
const db = drizzle(pool);

try {
	await main();
} finally {
	await pool.end();
}
