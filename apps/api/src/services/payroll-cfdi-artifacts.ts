import { createHash } from 'node:crypto';

import {
	buildPayrollCfdiXml,
	type FiscalArtifactManifest,
	type PayrollCfdiBuildInput,
	type PayrollCfdiValidationIssue,
	type PayrollCfdiValidationStatus,
} from './payroll-cfdi-xml.js';

export type PayrollCfdiXmlArtifactKind = 'XML_WITHOUT_SEAL' | 'SEALED_XML' | 'STAMPED_XML';

export interface PayrollFiscalVoucherArtifactSourceRow {
	id: string;
	payrollRunId: string;
	organizationId: string;
	employeeId: string;
	status: string;
	uuid: string | null;
	stampedAt: Date | string | null;
	voucher: Record<string, unknown>;
}

export interface PayrollCfdiXmlArtifactRow {
	id: string;
	payrollFiscalVoucherId: string;
	organizationId: string;
	employeeId: string;
	artifactKind: PayrollCfdiXmlArtifactKind;
	fiscalSnapshotHash: string;
	xmlHash: string;
	xml: string;
	fiscalArtifactManifest: FiscalArtifactManifest;
	validationErrors: PayrollCfdiValidationIssue[] | Record<string, unknown>[];
	generatedAt: Date;
	createdAt: Date;
}

export interface PayrollCfdiArtifactSummary {
	voucherId: string;
	artifactId: string | null;
	artifactKind: PayrollCfdiXmlArtifactKind;
	xmlHash: string | null;
	status: 'VALID' | 'BLOCKED';
	errors: Array<PayrollCfdiValidationIssue | Record<string, unknown>>;
	warnings: Array<PayrollCfdiValidationIssue | Record<string, unknown>>;
}

export interface PayrollCfdiXmlPersistencePayload {
	status: 'VALID' | 'BLOCKED';
	summary: PayrollCfdiArtifactSummary;
	artifact: {
		payrollFiscalVoucherId: string;
		organizationId: string;
		employeeId: string;
		artifactKind: 'XML_WITHOUT_SEAL';
		fiscalSnapshotHash: string;
		xmlHash: string;
		xml: string;
		fiscalArtifactManifest: FiscalArtifactManifest;
		validationErrors: PayrollCfdiValidationIssue[];
		generatedAt: Date;
	} | null;
}

const CFDI_XSD_URL = 'https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd';
const PAYROLL_XSD_URL = 'https://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd';
const TFD_XSD_URL =
	'https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd';

/**
 * Maps a persisted pre-stamping fiscal voucher snapshot into the Phase 3 CFDI XML builder input.
 *
 * @param args - Mapping inputs
 * @param args.voucherRow - Persisted fiscal voucher row
 * @param args.issuedAt - CFDI issue instant
 * @returns Builder input using null for unavailable Phase 3 fields
 */
