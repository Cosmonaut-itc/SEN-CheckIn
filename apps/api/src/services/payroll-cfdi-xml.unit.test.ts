import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import {
	buildPayrollCfdiXml,
	computePayrollSeniority,
	formatCfdiDate,
	formatMoney,
	formatPayrollDays,
	type PayrollCfdiBuildInput,
	validatePayrollCfdiXmlInput,
} from './payroll-cfdi-xml.js';

type PayrollCfdiBuildInputOverrides = Partial<
	Omit<PayrollCfdiBuildInput, 'issuer' | 'receiver' | 'payroll'>
> & {
	issuer?: Partial<PayrollCfdiBuildInput['issuer']>;
	receiver?: Partial<PayrollCfdiBuildInput['receiver']>;
	payroll?: Partial<PayrollCfdiBuildInput['payroll']>;
};

/**
 * Builds the synthetic weekly payroll fixture used by CFDI XML tests.
 *
 * @param overrides - Partial input fields to override
 * @returns Synthetic CFDI XML build input
 */
function buildWeeklyInput(overrides: PayrollCfdiBuildInputOverrides = {}): PayrollCfdiBuildInput {
	const base: PayrollCfdiBuildInput = {
		voucherId: 'voucher-weekly-001',
		fiscalSnapshotHash: 'snapshot-hash-001',
		issuedAt: new Date('2026-04-18T09:30:45.000-06:00'),
		issuer: {
			rfc: 'AAA010101AAA',
			name: 'EMPRESA DEMO SA DE CV',
			fiscalRegime: '601',
			expeditionPostalCode: '64000',
			employerRegistration: 'A1234567890',
		},
		receiver: {
			rfc: 'XEXX010101000',
			name: 'PERSONA DEMO NOMINA',
			fiscalRegime: '605',
			fiscalPostalCode: '64000',
			curp: 'XEXX010101HNEXXXA4',
			nss: '12345678901',
			employmentStartDateKey: '2015-05-18',
			contractType: '01',
			unionized: 'No',
			workdayType: '01',
			regimeType: '02',
			employeeNumber: 'EMP-001',
			department: 'Operaciones',
			position: 'Operador',
			positionRisk: '1',
			paymentFrequency: '02',
			bankAccount: '1234567890',
			baseContributionSalary: 315.04,
			integratedDailySalary: 315.04,
			federalEntity: 'NLE',
		},
		payroll: {
			type: 'O',
			paymentDateKey: '2026-04-18',
			periodStartDateKey: '2026-04-13',
			periodEndDateKey: '2026-04-19',
			daysPaid: 7,
		},
		perceptions: [
			{
				internalType: 'SALARY',
				internalCode: 'WEEKLY_SALARY',
				satTypeCode: '001',
				employerCode: '001',
				conceptLabel: 'Sueldo',
				taxedAmount: 1890.24,
				exemptAmount: 0,
			},
			{
				internalType: 'SEVENTH_DAY',
				internalCode: 'SEVENTH_DAY',
				satTypeCode: '001',
				employerCode: '003',
				conceptLabel: 'Séptimo día',
				taxedAmount: 315.04,
				exemptAmount: 0,
			},
		],
		deductions: [],
		otherPayments: [
			{
				internalType: 'SUBSIDY_APPLIED',
				internalCode: 'SUBSIDY_APPLIED',
				satTypeCode: '002',
				employerCode: '035',
				conceptLabel:
					'Subsidio para el empleo del Decreto que otorga el subsidio para el empleo',
				amount: 0,
				subsidyCausedAmount: 123.34,
			},
		],
	};

	return {
		...base,
		...overrides,
		issuer: { ...base.issuer, ...overrides.issuer },
		receiver: { ...base.receiver, ...overrides.receiver },
		payroll: { ...base.payroll, ...overrides.payroll },
		perceptions: overrides.perceptions ?? base.perceptions,
		deductions: overrides.deductions ?? base.deductions,
		otherPayments: overrides.otherPayments ?? base.otherPayments,
	};
}

