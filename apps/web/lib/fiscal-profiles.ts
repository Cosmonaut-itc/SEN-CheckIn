import { api } from '@/lib/api';
import { getApiResponseData } from '@/lib/api-response';

export type FiscalProfileStatus = 'COMPLETE' | 'INCOMPLETE';
export type PayrollStampingMode = 'PER_RUN' | 'MONTHLY_CONSOLIDATED_DISABLED';
export type EmployeeUnionizedValue = 'Sí' | 'No';
export type FiscalIssueSeverity = 'ERROR' | 'WARNING';
export type FiscalIssueSource =
	| 'ORGANIZATION'
	| 'EMPLOYEE'
	| 'PAYROLL_RUN'
	| 'CONCEPT_MAPPING'
	| 'CATALOG';
export type FiscalEmployeeStatus = 'READY' | 'BLOCKED';

/**
 * Organization fiscal profile returned by the API.
 */
export interface OrganizationFiscalProfile {
	id: string;
	organizationId: string;
	legalName: string;
	rfc: string;
	fiscalRegimeCode: string;
	expeditionPostalCode: string;
	employerRegistrationNumber: string | null;
	defaultFederalEntityCode: string | null;
	payrollCfdiSeries: string | null;
	payrollStampingMode: PayrollStampingMode;
	csdCertificateSerial: string | null;
	csdCertificateValidFrom: string | null;
	csdCertificateValidTo: string | null;
	csdSecretRef: string | null;
	pacProvider: string | null;
	pacCredentialsSecretRef: string | null;
	status: FiscalProfileStatus;
	createdAt: Date | string;
	updatedAt: Date | string;
}

/**
 * Writable organization fiscal profile fields.
 */
export interface OrganizationFiscalProfileInput {
	legalName?: string;
	rfc?: string;
	fiscalRegimeCode?: string;
	expeditionPostalCode?: string;
	employerRegistrationNumber?: string | null;
	defaultFederalEntityCode?: string | null;
	payrollCfdiSeries?: string | null;
	payrollStampingMode?: PayrollStampingMode;
	csdCertificateSerial?: string | null;
	csdCertificateValidFrom?: string | null;
	csdCertificateValidTo?: string | null;
	csdSecretRef?: string | null;
	pacProvider?: string | null;
	pacCredentialsSecretRef?: string | null;
}

/**
 * Organization fiscal profile save input with route identifier.
 */
export interface SaveOrganizationFiscalProfileInput extends OrganizationFiscalProfileInput {
	organizationId: string;
}

/**
 * Employee fiscal profile returned by the API.
 */
export interface EmployeeFiscalProfile {
	id: string;
	employeeId: string;
	organizationId: string;
	satName: string;
	rfc: string;
	curp: string;
	fiscalPostalCode: string;
	fiscalRegimeCode: string;
	cfdiUseCode: string;
	socialSecurityNumber: string | null;
	employmentStartDateKey: string;
	contractTypeCode: string;
	unionized: EmployeeUnionizedValue | null;
	workdayTypeCode: string;
	payrollRegimeTypeCode: string;
	employeeNumber: string;
	department: string | null;
	position: string | null;
	riskPositionCode: string | null;
	paymentFrequencyCode: string;
	bankAccount: string | null;
	bankAccountMasked: string | null;
	salaryBaseContribution: string | null;
	integratedDailySalary: string | null;
	federalEntityCode: string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
}

/**
 * Writable employee fiscal profile fields.
 */
export interface EmployeeFiscalProfileInput {
	satName?: string;
	rfc?: string;
	curp?: string;
	fiscalPostalCode?: string;
	fiscalRegimeCode?: string;
	cfdiUseCode?: string;
	socialSecurityNumber?: string | null;
	employmentStartDateKey?: string;
	contractTypeCode?: string;
	unionized?: EmployeeUnionizedValue | null;
	workdayTypeCode?: string;
	payrollRegimeTypeCode?: string;
	employeeNumber?: string;
	department?: string | null;
	position?: string | null;
	riskPositionCode?: string | null;
	paymentFrequencyCode?: string;
	bankAccount?: string | null;
	salaryBaseContribution?: string | null;
	integratedDailySalary?: string | null;
	federalEntityCode?: string | null;
}

/**
 * Employee fiscal profile save input with route identifier.
 */
export interface SaveEmployeeFiscalProfileInput extends EmployeeFiscalProfileInput {
	employeeId: string;
}

/**
 * Fiscal validation issue returned by payroll preflight.
 */
export interface FiscalIssue {
	code: string;
	severity: FiscalIssueSeverity;
	field: string;
	message: string;
	source: FiscalIssueSource;
}

/**
 * Per-employee fiscal preflight result.
 */
export interface PayrollFiscalPreflightEmployeeResult {
	employeeId: string;
	employeeNumber: string | null;
	displayName: string;
	status: FiscalEmployeeStatus;
	issues: FiscalIssue[];
	warnings: FiscalIssue[];
}