export function mapFiscalVoucherToPayrollCfdiBuildInput(args: {
	voucherRow: PayrollFiscalVoucherArtifactSourceRow;
	issuedAt: Date;
}): PayrollCfdiBuildInput {
	const voucher = args.voucherRow.voucher;
	const issuer = readRecord(voucher.issuer);
	const receiver = readRecord(voucher.receiver);

	const input: PayrollCfdiBuildInput = {
		voucherId: args.voucherRow.id,
		fiscalSnapshotHash: hashStableJson(voucher),
		issuedAt: args.issuedAt,
		fiscalArtifactManifest: buildDefaultFiscalArtifactManifest(args.issuedAt),
		issuer: {
			rfc: readString(issuer.rfc),
			name: readString(issuer.name),
			fiscalRegime: readString(issuer.fiscalRegime),
			expeditionPostalCode: readString(issuer.expeditionPostalCode),
			employerRegistration: readString(issuer.employerRegistration),
		},
		receiver: {
			rfc: readString(receiver.rfc),
			name: readString(receiver.name),
			fiscalRegime: readString(receiver.fiscalRegime),
			fiscalPostalCode: readString(receiver.fiscalPostalCode),
			curp: readString(receiver.curp),
			nss: readString(receiver.nss),
			employmentStartDateKey: readString(receiver.employmentStartDateKey),
			contractType: readString(receiver.contractType),
			unionized: readString(receiver.unionized),
			workdayType: readString(receiver.workdayType),
			regimeType: readString(receiver.regimeType),
			employeeNumber: readString(receiver.employeeNumber),
			department: readString(receiver.department),
			position: readString(receiver.position),
			positionRisk: readString(receiver.positionRisk),
			paymentFrequency: readString(voucher.paymentFrequency),
			bankAccount: readString(receiver.bankAccount),
			baseContributionSalary: readNumber(receiver.baseContributionSalary),
			integratedDailySalary: readNumber(receiver.integratedDailySalary),
			federalEntity: readString(receiver.federalEntity),
		},
		payroll: {
			type: readString(voucher.payrollType) ?? 'O',
			paymentDateKey: readString(voucher.paymentDateKey),
			periodStartDateKey: readString(voucher.periodStartDateKey),
			periodEndDateKey: readString(voucher.periodEndDateKey),
			daysPaid: readNumber(voucher.daysPaid),
		},
		perceptions: readArray(voucher.perceptions).map((line) => ({
			internalType: readString(line.internalType) ?? '',
			internalCode: readString(line.internalCode) ?? '',
			satTypeCode: readString(line.satTypeCode),
			employerCode: readString(line.employerCode) ?? readString(line.internalCode),
			conceptLabel: readString(line.conceptLabel) ?? readString(line.description),
			taxedAmount: readNumber(line.taxedAmount) ?? 0,
			exemptAmount: readNumber(line.exemptAmount) ?? 0,
		})),
		deductions: readArray(voucher.deductions).map((line) => ({
			internalType: readString(line.internalType) ?? '',
			internalCode: readString(line.internalCode) ?? '',
			satTypeCode: readString(line.satTypeCode),
			employerCode: readString(line.employerCode) ?? readString(line.internalCode),
			conceptLabel: readString(line.conceptLabel) ?? readString(line.description),
			amount: readNumber(line.amount) ?? 0,
		})),
		otherPayments: readArray(voucher.otherPayments).map((line) => ({
			internalType: readString(line.internalType) ?? '',
			internalCode: readString(line.internalCode) ?? '',
			satTypeCode: readString(line.satTypeCode),
			employerCode:
				readString(line.employerCode) ??
				readString(line.internalCode) ??
				(readString(line.satTypeCode) === '002' ? '035' : null),
			conceptLabel: readString(line.conceptLabel) ?? readString(line.description),
			amount: readNumber(line.amount) ?? 0,
			subsidyCausedAmount: readNumber(line.subsidyCausedAmount),
		})),
	};

	if (Object.prototype.hasOwnProperty.call(voucher, 'realPayrollComplementPay')) {
		input.realPayrollComplementPay = readNumber(voucher.realPayrollComplementPay);
	}

	return input;
}

/**
 * Builds a persistence payload for an XML_WITHOUT_SEAL artifact.
 *
 * @param args - Payload inputs
 * @param args.voucherRow - Persisted fiscal voucher row
 * @param args.issuedAt - CFDI issue instant
 * @returns Artifact insert values when XML is valid, otherwise a blocked summary
 */
export function buildPayrollCfdiXmlPersistencePayload(args: {
	voucherRow: PayrollFiscalVoucherArtifactSourceRow;
	issuedAt: Date;
}): PayrollCfdiXmlPersistencePayload {
	const input = mapFiscalVoucherToPayrollCfdiBuildInput(args);
	const buildResult = buildPayrollCfdiXml(input);
	const status = toArtifactStatus(buildResult.validation.status);

	if (status === 'BLOCKED') {
		return {
			status,
			artifact: null,
			summary: {
				voucherId: args.voucherRow.id,
				artifactId: null,
				artifactKind: 'XML_WITHOUT_SEAL',
				xmlHash: null,
				status,
				errors: buildResult.validation.errors,
				warnings: buildResult.validation.warnings,
			},
		};
	}

	const artifact = {
		payrollFiscalVoucherId: args.voucherRow.id,
		organizationId: args.voucherRow.organizationId,
		employeeId: args.voucherRow.employeeId,
		artifactKind: 'XML_WITHOUT_SEAL' as const,
		fiscalSnapshotHash: buildResult.fiscalSnapshotHash,
		xmlHash: buildResult.xmlHash,
		xml: buildResult.xmlWithoutSeal,
		fiscalArtifactManifest: buildResult.fiscalArtifactManifest,
		validationErrors: buildResult.validation.errors,
		generatedAt: args.issuedAt,
	};

	return {
		status,
		artifact,
		summary: {
			voucherId: args.voucherRow.id,
			artifactId: null,
			artifactKind: 'XML_WITHOUT_SEAL',
			xmlHash: artifact.xmlHash,
			status,
			errors: buildResult.validation.errors,
			warnings: buildResult.validation.warnings,
		},
	};
}