/**
 * Extracts XML attributes from the first matching opening tag.
 *
 * @param xml - XML string to inspect
 * @param tagName - XML tag name, including prefix when present
 * @returns Attribute map for the tag
 */
function attrs(xml: string, tagName: string): Record<string, string> {
	const match = xml.match(new RegExp(`<${tagName}\\s+([^>]*)>`));

	if (!match) {
		throw new Error(`Missing <${tagName}> in XML.`);
	}

	const attributeText = match[1];

	if (!attributeText) {
		throw new Error(`Missing attributes for <${tagName}> in XML.`);
	}

	return Object.fromEntries(
		[...attributeText.matchAll(/([A-Za-z0-9_:]+)="([^"]*)"/g)].map((entry) => [
			entry[1],
			entry[2],
		]),
	);
}

/**
 * Returns the validation error codes for an input.
 *
 * @param input - CFDI build input
 * @returns Error code list
 */
function errorCodes(input: PayrollCfdiBuildInput): string[] {
	return validatePayrollCfdiXmlInput(input).errors.map((issue) => issue.code);
}

/**
 * Returns a SHA-256 hex digest for test assertions.
 *
 * @param value - Text value to hash
 * @returns SHA-256 hex digest
 */
function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

describe('payroll CFDI XML formatting helpers', () => {
	it('formats valid money with two decimals and blocks negative values', () => {
		expect(formatMoney(2205.28)).toBe('2205.28');
		expect(formatMoney(0)).toBe('0.00');
		expect(() => formatMoney(-1)).toThrow('XML_NEGATIVE_AMOUNT');
	});

	it('formats payroll days with three decimals', () => {
		expect(formatPayrollDays(7)).toBe('7.000');
	});

	it('blocks negative payroll days including negative zero', () => {
		expect(() => formatPayrollDays(-1)).toThrow('XML_NEGATIVE_AMOUNT');
		expect(() => formatPayrollDays(-0)).toThrow('XML_NEGATIVE_AMOUNT');
	});

	it('formats CFDI dates without a timezone suffix', () => {
		expect(formatCfdiDate(new Date('2026-04-18T09:30:45.000-06:00'))).toBe(
			'2026-04-18T09:30:45',
		);
	});

	it('computes inclusive payroll seniority in weeks when divisible by seven', () => {
		expect(
			computePayrollSeniority({
				employmentStartDateKey: '2015-05-18',
				periodEndDateKey: '2026-04-19',
			}),
		).toBe('P570W');
	});
});

