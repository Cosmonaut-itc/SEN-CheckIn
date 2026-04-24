import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { addDays, isBefore } from 'date-fns';

import db from '../db/index.js';
import {
	attendanceRecord,
	employee,
	employeeDeduction,
	employeeGratification,
	employeeIncapacity,
	employeeSchedule,
	location,
	member,
	organization,
	overtimeAuthorization,
	payrollFiscalVoucher,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
	vacationRequest,
	vacationRequestDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { roundCurrency } from '../utils/money.js';
import {
	payrollFiscalVoucherPrepareSchema,
	payrollCalculateSchema,
	payrollProcessSchema,
	payrollRunQuerySchema,
} from '../schemas/payroll.js';
import { isValidIanaTimeZone, toDateKeyInTimeZone } from '../utils/time-zone.js';
import {
	calculatePayrollFromData,
	type EmployeeDeductionRow,
	type EmployeeGratificationRow,
	getPayrollPeriodBounds,
	resolvePayrollCutoffAssumedDateKeys,
	type AttendanceRow,
	type OvertimeAuthorizationRow,
	type PayrollCalculationRow,
	type PayrollDeductionBreakdownItem,
} from '../services/payroll-calculation.js';
import {
	resolveAdditionalMandatoryRestDaysForPeriod,
	resolvePayrollHolidayContext,
	type PayrollEmployeeHolidayImpact,
	type PayrollHolidayNotice,
} from '../services/holidays.js';
import type { IncapacityRecordInput } from '../services/incapacities.js';
import { countSaturdayBonusDaysForPeriod } from '../services/vacations.js';
import {
	buildPayrollFiscalVoucherFromCalculationRow,
	validatePayrollFiscalVoucher,
	type PayrollFiscalVoucherValidationIssue,
	type PayrollFiscalVoucherValidationStatus,
} from '../services/payroll-fiscal-vouchers.js';
import type {
	PayrollEmployeeWithholdings,
	PayrollInformationalLines,
} from '../services/mexico-payroll-taxes.js';
import {
	buildEmployeeAuditSnapshot,
	createEmployeeAuditEvent,
	getEmployeeAuditChangedFields,
	resolveEmployeeAuditActor,
	setEmployeeAuditSkip,
} from '../services/employee-audit.js';
import { buildErrorResponse } from '../utils/error-response.js';

interface PendingPayrollDeductionUpdate {
	deductionId: string;
	shouldPersistStateChange: boolean;
	status: EmployeeDeductionRow['status'];
	completedInstallments: number;
	remainingAmount: string | null;
	previousStatus: EmployeeDeductionRow['status'];
	previousCompletedInstallments: number;
	previousRemainingAmount: string | null;
	previousValue: string;
	previousCalculationMethod: EmployeeDeductionRow['calculationMethod'];
	previousFrequency: EmployeeDeductionRow['frequency'];
	previousTotalInstallments: number | null;
	previousTotalAmount: string | null;
	previousStartDateKey: string;
	previousEndDateKey: string | null;
}

interface PendingPayrollGratificationUpdate {
	gratificationId: string;
	shouldPersistStateChange: boolean;
	status: EmployeeGratificationRow['status'];
	previousStatus: EmployeeGratificationRow['status'];
	previousAmount: string;
	previousPeriodicity: EmployeeGratificationRow['periodicity'];
	previousApplicationMode: EmployeeGratificationRow['applicationMode'];
	previousStartDateKey: string;
	previousEndDateKey: string | null;
}

const PAYROLL_DEDUCTION_STATE_CONFLICT_ERROR = 'PAYROLL_DEDUCTION_STATE_CONFLICT';
const PAYROLL_GRATIFICATION_STATE_CONFLICT_ERROR = 'PAYROLL_GRATIFICATION_STATE_CONFLICT';

/**
 * Normalizes a deduction remaining amount into the persisted string format.
 *
 * @param value - Remaining amount from the calculation or database row
 * @returns Comparable persisted string value
 */
function normalizeDeductionAmount(value: number | string | null | undefined): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue.toFixed(2) : null;
}

/**
 * Normalizes a gratification amount into the persisted string format.
 *
 * @param value - Gratification amount from the calculation or database row
 * @returns Comparable persisted string value
 */
function normalizeGratificationAmount(value: number | string | null | undefined): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue.toFixed(2) : null;
}

/**
 * Checks whether the current caller can view dual payroll compensation data.
 *
 * @param args - Authorization context for the request
 * @param args.authType - Authentication mechanism used by the request
 * @param args.organizationId - Organization whose payroll is being accessed
 * @param args.session - Active Better Auth session when using cookie auth
 * @returns True when the caller can read dual payroll compensation for the organization
 */
async function canViewDualPayrollCompensation(args: {
	authType: 'session' | 'apiKey' | null;
	organizationId: string;
	session: { userId: string } | null;
}): Promise<boolean> {
	if (args.authType === 'apiKey') {
		return true;
	}

	if (args.authType !== 'session' || !args.session) {
		return false;
	}

	const membership = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);

	const role = membership[0]?.role ?? null;
	return role === 'owner' || role === 'admin';
}

type DualPayrollCompensationShape = {
	fiscalDailyPay?: unknown;
	fiscalGrossPay?: unknown;
	complementPay?: unknown;
	totalRealPay?: unknown;
	realVacationPayAmount?: unknown;
	realVacationPremiumAmount?: unknown;
};

/**
 * Removes dual payroll compensation fields from a payload.
 *
 * @param record - Payload that may expose fiscal compensation details
 * @returns Payload without dual payroll compensation fields
 */
function omitDualPayrollCompensation<T extends DualPayrollCompensationShape>(
	record: T,
): Omit<
	T,
	| 'fiscalDailyPay'
	| 'fiscalGrossPay'
	| 'complementPay'
	| 'totalRealPay'
	| 'realVacationPayAmount'
	| 'realVacationPremiumAmount'
> {
	const sanitizedRecord = { ...record } as Partial<T>;
	delete sanitizedRecord.fiscalDailyPay;
	delete sanitizedRecord.fiscalGrossPay;
	delete sanitizedRecord.complementPay;
	delete sanitizedRecord.totalRealPay;
	delete sanitizedRecord.realVacationPayAmount;
	delete sanitizedRecord.realVacationPremiumAmount;
	return sanitizedRecord as Omit<
		T,
		| 'fiscalDailyPay'
		| 'fiscalGrossPay'
		| 'complementPay'
		| 'totalRealPay'
		| 'realVacationPayAmount'
		| 'realVacationPremiumAmount'
	>;
}

/**
 * Removes dual payroll compensation fields from employee collections when needed.
 *
 * @param employees - Employee records or calculation rows
 * @param includeDualPayrollCompensation - Whether the caller can view fiscal compensation data
 * @returns Sanitized employee collection
 */
function sanitizeDualPayrollEmployees<T extends DualPayrollCompensationShape>(
	employees: T[],
	includeDualPayrollCompensation: boolean,
): Array<
	| T
	| Omit<
			T,
			| 'fiscalDailyPay'
			| 'fiscalGrossPay'
			| 'complementPay'
			| 'totalRealPay'
			| 'realVacationPayAmount'
			| 'realVacationPremiumAmount'
	  >
> {
	return includeDualPayrollCompensation
		? employees
		: employees.map((employeeRecord) => omitDualPayrollCompensation(employeeRecord));
}

/**
 * Removes dual payroll compensation data from a tax breakdown payload.
 *
 * @param taxBreakdown - Tax breakdown payload from the payroll run employee row
 * @returns Tax breakdown payload without dual compensation details
 */
function sanitizeDualPayrollTaxBreakdown(
	taxBreakdown: Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!taxBreakdown) {
		return taxBreakdown;
	}

	const sanitizedTaxBreakdown = { ...taxBreakdown };
	delete sanitizedTaxBreakdown.realCompensation;
	return sanitizedTaxBreakdown;
}

type DualPayrollRunShape = {
	taxSummary?: Record<string, unknown> | null;
};

type DualPayrollSettingsSnapshotShape = {
	realVacationPremiumRate?: unknown;
	enableDualPayroll?: unknown;
};

/**
 * Removes dual payroll-only settings from a payroll settings snapshot payload.
 *
 * @param settings - Payroll settings snapshot payload
 * @returns Settings snapshot without dual-payroll-only fields
 */
function sanitizeDualPayrollSettingsSnapshot<T extends DualPayrollSettingsSnapshotShape>(
	settings: T,
): Omit<T, 'realVacationPremiumRate' | 'enableDualPayroll'> {
	const sanitizedSettings = { ...settings } as Partial<T>;
	delete sanitizedSettings.realVacationPremiumRate;
	delete sanitizedSettings.enableDualPayroll;
	return sanitizedSettings as Omit<T, 'realVacationPremiumRate' | 'enableDualPayroll'>;
}

/**
 * Removes dual payroll-only settings from a payroll run tax summary payload.
 *
 * @param taxSummary - Payroll run tax summary payload
 * @returns Tax summary payload without dual-payroll-only settings
 */