/**
 * Builds an API artifact summary without XML content.
 *
 * @param args - Summary inputs
 * @param args.voucherId - Fiscal voucher identifier
 * @param args.artifact - Persisted XML artifact
 * @param args.status - XML validation status to expose
 * @param args.warnings - Validation warnings to expose
 * @returns JSON-safe summary without XML
 */
export function buildPayrollCfdiArtifactSummary(args: {
	voucherId: string;
	artifact: PayrollCfdiXmlArtifactRow;
	status: 'VALID' | 'BLOCKED';
	warnings: Array<PayrollCfdiValidationIssue | Record<string, unknown>>;
}): PayrollCfdiArtifactSummary {
	return {
		voucherId: args.voucherId,
		artifactId: args.artifact.id,
		artifactKind: args.artifact.artifactKind,
		xmlHash: args.artifact.xmlHash,
		status: args.status,
		errors: args.artifact.validationErrors,
		warnings: args.warnings,
	};
}

/**
 * Builds a direct XML download response for a persisted artifact.
 *
 * @param args - Download response inputs
 * @param args.voucherId - Fiscal voucher identifier used in the filename
 * @param args.artifact - Persisted XML artifact
 * @returns XML attachment response
 */
export function buildPayrollCfdiXmlDownloadResponse(args: {
	voucherId: string;
	artifact: PayrollCfdiXmlArtifactRow;
}): Response {
	return new Response(args.artifact.xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Content-Disposition': `attachment; filename="${args.voucherId}-${args.artifact.artifactKind}.xml"`,
			'Cache-Control': 'no-store',
		},
	});
}

/**
 * Builds the default SAT source manifest for generated payroll CFDI XML artifacts.
 *
 * @param issuedAt - CFDI issue instant
 * @returns Fiscal artifact manifest
 */
export function buildDefaultFiscalArtifactManifest(issuedAt: Date): FiscalArtifactManifest {
	return {
		exerciseYear: issuedAt.getFullYear(),
		cfdiVersion: '4.0',
		payrollComplementVersion: '1.2',
		source: 'SAT',
		sourceName: 'SAT CFDI/Nomina XSD',
		sourcePublishedAt: null,
		cfdXsdUrl: CFDI_XSD_URL,
		payrollXsdUrl: PAYROLL_XSD_URL,
		tfdXsdUrl: TFD_XSD_URL,
		catalogVersion: '2026',
		validationMatrixVersion: 'phase-3-v1',
		generatedAt: issuedAt.toISOString(),
	};
}

/**
 * Converts builder validation status to API artifact status.
 *
 * @param status - Builder validation status
 * @returns API artifact status
 */
function toArtifactStatus(status: PayrollCfdiValidationStatus): 'VALID' | 'BLOCKED' {
	return status === 'READY_TO_STAMP' ? 'VALID' : 'BLOCKED';
}

/**
 * Reads an object record from an unknown value.
 *
 * @param value - Candidate object value
 * @returns Object record or empty object
 */
function readRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Reads an array of object records from an unknown value.
 *
 * @param value - Candidate array value
 * @returns Object records
 */
function readArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(readRecord) : [];
}

/**
 * Reads a non-empty string from an unknown value.
 *
 * @param value - Candidate string value
 * @returns Trimmed string or null
 */
function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads a finite number from an unknown value.
 *
 * @param value - Candidate numeric value
 * @returns Finite number or null
 */
function readNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const numericValue = Number(value);
		return Number.isFinite(numericValue) ? numericValue : null;
	}
	return null;
}

/**
 * Hashes a JSON-compatible value using a deterministic key order.
 *
 * @param value - JSON-compatible value to hash
 * @returns SHA-256 hex digest
 */
function hashStableJson(value: unknown): string {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Stringifies JSON-compatible values with stable object key ordering.
 *
 * @param value - JSON-compatible value
 * @returns Stable JSON string
 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
			left.localeCompare(right),
		);
		return `{${entries
			.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
			.join(',')}}`;
	}

	return JSON.stringify(value);
}