describe('payroll CFDI XML builder totals', () => {
	it('builds no-deduction payroll with zero subsidy other payment without adding subsidy to net', () => {
		const result = buildPayrollCfdiXml(buildWeeklyInput());

		expect(result.validation.status).toBe('READY_TO_STAMP');
		expect(attrs(result.xmlWithoutSeal, 'cfdi:Comprobante')).toMatchObject({
			SubTotal: '2205.28',
			Total: '2205.28',
		});
		expect(attrs(result.xmlWithoutSeal, 'nomina12:Nomina')).toMatchObject({
			TotalPercepciones: '2205.28',
			TotalOtrosPagos: '0.00',
		});
		expect(result.xmlWithoutSeal).toContain('SubsidioCausado="123.34"');
		expect(result.xmlWithoutSeal).not.toContain('Descuento=');
	});

	it('splits ISR and other deduction totals on payroll with deductions', () => {
		const result = buildPayrollCfdiXml(
			buildWeeklyInput({
				perceptions: [
					{
						internalType: 'SALARY',
						internalCode: 'SALARY',
						satTypeCode: '001',
						employerCode: '001',
						conceptLabel: 'Sueldo',
						taxedAmount: 3000,
						exemptAmount: 0,
					},
				],
				deductions: [
					{
						internalType: 'ISR',
						internalCode: 'ISR',
						satTypeCode: '002',
						employerCode: '101',
						conceptLabel: 'ISR',
						amount: 100,
					},
					{
						internalType: 'IMSS_EMPLOYEE',
						internalCode: 'IMSS_EMPLOYEE',
						satTypeCode: '001',
						employerCode: '102',
						conceptLabel: 'IMSS',
						amount: 50,
					},
				],
				otherPayments: [],
			}),
		);

		expect(attrs(result.xmlWithoutSeal, 'cfdi:Comprobante')).toMatchObject({
			SubTotal: '3000.00',
			Descuento: '150.00',
			Total: '2850.00',
		});
		expect(attrs(result.xmlWithoutSeal, 'nomina12:Deducciones')).toMatchObject({
			TotalImpuestosRetenidos: '100.00',
			TotalOtrasDeducciones: '50.00',
		});
	});

	it('builds the deterministic golden weekly ordinary CFDI structure', () => {
		const result = buildPayrollCfdiXml(buildWeeklyInput());

		expect(result.validation.status).toBe('READY_TO_STAMP');
		expect(result.xmlHash).toMatch(/^[a-f0-9]{64}$/);
		expect(attrs(result.xmlWithoutSeal, 'cfdi:Comprobante')).toMatchObject({
			'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'xmlns:cfdi': 'http://www.sat.gob.mx/cfd/4',
			'xmlns:nomina12': 'http://www.sat.gob.mx/nomina12',
			'xsi:schemaLocation':
				'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd',
			Version: '4.0',
			TipoDeComprobante: 'N',
			MetodoPago: 'PUE',
			Exportacion: '01',
			Moneda: 'MXN',
			Fecha: '2026-04-18T09:30:45',
		});
		expect(attrs(result.xmlWithoutSeal, 'cfdi:Receptor')).toMatchObject({
			UsoCFDI: 'CN01',
		});
		expect(attrs(result.xmlWithoutSeal, 'cfdi:Concepto')).toMatchObject({
			ClaveProdServ: '84111505',
			Cantidad: '1',
			ClaveUnidad: 'ACT',
			Descripcion: 'Pago de nómina',
			ObjetoImp: '01',
			ValorUnitario: '2205.28',
			Importe: '2205.28',
		});
		expect(attrs(result.xmlWithoutSeal, 'nomina12:Nomina')).toMatchObject({
			TipoNomina: 'O',
			FechaPago: '2026-04-18',
			FechaInicialPago: '2026-04-13',
			FechaFinalPago: '2026-04-19',
			NumDiasPagados: '7.000',
			TotalPercepciones: '2205.28',
			TotalOtrosPagos: '0.00',
		});
		expect(result.xmlWithoutSeal).toContain(
			'<nomina12:Percepcion TipoPercepcion="001" Clave="001" Concepto="Sueldo" ImporteGravado="1890.24" ImporteExento="0.00"/>',
		);
		expect(result.xmlWithoutSeal).toContain(
			'<nomina12:Percepcion TipoPercepcion="001" Clave="003" Concepto="Séptimo día" ImporteGravado="315.04" ImporteExento="0.00"/>',
		);
		expect(result.xmlWithoutSeal).toContain(
			'<nomina12:OtroPago TipoOtroPago="002" Clave="035" Concepto="Subsidio para el empleo del Decreto que otorga el subsidio para el empleo" Importe="0.00"><nomina12:SubsidioAlEmpleo SubsidioCausado="123.34"/></nomina12:OtroPago>',
		);
		expect(result.xmlWithoutSeal).not.toContain('TimbreFiscalDigital');
		expect(result.xmlHash).toBe(sha256Hex(result.xmlWithoutSeal));
		expect(result.xmlWithoutSeal).toMatch(
			/^<cfdi:Comprobante [\s\S]*<cfdi:Emisor [\s\S]*<cfdi:Receptor [\s\S]*<cfdi:Conceptos><cfdi:Concepto [\s\S]*<\/cfdi:Conceptos><cfdi:Complemento><nomina12:Nomina [\s\S]*<nomina12:Emisor [\s\S]*<nomina12:Receptor [\s\S]*<nomina12:Percepciones [\s\S]*<nomina12:OtrosPagos>[\s\S]*<\/nomina12:Nomina><\/cfdi:Complemento><\/cfdi:Comprobante>$/,
		);
	});

	it('omits optional bank account when it is absent', () => {
		const result = buildPayrollCfdiXml(buildWeeklyInput({ receiver: { bankAccount: null } }));

		expect(result.validation.status).toBe('READY_TO_STAMP');
		expect(attrs(result.xmlWithoutSeal, 'nomina12:Receptor')).not.toHaveProperty(
			'CuentaBancaria',
		);
	});

	it('always emits SubsidioAlEmpleo child for subsidy other-payment lines', () => {
		const result = buildPayrollCfdiXml(
			buildWeeklyInput({
				otherPayments: [
					{
						internalType: 'SUBSIDY_APPLIED',
						internalCode: 'SUBSIDY_APPLIED',
						satTypeCode: '002',
						employerCode: '035',
						conceptLabel: 'Subsidio',
						amount: 0,
						subsidyCausedAmount: 0,
					},
				],
			}),
		);

		expect(result.validation.status).toBe('READY_TO_STAMP');
		expect(result.xmlWithoutSeal).toContain(
			'<nomina12:SubsidioAlEmpleo SubsidioCausado="0.00"/>',
		);
	});
});

