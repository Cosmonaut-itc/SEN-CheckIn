import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import {
	employee,
	employeeFiscalProfile,
	organizationFiscalProfile,
	payrollConceptSatMapping,
	payrollRun,
	payrollRunEmployee,
	satFiscalCatalogEntry,
} from '../db/schema.js';

const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CURP_PATTERN =
	/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/;
const NSS_PATTERN = /^\d{11}$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_STRING_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const PAID_DAYS_STRING_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const SUPPORTED_PAYMENT_FREQUENCIES = new Set(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);
export type FiscalIssueSeverity = 'ERROR' | 'WARNING';
export type FiscalIssueSource =
	| 'ORGANIZATION'
	| 'EMPLOYEE'
	| 'PAYROLL_RUN'
	| 'CONCEPT_MAPPING'
	| 'CATALOG';
export type FiscalEmployeeStatus = 'READY' | 'BLOCKED';
export type PayrollCfdiConceptNode = 'PERCEPTION' | 'DEDUCTION' | 'OTHER_PAYMENT';

export interface FiscalIssue {
	code: string;
	severity: FiscalIssueSeverity;
	field: string;
	message: string;
	source: FiscalIssueSource;
}

export interface PayrollFiscalPreflightResult {
	organizationId: string;
	payrollRunId: string;
	canPrepareFiscalVouchers: boolean;
	summary: {
		employeesTotal: number;
		employeesReady: number;
		employeesBlocked: number;
		unsupportedConcepts: number;
	};
	organizationIssues: FiscalIssue[];
	employeeResults: Array<{
		employeeId: string;
		employeeNumber: string | null;
		displayName: string;
		status: FiscalEmployeeStatus;
		issues: FiscalIssue[];
		warnings: FiscalIssue[];
	}>;
}

export interface PayrollFiscalCatalogEntryInput {
	catalogName: string;
	code: string;
	validFrom: string | null;
	validTo: string | null;
	isActive: boolean;
}

export interface PayrollFiscalConceptMappingInput {
	organizationId: string | null;
	internalConceptType: string;
	cfdiNode: PayrollCfdiConceptNode;
	satTypeCode: string;
	isSupportedForStamping: boolean;
}

export interface PayrollFiscalConceptInput {
	internalConceptType: string;
	cfdiNode: PayrollCfdiConceptNode;
}

export interface PayrollFiscalOrganizationProfileInput {
	legalName: string | null;
	rfc: string | null;
	fiscalRegimeCode: string | null;
	expeditionPostalCode: string | null;
	employerRegistrationNumber: string | null;
	defaultFederalEntityCode: string | null;
}

export interface PayrollFiscalEmployeeProfileInput {
	satName: string | null;
	rfc: string | null;
	curp: string | null;
	fiscalPostalCode: string | null;
	fiscalRegimeCode: string | null;
	cfdiUseCode: string | null;
	socialSecurityNumber: string | null;
	employmentStartDateKey: string | null;
	contractTypeCode: string | null;
	workdayTypeCode: string | null;
	payrollRegimeTypeCode: string | null;
	employeeNumber: string | null;
	department: string | null;
	position: string | null;
	riskPositionCode: string | null;
	paymentFrequencyCode: string | null;
	bankAccount: string | null;
	salaryBaseContribution: string | null;
	integratedDailySalary: string | null;
	federalEntityCode: string | null;
}

export interface PayrollFiscalEmployeeInput {
	employeeId: string;
	displayName: string;
	fiscalProfile: PayrollFiscalEmployeeProfileInput | null;
}

export interface PayrollFiscalRunInput {
	id: string;
	organizationId: string;
	paymentFrequency: string;
	status?: string | null;
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentDateKey: string | null;
	runType?: string | null;
	concepts: PayrollFiscalConceptInput[];
}

export interface PayrollFiscalPreflightInput {
	organizationId: string;
	payrollRunId: string;
	payrollRun: PayrollFiscalRunInput | null;
	organizationProfile: PayrollFiscalOrganizationProfileInput | null;
	employees: PayrollFiscalEmployeeInput[];
	catalogEntries: PayrollFiscalCatalogEntryInput[];
	conceptMappings: PayrollFiscalConceptMappingInput[];
}

export interface PersistedPayrollConceptSource {
	totalPay: number | string | null;
	fiscalGrossPay: number | string | null;
	overtimeDoublePay: number | string | null;
	overtimeTriplePay: number | string | null;
	sundayPremiumAmount: number | string | null;
	mandatoryRestDayPremiumAmount: number | string | null;
	vacationPayAmount: number | string | null;
	vacationPremiumAmount: number | string | null;
	deductionsBreakdown: unknown;
	taxBreakdown: unknown;
}

export interface PersistedPayrollRunSource {
	id: string;
	organizationId: string;
	paymentFrequency: string;
	status: string;
	periodStart: Date;
	periodEnd: Date;
	paymentDate?: Date | null;
}

export interface PersistedPayrollRunEmployeeSource extends PersistedPayrollConceptSource {
	employeeId: string;
}

export interface PersistedPayrollEmployeeSource {
	id: string;
	firstName: string;
	lastName: string;
}

export interface PersistedEmployeeFiscalProfileSource extends PayrollFiscalEmployeeProfileInput {
	employeeId: string;
}

export interface PersistedPayrollFiscalPreflightData {
	payrollRun: PersistedPayrollRunSource | null;
	runEmployees: Array<{
		line: PersistedPayrollRunEmployeeSource;
		employee: PersistedPayrollEmployeeSource;
	}>;
	organizationProfile: PayrollFiscalOrganizationProfileInput | null;
	employeeProfiles: PersistedEmployeeFiscalProfileSource[];
	catalogEntries: PayrollFiscalCatalogEntryInput[];
	conceptMappings: PayrollFiscalConceptMappingInput[];
}

export interface PayrollFiscalPreflightDataProvider {
	loadPayrollFiscalPreflightData(args: {
		organizationId: string;
		payrollRunId: string;
		paymentDateKey?: string | null;
	}): Promise<PersistedPayrollFiscalPreflightData>;
}

let payrollFiscalPreflightDataProviderForTest: PayrollFiscalPreflightDataProvider | null = null;

/**
 * Validates an RFC string using the Phase 1 operational payroll regex.
 *
 * @param value - RFC candidate value
 * @returns True when the value matches the expected RFC format
 */