/**
 * Payroll fiscal preflight result returned by the API.
 */
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
	employeeResults: PayrollFiscalPreflightEmployeeResult[];
}

/**
 * Fiscal voucher preparation summary returned by the API.
 */
export interface PayrollFiscalVoucherPreparationResult {
	statusSummary: {
		total: number;
		blocked: number;
		ready: number;
		stamped: number;
		failed: number;
		cancelled: number;
	};
	vouchers: unknown[];
}

type DataEnvelope<T> = {
	data?: T | null;
};

/**
 * Reads the nested data value used by the API response envelope.
 *
 * @param response - Eden response wrapper
 * @returns Nested payload or null when the response has no payload
 */
function readEnvelopeData<T>(response: unknown): T | null {
	const payload = getApiResponseData<DataEnvelope<T>>(response as DataEnvelope<DataEnvelope<T>>);
	return payload?.data ?? null;
}

/**
 * Fetches an organization fiscal profile.
 *
 * @param organizationId - Organization identifier
 * @returns Organization fiscal profile or null when none exists
 * @throws Error when the API request fails
 */
export async function fetchOrganizationFiscalProfile(
	organizationId: string,
): Promise<OrganizationFiscalProfile | null> {
	const response = await api.organizations[organizationId]['fiscal-profile'].get();

	if (response.error) {
		throw new Error('No se pudo cargar el perfil fiscal de la organización');
	}

	return readEnvelopeData<OrganizationFiscalProfile>(response);
}

/**
 * Saves an organization fiscal profile.
 *
 * @param input - Organization identifier and fiscal profile fields
 * @returns Saved organization fiscal profile or null when the API returns no data
 * @throws Error when the API request fails
 */
export async function saveOrganizationFiscalProfile(
	input: SaveOrganizationFiscalProfileInput,
): Promise<OrganizationFiscalProfile | null> {
	const { organizationId, ...profile } = input;
	const response = await api.organizations[organizationId]['fiscal-profile'].put(profile);

	if (response.error) {
		throw new Error('No se pudo guardar el perfil fiscal de la organización');
	}

	return readEnvelopeData<OrganizationFiscalProfile>(response);
}

/**
 * Fetches an employee fiscal profile.
 *
 * @param employeeId - Employee identifier
 * @returns Employee fiscal profile or null when none exists
 * @throws Error when the API request fails
 */
export async function fetchEmployeeFiscalProfile(
	employeeId: string,
): Promise<EmployeeFiscalProfile | null> {
	const response = await api.employees[employeeId]['fiscal-profile'].get();

	if (response.error) {
		throw new Error('No se pudo cargar el perfil fiscal del empleado');
	}

	return readEnvelopeData<EmployeeFiscalProfile>(response);
}

/**
 * Saves an employee fiscal profile.
 *
 * @param input - Employee identifier and fiscal profile fields
 * @returns Saved employee fiscal profile or null when the API returns no data
 * @throws Error when the API request fails
 */
export async function saveEmployeeFiscalProfile(
	input: SaveEmployeeFiscalProfileInput,
): Promise<EmployeeFiscalProfile | null> {
	const { employeeId, ...profile } = input;
	const response = await api.employees[employeeId]['fiscal-profile'].put(profile);

	if (response.error) {
		throw new Error('No se pudo guardar el perfil fiscal del empleado');
	}

	return readEnvelopeData<EmployeeFiscalProfile>(response);
}

/**
 * Fetches fiscal preflight validation for a payroll run.
 *
 * @param runId - Payroll run identifier
 * @returns Payroll fiscal preflight result
 * @throws Error when the API request fails or returns no data
 */
export async function fetchPayrollFiscalPreflight(
	runId: string,
): Promise<PayrollFiscalPreflightResult> {
	const response = await api.payroll.runs[runId]['fiscal-preflight'].get();

	if (response.error) {
		throw new Error('No se pudo cargar la validación fiscal de la nómina');
	}

	const result = readEnvelopeData<PayrollFiscalPreflightResult>(response);
	if (!result) {
		throw new Error('La validación fiscal de la nómina no devolvió datos');
	}

	return result;
}

/**
 * Prepares fiscal vouchers for a payroll run.
 *
 * @param runId - Payroll run identifier
 * @returns Fiscal voucher preparation result
 * @throws Error when the API request fails or returns no data
 */
export async function preparePayrollFiscalVouchers(
	runId: string,
): Promise<PayrollFiscalVoucherPreparationResult> {
	const response = await api.payroll.runs[runId]['fiscal-vouchers'].prepare.post({});

	if (response.error) {
		throw new Error('No se pudieron preparar los vouchers fiscales');
	}

	const result = readEnvelopeData<PayrollFiscalVoucherPreparationResult>(response);
	if (!result) {
		throw new Error('La preparación de vouchers fiscales no devolvió datos');
	}

	return result;
}