describe('payroll CFDI XML validation', () => {
	it('blocks invalid inputs with stable validation issue codes and empty XML', () => {
		const cases: Array<[string, PayrollCfdiBuildInput, string]> = [
			[
				'missing receiver postal code',
				buildWeeklyInput({ receiver: { fiscalPostalCode: null } }),
				'XML_RECEIVER_POSTAL_CODE_REQUIRED',
			],
			[
				'missing employer registration',
				buildWeeklyInput({ issuer: { employerRegistration: null } }),
				'XML_EMPLOYER_REGISTRATION_REQUIRED',
			],
			[
				'missing perception breakdown',
				buildWeeklyInput({
					perceptions: [
						{
							internalType: 'FISCAL_GROSS_PAY',
							internalCode: 'FISCAL_GROSS_PAY',
							satTypeCode: '001',
							employerCode: '001',
							conceptLabel: 'Sueldo agregado',
							taxedAmount: 2205.28,
							exemptAmount: 0,
						},
					],
				}),
				'XML_PERCEPTION_BREAKDOWN_REQUIRED',
			],
			[
				'subsidy caused with non-zero import',
				buildWeeklyInput({
					otherPayments: [
						{
							internalType: 'SUBSIDY_APPLIED',
							internalCode: 'SUBSIDY_APPLIED',
							satTypeCode: '002',
							employerCode: '035',
							conceptLabel: 'Subsidio',
							amount: 12,
							subsidyCausedAmount: 123.34,
						},
					],
				}),
				'XML_SUBSIDY_AMOUNT_MUST_BE_ZERO',
			],
			[
				'missing subsidy caused for subsidy other payment',
				buildWeeklyInput({
					otherPayments: [
						{
							internalType: 'SUBSIDY_APPLIED',
							internalCode: 'SUBSIDY_APPLIED',
							satTypeCode: '002',
							employerCode: '035',
							conceptLabel: 'Subsidio',
							amount: 0,
							subsidyCausedAmount: null,
						},
					],
				}),
				'XML_SUBSIDY_AMOUNT_MUST_BE_ZERO',
			],
			[
				'negative subsidy caused for subsidy other payment',
				buildWeeklyInput({
					otherPayments: [
						{
							internalType: 'SUBSIDY_APPLIED',
							internalCode: 'SUBSIDY_APPLIED',
							satTypeCode: '002',
							employerCode: '035',
							conceptLabel: 'Subsidio',
							amount: 0,
							subsidyCausedAmount: -1,
						},
					],
				}),
				'XML_NEGATIVE_AMOUNT',
			],
			[
				'unmapped deduction',
				buildWeeklyInput({
					deductions: [
						{
							internalType: 'LOAN',
							internalCode: 'LOAN',
							satTypeCode: null,
							employerCode: '103',
							conceptLabel: 'Préstamo',
							amount: 10,
						},
					],
				}),
				'XML_UNMAPPED_CONCEPT',
			],
			[
				'negative amount',
				buildWeeklyInput({
					perceptions: [
						{
							internalType: 'SALARY',
							internalCode: 'SALARY',
							satTypeCode: '001',
							employerCode: '001',
							conceptLabel: 'Sueldo',
							taxedAmount: -1,
							exemptAmount: 0,
						},
					],
				}),
				'XML_NEGATIVE_AMOUNT',
			],
			[
				'real payroll complement present',
				buildWeeklyInput({ realPayrollComplementPay: 100 }),
				'XML_REAL_PAYROLL_COMPLEMENT_FORBIDDEN',
			],
			[
				'unsupported extraordinary payroll',
				buildWeeklyInput({ payroll: { type: 'E' } }),
				'XML_UNSUPPORTED_PAYROLL_TYPE',
			],
			[
				'negative payroll days',
				buildWeeklyInput({ payroll: { daysPaid: -1 } }),
				'XML_DAYS_PAID_REQUIRED',
			],
			[
				'negative zero payroll days',
				buildWeeklyInput({ payroll: { daysPaid: -0 } }),
				'XML_DAYS_PAID_REQUIRED',
			],
		];

		for (const [label, input, code] of cases) {
			expect(errorCodes(input), label).toContain(code);
			const result = buildPayrollCfdiXml(input);

			expect(result.validation.status, label).toBe('BLOCKED');
			expect(result.xmlWithoutSeal, label).toBe('');
		}
	});

	it('blocks missing required Nomina receptor fields instead of throwing during render', () => {
		const cases: Array<[string, PayrollCfdiBuildInput, string]> = [
			[
				'missing contract type',
				buildWeeklyInput({ receiver: { contractType: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing unionized flag',
				buildWeeklyInput({ receiver: { unionized: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing workday type',
				buildWeeklyInput({ receiver: { workdayType: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing regime type',
				buildWeeklyInput({ receiver: { regimeType: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing employee number',
				buildWeeklyInput({ receiver: { employeeNumber: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing department',
				buildWeeklyInput({ receiver: { department: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing position',
				buildWeeklyInput({ receiver: { position: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing position risk',
				buildWeeklyInput({ receiver: { positionRisk: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing payment frequency',
				buildWeeklyInput({ receiver: { paymentFrequency: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'missing base contribution salary',
				buildWeeklyInput({ receiver: { baseContributionSalary: null } }),
				'XML_NEGATIVE_AMOUNT',
			],
			[
				'missing integrated daily salary',
				buildWeeklyInput({ receiver: { integratedDailySalary: null } }),
				'XML_NEGATIVE_AMOUNT',
			],
			[
				'missing federal entity',
				buildWeeklyInput({ receiver: { federalEntity: null } }),
				'XML_CATALOG_CODE_INVALID',
			],
			[
				'negative base contribution salary',
				buildWeeklyInput({ receiver: { baseContributionSalary: -1 } }),
				'XML_NEGATIVE_AMOUNT',
			],
			[
				'negative integrated daily salary',
				buildWeeklyInput({ receiver: { integratedDailySalary: -1 } }),
				'XML_NEGATIVE_AMOUNT',
			],
		];

		for (const [label, input, code] of cases) {
			expect(errorCodes(input), label).toContain(code);
			expect(() => buildPayrollCfdiXml(input), label).not.toThrow();

			const result = buildPayrollCfdiXml(input);

			expect(result.validation.status, label).toBe('BLOCKED');
			expect(result.xmlWithoutSeal, label).toBe('');
		}
	});
});