export function validateRfc(value: string): boolean {
	return RFC_PATTERN.test(value);
}

/**
 * Validates a CURP string with an operational approximation of official structure.
 *
 * @param value - CURP candidate value
 * @returns True when the value matches the expected CURP format
 */
export function validateCurp(value: string): boolean {
	return CURP_PATTERN.test(value);
}

/**
 * Validates an NSS string.
 *
 * @param value - NSS candidate value
 * @returns True when the value contains exactly 11 digits
 */
export function validateNss(value: string): boolean {
	return NSS_PATTERN.test(value);
}

/**
 * Validates a Mexican postal code string by format only.
 *
 * @param value - Postal code candidate value
 * @returns True when the value contains exactly 5 digits
 */
export function validatePostalCode(value: string): boolean {
	return POSTAL_CODE_PATTERN.test(value);
}

/**
 * Validates a date key as `YYYY-MM-DD` and checks calendar validity.
 *
 * @param value - Date key candidate value
 * @returns True when the value is a real calendar date key
 */
export function validateDateKey(value: string): boolean {
	if (!DATE_KEY_PATTERN.test(value)) {
		return false;
	}

	const [yearText, monthText, dayText] = value.split('-');
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/**
 * Validates a non-negative decimal money string with at most 2 decimals.
 *
 * @param value - Money string candidate value
 * @returns True when the value is a valid Phase 1 money string
 */
export function validateMoneyString(value: string): boolean {
	return MONEY_STRING_PATTERN.test(value);
}

/**
 * Validates a non-negative paid-days decimal string with at most 3 decimals.
 *
 * @param value - Paid-days string candidate value
 * @returns True when the value is a valid Phase 1 paid-days string
 */
export function validatePaidDaysString(value: string): boolean {
	return PAID_DAYS_STRING_PATTERN.test(value);
}

/**
 * Overrides the persistence provider used by `buildPayrollFiscalPreflight` in unit tests.
 *
 * @param provider - Test provider, or null to restore the real database provider
 * @returns Nothing
 */
export function setPayrollFiscalPreflightDataProviderForTest(
	provider: PayrollFiscalPreflightDataProvider | null,
): void {
	payrollFiscalPreflightDataProviderForTest = provider;
}

/**
 * Checks whether a SAT catalog code is active on the requested date.
 *
 * @param entries - Available catalog entries
 * @param catalogName - SAT catalog name
 * @param code - Catalog code to validate
 * @param effectiveDateKey - Date key used for effective dating
 * @returns True when an active catalog entry covers the date
 */
export function isCatalogCodeActive(
	entries: PayrollFiscalCatalogEntryInput[],
	catalogName: string,
	code: string,
	effectiveDateKey: string,
): boolean {
	return entries.some(
		(entry) =>
			entry.catalogName === catalogName &&
			entry.code === code &&
			entry.isActive &&
			(entry.validFrom === null || entry.validFrom <= effectiveDateKey) &&
			(entry.validTo === null || entry.validTo >= effectiveDateKey),
	);
}

/**
 * Validates a SAT catalog code against active database catalog entries.
 *
 * @param catalogName - SAT catalog name
 * @param code - Catalog code to validate
 * @param effectiveDateKey - Date key used for effective dating
 * @returns True when a matching active catalog entry exists
 */
export async function validateCatalogCode(
	catalogName: string,
	code: string,
	effectiveDateKey: string,
): Promise<boolean> {
	const { default: database } = await import('../db/index.js');
	const entries = await database
		.select({
			catalogName: satFiscalCatalogEntry.catalogName,
			code: satFiscalCatalogEntry.code,
			validFrom: satFiscalCatalogEntry.validFrom,
			validTo: satFiscalCatalogEntry.validTo,
			isActive: satFiscalCatalogEntry.isActive,
		})
		.from(satFiscalCatalogEntry)
		.where(
			and(
				eq(satFiscalCatalogEntry.catalogName, catalogName as never),
				eq(satFiscalCatalogEntry.code, code),
			),
		);

	return isCatalogCodeActive(entries, catalogName, code, effectiveDateKey);
}

/**
 * Evaluates whether payroll fiscal vouchers can be prepared for a run.
 *
 * @param input - Pure preflight source data
 * @returns Fiscal preflight result with organization and employee blockers
 */
export function evaluatePayrollFiscalPreflight(
	input: PayrollFiscalPreflightInput,
): PayrollFiscalPreflightResult {
	const organizationIssues: FiscalIssue[] = [];
	const effectiveDateKey =
		input.payrollRun?.paymentDateKey ?? input.payrollRun?.periodEndDateKey ?? '0000-00-00';

	if (
		!input.payrollRun ||
		input.payrollRun.organizationId !== input.organizationId ||
		!SUPPORTED_PAYMENT_FREQUENCIES.has(input.payrollRun.paymentFrequency) ||
		(input.payrollRun.runType !== undefined &&
			input.payrollRun.runType !== null &&
			input.payrollRun.runType !== 'ORDINARY')
	) {
		organizationIssues.push(
			createIssue(
				'UNSUPPORTED_PAYROLL_RUN_TYPE',
				'payrollRun.paymentFrequency',
				'Payroll run type is not supported for Phase 1 fiscal stamping.',
				'PAYROLL_RUN',
			),
		);
	}
	if (input.payrollRun?.status !== undefined && input.payrollRun.status !== 'PROCESSED') {
		organizationIssues.push(
			createIssue(
				'PAYROLL_RUN_NOT_PROCESSED',
				'payrollRun.status',
				'Payroll run must be processed before preparing fiscal vouchers.',
				'PAYROLL_RUN',
			),
		);
	}

	organizationIssues.push(...validateOrganizationProfile(input, effectiveDateKey));
	organizationIssues.push(...validateConceptMappings(input, effectiveDateKey));

	const employeeResults = input.employees.map((employeeInput) => {
		const warnings = validateEmployeeWarnings(employeeInput);
		const issues = validateEmployeeProfile(employeeInput, input, effectiveDateKey, warnings);
		const status: FiscalEmployeeStatus = issues.length === 0 ? 'READY' : 'BLOCKED';

		return {
			employeeId: employeeInput.employeeId,
			employeeNumber: employeeInput.fiscalProfile?.employeeNumber ?? null,
			displayName: employeeInput.displayName,
			status,
			issues,
			warnings,
		};
	});
	const employeesBlocked = employeeResults.filter((result) => result.status === 'BLOCKED').length;
	const unsupportedConcepts = organizationIssues.filter(
		(issue) =>
			issue.code === 'UNMAPPED_PAYROLL_CONCEPT' ||
			issue.code === 'UNSUPPORTED_PAYROLL_CONCEPT',
	).length;

	return {
		organizationId: input.organizationId,
		payrollRunId: input.payrollRunId,
		canPrepareFiscalVouchers:
			organizationIssues.every((issue) => issue.severity !== 'ERROR') &&
			employeesBlocked === 0,
		summary: {
			employeesTotal: input.employees.length,
			employeesReady: input.employees.length - employeesBlocked,
			employeesBlocked,
			unsupportedConcepts,
		},
		organizationIssues,
		employeeResults,
	};
}

/**
 * Loads persisted payroll fiscal preflight data and evaluates it.
 *
 * @param args - Organization and payroll run identifiers
 * @param args.paymentDateKey - Optional effective payment date override
 * @returns Fiscal preflight result for the persisted run
 * @throws Error when the database query fails
 */
export async function buildPayrollFiscalPreflight(args: {
	organizationId: string;
	payrollRunId: string;
	paymentDateKey?: string | null;
}): Promise<PayrollFiscalPreflightResult> {
	const provider = payrollFiscalPreflightDataProviderForTest ?? {
		loadPayrollFiscalPreflightData: loadPersistedPayrollFiscalPreflightData,
	};
	const persistedData = await provider.loadPayrollFiscalPreflightData(args);

	return evaluatePayrollFiscalPreflight(
		buildPayrollFiscalPreflightInputFromPersistedData(args, persistedData),
	);
}

/**
 * Loads all persisted records needed for payroll fiscal preflight evaluation.
 *
 * @param args - Organization and payroll run identifiers
 * @returns Persisted source records for the pure preflight evaluator
 * @throws Error when the database query fails
 */
async function loadPersistedPayrollFiscalPreflightData(args: {
	organizationId: string;
	payrollRunId: string;
}): Promise<PersistedPayrollFiscalPreflightData> {
	const { default: database } = await import('../db/index.js');
	const [runRow] = await database
		.select()
		.from(payrollRun)
		.where(
			and(
				eq(payrollRun.id, args.payrollRunId),
				eq(payrollRun.organizationId, args.organizationId),
			),
		)
		.limit(1);

	const runEmployeeRows = runRow
		? await database
				.select({
					line: payrollRunEmployee,
					employee,
				})
				.from(payrollRunEmployee)
				.innerJoin(employee, eq(employee.id, payrollRunEmployee.employeeId))
				.where(eq(payrollRunEmployee.payrollRunId, runRow.id))
		: [];

	const employeeIds = runEmployeeRows.map((row) => row.line.employeeId);
	const [organizationProfileRow] = await database
		.select()
		.from(organizationFiscalProfile)
		.where(eq(organizationFiscalProfile.organizationId, args.organizationId))
		.limit(1);
	const employeeProfileRows =
		employeeIds.length === 0
			? []
			: await database
					.select()
					.from(employeeFiscalProfile)
					.where(
						and(
							eq(employeeFiscalProfile.organizationId, args.organizationId),
							inArray(employeeFiscalProfile.employeeId, employeeIds),
						),
					);
	const conceptMappingRows = await database
		.select()
		.from(payrollConceptSatMapping)
		.where(
			or(
				eq(payrollConceptSatMapping.organizationId, args.organizationId),
				isNull(payrollConceptSatMapping.organizationId),
			),
		);
	const catalogRows = await database
		.select({
			catalogName: satFiscalCatalogEntry.catalogName,
			code: satFiscalCatalogEntry.code,
			validFrom: satFiscalCatalogEntry.validFrom,
			validTo: satFiscalCatalogEntry.validTo,
			isActive: satFiscalCatalogEntry.isActive,
		})
		.from(satFiscalCatalogEntry);

	return {
		payrollRun: runRow
			? {
					id: runRow.id,
					organizationId: runRow.organizationId,
					paymentFrequency: runRow.paymentFrequency,
					status: runRow.status,
					periodStart: runRow.periodStart,
					periodEnd: runRow.periodEnd,
				}
			: null,
		runEmployees: runEmployeeRows.map((row) => ({
			line: row.line,
			employee: {
				id: row.employee.id,
				firstName: row.employee.firstName,
				lastName: row.employee.lastName,
			},
		})),
		organizationProfile: organizationProfileRow
			? {
					legalName: organizationProfileRow.legalName,
					rfc: organizationProfileRow.rfc,
					fiscalRegimeCode: organizationProfileRow.fiscalRegimeCode,
					expeditionPostalCode: organizationProfileRow.expeditionPostalCode,
					employerRegistrationNumber: organizationProfileRow.employerRegistrationNumber,
					defaultFederalEntityCode: organizationProfileRow.defaultFederalEntityCode,
				}
			: null,
		employeeProfiles: employeeProfileRows.map((profile) => ({
			employeeId: profile.employeeId,
			...toEmployeeProfileInput(profile),
		})),
		catalogEntries: catalogRows,
		conceptMappings: conceptMappingRows.map((mapping) => ({
			organizationId: mapping.organizationId,
			internalConceptType: mapping.internalConceptType,
			cfdiNode: mapping.cfdiNode,
			satTypeCode: mapping.satTypeCode,
			isSupportedForStamping: mapping.isSupportedForStamping,
		})),
	};
}

/**
 * Converts persisted preflight records into the pure evaluator input shape.
 *
 * @param args - Organization and payroll run identifiers
 * @param persistedData - Persisted source records loaded for preflight
 * @returns Pure preflight input
 */
function buildPayrollFiscalPreflightInputFromPersistedData(
	args: {
		organizationId: string;
		payrollRunId: string;
		paymentDateKey?: string | null;
	},
	persistedData: PersistedPayrollFiscalPreflightData,
): PayrollFiscalPreflightInput {
	const scopedRunEmployees = persistedData.payrollRun ? persistedData.runEmployees : [];
	const profileByEmployeeId = new Map(
		persistedData.employeeProfiles.map((profile) => [profile.employeeId, profile]),
	);

	return {
		organizationId: args.organizationId,
		payrollRunId: args.payrollRunId,
		payrollRun: persistedData.payrollRun
			? {
					id: persistedData.payrollRun.id,
					organizationId: persistedData.payrollRun.organizationId,
					paymentFrequency: persistedData.payrollRun.paymentFrequency,
					status: persistedData.payrollRun.status,
					periodStartDateKey: toDateKey(persistedData.payrollRun.periodStart),
					periodEndDateKey: toDateKey(persistedData.payrollRun.periodEnd),
					paymentDateKey:
						args.paymentDateKey ??
						toDateKey(
							persistedData.payrollRun.paymentDate ??
								persistedData.payrollRun.periodEnd,
						),
					runType: 'ORDINARY',
					concepts: extractPersistedPayrollConcepts(
						scopedRunEmployees.map((row) => row.line),
					),
				}
			: null,
		organizationProfile: persistedData.organizationProfile,
		employees: scopedRunEmployees.map((row) => {
			const profile = profileByEmployeeId.get(row.line.employeeId) ?? null;

			return {
				employeeId: row.line.employeeId,
				displayName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
				fiscalProfile: profile,
			};
		}),
		catalogEntries: persistedData.catalogEntries,
		conceptMappings: persistedData.conceptMappings,
	};
}

/**
 * Checks whether a value has non-whitespace text.
 *
 * @param value - Candidate text value
 * @returns True when the value is a non-empty string
 */
function hasText(value: string | null | undefined): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Creates a fiscal validation issue.
 *
 * @param code - Stable issue code
 * @param field - Field path associated with the issue
 * @param message - Human-readable issue description
 * @param source - Source area for the issue
 * @param severity - Issue severity
 * @returns Fiscal validation issue
 */
function createIssue(
	code: string,
	field: string,
	message: string,
	source: FiscalIssueSource,
	severity: FiscalIssueSeverity = 'ERROR',
): FiscalIssue {
	return { code, severity, field, message, source };
}

/**
 * Validates organization profile completeness and catalog-backed fields.
 *
 * @param input - Preflight source data
 * @param effectiveDateKey - Date key used for catalog checks
 * @returns Organization-level issues
 */
function validateOrganizationProfile(
	input: PayrollFiscalPreflightInput,
	effectiveDateKey: string,
): FiscalIssue[] {
	const profile = input.organizationProfile;
	const issues: FiscalIssue[] = [];

	if (!profile) {
		return [
			createIssue(
				'ORG_RFC_REQUIRED',
				'organizationProfile.rfc',
				'Organization RFC is required.',
				'ORGANIZATION',
			),
			createIssue(
				'ORG_LEGAL_NAME_REQUIRED',
				'organizationProfile.legalName',
				'Organization legal name is required.',
				'ORGANIZATION',
			),
			createIssue(
				'ORG_FISCAL_REGIME_REQUIRED',
				'organizationProfile.fiscalRegimeCode',
				'Organization fiscal regime is required.',
				'ORGANIZATION',
			),
			createIssue(
				'ORG_EXPEDITION_POSTAL_CODE_REQUIRED',
				'organizationProfile.expeditionPostalCode',
				'Organization expedition postal code is required.',
				'ORGANIZATION',
			),
			createIssue(
				'ORG_EMPLOYER_REGISTRATION_REQUIRED',
				'organizationProfile.employerRegistrationNumber',
				'Organization employer registration number is required.',
				'ORGANIZATION',
			),
		];
	}

	if (!hasText(profile.rfc)) {
		issues.push(
			createIssue(
				'ORG_RFC_REQUIRED',
				'organizationProfile.rfc',
				'Organization RFC is required.',
				'ORGANIZATION',
			),
		);
	} else if (!validateRfc(profile.rfc)) {
		issues.push(
			createIssue(
				'ORG_RFC_INVALID',
				'organizationProfile.rfc',
				'Organization RFC format is invalid.',
				'ORGANIZATION',
			),
		);
	}

	pushRequiredIssue(
		issues,
		profile.legalName,
		'ORG_LEGAL_NAME_REQUIRED',
		'organizationProfile.legalName',
		'Organization legal name is required.',
		'ORGANIZATION',
	);
	pushRequiredIssue(
		issues,
		profile.fiscalRegimeCode,
		'ORG_FISCAL_REGIME_REQUIRED',
		'organizationProfile.fiscalRegimeCode',
		'Organization fiscal regime is required.',
		'ORGANIZATION',
	);
	pushRequiredIssue(
		issues,
		profile.expeditionPostalCode,
		'ORG_EXPEDITION_POSTAL_CODE_REQUIRED',
		'organizationProfile.expeditionPostalCode',
		'Organization expedition postal code is required.',
		'ORGANIZATION',
	);
	pushRequiredIssue(
		issues,
		profile.employerRegistrationNumber,
		'ORG_EMPLOYER_REGISTRATION_REQUIRED',
		'organizationProfile.employerRegistrationNumber',
		'Organization employer registration number is required.',
		'ORGANIZATION',
	);

	validateCatalogField(
		input,
		issues,
		'c_RegimenFiscal',
		profile.fiscalRegimeCode,
		effectiveDateKey,
		'organizationProfile.fiscalRegimeCode',
	);
	validateCatalogField(
		input,
		issues,
		'c_CodigoPostal',
		profile.expeditionPostalCode,
		effectiveDateKey,
		'organizationProfile.expeditionPostalCode',
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_ClaveEntFed',
		profile.defaultFederalEntityCode,
		effectiveDateKey,
		'organizationProfile.defaultFederalEntityCode',
	);

	if (
		hasText(profile.expeditionPostalCode) &&
		!validatePostalCode(profile.expeditionPostalCode)
	) {
		issues.push(
			createIssue(
				'ORG_EXPEDITION_POSTAL_CODE_INVALID',
				'organizationProfile.expeditionPostalCode',
				'Organization expedition postal code format is invalid.',
				'ORGANIZATION',
			),
		);
	}

	return issues;
}

/**
 * Adds a required-field issue when a text value is empty.
 *
 * @param issues - Issue accumulator
 * @param value - Candidate required value
 * @param code - Issue code to add
 * @param field - Field path associated with the issue
 * @param message - Human-readable issue description
 * @param source - Source area for the issue
 * @returns Nothing
 */
function pushRequiredIssue(
	issues: FiscalIssue[],
	value: string | null | undefined,
	code: string,
	field: string,
	message: string,
	source: FiscalIssueSource,
): void {
	if (!hasText(value)) {
		issues.push(createIssue(code, field, message, source));
	}
}

/**
 * Validates employee profile completeness and catalog-backed fields.
 *
 * @param employeeInput - Employee preflight source data
 * @param input - Full preflight source data
 * @param effectiveDateKey - Date key used for catalog checks
 * @returns Employee-level blocking issues
 */
function validateEmployeeProfile(
	employeeInput: PayrollFiscalEmployeeInput,
	input: PayrollFiscalPreflightInput,
	effectiveDateKey: string,
	warnings: FiscalIssue[],
): FiscalIssue[] {
	const profile = employeeInput.fiscalProfile;
	const issues: FiscalIssue[] = [];

	if (!profile) {
		return [
			createIssue(
				'EMPLOYEE_SAT_NAME_REQUIRED',
				'employeeFiscalProfile.satName',
				'Employee SAT name is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_RFC_REQUIRED',
				'employeeFiscalProfile.rfc',
				'Employee RFC is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_CURP_REQUIRED',
				'employeeFiscalProfile.curp',
				'Employee CURP is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_NSS_REQUIRED',
				'employeeFiscalProfile.socialSecurityNumber',
				'Employee NSS is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_FISCAL_POSTAL_CODE_REQUIRED',
				'employeeFiscalProfile.fiscalPostalCode',
				'Employee fiscal postal code is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_FISCAL_REGIME_REQUIRED',
				'employeeFiscalProfile.fiscalRegimeCode',
				'Employee fiscal regime is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_CFDI_USE_REQUIRED',
				'employeeFiscalProfile.cfdiUseCode',
				'Employee CFDI use is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_CONTRACT_TYPE_REQUIRED',
				'employeeFiscalProfile.contractTypeCode',
				'Employee contract type is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_WORKDAY_TYPE_REQUIRED',
				'employeeFiscalProfile.workdayTypeCode',
				'Employee workday type is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_PAYROLL_REGIME_TYPE_REQUIRED',
				'employeeFiscalProfile.payrollRegimeTypeCode',
				'Employee payroll regime type is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_PAYMENT_FREQUENCY_REQUIRED',
				'employeeFiscalProfile.paymentFrequencyCode',
				'Employee payment frequency is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_START_DATE_REQUIRED',
				'employeeFiscalProfile.employmentStartDateKey',
				'Employee start date is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_NUMBER_REQUIRED',
				'employeeFiscalProfile.employeeNumber',
				'Employee number is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_FEDERAL_ENTITY_REQUIRED',
				'employeeFiscalProfile.federalEntityCode',
				'Employee federal entity is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_RISK_POSITION_REQUIRED',
				'employeeFiscalProfile.riskPositionCode',
				'Employee risk position is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_SALARY_BASE_REQUIRED',
				'employeeFiscalProfile.salaryBaseContribution',
				'Employee salary base is required.',
				'EMPLOYEE',
			),
			createIssue(
				'EMPLOYEE_INTEGRATED_DAILY_SALARY_REQUIRED',
				'employeeFiscalProfile.integratedDailySalary',
				'Employee integrated daily salary is required.',
				'EMPLOYEE',
			),
		];
	}

	pushRequiredIssue(
		issues,
		profile.satName,
		'EMPLOYEE_SAT_NAME_REQUIRED',
		'employeeFiscalProfile.satName',
		'Employee SAT name is required.',
		'EMPLOYEE',
	);
	validateEmployeeRfc(issues, profile.rfc);
	validateEmployeeCurp(issues, profile.curp);
	validateEmployeeNss(issues, profile.socialSecurityNumber);
	validateRequiredDate(
		issues,
		profile.employmentStartDateKey,
		input.payrollRun?.periodEndDateKey ?? null,
	);
	validateRequiredMoney(
		issues,
		profile.salaryBaseContribution,
		'EMPLOYEE_SALARY_BASE_REQUIRED',
		'employeeFiscalProfile.salaryBaseContribution',
		'Employee salary base is required.',
	);
	validateRequiredMoney(
		issues,
		profile.integratedDailySalary,
		'EMPLOYEE_INTEGRATED_DAILY_SALARY_REQUIRED',
		'employeeFiscalProfile.integratedDailySalary',
		'Employee integrated daily salary is required.',
	);

	pushRequiredIssue(
		issues,
		profile.fiscalPostalCode,
		'EMPLOYEE_FISCAL_POSTAL_CODE_REQUIRED',
		'employeeFiscalProfile.fiscalPostalCode',
		'Employee fiscal postal code is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.fiscalRegimeCode,
		'EMPLOYEE_FISCAL_REGIME_REQUIRED',
		'employeeFiscalProfile.fiscalRegimeCode',
		'Employee fiscal regime is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.cfdiUseCode,
		'EMPLOYEE_CFDI_USE_REQUIRED',
		'employeeFiscalProfile.cfdiUseCode',
		'Employee CFDI use is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.contractTypeCode,
		'EMPLOYEE_CONTRACT_TYPE_REQUIRED',
		'employeeFiscalProfile.contractTypeCode',
		'Employee contract type is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.workdayTypeCode,
		'EMPLOYEE_WORKDAY_TYPE_REQUIRED',
		'employeeFiscalProfile.workdayTypeCode',
		'Employee workday type is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.payrollRegimeTypeCode,
		'EMPLOYEE_PAYROLL_REGIME_TYPE_REQUIRED',
		'employeeFiscalProfile.payrollRegimeTypeCode',
		'Employee payroll regime type is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.paymentFrequencyCode,
		'EMPLOYEE_PAYMENT_FREQUENCY_REQUIRED',
		'employeeFiscalProfile.paymentFrequencyCode',
		'Employee payment frequency is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.employeeNumber,
		'EMPLOYEE_NUMBER_REQUIRED',
		'employeeFiscalProfile.employeeNumber',
		'Employee number is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		resolveFederalEntityCode(profile, input.organizationProfile),
		'EMPLOYEE_FEDERAL_ENTITY_REQUIRED',
		'employeeFiscalProfile.federalEntityCode',
		'Employee federal entity is required.',
		'EMPLOYEE',
	);
	pushRequiredIssue(
		issues,
		profile.riskPositionCode,
		'EMPLOYEE_RISK_POSITION_REQUIRED',
		'employeeFiscalProfile.riskPositionCode',
		'Employee risk position is required.',
		'EMPLOYEE',
	);

	if (hasText(profile.fiscalPostalCode) && !validatePostalCode(profile.fiscalPostalCode)) {
		issues.push(
			createIssue(
				'EMPLOYEE_FISCAL_POSTAL_CODE_REQUIRED',
				'employeeFiscalProfile.fiscalPostalCode',
				'Employee fiscal postal code format is invalid.',
				'EMPLOYEE',
			),
		);
	}

	validateCatalogField(
		input,
		issues,
		'c_CodigoPostal',
		profile.fiscalPostalCode,
		effectiveDateKey,
		'employeeFiscalProfile.fiscalPostalCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'c_RegimenFiscal',
		profile.fiscalRegimeCode,
		effectiveDateKey,
		'employeeFiscalProfile.fiscalRegimeCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'c_UsoCFDI',
		profile.cfdiUseCode,
		effectiveDateKey,
		'employeeFiscalProfile.cfdiUseCode',
		warnings,
	);
	if (hasText(profile.cfdiUseCode) && profile.cfdiUseCode !== 'CN01') {
		issues.push(
			createIssue(
				'EMPLOYEE_CFDI_USE_UNSUPPORTED',
				'employeeFiscalProfile.cfdiUseCode',
				'Employee CFDI use must be CN01 for payroll CFDI.',
				'EMPLOYEE',
			),
		);
	}
	validateCatalogField(
		input,
		issues,
		'nomina_c_TipoContrato',
		profile.contractTypeCode,
		effectiveDateKey,
		'employeeFiscalProfile.contractTypeCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_TipoJornada',
		profile.workdayTypeCode,
		effectiveDateKey,
		'employeeFiscalProfile.workdayTypeCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_TipoRegimen',
		profile.payrollRegimeTypeCode,
		effectiveDateKey,
		'employeeFiscalProfile.payrollRegimeTypeCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_PeriodicidadPago',
		profile.paymentFrequencyCode,
		effectiveDateKey,
		'employeeFiscalProfile.paymentFrequencyCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_RiesgoPuesto',
		profile.riskPositionCode,
		effectiveDateKey,
		'employeeFiscalProfile.riskPositionCode',
		warnings,
	);
	validateCatalogField(
		input,
		issues,
		'nomina_c_ClaveEntFed',
		resolveFederalEntityCode(profile, input.organizationProfile),
		effectiveDateKey,
		'employeeFiscalProfile.federalEntityCode',
		warnings,
	);

	return issues;
}

/**
 * Validates employee warnings that do not block voucher preparation.
 *
 * @param employeeInput - Employee preflight source data
 * @returns Employee warnings
 */
function validateEmployeeWarnings(employeeInput: PayrollFiscalEmployeeInput): FiscalIssue[] {
	const profile = employeeInput.fiscalProfile;

	if (!profile) {
		return [];
	}

	const warnings: FiscalIssue[] = [];
	if (!hasText(profile.bankAccount)) {
		warnings.push(
			createIssue(
				'EMPLOYEE_BANK_ACCOUNT_MISSING',
				'employeeFiscalProfile.bankAccount',
				'Employee bank account is missing.',
				'EMPLOYEE',
				'WARNING',
			),
		);
	}
	if (!hasText(profile.department)) {
		warnings.push(
			createIssue(
				'EMPLOYEE_DEPARTMENT_MISSING',
				'employeeFiscalProfile.department',
				'Employee department is missing.',
				'EMPLOYEE',
				'WARNING',
			),
		);
	}
	if (!hasText(profile.position)) {
		warnings.push(
			createIssue(
				'EMPLOYEE_POSITION_MISSING',
				'employeeFiscalProfile.position',
				'Employee position is missing.',
				'EMPLOYEE',
				'WARNING',
			),
		);
	}

	return warnings;
}

/**
 * Resolves employee federal entity with organization fallback.
 *
 * @param profile - Employee fiscal profile
 * @param organizationProfile - Organization fiscal profile
 * @returns Federal entity code when available
 */
function resolveFederalEntityCode(
	profile: PayrollFiscalEmployeeProfileInput,
	organizationProfile: PayrollFiscalOrganizationProfileInput | null,
): string | null {
	return hasText(profile.federalEntityCode)
		? profile.federalEntityCode
		: (organizationProfile?.defaultFederalEntityCode ?? null);
}

/**
 * Validates an employee RFC field.
 *
 * @param issues - Issue accumulator
 * @param value - RFC value
 * @returns Nothing
 */
function validateEmployeeRfc(issues: FiscalIssue[], value: string | null): void {
	if (!hasText(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_RFC_REQUIRED',
				'employeeFiscalProfile.rfc',
				'Employee RFC is required.',
				'EMPLOYEE',
			),
		);
	} else if (!validateRfc(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_RFC_INVALID',
				'employeeFiscalProfile.rfc',
				'Employee RFC format is invalid.',
				'EMPLOYEE',
			),
		);
	}
}

