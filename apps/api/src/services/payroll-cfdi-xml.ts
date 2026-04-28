import { createHash } from 'node:crypto';

import { roundCurrency, sumMoney } from '../utils/money.js';

export type PayrollCfdiValidationStatus = 'READY_TO_STAMP' | 'BLOCKED';

export type PayrollCfdiValidationIssueCode =
	| 'XML_ISSUER_RFC_REQUIRED'
	| 'XML_ISSUER_NAME_REQUIRED'
	| 'XML_ISSUER_REGIME_REQUIRED'
	| 'XML_EXPEDITION_POSTAL_CODE_REQUIRED'
	| 'XML_RECEIVER_RFC_REQUIRED'
	| 'XML_RECEIVER_NAME_REQUIRED'
	| 'XML_RECEIVER_POSTAL_CODE_REQUIRED'
	| 'XML_RECEIVER_REGIME_REQUIRED'
	| 'XML_RECEIVER_CURP_REQUIRED'
	| 'XML_RECEIVER_NSS_REQUIRED'
	| 'XML_EMPLOYMENT_START_DATE_REQUIRED'
	| 'XML_EMPLOYER_REGISTRATION_REQUIRED'
	| 'XML_PAYMENT_DATE_REQUIRED'
	| 'XML_PERIOD_DATES_REQUIRED'
	| 'XML_DAYS_PAID_REQUIRED'
	| 'XML_PERCEPTION_BREAKDOWN_REQUIRED'
	| 'XML_UNMAPPED_CONCEPT'
	| 'XML_NEGATIVE_AMOUNT'
	| 'XML_SALARY_REQUIRED'
	| 'XML_TOTALS_MISMATCH'
	| 'XML_SUBSIDY_AMOUNT_MUST_BE_ZERO'
	| 'XML_REAL_PAYROLL_COMPLEMENT_FORBIDDEN'
	| 'XML_UNSUPPORTED_PAYROLL_TYPE'
	| 'XML_CATALOG_CODE_INVALID';

export interface PayrollCfdiValidationIssue {
	code: PayrollCfdiValidationIssueCode;
	field: string;
	message: string;
}

export interface PayrollCfdiValidationResult {
	status: PayrollCfdiValidationStatus;
	errors: PayrollCfdiValidationIssue[];
	warnings: PayrollCfdiValidationIssue[];
}

export interface FiscalArtifactManifest {
	exerciseYear: number;
	cfdiVersion: '4.0';
	payrollComplementVersion: '1.2';
	source: 'SAT' | 'PAC';
	sourceName: string;
	sourcePublishedAt: string | null;
	cfdXsdUrl: string;
	payrollXsdUrl: string;
	tfdXsdUrl: string;
	catalogVersion: string;
	validationMatrixVersion: string;
	generatedAt: string;
}

export interface PayrollCfdiIssuer {
	rfc: string | null;
	name: string | null;
	fiscalRegime: string | null;
	expeditionPostalCode: string | null;
	employerRegistration: string | null;
}

export interface PayrollCfdiReceiver {
	rfc: string | null;
	name: string | null;
	fiscalRegime: string | null;
	fiscalPostalCode: string | null;
	curp: string | null;
	nss: string | null;
	employmentStartDateKey: string | null;
	contractType: string | null;
	unionized: string | null;
	workdayType: string | null;
	regimeType: string | null;
	employeeNumber: string | null;
	department: string | null;
	position: string | null;
	positionRisk: string | null;
	paymentFrequency: string | null;
	bankAccount?: string | null;
	baseContributionSalary: number | null;
	integratedDailySalary: number | null;
	federalEntity: string | null;
}

export interface PayrollCfdiPayrollPeriod {
	type: 'O' | 'E' | string;
	paymentDateKey: string | null;
	periodStartDateKey: string | null;
	periodEndDateKey: string | null;
	daysPaid: number | null;
}

export interface PayrollCfdiPerceptionLine {
	internalType: string;
	internalCode: string;
	satTypeCode: string | null;
	employerCode: string | null;
	conceptLabel: string | null;
	taxedAmount: number;
	exemptAmount: number;
}

export interface PayrollCfdiDeductionLine {
	internalType: string;
	internalCode: string;
	satTypeCode: string | null;
	employerCode: string | null;
	conceptLabel: string | null;
	amount: number;
}

export interface PayrollCfdiOtherPaymentLine {
	internalType: string;
	internalCode: string;
	satTypeCode: string | null;
	employerCode: string | null;
	conceptLabel: string | null;
	amount: number;
	subsidyCausedAmount?: number | null;
}