function sanitizeDualPayrollTaxSummary(
	taxSummary: Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!taxSummary) {
		return taxSummary;
	}

	const sanitizedTaxSummary = { ...taxSummary };
	const settings = sanitizedTaxSummary.settings;
	if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
		return sanitizedTaxSummary;
	}

	const sanitizedSettings = { ...(settings as Record<string, unknown>) };
	delete sanitizedSettings.realVacationPremiumRate;
	delete sanitizedSettings.enableDualPayroll;
	sanitizedTaxSummary.settings = sanitizedSettings;
	return sanitizedTaxSummary;
}

/**
 * Removes dual payroll-only settings from a payroll run payload.
 *
 * @param run - Payroll run payload
 * @returns Payroll run payload without dual-payroll-only settings
 */
function sanitizeDualPayrollRun<T extends DualPayrollRunShape>(run: T): T {
	const sanitizedRun = { ...run };
	if (!sanitizedRun.taxSummary) {
		return sanitizedRun;
	}

	sanitizedRun.taxSummary = sanitizeDualPayrollTaxSummary(sanitizedRun.taxSummary);
	return sanitizedRun;
}

type PayrollFiscalVoucherDbRow = {
	id: string;
	payrollRunId: string;
	payrollRunEmployeeId: string;
	organizationId: string;
	employeeId: string;
	status: string;
	voucher: Record<string, unknown>;
	validationErrors: Record<string, unknown>[];
	validationWarnings: Record<string, unknown>[];
	uuid: string | null;
	stampedXml: string | null;
	pacProvider: string | null;
	stampedAt: Date | null;
	cancellationReason: string | null;
	replacementUuid: string | null;
	preparedAt: Date;
	createdAt: Date;
	updatedAt: Date;
};

type PayrollRunEmployeeFiscalSource = {
	id: string;
	payrollRunId: string;
	employeeId: string;
	totalPay: string | number;
	fiscalGrossPay: string | number | null;
	complementPay: string | number | null;
	deductionsBreakdown: unknown;
	taxBreakdown: Record<string, unknown> | null;
};

type PayrollFiscalVoucherSourceParseResult<TValue> =
	| { ok: true; value: TValue; issues: [] }
	| { ok: false; value: TValue; issues: PayrollFiscalVoucherValidationIssue[] };

const ZERO_EMPLOYEE_WITHHOLDINGS: PayrollEmployeeWithholdings = {
	imssEmployee: {
		emExcess: 0,
		pd: 0,
		gmp: 0,
		iv: 0,
		cv: 0,
		total: 0,
	},
	isrWithheld: 0,
	infonavitCredit: 0,
	total: 0,
};

const ZERO_INFORMATIONAL_LINES: PayrollInformationalLines = {
	isrBeforeSubsidy: 0,
	subsidyApplied: 0,
	subsidyCaused: 0,
};

/**
 * Converts an unknown JSON value into an object when possible.
 *
 * @param value - Unknown JSON value
 * @returns Record value or null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * Converts a numeric database value to a number.
 *
 * @param value - Numeric-like database value
 * @param fallback - Value used when the input is not finite
 * @returns Parsed number
 */
function toFiniteNumber(value: unknown, fallback = 0): number {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : fallback;
}

/**
 * Reads a finite number without coercing invalid values into usable data.
 *
 * @param value - Unknown persisted value
 * @returns Finite numeric value or null
 */
function readFiniteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Creates a validation issue object for fiscal voucher source parsing.
 *
 * @param code - Stable issue code
 * @param field - Field path associated with the issue
 * @param message - Human-readable issue description
 * @returns Validation issue
 */
function createFiscalVoucherSourceIssue(
	code: PayrollFiscalVoucherValidationIssue['code'],
	field: string,
	message: string,
): PayrollFiscalVoucherValidationIssue {
	return { code, field, message };
}

/**
 * Reads an optional string from a JSON object.
 *
 * @param source - Source JSON record
 * @param keys - Candidate property names in priority order
 * @returns String value or null
 */