/**
 * Validates an employee CURP field.
 *
 * @param issues - Issue accumulator
 * @param value - CURP value
 * @returns Nothing
 */
function validateEmployeeCurp(issues: FiscalIssue[], value: string | null): void {
	if (!hasText(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_CURP_REQUIRED',
				'employeeFiscalProfile.curp',
				'Employee CURP is required.',
				'EMPLOYEE',
			),
		);
	} else if (!validateCurp(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_CURP_INVALID',
				'employeeFiscalProfile.curp',
				'Employee CURP format is invalid.',
				'EMPLOYEE',
			),
		);
	}
}

/**
 * Validates an employee NSS field.
 *
 * @param issues - Issue accumulator
 * @param value - NSS value
 * @returns Nothing
 */
function validateEmployeeNss(issues: FiscalIssue[], value: string | null): void {
	if (!hasText(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_NSS_REQUIRED',
				'employeeFiscalProfile.socialSecurityNumber',
				'Employee NSS is required.',
				'EMPLOYEE',
			),
		);
	} else if (!validateNss(value)) {
		issues.push(
			createIssue(
				'EMPLOYEE_NSS_INVALID',
				'employeeFiscalProfile.socialSecurityNumber',
				'Employee NSS format is invalid.',
				'EMPLOYEE',
			),
		);
	}
}