export interface PayrollCfdiBuildInput {
	voucherId: string;
	fiscalSnapshotHash: string;
	issuedAt: Date;
	fiscalArtifactManifest: FiscalArtifactManifest;
	issuer: PayrollCfdiIssuer;
	receiver: PayrollCfdiReceiver;
	payroll: PayrollCfdiPayrollPeriod;
	perceptions: PayrollCfdiPerceptionLine[];
	deductions: PayrollCfdiDeductionLine[];
	otherPayments: PayrollCfdiOtherPaymentLine[];
	realPayrollComplementPay?: number | null;
}

export interface PayrollCfdiBuildResult {
	voucherId: string;
	fiscalSnapshotHash: string;
	xmlWithoutSeal: string;
	xmlHash: string;
	validation: PayrollCfdiValidationResult;
	fiscalArtifactManifest: FiscalArtifactManifest;
}

interface PayrollCfdiTotals {
	subtotal: number;
	discount: number;
	total: number;
	totalPerceptions: number;
	totalTaxed: number;
	totalExempt: number;
	totalOtherPayments: number;
	totalDeductions: number;
	totalIsrWithheld: number;
	totalOtherDeductions: number;
	hasOtherPaymentsNode: boolean;
}

const XML_SCHEMA_LOCATION =
	'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd';
const CFDI_TIME_ZONE = 'America/Mexico_City';

/**
 * Formats a nonnegative money value with two decimal places.
 *
 * @param value - Money value to format
 * @returns CFDI money text with exactly two decimals
 * @throws Error when the value is not finite or is negative
 */
export function formatMoney(value: number): string {
	if (!Number.isFinite(value) || Object.is(value, -0) || value < 0) {
		throw new Error('XML_NEGATIVE_AMOUNT');
	}

	return roundCurrency(value).toFixed(2);
}

/**
 * Formats payroll days with three decimal places.
 *
 * @param value - Payroll days value
 * @returns Payroll days text with exactly three decimals
 * @throws Error when the value is not finite or is negative
 */
export function formatPayrollDays(value: number): string {
	if (!Number.isFinite(value) || Object.is(value, -0) || value < 0) {
		throw new Error('XML_NEGATIVE_AMOUNT');
	}

	return value.toFixed(3);
}

/**
 * Formats a date-like value as a SAT date key.
 *
 * @param value - Date or date key to format
 * @returns Date key in YYYY-MM-DD format
 */
export function formatDateKey(value: Date | string): string {
	if (typeof value === 'string') {
		return value.slice(0, 10);
	}

	const parts = getCfdiDateParts(value);
	const year = parts.year;
	const month = parts.month;
	const day = parts.day;

	return `${year}-${month}-${day}`;
}

/**
 * Formats a CFDI issue date without a timezone suffix.
 *
 * @param date - Issue date
 * @returns CFDI date-time text in YYYY-MM-DDTHH:mm:ss format
 */