function readStringField(source: Record<string, unknown> | null, keys: string[]): string | null {
	if (!source) {
		return null;
	}

	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

/**
 * Parses organization metadata for fiscal pre-stamping fields.
 *
 * @param metadata - Better Auth organization metadata string
 * @returns Parsed JSON object or null
 */
function parseOrganizationMetadata(
	metadata: string | null | undefined,
): Record<string, unknown> | null {
	if (!metadata) {
		return null;
	}

	try {
		return asRecord(JSON.parse(metadata));
	} catch {
		return null;
	}
}

/**
 * Extracts employee withholdings from a persisted tax breakdown snapshot.
 *
 * @param taxBreakdown - Persisted tax breakdown object
 * @returns Employee withholding breakdown or a blocking validation issue
 */
function resolveEmployeeWithholdings(
	taxBreakdown: Record<string, unknown> | null,
): PayrollFiscalVoucherSourceParseResult<PayrollEmployeeWithholdings> {
	const rawEmployeeWithholdings = taxBreakdown?.employeeWithholdings;
	const employeeWithholdings = asRecord(rawEmployeeWithholdings);
	if (!employeeWithholdings) {
		if (rawEmployeeWithholdings !== undefined) {
			return {
				ok: false,
				value: ZERO_EMPLOYEE_WITHHOLDINGS,
				issues: [
					createFiscalVoucherSourceIssue(
						'EMPLOYEE_WITHHOLDINGS_INVALID',
						'taxBreakdown.employeeWithholdings',
						'Persisted employee withholding payroll tax lines are invalid.',
					),
				],
			};
		}

		return { ok: true, value: ZERO_EMPLOYEE_WITHHOLDINGS, issues: [] };
	}

	const imssEmployee = asRecord(employeeWithholdings.imssEmployee);
	const emExcess = readFiniteNumber(imssEmployee?.emExcess);
	const pd = readFiniteNumber(imssEmployee?.pd);
	const gmp = readFiniteNumber(imssEmployee?.gmp);
	const iv = readFiniteNumber(imssEmployee?.iv);
	const cv = readFiniteNumber(imssEmployee?.cv);
	const imssTotal = readFiniteNumber(imssEmployee?.total);
	const isrWithheld = readFiniteNumber(employeeWithholdings.isrWithheld);
	const infonavitCredit = readFiniteNumber(employeeWithholdings.infonavitCredit);
	const total = readFiniteNumber(employeeWithholdings.total);

	if (
		!imssEmployee ||
		emExcess === null ||
		pd === null ||
		gmp === null ||
		iv === null ||
		cv === null ||
		imssTotal === null ||
		isrWithheld === null ||
		infonavitCredit === null ||
		total === null
	) {
		return {
			ok: false,
			value: ZERO_EMPLOYEE_WITHHOLDINGS,
			issues: [
				createFiscalVoucherSourceIssue(
					'EMPLOYEE_WITHHOLDINGS_INVALID',
					'taxBreakdown.employeeWithholdings',
					'Persisted employee withholding payroll tax lines are invalid.',
				),
			],
		};
	}

	return {
		ok: true,
		value: {
			imssEmployee: {
				emExcess,
				pd,
				gmp,
				iv,
				cv,
				total: imssTotal,
			},
			isrWithheld,
			infonavitCredit,
			total,
		},
		issues: [],
	};
}

/**
 * Extracts informational tax lines from a persisted tax breakdown snapshot.
 *
 * @param taxBreakdown - Persisted tax breakdown object
 * @returns Payroll informational tax lines
 */
function resolveInformationalLines(
	taxBreakdown: Record<string, unknown> | null,
): PayrollFiscalVoucherSourceParseResult<PayrollInformationalLines> {
	const informationalLines = asRecord(taxBreakdown?.informationalLines);
	if (!informationalLines) {
		return { ok: true, value: ZERO_INFORMATIONAL_LINES, issues: [] };
	}

	const subsidyApplied = readFiniteNumber(informationalLines.subsidyApplied);
	const subsidyCaused = readFiniteNumber(informationalLines.subsidyCaused);
	const isrBeforeSubsidy = readFiniteNumber(informationalLines.isrBeforeSubsidy) ?? 0;
	if (subsidyCaused === null && subsidyApplied === null) {
		return {
			ok: false,
			value: ZERO_INFORMATIONAL_LINES,
			issues: [
				createFiscalVoucherSourceIssue(
					'INFORMATIONAL_LINES_INVALID',
					'taxBreakdown.informationalLines',
					'Persisted informational payroll tax lines are invalid.',
				),
			],
		};
	}

	return {
		ok: true,
		value: {
			isrBeforeSubsidy,
			subsidyApplied: subsidyApplied ?? 0,
			subsidyCaused: subsidyCaused ?? subsidyApplied ?? 0,
		},
		issues: [],
	};
}

/**
 * Checks whether a persisted deduction type is supported by the payroll engine.
 *
 * @param value - Candidate deduction type
 * @returns True when the value is a supported deduction type
 */
function isPayrollDeductionType(value: unknown): value is PayrollDeductionBreakdownItem['type'] {
	return (
		value === 'INFONAVIT' ||
		value === 'ALIMONY' ||
		value === 'FONACOT' ||
		value === 'LOAN' ||
		value === 'UNION_FEE' ||
		value === 'ADVANCE' ||
		value === 'OTHER'
	);
}

/**
 * Checks whether a persisted deduction calculation method is supported.
 *
 * @param value - Candidate calculation method
 * @returns True when the value is a supported calculation method
 */
function isPayrollDeductionCalculationMethod(
	value: unknown,
): value is PayrollDeductionBreakdownItem['calculationMethod'] {
	return (
		value === 'PERCENTAGE_SBC' ||
		value === 'PERCENTAGE_NET' ||
		value === 'PERCENTAGE_GROSS' ||
		value === 'FIXED_AMOUNT' ||
		value === 'VSM_FACTOR'
	);
}

/**
 * Checks whether a persisted deduction frequency is supported.
 *
 * @param value - Candidate deduction frequency
 * @returns True when the value is a supported frequency
 */
function isPayrollDeductionFrequency(
	value: unknown,
): value is PayrollDeductionBreakdownItem['frequency'] {
	return value === 'RECURRING' || value === 'ONE_TIME' || value === 'INSTALLMENTS';
}

/**
 * Checks whether a persisted deduction status is supported.
 *
 * @param value - Candidate deduction status
 * @returns True when the value is a supported status
 */
function isPayrollDeductionStatus(
	value: unknown,
): value is PayrollDeductionBreakdownItem['statusBefore'] {
	return (
		value === 'ACTIVE' || value === 'PAUSED' || value === 'COMPLETED' || value === 'CANCELLED'
	);
}

/**
 * Reads a string or null from a persisted JSON object field.
 *
 * @param value - Persisted field value
 * @returns Trimmed string or null
 */
function readStringOrNull(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads a number or string source value with a numeric fallback.
 *
 * @param value - Persisted field value
 * @param fallback - Numeric fallback value
 * @returns Number/string value accepted by payroll source fields
 */
function readSourceNumberOrString(value: unknown, fallback: number): number | string {
	return typeof value === 'number' || typeof value === 'string' ? value : fallback;
}

/**
 * Reads a number, string, or null source total amount.
 *
 * @param value - Persisted field value
 * @returns Persisted source total amount or null
 */
function readSourceTotalAmount(value: unknown): number | string | null {
	return typeof value === 'number' || typeof value === 'string' ? value : null;
}

/**
 * Parses persisted deduction JSONB before it is used by the fiscal mapper.
 *
 * @param raw - Persisted deductionsBreakdown JSONB value
 * @returns Parsed deduction rows or a blocking validation issue
 */
function parsePayrollDeductionBreakdown(
	raw: unknown,
): PayrollFiscalVoucherSourceParseResult<PayrollDeductionBreakdownItem[]> {
	if (!Array.isArray(raw)) {
		return {
			ok: false,
			value: [],
			issues: [
				createFiscalVoucherSourceIssue(
					'DEDUCTION_BREAKDOWN_INVALID',
					'deductionsBreakdown',
					'Persisted payroll deduction breakdown must be an array.',
				),
			],
		};
	}

	const parsedItems: PayrollDeductionBreakdownItem[] = [];
	for (const [index, rawItem] of raw.entries()) {
		const item = asRecord(rawItem);
		const deductionId = item?.deductionId;
		const label = item?.label;
		const type = item?.type;
		const appliedAmount = item?.appliedAmount;
		const satDeductionCode = item?.satDeductionCode;
		const hasValidSatDeductionCode =
			satDeductionCode === null ||
			(typeof satDeductionCode === 'string' && satDeductionCode.trim().length > 0);

		if (
			!item ||
			typeof deductionId !== 'string' ||
			deductionId.trim().length === 0 ||
			typeof label !== 'string' ||
			label.trim().length === 0 ||
			!isPayrollDeductionType(type) ||
			typeof appliedAmount !== 'number' ||
			!Number.isFinite(appliedAmount) ||
			appliedAmount < 0 ||
			!hasValidSatDeductionCode
		) {
			return {
				ok: false,
				value: [],
				issues: [
					createFiscalVoucherSourceIssue(
						'DEDUCTION_BREAKDOWN_INVALID',
						`deductionsBreakdown.${index}`,
						'Persisted payroll deduction breakdown item is invalid.',
					),
				],
			};
		}

		const calculationMethod = isPayrollDeductionCalculationMethod(item.calculationMethod)
			? item.calculationMethod
			: 'FIXED_AMOUNT';
		const frequency = isPayrollDeductionFrequency(item.frequency) ? item.frequency : 'ONE_TIME';
		const statusBefore = isPayrollDeductionStatus(item.statusBefore)
			? item.statusBefore
			: 'ACTIVE';
		const statusAfter = isPayrollDeductionStatus(item.statusAfter)
			? item.statusAfter
			: statusBefore;

		parsedItems.push({
			deductionId: deductionId.trim(),
			type,
			label: label.trim(),
			calculationMethod,
			frequency,
			configuredValue: readFiniteNumber(item.configuredValue) ?? appliedAmount,
			sourceValue: readSourceNumberOrString(item.sourceValue, appliedAmount),
			baseAmount: readFiniteNumber(item.baseAmount) ?? 0,
			calculatedAmount: readFiniteNumber(item.calculatedAmount) ?? appliedAmount,
			appliedAmount,
			applicableDays: readFiniteNumber(item.applicableDays) ?? 0,
			totalInstallments: readFiniteNumber(item.totalInstallments),
			sourceTotalInstallments: readFiniteNumber(item.sourceTotalInstallments),
			completedInstallmentsBefore: readFiniteNumber(item.completedInstallmentsBefore) ?? 0,
			completedInstallmentsAfter: readFiniteNumber(item.completedInstallmentsAfter) ?? 0,
			remainingAmountBefore: readFiniteNumber(item.remainingAmountBefore),
			remainingAmountAfter: readFiniteNumber(item.remainingAmountAfter),
			sourceTotalAmount: readSourceTotalAmount(item.sourceTotalAmount),
			statusBefore,
			statusAfter,
			cappedByNetPay: item.cappedByNetPay === true,
			sourceStartDateKey: readStringOrNull(item.sourceStartDateKey) ?? '',
			sourceEndDateKey: readStringOrNull(item.sourceEndDateKey),
			referenceNumber: readStringOrNull(item.referenceNumber),
			satDeductionCode: typeof satDeductionCode === 'string' ? satDeductionCode.trim() : null,
		});
	}

	return { ok: true, value: parsedItems, issues: [] };
}

/**
 * Creates the route response summary for prepared fiscal vouchers.
 *
 * @param rows - Persisted fiscal voucher rows
 * @returns Status counts
 */
function summarizeFiscalVoucherStatuses(rows: PayrollFiscalVoucherDbRow[]): {
	total: number;
	blocked: number;
	ready: number;
	stamped: number;
	failed: number;
	cancelled: number;
} {
	return rows.reduce(
		(summary, row) => {
			const status = row.status as PayrollFiscalVoucherValidationStatus | string;
			return {
				total: summary.total + 1,
				blocked: summary.blocked + (status === 'BLOCKED' ? 1 : 0),
				ready: summary.ready + (status === 'READY_TO_STAMP' ? 1 : 0),
				stamped: summary.stamped + (status === 'STAMPED' ? 1 : 0),
				failed: summary.failed + (status === 'STAMPING_FAILED' ? 1 : 0),
				cancelled: summary.cancelled + (status === 'CANCELLED' ? 1 : 0),
			};
		},
		{ total: 0, blocked: 0, ready: 0, stamped: 0, failed: 0, cancelled: 0 },
	);
}

/**
 * Builds a route response payload for fiscal voucher rows.
 *
 * @param rows - Fiscal voucher database rows
 * @returns API response payload
 */
function buildFiscalVoucherListPayload(rows: PayrollFiscalVoucherDbRow[]): {
	statusSummary: ReturnType<typeof summarizeFiscalVoucherStatuses>;
	vouchers: PayrollFiscalVoucherDbRow[];
} {
	return {
		statusSummary: summarizeFiscalVoucherStatuses(rows),
		vouchers: rows,
	};
}

/**
 * Converts a persisted payroll row into a fiscal voucher source row.
 *
 * @param args - Conversion arguments
 * @returns Minimal payroll calculation row accepted by the voucher mapper
 */
function buildFiscalVoucherCalculationRow(args: {
	run: { paymentFrequency: PayrollCalculationRow['paymentFrequency'] };
	line: PayrollRunEmployeeFiscalSource;
	employeeName: string;
}): {
	row: PayrollCalculationRow;
	issues: PayrollFiscalVoucherValidationIssue[];
} {
	const taxBreakdown = asRecord(args.line.taxBreakdown);
	const deductionsBreakdown = parsePayrollDeductionBreakdown(args.line.deductionsBreakdown);
	const employeeWithholdings = resolveEmployeeWithholdings(taxBreakdown);
	const informationalLines = resolveInformationalLines(taxBreakdown);
	const fiscalGrossPay =
		args.line.fiscalGrossPay === null
			? null
			: roundCurrency(toFiniteNumber(args.line.fiscalGrossPay));
	const grossPay = roundCurrency(
		toFiniteNumber(taxBreakdown?.grossPay, toFiniteNumber(args.line.totalPay)),
	);

	return {
		row: {
			employeeId: args.line.employeeId,
			name: args.employeeName,
			paymentFrequency: args.run.paymentFrequency,
			fiscalGrossPay,
			grossPay,
			complementPay:
				args.line.complementPay === null
					? null
					: roundCurrency(toFiniteNumber(args.line.complementPay)),
			deductionsBreakdown: deductionsBreakdown.value,
			employeeWithholdings: employeeWithholdings.value,
			informationalLines: informationalLines.value,
		} as unknown as PayrollCalculationRow,
		issues: [
			...deductionsBreakdown.issues,
			...employeeWithholdings.issues,
			...informationalLines.issues,
		],
	};
}

/**
 * Builds a fiscal voucher row ready for insertion.
 *
 * @param args - Source payroll, organization and employee data
 * @returns Insertable fiscal voucher row
 */
function buildPreparedFiscalVoucherRow(args: {
	run: {
		id: string;
		organizationId: string;
		paymentFrequency: PayrollCalculationRow['paymentFrequency'];
		periodStart: Date;
		periodEnd: Date;
		timeZone: string;
	};
	paymentDateKey: string | null;
	line: PayrollRunEmployeeFiscalSource;
	organizationName: string | null;
	organizationMetadata: Record<string, unknown> | null;
	employeeProfile: {
		name: string;
		rfc: string | null;
		nss: string | null;
	};
}): Omit<PayrollFiscalVoucherDbRow, 'id' | 'createdAt' | 'updatedAt'> {
	const calculationRow = buildFiscalVoucherCalculationRow({
		run: args.run,
		line: args.line,
		employeeName: args.employeeProfile.name,
	});
	const voucher = buildPayrollFiscalVoucherFromCalculationRow({
		row: calculationRow.row,
		payrollRunId: args.run.id,
		payrollRunEmployeeId: args.line.id,
		organizationId: args.run.organizationId,
		issuer: {
			name: args.organizationName,
			rfc: readStringField(args.organizationMetadata, ['rfc', 'fiscalRfc']),
			fiscalRegime: readStringField(args.organizationMetadata, [
				'fiscalRegime',
				'regimenFiscal',
			]),
			expeditionPostalCode: readStringField(args.organizationMetadata, [
				'expeditionPostalCode',
				'lugarExpedicion',
				'postalCode',
			]),
		},
		receiver: {
			name: args.employeeProfile.name,
			rfc: args.employeeProfile.rfc,
			curp: null,
			nss: args.employeeProfile.nss,
			fiscalRegime: null,
			fiscalPostalCode: null,
			contractType: null,
			workdayType: null,
		},
		periodStartDateKey: toDateKeyInTimeZone(args.run.periodStart, args.run.timeZone),
		periodEndDateKey: toDateKeyInTimeZone(args.run.periodEnd, args.run.timeZone),
		paymentDateKey: args.paymentDateKey,
	});
	const validation = validatePayrollFiscalVoucher(voucher);
	const validationErrors = [...calculationRow.issues, ...validation.errors];

	return {
		payrollRunId: args.run.id,
		payrollRunEmployeeId: args.line.id,
		organizationId: args.run.organizationId,
		employeeId: args.line.employeeId,
		status: validationErrors.length > 0 ? 'BLOCKED' : validation.status,
		voucher: voucher as unknown as Record<string, unknown>,
		validationErrors: validationErrors as unknown as Record<string, unknown>[],
		validationWarnings: validation.warnings as unknown as Record<string, unknown>[],
		uuid: null,
		stampedXml: null,
		pacProvider: null,
		stampedAt: null,
		cancellationReason: null,
		replacementUuid: null,
		preparedAt: new Date(),
	};
}

/**
 * Builds one SQL update payload for changing the fiscal payment date on many
 * unstamped vouchers.
 *
 * @param paymentDateKey - Fiscal payment date key to apply
 * @returns Column updates for the bulk payment-date reconciliation
 */
function buildFiscalVoucherPaymentDateBulkUpdate(paymentDateKey: string): {
	status: PayrollFiscalVoucherValidationStatus | ReturnType<typeof sql>;
	voucher: ReturnType<typeof sql>;
	validationErrors: ReturnType<typeof sql>;
	updatedAt: Date;
} {
	const validationErrorsWithoutPaymentDate = sql`coalesce((select jsonb_agg(error_item) from jsonb_array_elements(${payrollFiscalVoucher.validationErrors}) as error_item where error_item->>'code' <> 'PAYMENT_DATE_REQUIRED'), '[]'::jsonb)`;

	return {
		status: sql`case when jsonb_array_length(${validationErrorsWithoutPaymentDate}) = 0 then 'READY_TO_STAMP' else ${payrollFiscalVoucher.status} end`,
		voucher: sql`jsonb_set(${payrollFiscalVoucher.voucher}, '{paymentDateKey}', to_jsonb(${paymentDateKey}::text), true)`,
		validationErrors: validationErrorsWithoutPaymentDate,
		updatedAt: new Date(),
	};
}

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
	employees: Array<PayrollCalculationRow & { holidayImpact?: PayrollEmployeeHolidayImpact }>;
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
	holidayNotices: PayrollHolidayNotice[];
	payrollSettingsSnapshot: {
		riskWorkRate: number;
		statePayrollTaxRate: number;
		absorbImssEmployeeShare: boolean;
		absorbIsr: boolean;
		aguinaldoDays: number;
		vacationPremiumRate: number;
		realVacationPremiumRate: number;
		enableSeventhDayPay: boolean;
		enableDualPayroll: boolean;
		autoDeductLunchBreak: boolean;
		lunchBreakMinutes: number;
		lunchBreakThresholdHours: number;
		countSaturdayAsWorkedForSeventhDay: boolean;
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
	const legacyAdditionalMandatoryRestDays = orgSettings[0]?.additionalMandatoryRestDays ?? [];
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
		realVacationPremiumRate: Number(
			orgSettings[0]?.realVacationPremiumRate ?? orgSettings[0]?.vacationPremiumRate ?? 0.25,
		),
		enableSeventhDayPay: Boolean(orgSettings[0]?.enableSeventhDayPay ?? false),
		enableDualPayroll: Boolean(orgSettings[0]?.enableDualPayroll ?? false),
		autoDeductLunchBreak: Boolean(orgSettings[0]?.autoDeductLunchBreak ?? false),
		lunchBreakMinutes: Number(orgSettings[0]?.lunchBreakMinutes ?? 60),
		lunchBreakThresholdHours: Number(orgSettings[0]?.lunchBreakThresholdHours ?? 6),
		countSaturdayAsWorkedForSeventhDay: Boolean(
			orgSettings[0]?.countSaturdayAsWorkedForSeventhDay ?? false,
		),
	};

	const periodBounds = getPayrollPeriodBounds({
		periodStartDateKey,
		periodEndDateKey,
		timeZone,
	});

	const additionalMandatoryRestDays = await resolveAdditionalMandatoryRestDaysForPeriod({
		organizationId,
		periodStartDateKey,
		periodEndDateKey,
		legacyAdditionalMandatoryRestDays,
	});

	const employees = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
			jobPositionId: employee.jobPositionId,
			lastPayrollDate: employee.lastPayrollDate,
			hireDate: employee.hireDate,
			status: employee.status,
			sbcDailyOverride: employee.sbcDailyOverride,
			aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
			dailyPay: employee.dailyPay,
			fiscalDailyPay: employee.fiscalDailyPay,
			paymentFrequency: employee.paymentFrequency,
			shiftType: employee.shiftType,
			locationGeographicZone: location.geographicZone,
			locationTimeZone: location.timeZone,
		})
		.from(employee)
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
						checkOutReason: attendanceRecord.checkOutReason,
						offsiteDateKey: attendanceRecord.offsiteDateKey,
						offsiteDayKind: attendanceRecord.offsiteDayKind,
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
						dateKey: vacationRequestDay.dateKey,
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
	const vacationDateKeysByEmployee: Record<string, string[]> = {};
	for (const row of vacationDayRows) {
		vacationDayCounts[row.employeeId] = (vacationDayCounts[row.employeeId] ?? 0) + 1;
		vacationDateKeysByEmployee[row.employeeId] = [
			...(vacationDateKeysByEmployee[row.employeeId] ?? []),
			row.dateKey,
		];
	}

	const payrollCutoffDateKeys = resolvePayrollCutoffAssumedDateKeys({
		now: new Date(),
		periodStartDateKey,
		periodEndDateKey,
		timeZone,
	});
	const assumedAttendanceDateKeys = Object.fromEntries(
		filteredEmployees.map((employeeRow) => [
			employeeRow.id,
			employeeRow.status === 'ACTIVE' ? payrollCutoffDateKeys : [],
		]),
	);

	const payableVacationRequestRows =
		employeeIds.length === 0 || !payrollSettingsSnapshot.countSaturdayAsWorkedForSeventhDay
			? []
			: await db
					.select({
						requestId: vacationRequestDay.requestId,
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

	const payableVacationRequestIds = new Set(
		payableVacationRequestRows.map((row) => row.requestId),
	);

	const approvedVacationPeriodRows =
		employeeIds.length === 0 || !payrollSettingsSnapshot.countSaturdayAsWorkedForSeventhDay
			? []
			: await db
					.select({
						id: vacationRequest.id,
						employeeId: vacationRequest.employeeId,
						startDateKey: vacationRequest.startDateKey,
						endDateKey: vacationRequest.endDateKey,
					})
					.from(vacationRequest)
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							inArray(vacationRequest.employeeId, employeeIds),
							eq(vacationRequest.status, 'APPROVED'),
							lte(vacationRequest.startDateKey, periodEndDateKey),
							gte(vacationRequest.endDateKey, periodStartDateKey),
						),
					);

	const approvedVacationPeriodsByEmployeeId = new Map<
		string,
		Array<{ startDateKey: string; endDateKey: string }>
	>();
	for (const row of approvedVacationPeriodRows) {
		if (!payableVacationRequestIds.has(row.id)) {
			continue;
		}

		const current = approvedVacationPeriodsByEmployeeId.get(row.employeeId) ?? [];
		current.push({
			startDateKey: row.startDateKey,
			endDateKey: row.endDateKey,
		});
		approvedVacationPeriodsByEmployeeId.set(row.employeeId, current);
	}

	const schedulesByEmployeeId = new Map<string, typeof schedules>();
	for (const scheduleRow of schedules) {
		const current = schedulesByEmployeeId.get(scheduleRow.employeeId) ?? [];
		current.push(scheduleRow);
		schedulesByEmployeeId.set(scheduleRow.employeeId, current);
	}

	const saturdayVacationBonusDays: Record<string, number> = {};
	if (payrollSettingsSnapshot.countSaturdayAsWorkedForSeventhDay) {
		for (const employeeRow of filteredEmployees) {
			const saturdayBonusDays = countSaturdayBonusDaysForPeriod({
				countSaturdayAsWorkedForSeventhDay:
					payrollSettingsSnapshot.countSaturdayAsWorkedForSeventhDay,
				periodStartDateKey,
				periodEndDateKey,
				scheduleDays: (schedulesByEmployeeId.get(employeeRow.id) ?? []).map(
					(scheduleRow) => ({
						dayOfWeek: scheduleRow.dayOfWeek,
						isWorkingDay: scheduleRow.isWorkingDay,
					}),
				),
				vacationPeriods: approvedVacationPeriodsByEmployeeId.get(employeeRow.id) ?? [],
			});

			if (saturdayBonusDays > 0) {
				saturdayVacationBonusDays[employeeRow.id] = saturdayBonusDays;
			}
		}
	}

	const incapacityRows =
		employeeIds.length === 0
			? []
			: await db
					.select({
						id: employeeIncapacity.id,
						employeeId: employeeIncapacity.employeeId,
						caseId: employeeIncapacity.caseId,
						type: employeeIncapacity.type,
						satTipoIncapacidad: employeeIncapacity.satTipoIncapacidad,
						startDateKey: employeeIncapacity.startDateKey,
						endDateKey: employeeIncapacity.endDateKey,
						daysAuthorized: employeeIncapacity.daysAuthorized,
						percentOverride: employeeIncapacity.percentOverride,
					})
					.from(employeeIncapacity)
					.where(
						and(
							eq(employeeIncapacity.organizationId, organizationId),
							inArray(employeeIncapacity.employeeId, employeeIds),
							eq(employeeIncapacity.status, 'ACTIVE'),
							lte(employeeIncapacity.startDateKey, periodEndDateKey),
							gte(employeeIncapacity.endDateKey, periodStartDateKey),
						),
					);

	const incapacityRecordsByEmployee: Record<string, IncapacityRecordInput[]> = {};
	for (const row of incapacityRows) {
		if (!incapacityRecordsByEmployee[row.employeeId]) {
			incapacityRecordsByEmployee[row.employeeId] = [];
		}
		incapacityRecordsByEmployee[row.employeeId]?.push({
			...row,
			percentOverride:
				row.percentOverride !== null && row.percentOverride !== undefined
					? Number(row.percentOverride)
					: null,
		});
	}

	// Intentionally unbounded: this fetch is already constrained by organization,
	// the employeeIds participating in the run, ACTIVE status, and the payroll period.
	const overtimeAuthorizationRows: OvertimeAuthorizationRow[] =
		employeeIds.length === 0
			? []
			: await db
					.select({
						employeeId: overtimeAuthorization.employeeId,
						dateKey: overtimeAuthorization.dateKey,
						authorizedHours: overtimeAuthorization.authorizedHours,
						status: overtimeAuthorization.status,
					})
					.from(overtimeAuthorization)
					.where(
						and(
							eq(overtimeAuthorization.organizationId, organizationId),
							inArray(overtimeAuthorization.employeeId, employeeIds),
							eq(overtimeAuthorization.status, 'ACTIVE'),
							gte(overtimeAuthorization.dateKey, periodStartDateKey),
							lte(overtimeAuthorization.dateKey, periodEndDateKey),
						),
					);

	const employeeDeductionRows: EmployeeDeductionRow[] =
		employeeIds.length === 0
			? []
			: await db
					.select({
						id: employeeDeduction.id,
						employeeId: employeeDeduction.employeeId,
						type: employeeDeduction.type,
						label: employeeDeduction.label,
						calculationMethod: employeeDeduction.calculationMethod,
						value: employeeDeduction.value,
						frequency: employeeDeduction.frequency,
						totalInstallments: employeeDeduction.totalInstallments,
						completedInstallments: employeeDeduction.completedInstallments,
						totalAmount: employeeDeduction.totalAmount,
						remainingAmount: employeeDeduction.remainingAmount,
						status: employeeDeduction.status,
						startDateKey: employeeDeduction.startDateKey,
						endDateKey: employeeDeduction.endDateKey,
						referenceNumber: employeeDeduction.referenceNumber,
						satDeductionCode: employeeDeduction.satDeductionCode,
						notes: employeeDeduction.notes,
						createdAt: employeeDeduction.createdAt,
					})
					.from(employeeDeduction)
					.where(
						and(
							eq(employeeDeduction.organizationId, organizationId),
							inArray(employeeDeduction.employeeId, employeeIds),
							eq(employeeDeduction.status, 'ACTIVE'),
							lte(employeeDeduction.startDateKey, periodEndDateKey),
							or(
								isNull(employeeDeduction.endDateKey),
								gte(employeeDeduction.endDateKey, periodStartDateKey),
							),
						),
					);

	const employeeGratificationRows: EmployeeGratificationRow[] =
		employeeIds.length === 0
			? []
			: await db
					.select({
						id: employeeGratification.id,
						employeeId: employeeGratification.employeeId,
						concept: employeeGratification.concept,
						amount: employeeGratification.amount,
						periodicity: employeeGratification.periodicity,
						applicationMode: employeeGratification.applicationMode,
						status: employeeGratification.status,
						startDateKey: employeeGratification.startDateKey,
						endDateKey: employeeGratification.endDateKey,
						notes: employeeGratification.notes,
						createdAt: employeeGratification.createdAt,
					})
					.from(employeeGratification)
					.where(
						and(
							eq(employeeGratification.organizationId, organizationId),
							inArray(employeeGratification.employeeId, employeeIds),
							eq(employeeGratification.status, 'ACTIVE'),
							lte(employeeGratification.startDateKey, periodEndDateKey),
							or(
								isNull(employeeGratification.endDateKey),
								gte(employeeGratification.endDateKey, periodStartDateKey),
							),
						),
					);

	const {
		employees: results,
		totalAmount,
		taxSummary,
	} = calculatePayrollFromData({
		employees: filteredEmployees,
		schedules,
		attendanceRows,
		overtimeAuthorizations: overtimeAuthorizationRows,
		employeeDeductions: employeeDeductionRows,
		employeeGratifications: employeeGratificationRows,
		periodStartDateKey,
		periodEndDateKey,
		periodBounds,
		overtimeEnforcement,
		weekStartDay,
		additionalMandatoryRestDays,
		defaultTimeZone: timeZone,
		payrollSettings: payrollSettingsSnapshot,
		vacationDayCounts,
		vacationDateKeysByEmployee,
		assumedAttendanceDateKeys,
		saturdayVacationBonusDays,
		incapacityRecordsByEmployee,
	});

	const holidayContext = await resolvePayrollHolidayContext({
		organizationId,
		periodStartDateKey,
		periodEndDateKey,
		legacyAdditionalMandatoryRestDays,
		employees: results,
		additionalMandatoryRestDays,
	});

	const employeesWithHolidayImpact = results.map((employeeResult) => {
		const holidayImpact =
			holidayContext.employeeHolidayImpactByEmployeeId[employeeResult.employeeId];
		if (!holidayImpact) {
			return employeeResult;
		}
		return {
			...employeeResult,
			holidayImpact,
		};
	});

	return {
		employees: employeesWithHolidayImpact,
		totalAmount,
		taxSummary,
		overtimeEnforcement,
		timeZone,
		periodStartUtc: periodBounds.periodStartUtc,
		periodEndInclusiveUtc: periodBounds.periodEndInclusiveUtc,
		periodEndExclusiveUtc: periodBounds.periodEndExclusiveUtc,
		holidayNotices: holidayContext.holidayNotices,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const {
				employees,
				totalAmount,
				overtimeEnforcement,
				timeZone,
				taxSummary,
				holidayNotices,
			} = await calculatePayroll({
				organizationId,
				periodStartDateKey: body.periodStartDateKey,
				periodEndDateKey: body.periodEndDateKey,
				paymentFrequency: body.paymentFrequency,
			});
			const includeDualPayrollCompensation = await canViewDualPayrollCompensation({
				authType,
				organizationId,
				session: session ?? null,
			});

			return {
				data: {
					employees: sanitizeDualPayrollEmployees(
						employees,
						includeDualPayrollCompensation,
					),
					totalAmount,
					taxSummary,
					periodStartDateKey: body.periodStartDateKey,
					periodEndDateKey: body.periodEndDateKey,
					overtimeEnforcement,
					timeZone,
					holidayNotices,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const calculation = await calculatePayroll({
				organizationId,
				periodStartDateKey: body.periodStartDateKey,
				periodEndDateKey: body.periodEndDateKey,
				paymentFrequency: body.paymentFrequency,
			});
			const includeDualPayrollCompensation = await canViewDualPayrollCompensation({
				authType,
				organizationId,
				session: session ?? null,
			});
			const sanitizedCalculation = {
				...calculation,
				employees: sanitizeDualPayrollEmployees(
					calculation.employees,
					includeDualPayrollCompensation,
				),
				payrollSettingsSnapshot: includeDualPayrollCompensation
					? calculation.payrollSettingsSnapshot
					: sanitizeDualPayrollSettingsSnapshot(calculation.payrollSettingsSnapshot),
			};

			const hasBlockingWarnings =
				calculation.overtimeEnforcement === 'BLOCK' &&
				calculation.employees.some((emp) =>
					emp.warnings.some((w) => w.severity === 'error'),
				);

			if (hasBlockingWarnings) {
				set.status = 400;
				return buildErrorResponse(
					'Overtime limits exceeded. Resolve errors to process payroll.',
					400,
					{ details: { calculation: sanitizedCalculation } },
				);
			}

			const deductionUpdates: PendingPayrollDeductionUpdate[] = calculation.employees.flatMap(
				(row) =>
					row.deductionsBreakdown
						.filter((item) => item.appliedAmount > 0)
						.map((item) => ({
							deductionId: item.deductionId,
							shouldPersistStateChange:
								item.statusAfter !== item.statusBefore ||
								item.completedInstallmentsAfter !==
									item.completedInstallmentsBefore ||
								item.remainingAmountAfter !== item.remainingAmountBefore,
							status: item.statusAfter,
							completedInstallments: item.completedInstallmentsAfter,
							remainingAmount: normalizeDeductionAmount(item.remainingAmountAfter),
							previousStatus: item.statusBefore,
							previousCompletedInstallments: item.completedInstallmentsBefore,
							previousRemainingAmount: normalizeDeductionAmount(
								item.remainingAmountBefore,
							),
							previousValue: String(item.sourceValue),
							previousCalculationMethod: item.calculationMethod,
							previousFrequency: item.frequency,
							previousTotalInstallments: item.sourceTotalInstallments,
							previousTotalAmount: normalizeDeductionAmount(item.sourceTotalAmount),
							previousStartDateKey: item.sourceStartDateKey,
							previousEndDateKey: item.sourceEndDateKey,
						})),
			);
			const gratificationUpdates: PendingPayrollGratificationUpdate[] =
				calculation.employees.flatMap((row) =>
					row.gratificationsBreakdown
						.filter((item) => item.appliedAmount > 0)
						.map((item) => ({
							gratificationId: item.gratificationId,
							shouldPersistStateChange: item.statusAfter !== item.statusBefore,
							status: item.statusAfter,
							previousStatus: item.statusBefore,
							previousAmount:
								normalizeGratificationAmount(item.sourceAmount) ?? '0.00',
							previousPeriodicity: item.periodicity,
							previousApplicationMode: item.applicationMode,
							previousStartDateKey: item.sourceStartDateKey,
							previousEndDateKey: item.sourceEndDateKey,
						})),
				);

			let runResult: Record<string, unknown> | undefined;
			try {
				runResult = await db.transaction(async (tx) => {
					if (deductionUpdates.length > 0) {
						const currentDeductions = await tx
							.select({
								id: employeeDeduction.id,
								status: employeeDeduction.status,
								completedInstallments: employeeDeduction.completedInstallments,
								remainingAmount: employeeDeduction.remainingAmount,
								value: employeeDeduction.value,
								calculationMethod: employeeDeduction.calculationMethod,
								frequency: employeeDeduction.frequency,
								totalInstallments: employeeDeduction.totalInstallments,
								totalAmount: employeeDeduction.totalAmount,
								startDateKey: employeeDeduction.startDateKey,
								endDateKey: employeeDeduction.endDateKey,
							})
							.from(employeeDeduction)
							.where(
								and(
									eq(employeeDeduction.organizationId, organizationId),
									inArray(
										employeeDeduction.id,
										deductionUpdates.map((update) => update.deductionId),
									),
								),
							);
						const currentDeductionsById = new Map(
							currentDeductions.map((row) => [row.id, row]),
						);
						const hasDeductionConflict = deductionUpdates.some((update) => {
							const currentDeduction = currentDeductionsById.get(update.deductionId);
							if (!currentDeduction) {
								return true;
							}

							return (
								currentDeduction.status !== update.previousStatus ||
								currentDeduction.completedInstallments !==
									update.previousCompletedInstallments ||
								normalizeDeductionAmount(currentDeduction.remainingAmount) !==
									update.previousRemainingAmount ||
								currentDeduction.value !== update.previousValue ||
								currentDeduction.calculationMethod !==
									update.previousCalculationMethod ||
								currentDeduction.frequency !== update.previousFrequency ||
								currentDeduction.totalInstallments !==
									update.previousTotalInstallments ||
								normalizeDeductionAmount(currentDeduction.totalAmount) !==
									update.previousTotalAmount ||
								currentDeduction.startDateKey !== update.previousStartDateKey ||
								currentDeduction.endDateKey !== update.previousEndDateKey
							);
						});

						if (hasDeductionConflict) {
							throw new Error(PAYROLL_DEDUCTION_STATE_CONFLICT_ERROR);
						}
					}

					if (gratificationUpdates.length > 0) {
						const currentGratifications = await tx
							.select({
								id: employeeGratification.id,
								status: employeeGratification.status,
								amount: employeeGratification.amount,
								periodicity: employeeGratification.periodicity,
								applicationMode: employeeGratification.applicationMode,
								startDateKey: employeeGratification.startDateKey,
								endDateKey: employeeGratification.endDateKey,
							})
							.from(employeeGratification)
							.where(
								and(
									eq(employeeGratification.organizationId, organizationId),
									inArray(
										employeeGratification.id,
										gratificationUpdates.map(
											(update) => update.gratificationId,
										),
									),
								),
							);
						const currentGratificationsById = new Map(
							currentGratifications.map((row) => [row.id, row]),
						);
						const hasGratificationConflict = gratificationUpdates.some((update) => {
							const currentGratification = currentGratificationsById.get(
								update.gratificationId,
							);
							if (!currentGratification) {
								return true;
							}

							return (
								currentGratification.status !== update.previousStatus ||
								normalizeGratificationAmount(currentGratification.amount) !==
									update.previousAmount ||
								currentGratification.periodicity !== update.previousPeriodicity ||
								currentGratification.applicationMode !==
									update.previousApplicationMode ||
								currentGratification.startDateKey !== update.previousStartDateKey ||
								currentGratification.endDateKey !== update.previousEndDateKey
							);
						});

						if (hasGratificationConflict) {
							throw new Error(PAYROLL_GRATIFICATION_STATE_CONFLICT_ERROR);
						}
					}

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
						holidayNotices: calculation.holidayNotices as unknown as Record<
							string,
							unknown
						>[],
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
							fiscalDailyPay:
								row.fiscalDailyPay === null ? null : row.fiscalDailyPay.toFixed(4),
							fiscalGrossPay:
								row.fiscalGrossPay === null ? null : row.fiscalGrossPay.toFixed(4),
							complementPay:
								row.complementPay === null ? null : row.complementPay.toFixed(4),
							totalRealPay:
								row.totalRealPay === null ? null : row.totalRealPay.toFixed(4),
							normalHours: row.normalHours.toFixed(2),
							normalPay: row.normalPay.toFixed(2),
							overtimeDoubleHours: row.overtimeDoubleHours.toFixed(2),
							overtimeDoublePay: row.overtimeDoublePay.toFixed(2),
							overtimeTripleHours: row.overtimeTripleHours.toFixed(2),
							overtimeTriplePay: row.overtimeTriplePay.toFixed(2),
							authorizedOvertimeHours: row.authorizedOvertimeHours.toFixed(2),
							unauthorizedOvertimeHours: row.unauthorizedOvertimeHours.toFixed(2),
							sundayPremiumAmount: row.sundayPremiumAmount.toFixed(2),
							mandatoryRestDayPremiumAmount:
								row.mandatoryRestDayPremiumAmount.toFixed(2),
							vacationDaysPaid: row.vacationDaysPaid,
							vacationPayAmount: row.vacationPayAmount.toFixed(2),
							vacationPremiumAmount: row.vacationPremiumAmount.toFixed(2),
							lunchBreakAutoDeductedDays: row.lunchBreakAutoDeductedDays,
							lunchBreakAutoDeductedMinutes: row.lunchBreakAutoDeductedMinutes,
							deductionsBreakdown: row.deductionsBreakdown as unknown as Record<
								string,
								unknown
							>[],
							totalDeductions: row.totalDeductions.toFixed(2),
							taxBreakdown: {
								grossPay:
									row.fiscalGrossPay === null
										? roundCurrency(
												Math.max(row.grossPay - row.totalGratifications, 0),
											)
										: row.fiscalGrossPay,
								seventhDayPay: row.seventhDayPay,
								realCompensation: {
									vacationPayAmount: row.realVacationPayAmount,
									vacationPremiumAmount: row.realVacationPremiumAmount,
								},
								gratificationsBreakdown: row.gratificationsBreakdown,
								totalGratifications: row.totalGratifications,
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

						for (const deductionUpdate of deductionUpdates.filter(
							(update) => update.shouldPersistStateChange,
						)) {
							const previousStateConditions = [
								eq(employeeDeduction.status, deductionUpdate.previousStatus),
								eq(
									employeeDeduction.completedInstallments,
									deductionUpdate.previousCompletedInstallments,
								),
								deductionUpdate.previousRemainingAmount === null
									? isNull(employeeDeduction.remainingAmount)
									: eq(
											employeeDeduction.remainingAmount,
											deductionUpdate.previousRemainingAmount,
										),
								eq(employeeDeduction.value, deductionUpdate.previousValue),
								eq(
									employeeDeduction.calculationMethod,
									deductionUpdate.previousCalculationMethod,
								),
								eq(employeeDeduction.frequency, deductionUpdate.previousFrequency),
								deductionUpdate.previousTotalInstallments === null
									? isNull(employeeDeduction.totalInstallments)
									: eq(
											employeeDeduction.totalInstallments,
											deductionUpdate.previousTotalInstallments,
										),
								deductionUpdate.previousTotalAmount === null
									? isNull(employeeDeduction.totalAmount)
									: eq(
											employeeDeduction.totalAmount,
											deductionUpdate.previousTotalAmount,
										),
								eq(
									employeeDeduction.startDateKey,
									deductionUpdate.previousStartDateKey,
								),
								deductionUpdate.previousEndDateKey === null
									? isNull(employeeDeduction.endDateKey)
									: eq(
											employeeDeduction.endDateKey,
											deductionUpdate.previousEndDateKey,
										),
							];
							const updatedRows = await tx
								.update(employeeDeduction)
								.set({
									status: deductionUpdate.status,
									completedInstallments: deductionUpdate.completedInstallments,
									remainingAmount: deductionUpdate.remainingAmount,
								})
								.where(
									and(
										eq(employeeDeduction.id, deductionUpdate.deductionId),
										eq(employeeDeduction.organizationId, organizationId),
										...previousStateConditions,
									),
								)
								.returning({ id: employeeDeduction.id });
							if (updatedRows.length === 0) {
								throw new Error(PAYROLL_DEDUCTION_STATE_CONFLICT_ERROR);
							}
						}

						for (const gratificationUpdate of gratificationUpdates.filter(
							(update) => update.shouldPersistStateChange,
						)) {
							const previousStateConditions = [
								eq(
									employeeGratification.status,
									gratificationUpdate.previousStatus,
								),
								eq(
									employeeGratification.amount,
									gratificationUpdate.previousAmount,
								),
								eq(
									employeeGratification.periodicity,
									gratificationUpdate.previousPeriodicity,
								),
								eq(
									employeeGratification.applicationMode,
									gratificationUpdate.previousApplicationMode,
								),
								eq(
									employeeGratification.startDateKey,
									gratificationUpdate.previousStartDateKey,
								),
								gratificationUpdate.previousEndDateKey === null
									? isNull(employeeGratification.endDateKey)
									: eq(
											employeeGratification.endDateKey,
											gratificationUpdate.previousEndDateKey,
										),
							];
							const updatedRows = await tx
								.update(employeeGratification)
								.set({
									status: gratificationUpdate.status,
								})
								.where(
									and(
										eq(
											employeeGratification.id,
											gratificationUpdate.gratificationId,
										),
										eq(employeeGratification.organizationId, organizationId),
										...previousStateConditions,
									),
								)
								.returning({ id: employeeGratification.id });
							if (updatedRows.length === 0) {
								throw new Error(PAYROLL_GRATIFICATION_STATE_CONFLICT_ERROR);
							}
						}

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
			} catch (error) {
				if (
					error instanceof Error &&
					(error.message === PAYROLL_DEDUCTION_STATE_CONFLICT_ERROR ||
						error.message === PAYROLL_GRATIFICATION_STATE_CONFLICT_ERROR)
				) {
					set.status = 409;
					return buildErrorResponse(
						'Payroll data changed while processing. Recalculate and try again.',
						409,
					);
				}

				throw error;
			}

			const sanitizedRun =
				includeDualPayrollCompensation || !runResult
					? runResult
					: sanitizeDualPayrollRun(
							runResult as typeof runResult & {
								taxSummary?: Record<string, unknown> | null;
							},
						);

			return { data: { run: sanitizedRun, calculation: sanitizedCalculation } };
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}
			const includeDualPayrollCompensation = await canViewDualPayrollCompensation({
				authType,
				organizationId,
				session: session ?? null,
			});

			const runs = await db
				.select()
				.from(payrollRun)
				.where(eq(payrollRun.organizationId, organizationId))
				.limit(query.limit)
				.offset(query.offset)
				.orderBy(payrollRun.createdAt);

			return {
				data: includeDualPayrollCompensation
					? runs
					: runs.map((run) =>
							sanitizeDualPayrollRun(
								run as typeof run & {
									taxSummary?: Record<string, unknown> | null;
								},
							),
						),
			};
		},
		{
			query: payrollRunQuerySchema,
		},
	)
	/**
	 * Prepare fiscal vouchers for a processed payroll run.
	 */
	.post(
		'/runs/:id/fiscal-vouchers/prepare',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;
			const runRows = await db
				.select()
				.from(payrollRun)
				.where(eq(payrollRun.id, id))
				.limit(1);
			const run = runRows[0];

			if (!run) {
				set.status = 404;
				return buildErrorResponse('Payroll run not found', 404);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: run.organizationId,
			});

			if (!organizationId || organizationId !== run.organizationId) {
				set.status = 404;
				return buildErrorResponse('Payroll run not found', 404);
			}

			if (run.status !== 'PROCESSED') {
				set.status = 409;
				return buildErrorResponse(
					'Payroll run must be processed before preparing fiscal vouchers',
					409,
				);
			}

			const canAccessFiscalVouchers = await canViewDualPayrollCompensation({
				authType,
				organizationId: run.organizationId,
				session: session ?? null,
			});
			if (!canAccessFiscalVouchers) {
				set.status = 403;
				return buildErrorResponse('You do not have access to payroll fiscal vouchers', 403);
			}

			const payrollSettingRows = await db
				.select({
					timeZone: payrollSetting.timeZone,
				})
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, run.organizationId))
				.limit(1);
			const timeZoneCandidate = payrollSettingRows[0]?.timeZone ?? 'America/Mexico_City';
			const timeZone = isValidIanaTimeZone(timeZoneCandidate)
				? timeZoneCandidate
				: 'America/Mexico_City';
			const paymentDateKey = body.paymentDateKey ?? null;

			const insertedRows = await db.transaction(async (tx) => {
				const reconcilePaymentDate = async (
					rows: PayrollFiscalVoucherDbRow[],
				): Promise<PayrollFiscalVoucherDbRow[]> => {
					if (paymentDateKey === null) {
						return rows;
					}

					const rowsNeedingPaymentDateUpdate = rows.filter(
						(row) =>
							row.uuid === null &&
							row.stampedAt === null &&
							row.voucher.paymentDateKey !== paymentDateKey,
					);
					const idsToUpdate = rowsNeedingPaymentDateUpdate.map((row) => row.id);

					if (idsToUpdate.length > 0) {
						await tx
							.update(payrollFiscalVoucher)
							.set(buildFiscalVoucherPaymentDateBulkUpdate(paymentDateKey))
							.where(
								and(
									inArray(payrollFiscalVoucher.id, idsToUpdate),
									isNull(payrollFiscalVoucher.uuid),
									isNull(payrollFiscalVoucher.stampedAt),
								),
							);
					}

					if (idsToUpdate.length === 0) {
						return rows;
					}

					return (await tx
						.select()
						.from(payrollFiscalVoucher)
						.where(
							eq(payrollFiscalVoucher.payrollRunId, id),
						)) as PayrollFiscalVoucherDbRow[];
				};

				const existingRows = (await tx
					.select()
					.from(payrollFiscalVoucher)
					.where(
						eq(payrollFiscalVoucher.payrollRunId, id),
					)) as PayrollFiscalVoucherDbRow[];
				if (existingRows.length > 0) {
					return reconcilePaymentDate(existingRows);
				}

				const lines = (await tx
					.select()
					.from(payrollRunEmployee)
					.where(
						eq(payrollRunEmployee.payrollRunId, id),
					)) as PayrollRunEmployeeFiscalSource[];

				const organizationRows = await tx
					.select({
						name: organization.name,
						metadata: organization.metadata,
					})
					.from(organization)
					.where(eq(organization.id, run.organizationId))
					.limit(1);
				const organizationRow = organizationRows[0] as
					| { name?: string | null; metadata?: string | null }
					| undefined;

				const employeeIds = lines.map((line) => line.employeeId);
				const employeeRows =
					employeeIds.length === 0
						? []
						: await tx
								.select({
									id: employee.id,
									firstName: employee.firstName,
									lastName: employee.lastName,
									rfc: employee.rfc,
									nss: employee.nss,
								})
								.from(employee)
								.where(inArray(employee.id, employeeIds));
				const employeesById = new Map(
					employeeRows.map((row) => [
						row.id,
						{
							name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
							rfc: row.rfc ?? null,
							nss: row.nss ?? null,
						},
					]),
				);

				const preparedRows = lines.map((line) =>
					buildPreparedFiscalVoucherRow({
						run: {
							id: run.id,
							organizationId: run.organizationId,
							paymentFrequency: run.paymentFrequency,
							periodStart: run.periodStart,
							periodEnd: run.periodEnd,
							timeZone,
						},
						paymentDateKey,
						line,
						organizationName: organizationRow?.name ?? null,
						organizationMetadata: parseOrganizationMetadata(organizationRow?.metadata),
						employeeProfile: employeesById.get(line.employeeId) ?? {
							name: line.employeeId,
							rfc: null,
							nss: null,
						},
					}),
				);

				if (preparedRows.length > 0) {
					await tx.insert(payrollFiscalVoucher).values(preparedRows).onConflictDoNothing({
						target: payrollFiscalVoucher.payrollRunEmployeeId,
					});
				}

				const rowsAfterInsert = (await tx
					.select()
					.from(payrollFiscalVoucher)
					.where(
						eq(payrollFiscalVoucher.payrollRunId, id),
					)) as PayrollFiscalVoucherDbRow[];
				return reconcilePaymentDate(rowsAfterInsert);
			});

			return { data: buildFiscalVoucherListPayload(insertedRows) };
		},
		{
			body: payrollFiscalVoucherPrepareSchema,
		},
	)
	/**
	 * List prepared fiscal vouchers for a payroll run.
	 */
	.get(
		'/runs/:id/fiscal-vouchers',
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
			const runRows = await db
				.select()
				.from(payrollRun)
				.where(eq(payrollRun.id, id))
				.limit(1);
			const run = runRows[0];

			if (!run) {
				set.status = 404;
				return buildErrorResponse('Payroll run not found', 404);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: run.organizationId,
			});

			if (!organizationId || organizationId !== run.organizationId) {
				set.status = 404;
				return buildErrorResponse('Payroll run not found', 404);
			}

			const canAccessFiscalVouchers = await canViewDualPayrollCompensation({
				authType,
				organizationId: run.organizationId,
				session: session ?? null,
			});
			if (!canAccessFiscalVouchers) {
				set.status = 403;
				return buildErrorResponse('You do not have access to payroll fiscal vouchers', 403);
			}

			const rows = (await db
				.select()
				.from(payrollFiscalVoucher)
				.where(eq(payrollFiscalVoucher.payrollRunId, id))) as PayrollFiscalVoucherDbRow[];

			return { data: buildFiscalVoucherListPayload(rows) };
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
				return buildErrorResponse('Payroll run not found', 404);
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
				return buildErrorResponse('You do not have access to this payroll run', 403);
			}
			const includeDualPayrollCompensation = await canViewDualPayrollCompensation({
				authType,
				organizationId: record.organizationId,
				session: session ?? null,
			});

			const organizationRows = await db
				.select({ name: organization.name })
				.from(organization)
				.where(eq(organization.id, record.organizationId))
				.limit(1);
			const organizationName = organizationRows[0]?.name ?? null;

			const lines = await db
				.select({
					id: payrollRunEmployee.id,
					payrollRunId: payrollRunEmployee.payrollRunId,
					employeeId: payrollRunEmployee.employeeId,
					hoursWorked: payrollRunEmployee.hoursWorked,
					hourlyPay: payrollRunEmployee.hourlyPay,
					totalPay: payrollRunEmployee.totalPay,
					fiscalDailyPay: payrollRunEmployee.fiscalDailyPay,
					fiscalGrossPay: payrollRunEmployee.fiscalGrossPay,
					complementPay: payrollRunEmployee.complementPay,
					totalRealPay: payrollRunEmployee.totalRealPay,
					normalHours: payrollRunEmployee.normalHours,
					normalPay: payrollRunEmployee.normalPay,
					overtimeDoubleHours: payrollRunEmployee.overtimeDoubleHours,
					overtimeDoublePay: payrollRunEmployee.overtimeDoublePay,
					overtimeTripleHours: payrollRunEmployee.overtimeTripleHours,
					overtimeTriplePay: payrollRunEmployee.overtimeTriplePay,
					authorizedOvertimeHours: payrollRunEmployee.authorizedOvertimeHours,
					unauthorizedOvertimeHours: payrollRunEmployee.unauthorizedOvertimeHours,
					sundayPremiumAmount: payrollRunEmployee.sundayPremiumAmount,
					mandatoryRestDayPremiumAmount: payrollRunEmployee.mandatoryRestDayPremiumAmount,
					vacationDaysPaid: payrollRunEmployee.vacationDaysPaid,
					vacationPayAmount: payrollRunEmployee.vacationPayAmount,
					vacationPremiumAmount: payrollRunEmployee.vacationPremiumAmount,
					lunchBreakAutoDeductedDays: payrollRunEmployee.lunchBreakAutoDeductedDays,
					lunchBreakAutoDeductedMinutes: payrollRunEmployee.lunchBreakAutoDeductedMinutes,
					deductionsBreakdown: payrollRunEmployee.deductionsBreakdown,
					totalDeductions: payrollRunEmployee.totalDeductions,
					taxBreakdown: payrollRunEmployee.taxBreakdown,
					periodStart: payrollRunEmployee.periodStart,
					periodEnd: payrollRunEmployee.periodEnd,
					createdAt: payrollRunEmployee.createdAt,
					updatedAt: payrollRunEmployee.updatedAt,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					employeeNss: employee.nss,
					employeeRfc: employee.rfc,
				})
				.from(payrollRunEmployee)
				.leftJoin(employee, eq(payrollRunEmployee.employeeId, employee.id))
				.where(eq(payrollRunEmployee.payrollRunId, id));

			const employees = lines.map((line) => ({
				id: line.id,
				payrollRunId: line.payrollRunId,
				employeeId: line.employeeId,
				hoursWorked: line.hoursWorked,
				hourlyPay: line.hourlyPay,
				totalPay: line.totalPay,
				...(includeDualPayrollCompensation
					? {
							fiscalDailyPay: line.fiscalDailyPay,
							fiscalGrossPay: line.fiscalGrossPay,
							complementPay: line.complementPay,
							totalRealPay: line.totalRealPay,
							realVacationPayAmount: Number(
								(
									line.taxBreakdown as {
										realCompensation?: {
											vacationPayAmount?: number | string | null;
										};
									} | null
								)?.realCompensation?.vacationPayAmount ?? line.vacationPayAmount,
							),
							realVacationPremiumAmount: Number(
								(
									line.taxBreakdown as {
										realCompensation?: {
											vacationPremiumAmount?: number | string | null;
										};
									} | null
								)?.realCompensation?.vacationPremiumAmount ??
									line.vacationPremiumAmount,
							),
						}
					: {}),
				normalHours: line.normalHours,
				normalPay: line.normalPay,
				overtimeDoubleHours: line.overtimeDoubleHours,
				overtimeDoublePay: line.overtimeDoublePay,
				overtimeTripleHours: line.overtimeTripleHours,
				overtimeTriplePay: line.overtimeTriplePay,
				authorizedOvertimeHours: line.authorizedOvertimeHours,
				unauthorizedOvertimeHours: line.unauthorizedOvertimeHours,
				sundayPremiumAmount: line.sundayPremiumAmount,
				mandatoryRestDayPremiumAmount: line.mandatoryRestDayPremiumAmount,
				vacationDaysPaid: line.vacationDaysPaid,
				vacationPayAmount: line.vacationPayAmount,
				vacationPremiumAmount: line.vacationPremiumAmount,
				lunchBreakAutoDeductedDays: line.lunchBreakAutoDeductedDays,
				lunchBreakAutoDeductedMinutes: line.lunchBreakAutoDeductedMinutes,
				deductionsBreakdown: line.deductionsBreakdown,
				totalDeductions: line.totalDeductions,
				taxBreakdown: includeDualPayrollCompensation
					? line.taxBreakdown
					: sanitizeDualPayrollTaxBreakdown(
							line.taxBreakdown as Record<string, unknown> | null,
						),
				periodStart: line.periodStart,
				periodEnd: line.periodEnd,
				createdAt: line.createdAt,
				updatedAt: line.updatedAt,
				employeeName:
					`${line.employeeFirstName ?? ''} ${line.employeeLastName ?? ''}`.trim(),
				employeeCode: line.employeeCode ?? '',
				employeeNss: line.employeeNss ?? null,
				employeeRfc: line.employeeRfc ?? null,
			}));

			const runPayload = { ...record, organizationName };

			return {
				data: {
					run: includeDualPayrollCompensation
						? runPayload
						: sanitizeDualPayrollRun(
								runPayload as typeof runPayload & {
									taxSummary?: Record<string, unknown> | null;
								},
							),
					employees,
				},
			};
		},
	);