/**
 * Validates an employee start date field.
 *
 * @param issues - Issue accumulator
 * @param value - Start date key
 * @param periodEndDateKey - Payroll period end date key
 * @returns Nothing
 */
function validateRequiredDate(
	issues: FiscalIssue[],
	value: string | null,
	periodEndDateKey: string | null,
): void {
	if (
		!hasText(value) ||
		!validateDateKey(value) ||
		(periodEndDateKey !== null && value > periodEndDateKey)
	) {
		issues.push(
			createIssue(
				'EMPLOYEE_START_DATE_REQUIRED',
				'employeeFiscalProfile.employmentStartDateKey',
				'Employee start date is required and must be on or before the period end date.',
				'EMPLOYEE',
			),
		);
	}
}

/**
 * Validates a required money string field.
 *
 * @param issues - Issue accumulator
 * @param value - Money string value
 * @param code - Issue code to add
 * @param field - Field path associated with the issue
 * @param message - Human-readable issue description
 * @returns Nothing
 */
function validateRequiredMoney(
	issues: FiscalIssue[],
	value: string | null,
	code: string,
	field: string,
	message: string,
): void {
	if (!hasText(value) || !validateMoneyString(value)) {
		issues.push(createIssue(code, field, message, 'EMPLOYEE'));
	}
}