export function formatCfdiDate(date: Date): string {
	const dateKey = formatDateKey(date);
	const parts = getCfdiDateParts(date);

	return `${dateKey}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Computes SAT payroll seniority from employment start through period end.
 *
 * @param args - Employment start and period end date keys
 * @returns Seniority period using weeks when evenly divisible by seven
 */
export function computePayrollSeniority(args: {
	employmentStartDateKey: string;
	periodEndDateKey: string;
}): string {
	const start = parseDateKeyAsUtc(args.employmentStartDateKey);
	const end = parseDateKeyAsUtc(args.periodEndDateKey);
	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const days = Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;

	if (days % 7 === 0) {
		return `P${days / 7}W`;
	}

	return `P${days}D`;
}

/**
 * Validates an input snapshot before deterministic XML generation.
 *
 * @param input - Payroll CFDI XML build input
 * @returns Validation result with stable issue codes
 */
export function validatePayrollCfdiXmlInput(
	input: PayrollCfdiBuildInput,
): PayrollCfdiValidationResult {
	const errors: PayrollCfdiValidationIssue[] = [];

	pushRequired(errors, input.issuer.rfc, 'XML_ISSUER_RFC_REQUIRED', 'issuer.rfc');
	pushRequired(errors, input.issuer.name, 'XML_ISSUER_NAME_REQUIRED', 'issuer.name');
	pushRequired(
		errors,
		input.issuer.fiscalRegime,
		'XML_ISSUER_REGIME_REQUIRED',
		'issuer.fiscalRegime',
	);
	pushRequired(
		errors,
		input.issuer.expeditionPostalCode,
		'XML_EXPEDITION_POSTAL_CODE_REQUIRED',
		'issuer.expeditionPostalCode',
	);
	pushRequired(
		errors,
		input.issuer.employerRegistration,
		'XML_EMPLOYER_REGISTRATION_REQUIRED',
		'issuer.employerRegistration',
	);
	pushRequired(errors, input.receiver.rfc, 'XML_RECEIVER_RFC_REQUIRED', 'receiver.rfc');
	pushRequired(errors, input.receiver.name, 'XML_RECEIVER_NAME_REQUIRED', 'receiver.name');
	pushRequired(
		errors,
		input.receiver.fiscalPostalCode,
		'XML_RECEIVER_POSTAL_CODE_REQUIRED',
		'receiver.fiscalPostalCode',
	);
	pushRequired(
		errors,
		input.receiver.fiscalRegime,
		'XML_RECEIVER_REGIME_REQUIRED',
		'receiver.fiscalRegime',
	);
	pushRequired(errors, input.receiver.curp, 'XML_RECEIVER_CURP_REQUIRED', 'receiver.curp');
	pushRequired(errors, input.receiver.nss, 'XML_RECEIVER_NSS_REQUIRED', 'receiver.nss');
	pushRequired(
		errors,
		input.receiver.employmentStartDateKey,
		'XML_EMPLOYMENT_START_DATE_REQUIRED',
		'receiver.employmentStartDateKey',
	);
	validatePayrollReceiver(input.receiver, errors);
	pushRequired(
		errors,
		input.payroll.paymentDateKey,
		'XML_PAYMENT_DATE_REQUIRED',
		'payroll.paymentDateKey',
	);

	if (!hasText(input.payroll.periodStartDateKey) || !hasText(input.payroll.periodEndDateKey)) {
		errors.push(createIssue('XML_PERIOD_DATES_REQUIRED', 'payroll.periodDates'));
	}

	if (
		input.payroll.daysPaid === null ||
		!Number.isFinite(input.payroll.daysPaid) ||
		Object.is(input.payroll.daysPaid, -0) ||
		input.payroll.daysPaid < 0
	) {
		errors.push(createIssue('XML_DAYS_PAID_REQUIRED', 'payroll.daysPaid'));
	}

	if (input.payroll.type !== 'O') {
		errors.push(createIssue('XML_UNSUPPORTED_PAYROLL_TYPE', 'payroll.type'));
	}

	if (
		input.realPayrollComplementPay !== null &&
		input.realPayrollComplementPay !== undefined &&
		input.realPayrollComplementPay > 0
	) {
		errors.push(
			createIssue('XML_REAL_PAYROLL_COMPLEMENT_FORBIDDEN', 'realPayrollComplementPay'),
		);
	}

	validatePayrollDates(input, errors);
	validatePerceptions(input.perceptions, errors);
	validateDeductions(input.deductions, errors);
	validateOtherPayments(input.otherPayments, errors);
	validateTotals(input, errors);

	return {
		status: errors.length > 0 ? 'BLOCKED' : 'READY_TO_STAMP',
		errors,
		warnings: [],
	};
}

/**
 * Builds a deterministic unstamped CFDI 4.0 payroll XML document.
 *
 * @param input - Validated payroll CFDI snapshot
 * @returns XML build result with SHA-256 hash and validation
 */
export function buildPayrollCfdiXml(input: PayrollCfdiBuildInput): PayrollCfdiBuildResult {
	const validation = validatePayrollCfdiXmlInput(input);
	const xmlWithoutSeal =
		validation.status === 'READY_TO_STAMP' ? renderPayrollCfdiXml(input) : '';
	const xmlHash = sha256Hex(xmlWithoutSeal);

	return {
		voucherId: input.voucherId,
		fiscalSnapshotHash: input.fiscalSnapshotHash,
		xmlWithoutSeal,
		xmlHash,
		validation,
		fiscalArtifactManifest: input.fiscalArtifactManifest,
	};
}

/**
 * Renders the XML string once validation has succeeded.
 *
 * @param input - Valid payroll CFDI build input
 * @returns Deterministic XML string
 */
function renderPayrollCfdiXml(input: PayrollCfdiBuildInput): string {
	const totals = calculateTotals(input);
	const comprobanteAttrs = attrsToXml({
		'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
		'xmlns:cfdi': 'http://www.sat.gob.mx/cfd/4',
		'xmlns:nomina12': 'http://www.sat.gob.mx/nomina12',
		'xsi:schemaLocation': XML_SCHEMA_LOCATION,
		Version: '4.0',
		Fecha: formatCfdiDate(input.issuedAt),
		SubTotal: formatMoney(totals.subtotal),
		...(totals.discount > 0 ? { Descuento: formatMoney(totals.discount) } : {}),
		Moneda: 'MXN',
		Total: formatMoney(totals.total),
		TipoDeComprobante: 'N',
		Exportacion: '01',
		MetodoPago: 'PUE',
		LugarExpedicion: requireText(input.issuer.expeditionPostalCode),
	});
	const conceptoAttrs = attrsToXml({
		ClaveProdServ: '84111505',
		Cantidad: '1',
		ClaveUnidad: 'ACT',
		Descripcion: 'Pago de nómina',
		ValorUnitario: formatMoney(totals.subtotal),
		Importe: formatMoney(totals.subtotal),
		...(totals.discount > 0 ? { Descuento: formatMoney(totals.discount) } : {}),
		ObjetoImp: '01',
	});
	const nominaAttrs = attrsToXml({
		Version: '1.2',
		TipoNomina: 'O',
		FechaPago: requireText(input.payroll.paymentDateKey),
		FechaInicialPago: requireText(input.payroll.periodStartDateKey),
		FechaFinalPago: requireText(input.payroll.periodEndDateKey),
		NumDiasPagados: formatPayrollDays(requireNumber(input.payroll.daysPaid)),
		TotalPercepciones: formatMoney(totals.totalPerceptions),
		...(totals.totalDeductions > 0
			? { TotalDeducciones: formatMoney(totals.totalDeductions) }
			: {}),
		...(totals.hasOtherPaymentsNode || totals.totalOtherPayments > 0
			? { TotalOtrosPagos: formatMoney(totals.totalOtherPayments) }
			: {}),
	});

	return [
		`<cfdi:Comprobante ${comprobanteAttrs}>`,
		`<cfdi:Emisor ${attrsToXml({
			Rfc: requireText(input.issuer.rfc),
			Nombre: requireText(input.issuer.name),
			RegimenFiscal: requireText(input.issuer.fiscalRegime),
		})}/>`,
		`<cfdi:Receptor ${attrsToXml({
			Rfc: requireText(input.receiver.rfc),
			Nombre: requireText(input.receiver.name),
			DomicilioFiscalReceptor: requireText(input.receiver.fiscalPostalCode),
			RegimenFiscalReceptor: requireText(input.receiver.fiscalRegime),
			UsoCFDI: 'CN01',
		})}/>`,
		'<cfdi:Conceptos>',
		`<cfdi:Concepto ${conceptoAttrs}/>`,
		'</cfdi:Conceptos>',
		'<cfdi:Complemento>',
		`<nomina12:Nomina ${nominaAttrs}>`,
		`<nomina12:Emisor ${attrsToXml({
			RegistroPatronal: requireText(input.issuer.employerRegistration),
		})}/>`,
		renderPayrollReceiver(input),
		renderPerceptions(input.perceptions, totals),
		renderDeductions(input.deductions, totals),
		renderOtherPayments(input.otherPayments),
		'</nomina12:Nomina>',
		'</cfdi:Complemento>',
		'</cfdi:Comprobante>',
	].join('');
}

/**
 * Renders the Nomina Receptor node.
 *
 * @param input - Valid payroll CFDI build input
 * @returns Nomina Receptor XML
 */
function renderPayrollReceiver(input: PayrollCfdiBuildInput): string {
	const receiver = input.receiver;

	return `<nomina12:Receptor ${attrsToXml({
		Curp: requireText(receiver.curp),
		NumSeguridadSocial: requireText(receiver.nss),
		FechaInicioRelLaboral: requireText(receiver.employmentStartDateKey),
		Antigüedad: computePayrollSeniority({
			employmentStartDateKey: requireText(receiver.employmentStartDateKey),
			periodEndDateKey: requireText(input.payroll.periodEndDateKey),
		}),
		TipoContrato: requireText(receiver.contractType),
		Sindicalizado: requireText(receiver.unionized),
		TipoJornada: requireText(receiver.workdayType),
		TipoRegimen: requireText(receiver.regimeType),
		NumEmpleado: requireText(receiver.employeeNumber),
		Departamento: requireText(receiver.department),
		Puesto: requireText(receiver.position),
		RiesgoPuesto: requireText(receiver.positionRisk),
		PeriodicidadPago: requireText(receiver.paymentFrequency),
		...(hasText(receiver.bankAccount) ? { CuentaBancaria: receiver.bankAccount } : {}),
		SalarioBaseCotApor: formatMoney(requireNumber(receiver.baseContributionSalary)),
		SalarioDiarioIntegrado: formatMoney(requireNumber(receiver.integratedDailySalary)),
		ClaveEntFed: requireText(receiver.federalEntity),
	})}/>`;
}

/**
 * Renders payroll perception nodes.
 *
 * @param perceptions - Perception breakdown lines
 * @param totals - Calculated XML totals
 * @returns Percepciones XML
 */
function renderPerceptions(
	perceptions: PayrollCfdiPerceptionLine[],
	totals: PayrollCfdiTotals,
): string {
	const lines = perceptions
		.map(
			(line) =>
				`<nomina12:Percepcion ${attrsToXml({
					TipoPercepcion: requireText(line.satTypeCode),
					Clave: requireText(line.employerCode),
					Concepto: requireText(line.conceptLabel),
					ImporteGravado: formatMoney(line.taxedAmount),
					ImporteExento: formatMoney(line.exemptAmount),
				})}/>`,
		)
		.join('');

	return `<nomina12:Percepciones ${attrsToXml({
		TotalSueldos: formatMoney(totals.totalPerceptions),
		TotalGravado: formatMoney(totals.totalTaxed),
		TotalExento: formatMoney(totals.totalExempt),
	})}>${lines}</nomina12:Percepciones>`;
}

/**
 * Renders deduction nodes when deductions exist.
 *
 * @param deductions - Deduction breakdown lines
 * @param totals - Calculated XML totals
 * @returns Deducciones XML or empty string
 */
function renderDeductions(
	deductions: PayrollCfdiDeductionLine[],
	totals: PayrollCfdiTotals,
): string {
	if (deductions.length === 0) {
		return '';
	}

	const lines = deductions
		.map(
			(line) =>
				`<nomina12:Deduccion ${attrsToXml({
					TipoDeduccion: requireText(line.satTypeCode),
					Clave: requireText(line.employerCode),
					Concepto: requireText(line.conceptLabel),
					Importe: formatMoney(line.amount),
				})}/>`,
		)
		.join('');

	return `<nomina12:Deducciones ${attrsToXml({
		...(totals.totalOtherDeductions > 0
			? { TotalOtrasDeducciones: formatMoney(totals.totalOtherDeductions) }
			: {}),
		...(totals.totalIsrWithheld > 0
			? { TotalImpuestosRetenidos: formatMoney(totals.totalIsrWithheld) }
			: {}),
	})}>${lines}</nomina12:Deducciones>`;
}

/**
 * Renders other payment nodes when present.
 *
 * @param otherPayments - Other payment breakdown lines
 * @returns OtrosPagos XML or empty string
 */
function renderOtherPayments(otherPayments: PayrollCfdiOtherPaymentLine[]): string {
	if (otherPayments.length === 0) {
		return '';
	}

	const lines = otherPayments
		.map((line) => {
			const child =
				line.satTypeCode === '002'
					? `<nomina12:SubsidioAlEmpleo ${attrsToXml({
							SubsidioCausado: formatMoney(
								requireNumber(line.subsidyCausedAmount ?? null),
							),
						})}/>`
					: '';

			return `<nomina12:OtroPago ${attrsToXml({
				TipoOtroPago: requireText(line.satTypeCode),
				Clave: requireText(line.employerCode),
				Concepto: requireText(line.conceptLabel),
				Importe: formatMoney(line.amount),
			})}>${child}</nomina12:OtroPago>`;
		})
		.join('');

	return `<nomina12:OtrosPagos>${lines}</nomina12:OtrosPagos>`;
}

/**
 * Validates required Nomina Receptor fields used during XML rendering.
 *
 * @param receiver - Nomina Receptor snapshot
 * @param errors - Mutable validation issue list
 */
function validatePayrollReceiver(
	receiver: PayrollCfdiReceiver,
	errors: PayrollCfdiValidationIssue[],
): void {
	validateRequiredCatalogText(receiver.contractType, 'receiver.contractType', errors);
	validateRequiredCatalogText(receiver.unionized, 'receiver.unionized', errors);
	validateRequiredCatalogText(receiver.workdayType, 'receiver.workdayType', errors);
	validateRequiredCatalogText(receiver.regimeType, 'receiver.regimeType', errors);
	validateRequiredCatalogText(receiver.employeeNumber, 'receiver.employeeNumber', errors);
	validateRequiredCatalogText(receiver.department, 'receiver.department', errors);
	validateRequiredCatalogText(receiver.position, 'receiver.position', errors);
	validateRequiredCatalogText(receiver.positionRisk, 'receiver.positionRisk', errors);
	validateRequiredCatalogText(receiver.paymentFrequency, 'receiver.paymentFrequency', errors);
	validateNullableAmount(
		receiver.baseContributionSalary,
		'receiver.baseContributionSalary',
		errors,
	);
	validateNullableAmount(
		receiver.integratedDailySalary,
		'receiver.integratedDailySalary',
		errors,
	);
	validateRequiredCatalogText(receiver.federalEntity, 'receiver.federalEntity', errors);
}

/**
 * Calculates CFDI and Nomina totals from line breakdowns.
 *
 * @param input - Payroll CFDI build input
 * @returns Calculated totals
 */
function calculateTotals(input: PayrollCfdiBuildInput): PayrollCfdiTotals {
	const perceptionTotals = input.perceptions.map((line) =>
		sumMoney([line.taxedAmount, line.exemptAmount]),
	);
	const totalTaxed = sumMoney(input.perceptions.map((line) => line.taxedAmount));
	const totalExempt = sumMoney(input.perceptions.map((line) => line.exemptAmount));
	const totalPerceptions = sumMoney(perceptionTotals);
	const totalOtherPayments = sumMoney(input.otherPayments.map((line) => line.amount));
	const subtotal = sumMoney([totalPerceptions, totalOtherPayments]);
	const totalIsrWithheld = sumMoney(
		input.deductions.filter((line) => line.satTypeCode === '002').map((line) => line.amount),
	);
	const totalDeductions = sumMoney(input.deductions.map((line) => line.amount));
	const totalOtherDeductions = roundCurrency(totalDeductions - totalIsrWithheld);
	const total = roundCurrency(subtotal - totalDeductions);

	return {
		subtotal,
		discount: totalDeductions,
		total,
		totalPerceptions,
		totalTaxed,
		totalExempt,
		totalOtherPayments,
		totalDeductions,
		totalIsrWithheld,
		totalOtherDeductions,
		hasOtherPaymentsNode: input.otherPayments.length > 0,
	};
}

/**
 * Validates strict calendar date keys and payroll date ordering.
 *
 * @param input - Payroll CFDI build input
 * @param errors - Mutable validation issue list
 */
function validatePayrollDates(
	input: PayrollCfdiBuildInput,
	errors: PayrollCfdiValidationIssue[],
): void {
	const paymentDate = parseStrictDateKey(input.payroll.paymentDateKey);
	const periodStartDate = parseStrictDateKey(input.payroll.periodStartDateKey);
	const periodEndDate = parseStrictDateKey(input.payroll.periodEndDateKey);
	const employmentStartDate = parseStrictDateKey(input.receiver.employmentStartDateKey);

	if (input.payroll.paymentDateKey !== null && paymentDate === null) {
		errors.push(createIssue('XML_PAYMENT_DATE_REQUIRED', 'payroll.paymentDateKey'));
	}

	if (
		(input.payroll.periodStartDateKey !== null && periodStartDate === null) ||
		(input.payroll.periodEndDateKey !== null && periodEndDate === null) ||
		(periodStartDate !== null &&
			periodEndDate !== null &&
			periodEndDate.getTime() < periodStartDate.getTime())
	) {
		errors.push(createIssue('XML_PERIOD_DATES_REQUIRED', 'payroll.periodDates'));
	}

	if (
		(input.receiver.employmentStartDateKey !== null && employmentStartDate === null) ||
		(employmentStartDate !== null &&
			periodEndDate !== null &&
			periodEndDate.getTime() < employmentStartDate.getTime())
	) {
		errors.push(
			createIssue('XML_EMPLOYMENT_START_DATE_REQUIRED', 'receiver.employmentStartDateKey'),
		);
	}
}

/**
 * Validates aggregate CFDI totals after line-level validation.
 *
 * @param input - Payroll CFDI build input
 * @param errors - Mutable validation issue list
 */
function validateTotals(input: PayrollCfdiBuildInput, errors: PayrollCfdiValidationIssue[]): void {
	if (!hasValidTotalAmounts(input)) {
		return;
	}

	const totals = calculateTotals(input);

	if (totals.discount > totals.subtotal || totals.total < 0) {
		errors.push(createIssue('XML_TOTALS_MISMATCH', 'totals.total'));
	}
}

/**
 * Checks whether all total-bearing amounts can safely be aggregated.
 *
 * @param input - Payroll CFDI build input
 * @returns True when amounts are finite and nonnegative
 */
function hasValidTotalAmounts(input: PayrollCfdiBuildInput): boolean {
	const amounts = [
		...input.perceptions.flatMap((line) => [line.taxedAmount, line.exemptAmount]),
		...input.deductions.map((line) => line.amount),
		...input.otherPayments.map((line) => line.amount),
	];

	return amounts.every(
		(amount) => Number.isFinite(amount) && amount >= 0 && !Object.is(amount, -0),
	);
}

/**
 * Validates perception lines.
 *
 * @param perceptions - Perception lines to validate
 * @param errors - Mutable validation issue list
 */
function validatePerceptions(
	perceptions: PayrollCfdiPerceptionLine[],
	errors: PayrollCfdiValidationIssue[],
): void {
	for (const [index, line] of perceptions.entries()) {
		const field = `perceptions.${index}`;

		if (line.internalCode === 'FISCAL_GROSS_PAY' || line.internalType === 'FISCAL_GROSS_PAY') {
			errors.push(createIssue('XML_PERCEPTION_BREAKDOWN_REQUIRED', field));
		}

		validateCatalogText(line.satTypeCode, `${field}.satTypeCode`, errors);
		validateCatalogText(line.employerCode, `${field}.employerCode`, errors);
		validateRequiredText(line.conceptLabel, `${field}.conceptLabel`, errors);
		validateAmount(line.taxedAmount, `${field}.taxedAmount`, errors);
		validateAmount(line.exemptAmount, `${field}.exemptAmount`, errors);

		if (
			Number.isFinite(line.taxedAmount) &&
			Number.isFinite(line.exemptAmount) &&
			sumMoney([line.taxedAmount, line.exemptAmount]) <= 0
		) {
			errors.push(createIssue('XML_TOTALS_MISMATCH', field));
		}
	}
}

/**
 * Validates deduction lines.
 *
 * @param deductions - Deduction lines to validate
 * @param errors - Mutable validation issue list
 */
function validateDeductions(
	deductions: PayrollCfdiDeductionLine[],
	errors: PayrollCfdiValidationIssue[],
): void {
	if (
		deductions.length > 0 &&
		deductions.every((line) => Number.isFinite(line.amount)) &&
		sumMoney(deductions.map((line) => line.amount)) <= 0
	) {
		errors.push(createIssue('XML_TOTALS_MISMATCH', 'deductions'));
	}

	for (const [index, line] of deductions.entries()) {
		const field = `deductions.${index}`;

		if (!hasText(line.satTypeCode)) {
			errors.push(createIssue('XML_UNMAPPED_CONCEPT', `${field}.satTypeCode`));
		} else {
			validateCatalogText(line.satTypeCode, `${field}.satTypeCode`, errors);
		}

		validateCatalogText(line.employerCode, `${field}.employerCode`, errors);
		validateRequiredText(line.conceptLabel, `${field}.conceptLabel`, errors);
		validateAmount(line.amount, `${field}.amount`, errors);
	}
}

/**
 * Validates other payment lines.
 *
 * @param otherPayments - Other payment lines to validate
 * @param errors - Mutable validation issue list
 */
function validateOtherPayments(
	otherPayments: PayrollCfdiOtherPaymentLine[],
	errors: PayrollCfdiValidationIssue[],
): void {
	for (const [index, line] of otherPayments.entries()) {
		const field = `otherPayments.${index}`;

		validateCatalogText(line.satTypeCode, `${field}.satTypeCode`, errors);
		validateCatalogText(line.employerCode, `${field}.employerCode`, errors);
		validateRequiredText(line.conceptLabel, `${field}.conceptLabel`, errors);
		validateAmount(line.amount, `${field}.amount`, errors);

		if (line.satTypeCode === '002') {
			if (line.amount !== 0) {
				errors.push(createIssue('XML_SUBSIDY_AMOUNT_MUST_BE_ZERO', `${field}.amount`));
			}

			if (line.subsidyCausedAmount === null || line.subsidyCausedAmount === undefined) {
				errors.push(
					createIssue('XML_SUBSIDY_AMOUNT_MUST_BE_ZERO', `${field}.subsidyCausedAmount`),
				);
			} else {
				validateAmount(line.subsidyCausedAmount, `${field}.subsidyCausedAmount`, errors);
			}
		}
	}
}

/**
 * Adds a required-text validation issue when the value is blank.
 *
 * @param errors - Mutable validation issue list
 * @param value - Candidate text value
 * @param code - Issue code to add
 * @param field - Field path for the issue
 */
function pushRequired(
	errors: PayrollCfdiValidationIssue[],
	value: string | null,
	code: PayrollCfdiValidationIssueCode,
	field: string,
): void {
	if (!hasText(value)) {
		errors.push(createIssue(code, field));
	}
}

/**
 * Validates required text with the generic unmapped concept code.
 *
 * @param value - Candidate text value
 * @param field - Field path for the issue
 * @param errors - Mutable validation issue list
 */
function validateRequiredText(
	value: string | null,
	field: string,
	errors: PayrollCfdiValidationIssue[],
): void {
	if (!hasText(value)) {
		errors.push(createIssue('XML_UNMAPPED_CONCEPT', field));
	}
}

/**
 * Validates required receiver catalog/text fields with the generic catalog issue.
 *
 * @param value - Candidate text value
 * @param field - Field path for the issue
 * @param errors - Mutable validation issue list
 */
function validateRequiredCatalogText(
	value: string | null,
	field: string,
	errors: PayrollCfdiValidationIssue[],
): void {
	if (!hasText(value)) {
		errors.push(createIssue('XML_CATALOG_CODE_INVALID', field));
	}
}

/**
 * Validates a SAT catalog-like code field.
 *
 * @param value - Candidate code value
 * @param field - Field path for the issue
 * @param errors - Mutable validation issue list
 */
function validateCatalogText(
	value: string | null,
	field: string,
	errors: PayrollCfdiValidationIssue[],
): void {
	if (!hasText(value)) {
		errors.push(createIssue('XML_UNMAPPED_CONCEPT', field));
		return;
	}

	if (!/^[0-9A-Z-]+$/i.test(value)) {
		errors.push(createIssue('XML_CATALOG_CODE_INVALID', field));
	}
}

/**
 * Validates that an amount is finite and nonnegative.
 *
 * @param value - Amount to validate
 * @param field - Field path for the issue
 * @param errors - Mutable validation issue list
 */
function validateAmount(value: number, field: string, errors: PayrollCfdiValidationIssue[]): void {
	if (!Number.isFinite(value) || Object.is(value, -0) || value < 0) {
		errors.push(createIssue('XML_NEGATIVE_AMOUNT', field));
	}
}

/**
 * Validates that an amount exists, is finite, and is nonnegative.
 *
 * @param value - Nullable amount to validate
 * @param field - Field path for the issue
 * @param errors - Mutable validation issue list
 */
function validateNullableAmount(
	value: number | null,
	field: string,
	errors: PayrollCfdiValidationIssue[],
): void {
	if (value === null) {
		errors.push(createIssue('XML_SALARY_REQUIRED', field));
		return;
	}

	if (!Number.isFinite(value) || Object.is(value, -0) || value < 0) {
		errors.push(createIssue('XML_NEGATIVE_AMOUNT', field));
	}
}

/**
 * Creates a validation issue with a deterministic message.
 *
 * @param code - Stable validation issue code
 * @param field - Field path associated with the issue
 * @returns Validation issue
 */
function createIssue(
	code: PayrollCfdiValidationIssueCode,
	field: string,
): PayrollCfdiValidationIssue {
	return {
		code,
		field,
		message: code,
	};
}

/**
 * Checks whether a value contains non-whitespace text.
 *
 * @param value - Candidate text
 * @returns True when the value is a non-empty string
 */
function hasText(value: string | null | undefined): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Requires a string value after validation.
 *
 * @param value - Candidate text
 * @returns Non-empty string
 */
function requireText(value: string | null | undefined): string {
	if (!hasText(value)) {
		throw new Error('Expected validated text.');
	}

	return value;
}

/**
 * Requires a number value after validation.
 *
 * @param value - Candidate number
 * @returns Number value
 */
function requireNumber(value: number | null): number {
	if (value === null || !Number.isFinite(value)) {
		throw new Error('Expected validated number.');
	}

	return value;
}

/**
 * Converts XML attributes into deterministic escaped text.
 *
 * @param attrs - Attribute map
 * @returns XML attribute text
 */
function attrsToXml(attrs: Record<string, string | number | undefined>): string {
	return Object.entries(attrs)
		.filter((entry): entry is [string, string | number] => entry[1] !== undefined)
		.map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
		.join(' ');
}

/**
 * Escapes text for XML attribute values.
 *
 * @param value - Raw attribute value
 * @returns Escaped XML attribute value
 */
function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/**
 * Reads CFDI date parts in the configured Mexico City timezone.
 *
 * @param date - Date to format
 * @returns Date-time parts with zero-padded values
 */
function getCfdiDateParts(date: Date): {
	year: string;
	month: string;
	day: string;
	hour: string;
	minute: string;
	second: string;
} {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: CFDI_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value]),
	);

	return {
		year: requireDatePart(parts.year, 'year'),
		month: requireDatePart(parts.month, 'month'),
		day: requireDatePart(parts.day, 'day'),
		hour: requireDatePart(parts.hour, 'hour'),
		minute: requireDatePart(parts.minute, 'minute'),
		second: requireDatePart(parts.second, 'second'),
	};
}

/**
 * Requires a date part from Intl formatting.
 *
 * @param value - Candidate date part value
 * @param partName - Name of the date part
 * @returns Date part value
 */
function requireDatePart(value: string | undefined, partName: string): string {
	if (!hasText(value)) {
		throw new Error(`Missing CFDI date part: ${partName}.`);
	}

	return value;
}

/**
 * Parses a date key as a UTC calendar date.
 *
 * @param value - Date key in YYYY-MM-DD format
 * @returns UTC calendar date
 */
function parseDateKeyAsUtc(value: string): Date {
	const parsed = parseStrictDateKey(value);

	if (parsed === null) {
		throw new Error(`Invalid date key: ${value}.`);
	}

	return parsed;
}

/**
 * Parses a strict YYYY-MM-DD calendar date key without rollover.
 *
 * @param value - Candidate date key
 * @returns UTC calendar date, or null when invalid
 */
function parseStrictDateKey(value: string | null): Date | null {
	if (!hasText(value)) {
		return null;
	}

	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return date;
}

/**
 * Returns a SHA-256 hex digest for deterministic artifact tracking.
 *
 * @param value - Text value to hash
 * @returns SHA-256 hex digest
 */
function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}