/**
 * Adds catalog validation issues for populated code fields.
 *
 * @param input - Full preflight source data
 * @param issues - Issue accumulator
 * @param catalogName - SAT catalog name
 * @param code - Code value to validate
 * @param effectiveDateKey - Date key used for effective dating
 * @param field - Field path associated with the issue
 * @param warnings - Warning accumulator for unverified catalog versions
 * @returns Nothing
 */
function validateCatalogField(
	input: PayrollFiscalPreflightInput,
	issues: FiscalIssue[],
	catalogName: string,
	code: string | null | undefined,
	effectiveDateKey: string,
	field: string,
	warnings: FiscalIssue[] = issues,
): void {
	if (!hasText(code)) {
		return;
	}

	const hasCatalogEntries = input.catalogEntries.some(
		(entry) => entry.catalogName === catalogName,
	);
	if (!hasCatalogEntries) {
		warnings.push(
			createIssue(
				'CATALOG_VERSION_UNVERIFIED',
				field,
				`Catalog ${catalogName} is not loaded.`,
				'CATALOG',
				'WARNING',
			),
		);
		return;
	}

	if (!isCatalogCodeActive(input.catalogEntries, catalogName, code, effectiveDateKey)) {
		issues.push(
			createIssue(
				'CATALOG_CODE_INVALID',
				field,
				`Catalog code ${catalogName}:${code} is not active for the payroll date.`,
				'CATALOG',
			),
		);
	}
}

/**
 * Validates concept mappings for all concepts used by the payroll run.
 *
 * @param input - Full preflight source data
 * @param effectiveDateKey - Date key used for catalog checks
 * @returns Concept mapping issues
 */
function validateConceptMappings(
	input: PayrollFiscalPreflightInput,
	effectiveDateKey: string,
): FiscalIssue[] {
	const issues: FiscalIssue[] = [];
	const concepts = dedupeConcepts(input.payrollRun?.concepts ?? []);

	for (const concept of concepts) {
		const mapping = findConceptMapping(input.conceptMappings, input.organizationId, concept);
		if (!mapping) {
			issues.push(
				createIssue(
					'UNMAPPED_PAYROLL_CONCEPT',
					`payrollRun.concepts.${concept.internalConceptType}`,
					'Payroll concept does not have an active SAT mapping.',
					'CONCEPT_MAPPING',
				),
			);
			continue;
		}
		if (!mapping.isSupportedForStamping) {
			issues.push(
				createIssue(
					'UNSUPPORTED_PAYROLL_CONCEPT',
					`payrollRun.concepts.${concept.internalConceptType}`,
					'Payroll concept is not supported for stamping.',
					'CONCEPT_MAPPING',
				),
			);
		}

		const catalogName = resolveConceptCatalogName(concept.cfdiNode);
		validateCatalogField(
			input,
			issues,
			catalogName,
			mapping.satTypeCode,
			effectiveDateKey,
			`conceptMappings.${concept.internalConceptType}.satTypeCode`,
		);
	}

	return issues;
}

/**
 * Removes duplicate concept references.
 *
 * @param concepts - Payroll concepts used by the run
 * @returns Unique concepts by internal type and CFDI node
 */
function dedupeConcepts(concepts: PayrollFiscalConceptInput[]): PayrollFiscalConceptInput[] {
	const seen = new Set<string>();
	const unique: PayrollFiscalConceptInput[] = [];

	for (const concept of concepts) {
		const key = `${concept.cfdiNode}:${concept.internalConceptType}`;
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(concept);
		}
	}

	return unique;
}

/**
 * Finds the organization-specific concept mapping, falling back to global defaults.
 *
 * @param mappings - Available concept mappings
 * @param organizationId - Organization identifier
 * @param concept - Concept to resolve
 * @returns Matching concept mapping when present
 */
function findConceptMapping(
	mappings: PayrollFiscalConceptMappingInput[],
	organizationId: string,
	concept: PayrollFiscalConceptInput,
): PayrollFiscalConceptMappingInput | null {
	return (
		mappings.find(
			(mapping) =>
				mapping.organizationId === organizationId &&
				mapping.internalConceptType === concept.internalConceptType &&
				mapping.cfdiNode === concept.cfdiNode,
		) ??
		mappings.find(
			(mapping) =>
				mapping.organizationId === null &&
				mapping.internalConceptType === concept.internalConceptType &&
				mapping.cfdiNode === concept.cfdiNode,
		) ??
		null
	);
}

/**
 * Resolves the SAT catalog name for a CFDI concept node.
 *
 * @param cfdiNode - CFDI concept node
 * @returns SAT catalog name for the concept node
 */
function resolveConceptCatalogName(cfdiNode: PayrollCfdiConceptNode): string {
	if (cfdiNode === 'DEDUCTION') {
		return 'nomina_c_TipoDeduccion';
	}
	if (cfdiNode === 'OTHER_PAYMENT') {
		return 'nomina_c_TipoOtroPago';
	}
	return 'nomina_c_TipoPercepcion';
}

/**
 * Formats a JavaScript date as a UTC date key.
 *
 * @param date - Date value to format
 * @returns `YYYY-MM-DD` date key
 */
function toDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Converts a database employee fiscal profile row into pure evaluator input.
 *
 * @param profile - Persisted employee fiscal profile
 * @returns Pure evaluator profile input
 */
function toEmployeeProfileInput(
	profile: typeof employeeFiscalProfile.$inferSelect,
): PayrollFiscalEmployeeProfileInput {
	return {
		satName: profile.satName,
		rfc: profile.rfc,
		curp: profile.curp,
		fiscalPostalCode: profile.fiscalPostalCode,
		fiscalRegimeCode: profile.fiscalRegimeCode,
		cfdiUseCode: profile.cfdiUseCode,
		socialSecurityNumber: profile.socialSecurityNumber,
		employmentStartDateKey: profile.employmentStartDateKey,
		contractTypeCode: profile.contractTypeCode,
		workdayTypeCode: profile.workdayTypeCode,
		payrollRegimeTypeCode: profile.payrollRegimeTypeCode,
		employeeNumber: profile.employeeNumber,
		department: profile.department,
		position: profile.position,
		riskPositionCode: profile.riskPositionCode,
		paymentFrequencyCode: profile.paymentFrequencyCode,
		bankAccount: profile.bankAccount,
		salaryBaseContribution: profile.salaryBaseContribution,
		integratedDailySalary: profile.integratedDailySalary,
		federalEntityCode: profile.federalEntityCode,
	};
}

/**
 * Extracts fiscal concept references from persisted payroll run employee rows.
 *
 * @param lines - Payroll run employee rows
 * @returns Unique fiscal concepts used by the run
 */
export function extractPersistedPayrollConcepts(
	lines: PersistedPayrollConceptSource[],
): PayrollFiscalConceptInput[] {
	const concepts: PayrollFiscalConceptInput[] = [];

	for (const line of lines) {
		if (isPositiveAmount(line.totalPay) || isPositiveAmount(line.fiscalGrossPay)) {
			concepts.push({ internalConceptType: 'SALARY', cfdiNode: 'PERCEPTION' });
		}
		pushPositiveAmountConcept(
			concepts,
			line.overtimeDoublePay,
			'OVERTIME_DOUBLE',
			'PERCEPTION',
		);
		pushPositiveAmountConcept(
			concepts,
			line.overtimeTriplePay,
			'OVERTIME_TRIPLE',
			'PERCEPTION',
		);
		pushPositiveAmountConcept(
			concepts,
			line.sundayPremiumAmount,
			'SUNDAY_PREMIUM',
			'PERCEPTION',
		);
		pushPositiveAmountConcept(
			concepts,
			line.mandatoryRestDayPremiumAmount,
			'MANDATORY_REST_DAY_PREMIUM',
			'PERCEPTION',
		);
		pushPositiveAmountConcept(concepts, line.vacationPayAmount, 'VACATION_PAY', 'PERCEPTION');
		pushPositiveAmountConcept(
			concepts,
			line.vacationPremiumAmount,
			'VACATION_PREMIUM',
			'PERCEPTION',
		);

		const taxBreakdown = readRecord(line.taxBreakdown);
		pushPositiveAmountConcept(
			concepts,
			readNumericValue(taxBreakdown?.seventhDayPay),
			'SEVENTH_DAY',
			'PERCEPTION',
		);

		for (const deduction of readRecordArray(line.deductionsBreakdown)) {
			const appliedAmount = readNumericValue(deduction.appliedAmount);
			const deductionType = readStringValue(deduction.type);
			if (appliedAmount > 0 && deductionType !== null) {
				concepts.push({ internalConceptType: deductionType, cfdiNode: 'DEDUCTION' });
			}
		}

		const withholdings = readRecord(readRecord(line.taxBreakdown)?.employeeWithholdings);
		const imssEmployee = readRecord(withholdings?.imssEmployee);
		if (readNumericValue(imssEmployee?.total) > 0) {
			concepts.push({ internalConceptType: 'IMSS_EMPLOYEE', cfdiNode: 'DEDUCTION' });
		}
		if (readNumericValue(withholdings?.isrWithheld) > 0) {
			concepts.push({ internalConceptType: 'ISR', cfdiNode: 'DEDUCTION' });
		}

		for (const gratification of readRecordArray(taxBreakdown?.gratificationsBreakdown)) {
			const appliedAmount = readNumericValue(gratification.appliedAmount);
			const concept = readStringValue(gratification.concept);
			if (appliedAmount > 0 && concept !== null) {
				concepts.push({ internalConceptType: concept, cfdiNode: 'PERCEPTION' });
			}
		}

		const informationalLines = readRecord(taxBreakdown?.informationalLines);
		if (readNumericValue(informationalLines?.subsidyCaused) > 0) {
			concepts.push({
				internalConceptType: 'SUBSIDY_APPLIED',
				cfdiNode: 'OTHER_PAYMENT',
			});
		}
	}

	return dedupeConcepts(concepts);
}

/**
 * Adds a concept when the persisted amount is positive.
 *
 * @param concepts - Concept accumulator
 * @param amount - Persisted numeric amount
 * @param internalConceptType - Internal payroll concept type
 * @param cfdiNode - CFDI node where the concept belongs
 * @returns Nothing
 */
function pushPositiveAmountConcept(
	concepts: PayrollFiscalConceptInput[],
	amount: number | string | null,
	internalConceptType: string,
	cfdiNode: PayrollCfdiConceptNode,
): void {
	if (isPositiveAmount(amount)) {
		concepts.push({ internalConceptType, cfdiNode });
	}
}

/**
 * Checks whether a persisted numeric value is positive.
 *
 * @param value - Persisted numeric value
 * @returns True when the parsed value is greater than zero
 */
function isPositiveAmount(value: number | string | null): boolean {
	return readNumericValue(value) > 0;
}

/**
 * Reads an unknown value as a finite number.
 *
 * @param value - Unknown numeric value
 * @returns Finite numeric value or zero
 */
function readNumericValue(value: unknown): number {
	const numberValue = typeof value === 'number' ? value : Number(value ?? 0);

	return Number.isFinite(numberValue) ? numberValue : 0;
}

/**
 * Reads an unknown value as a non-empty string.
 *
 * @param value - Unknown text value
 * @returns Trimmed string or null
 */
function readStringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads an unknown JSON value as an array of string-keyed objects.
 *
 * @param value - Unknown JSON value
 * @returns Object array or an empty array
 */
function readRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.flatMap((item) => {
				const record = readRecord(item);

				return record ? [record] : [];
			})
		: [];
}

/**
 * Reads an unknown JSON value as a string-keyed object.
 *
 * @param value - Unknown JSON value
 * @returns Object value or null
 */
function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
