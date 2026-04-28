import { afterEach, describe, expect, it } from 'bun:test';

import {
	buildPayrollFiscalPreflight,
	evaluatePayrollFiscalPreflight,
	extractPersistedPayrollConcepts,
	isCatalogCodeActive,
	setPayrollFiscalPreflightDataProviderForTest,
	validateCurp,
	validateDateKey,
	validateMoneyString,
	validateNss,
	validatePaidDaysString,
	validatePostalCode,
	validateRfc,
	type PayrollFiscalPreflightDataProvider,
	type PayrollFiscalPreflightInput,
} from './payroll-fiscal-validation.js';

const weeklyPayrollFixture = {
	periodStartDateKey: '2026-04-13',
	periodEndDateKey: '2026-04-19',
	paymentDateKey: '2026-04-18',
	daysPaid: '7.000',
	perceptions: [
		{ internalConceptType: 'SALARY', amount: '1890.24', taxed: '1890.24', exempt: '0.00' },
		{ internalConceptType: 'SEVENTH_DAY', amount: '315.04', taxed: '315.04', exempt: '0.00' },
	],
	subsidyCaused: '123.34',
};

const completeCatalogEntries: PayrollFiscalPreflightInput['catalogEntries'] = [
	{
		catalogName: 'c_RegimenFiscal',
		code: '601',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'c_RegimenFiscal',
		code: '605',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'c_UsoCFDI',
		code: 'CN01',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'c_CodigoPostal',
		code: '64000',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoContrato',
		code: '01',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoJornada',
		code: '01',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoRegimen',
		code: '02',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_RiesgoPuesto',
		code: '2',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_PeriodicidadPago',
		code: '02',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_ClaveEntFed',
		code: 'NLE',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoPercepcion',
		code: '001',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoOtroPago',
		code: '002',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoDeduccion',
		code: '001',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
	{
		catalogName: 'nomina_c_TipoDeduccion',
		code: '002',
		validFrom: '2022-01-01',
		validTo: null,
		isActive: true,
	},
];

const completeConceptMappings: PayrollFiscalPreflightInput['conceptMappings'] = [
	{
		organizationId: 'org-1',
		internalConceptType: 'SALARY',
		cfdiNode: 'PERCEPTION',
		satTypeCode: '001',
		isSupportedForStamping: true,
	},
	{
		organizationId: 'org-1',
		internalConceptType: 'SEVENTH_DAY',
		cfdiNode: 'PERCEPTION',
		satTypeCode: '001',
		isSupportedForStamping: true,
	},
	{
		organizationId: null,
		internalConceptType: 'SUBSIDY_APPLIED',
		cfdiNode: 'OTHER_PAYMENT',
		satTypeCode: '002',
		isSupportedForStamping: true,
	},
	{
		organizationId: null,
		internalConceptType: 'IMSS_EMPLOYEE',
		cfdiNode: 'DEDUCTION',
		satTypeCode: '001',
		isSupportedForStamping: true,
	},
	{
		organizationId: null,
		internalConceptType: 'ISR',
		cfdiNode: 'DEDUCTION',
		satTypeCode: '002',
		isSupportedForStamping: true,
	},
];

const completePayrollRun: NonNullable<PayrollFiscalPreflightInput['payrollRun']> = {
	id: 'run-weekly-1',
	organizationId: 'org-1',
	paymentFrequency: 'WEEKLY',
	periodStartDateKey: weeklyPayrollFixture.periodStartDateKey,
	periodEndDateKey: weeklyPayrollFixture.periodEndDateKey,
	paymentDateKey: weeklyPayrollFixture.paymentDateKey,
	status: 'PROCESSED',
	concepts: [
		...weeklyPayrollFixture.perceptions.map((perception) => ({
			internalConceptType: perception.internalConceptType,
			cfdiNode: 'PERCEPTION' as const,
		})),
		{
			internalConceptType: 'SUBSIDY_APPLIED',
			cfdiNode: 'OTHER_PAYMENT',
		},
		{ internalConceptType: 'IMSS_EMPLOYEE', cfdiNode: 'DEDUCTION' },
		{ internalConceptType: 'ISR', cfdiNode: 'DEDUCTION' },
	],
};

const completeOrganizationProfile: NonNullable<PayrollFiscalPreflightInput['organizationProfile']> =
	{
		legalName: 'Servicios Operativos del Norte SA de CV',
		rfc: 'SON010101AB1',
		fiscalRegimeCode: '601',
		expeditionPostalCode: '64000',
		employerRegistrationNumber: 'Y5412345101',
		defaultFederalEntityCode: 'NLE',
	};

const completeEmployeeFiscalProfile: NonNullable<
	PayrollFiscalPreflightInput['employees'][number]['fiscalProfile']
> = {
	satName: 'PERSONA UNO',
	rfc: 'PUON800113AB1',
	curp: 'PUON800113HNLRNS09',
	fiscalPostalCode: '64000',
	fiscalRegimeCode: '605',
	cfdiUseCode: 'CN01',
	socialSecurityNumber: '12345678901',
	employmentStartDateKey: '2024-01-15',
	contractTypeCode: '01',
	workdayTypeCode: '01',
	payrollRegimeTypeCode: '02',
	employeeNumber: 'E-001',
	department: 'Operaciones',
	position: 'Analista',
	riskPositionCode: '2',
	paymentFrequencyCode: '02',
	bankAccount: '012345678901234567',
	salaryBaseContribution: '315.04',
	integratedDailySalary: '330.00',
	federalEntityCode: null,
};

const completePreflightInput: PayrollFiscalPreflightInput = {
	organizationId: 'org-1',
	payrollRunId: 'run-weekly-1',
	payrollRun: completePayrollRun,
	organizationProfile: completeOrganizationProfile,
	employees: [
		{
			employeeId: 'emp-1',
			displayName: 'Persona Uno',
			fiscalProfile: completeEmployeeFiscalProfile,
		},
	],
	catalogEntries: completeCatalogEntries,
	conceptMappings: completeConceptMappings,
};

afterEach(() => {
	setPayrollFiscalPreflightDataProviderForTest(null);
});

describe('payroll fiscal validators', () => {
	it('validates RFC, CURP, NSS, and postal code formats', () => {
		expect(validateRfc('COSC8001137NA')).toBe(true);
		expect(validateRfc('COS8001137NA')).toBe(true);
		expect(validateRfc('cosc8001137na')).toBe(false);
		expect(validateRfc('COSC8001137N')).toBe(false);

		expect(validateCurp('LOMC800113HDFPRR09')).toBe(true);
		expect(validateCurp('LOMC800113XDFPRR09')).toBe(false);
		expect(validateCurp('LOMC800113HZZPRR09')).toBe(false);
		expect(validateCurp('LOMC800113HDFPRR0')).toBe(false);

		expect(validateNss('12345678901')).toBe(true);
		expect(validateNss('1234567890A')).toBe(false);
		expect(validateNss('1234567890')).toBe(false);

		expect(validatePostalCode('64000')).toBe(true);
		expect(validatePostalCode('6400')).toBe(false);
		expect(validatePostalCode('6400A')).toBe(false);
	});

	it('validates date keys, money strings, and paid-days strings', () => {
		expect(validateDateKey('2026-04-19')).toBe(true);
		expect(validateDateKey('2026-02-29')).toBe(false);
		expect(validateDateKey('2024-02-29')).toBe(true);
		expect(validateDateKey('2026-4-19')).toBe(false);

		expect(validateMoneyString('0')).toBe(true);
		expect(validateMoneyString('1890.24')).toBe(true);
		expect(validateMoneyString('-1.00')).toBe(false);
		expect(validateMoneyString('1.234')).toBe(false);

		expect(validatePaidDaysString('7')).toBe(true);
		expect(validatePaidDaysString('7.000')).toBe(true);
		expect(validatePaidDaysString('-0.001')).toBe(false);
		expect(validatePaidDaysString('7.0001')).toBe(false);
	});
});

describe('SAT catalog effective-date validation', () => {
	it('validates active catalog entries by code and effective date', () => {
		const entries: PayrollFiscalPreflightInput['catalogEntries'] = [
			{
				catalogName: 'nomina_c_TipoContrato',
				code: '01',
				validFrom: '2026-01-01',
				validTo: '2026-12-31',
				isActive: true,
			},
			{
				catalogName: 'nomina_c_TipoContrato',
				code: '02',
				validFrom: '2026-01-01',
				validTo: null,
				isActive: false,
			},
		];

		expect(isCatalogCodeActive(entries, 'nomina_c_TipoContrato', '01', '2026-04-19')).toBe(
			true,
		);
		expect(isCatalogCodeActive(entries, 'nomina_c_TipoContrato', '01', '2027-01-01')).toBe(
			false,
		);
		expect(isCatalogCodeActive(entries, 'nomina_c_TipoContrato', '02', '2026-04-19')).toBe(
			false,
		);
		expect(isCatalogCodeActive(entries, 'nomina_c_TipoJornada', '01', '2026-04-19')).toBe(
			false,
		);
	});
});

describe('persisted payroll concept extraction', () => {
	it('extracts nonzero persisted payroll concepts beyond base salary and taxes', () => {
		const concepts = extractPersistedPayrollConcepts([
			{
				totalPay: '5000.00',
				fiscalGrossPay: null,
				overtimeDoublePay: '120.00',
				overtimeTriplePay: '80.00',
				sundayPremiumAmount: '45.00',
				mandatoryRestDayPremiumAmount: '60.00',
				vacationPayAmount: '700.00',
				vacationPremiumAmount: '175.00',
				deductionsBreakdown: [
					{
						type: 'LOAN',
						appliedAmount: 250,
					},
				],
				taxBreakdown: {
					seventhDayPay: 315.04,
					gratificationsBreakdown: [
						{
							concept: 'PRODUCTIVITY_BONUS',
							appliedAmount: 300,
						},
					],
					employeeWithholdings: {
						imssEmployee: {
							total: 150,
						},
						isrWithheld: 275,
					},
					informationalLines: {
						subsidyCaused: 123,
					},
				},
			},
		]);

		expect(concepts).toEqual(
			expect.arrayContaining([
				{ internalConceptType: 'SALARY', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'SEVENTH_DAY', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'OVERTIME_DOUBLE', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'OVERTIME_TRIPLE', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'SUNDAY_PREMIUM', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'MANDATORY_REST_DAY_PREMIUM', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'VACATION_PAY', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'VACATION_PREMIUM', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'PRODUCTIVITY_BONUS', cfdiNode: 'PERCEPTION' },
				{ internalConceptType: 'LOAN', cfdiNode: 'DEDUCTION' },
				{ internalConceptType: 'IMSS_EMPLOYEE', cfdiNode: 'DEDUCTION' },
				{ internalConceptType: 'ISR', cfdiNode: 'DEDUCTION' },
				{ internalConceptType: 'SUBSIDY_APPLIED', cfdiNode: 'OTHER_PAYMENT' },
			]),
		);
	});

	it('extracts the persisted employment subsidy using the voucher concept key', () => {
		const concepts = extractPersistedPayrollConcepts([
			{
				totalPay: '0.00',
				fiscalGrossPay: null,
				overtimeDoublePay: '0.00',
				overtimeTriplePay: '0.00',
				sundayPremiumAmount: '0.00',
				mandatoryRestDayPremiumAmount: '0.00',
				vacationPayAmount: '0.00',
				vacationPremiumAmount: '0.00',
				deductionsBreakdown: [],
				taxBreakdown: {
					informationalLines: {
						subsidyCaused: 123.34,
					},
				},
			},
		]);

		expect(concepts).toEqual([
			{
				internalConceptType: 'SUBSIDY_APPLIED',
				cfdiNode: 'OTHER_PAYMENT',
			},
		]);
	});

	it('feeds persisted extra concepts into preflight mapping validation', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			payrollRun: {
				...completePayrollRun,
				concepts: extractPersistedPayrollConcepts([
					{
						totalPay: '5000.00',
						fiscalGrossPay: null,
						overtimeDoublePay: '120.00',
						overtimeTriplePay: '0.00',
						sundayPremiumAmount: '0.00',
						mandatoryRestDayPremiumAmount: '0.00',
						vacationPayAmount: '0.00',
						vacationPremiumAmount: '0.00',
						deductionsBreakdown: [],
						taxBreakdown: null,
					},
				]),
			},
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'UNMAPPED_PAYROLL_CONCEPT',
					field: 'payrollRun.concepts.OVERTIME_DOUBLE',
				}),
			]),
		);
	});
});

describe('payroll fiscal preflight database adapter', () => {
	it('blocks persisted extra payroll concepts loaded by buildPayrollFiscalPreflight when mapping is missing', async () => {
		const provider: PayrollFiscalPreflightDataProvider = {
			async loadPayrollFiscalPreflightData() {
				return {
					payrollRun: {
						id: 'run-weekly-1',
						organizationId: 'org-1',
						paymentFrequency: 'WEEKLY',
						status: 'PROCESSED',
						periodStart: new Date('2026-04-13T00:00:00.000Z'),
						periodEnd: new Date('2026-04-19T00:00:00.000Z'),
					},
					runEmployees: [
						{
							line: {
								employeeId: 'emp-1',
								totalPay: '5000.00',
								fiscalGrossPay: null,
								overtimeDoublePay: '120.00',
								overtimeTriplePay: '0.00',
								sundayPremiumAmount: '0.00',
								mandatoryRestDayPremiumAmount: '0.00',
								vacationPayAmount: '0.00',
								vacationPremiumAmount: '0.00',
								deductionsBreakdown: [],
								taxBreakdown: null,
							},
							employee: {
								id: 'emp-1',
								firstName: 'Persona',
								lastName: 'Uno',
							},
						},
					],
					organizationProfile: completeOrganizationProfile,
					employeeProfiles: [
						{
							employeeId: 'emp-1',
							...completeEmployeeFiscalProfile,
						},
					],
					catalogEntries: completeCatalogEntries,
					conceptMappings: completeConceptMappings,
				};
			},
		};
		setPayrollFiscalPreflightDataProviderForTest(provider);

		const result = await buildPayrollFiscalPreflight({
			organizationId: 'org-1',
			payrollRunId: 'run-weekly-1',
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'UNMAPPED_PAYROLL_CONCEPT',
					field: 'payrollRun.concepts.OVERTIME_DOUBLE',
				}),
			]),
		);
	});

	it('uses the persisted payment date for database-backed catalog checks when available', async () => {
		const provider: PayrollFiscalPreflightDataProvider = {
			async loadPayrollFiscalPreflightData() {
				return {
					payrollRun: {
						id: 'run-weekly-1',
						organizationId: 'org-1',
						paymentFrequency: 'WEEKLY',
						status: 'PROCESSED',
						periodStart: new Date('2026-04-13T00:00:00.000Z'),
						periodEnd: new Date('2026-04-19T00:00:00.000Z'),
						paymentDate: new Date('2026-04-21T00:00:00.000Z'),
					},
					runEmployees: [
						{
							line: {
								employeeId: 'emp-1',
								totalPay: '5000.00',
								fiscalGrossPay: null,
								overtimeDoublePay: '0.00',
								overtimeTriplePay: '0.00',
								sundayPremiumAmount: '0.00',
								mandatoryRestDayPremiumAmount: '0.00',
								vacationPayAmount: '0.00',
								vacationPremiumAmount: '0.00',
								deductionsBreakdown: [],
								taxBreakdown: null,
							},
							employee: {
								id: 'emp-1',
								firstName: 'Persona',
								lastName: 'Uno',
							},
						},
					],
					organizationProfile: completeOrganizationProfile,
					employeeProfiles: [
						{
							employeeId: 'emp-1',
							...completeEmployeeFiscalProfile,
						},
					],
					catalogEntries: completeCatalogEntries.map((entry) => ({
						...entry,
						validTo: '2026-04-19',
					})),
					conceptMappings: completeConceptMappings,
				};
			},
		};
		setPayrollFiscalPreflightDataProviderForTest(provider);

		const result = await buildPayrollFiscalPreflight({
			organizationId: 'org-1',
			payrollRunId: 'run-weekly-1',
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues.map((issue) => issue.code)).toContain(
			'CATALOG_CODE_INVALID',
		);
	});

	it('does not expose employee rows when the scoped run is missing', async () => {
		const provider: PayrollFiscalPreflightDataProvider = {
			async loadPayrollFiscalPreflightData() {
				return {
					payrollRun: null,
					runEmployees: [
						{
							line: {
								employeeId: 'foreign-emp',
								totalPay: '5000.00',
								fiscalGrossPay: null,
								overtimeDoublePay: '0.00',
								overtimeTriplePay: '0.00',
								sundayPremiumAmount: '0.00',
								mandatoryRestDayPremiumAmount: '0.00',
								vacationPayAmount: '0.00',
								vacationPremiumAmount: '0.00',
								deductionsBreakdown: [],
								taxBreakdown: null,
							},
							employee: {
								id: 'foreign-emp',
								firstName: 'Ajeno',
								lastName: 'Uno',
							},
						},
					],
					organizationProfile: completeOrganizationProfile,
					employeeProfiles: [],
					catalogEntries: completeCatalogEntries,
					conceptMappings: completeConceptMappings,
				};
			},
		};
		setPayrollFiscalPreflightDataProviderForTest(provider);

		const result = await buildPayrollFiscalPreflight({
			organizationId: 'org-1',
			payrollRunId: 'foreign-run',
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.employeeResults).toEqual([]);
		expect(result.summary.employeesTotal).toBe(0);
		expect(result.organizationIssues.map((issue) => issue.code)).toContain(
			'UNSUPPORTED_PAYROLL_RUN_TYPE',
		);
	});
});

describe('payroll fiscal preflight evaluation', () => {
	it('blocks when the organization fiscal profile is incomplete', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			organizationProfile: {
				...completeOrganizationProfile,
				legalName: '',
				rfc: 'invalid',
				employerRegistrationNumber: null,
			},
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				'ORG_RFC_INVALID',
				'ORG_LEGAL_NAME_REQUIRED',
				'ORG_EMPLOYER_REGISTRATION_REQUIRED',
			]),
		);
	});

	it('distinguishes invalid organization expedition postal code format from a missing value', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			organizationProfile: {
				...completeOrganizationProfile,
				expeditionPostalCode: '6400A',
			},
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'ORG_EXPEDITION_POSTAL_CODE_INVALID',
					field: 'organizationProfile.expeditionPostalCode',
				}),
			]),
		);
		expect(result.organizationIssues.map((issue) => issue.code)).not.toContain(
			'ORG_EXPEDITION_POSTAL_CODE_REQUIRED',
		);
	});

	it('blocks employees when their fiscal profile is incomplete', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			employees: [
				{
					employeeId: 'emp-1',
					displayName: 'Persona Uno',
					fiscalProfile: {
						...completeEmployeeFiscalProfile,
						satName: '',
						curp: 'invalid',
						socialSecurityNumber: null,
						salaryBaseContribution: '-1.00',
						integratedDailySalary: '',
					},
				},
			],
		});

		const [employee] = result.employeeResults;
		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(employee?.status).toBe('BLOCKED');
		expect(employee?.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				'EMPLOYEE_SAT_NAME_REQUIRED',
				'EMPLOYEE_CURP_INVALID',
				'EMPLOYEE_NSS_REQUIRED',
				'EMPLOYEE_SALARY_BASE_REQUIRED',
				'EMPLOYEE_INTEGRATED_DAILY_SALARY_REQUIRED',
			]),
		);
	});

	it('blocks employees when CFDI receptor fiscal fields are missing', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			employees: [
				{
					employeeId: 'emp-1',
					displayName: 'Persona Uno',
					fiscalProfile: {
						...completeEmployeeFiscalProfile,
						fiscalRegimeCode: '',
						cfdiUseCode: null,
					},
				},
			],
		});

		const [employee] = result.employeeResults;
		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(employee?.status).toBe('BLOCKED');
		expect(employee?.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'EMPLOYEE_FISCAL_REGIME_REQUIRED',
					field: 'employeeFiscalProfile.fiscalRegimeCode',
				}),
				expect.objectContaining({
					code: 'EMPLOYEE_CFDI_USE_REQUIRED',
					field: 'employeeFiscalProfile.cfdiUseCode',
				}),
			]),
		);
	});

	it('blocks employees when CFDI use is not CN01', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			catalogEntries: [
				...completeCatalogEntries,
				{
					catalogName: 'c_UsoCFDI',
					code: 'G03',
					validFrom: '2022-01-01',
					validTo: null,
					isActive: true,
				},
			],
			employees: [
				{
					employeeId: 'emp-1',
					displayName: 'Persona Uno',
					fiscalProfile: {
						...completeEmployeeFiscalProfile,
						cfdiUseCode: 'G03',
					},
				},
			],
		});

		const [employee] = result.employeeResults;
		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(employee?.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'EMPLOYEE_CFDI_USE_UNSUPPORTED',
					field: 'employeeFiscalProfile.cfdiUseCode',
				}),
			]),
		);
	});

	it('blocks when a payroll concept does not have an active mapping', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			conceptMappings: completeConceptMappings.filter(
				(mapping) => mapping.internalConceptType !== 'SEVENTH_DAY',
			),
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.summary.unsupportedConcepts).toBe(1);
		expect(result.organizationIssues.map((issue) => issue.code)).toContain(
			'UNMAPPED_PAYROLL_CONCEPT',
		);
	});

	it('allows custom payroll concepts when an active supported mapping exists', () => {
		const customConceptInput: PayrollFiscalPreflightInput = {
			...completePreflightInput,
			payrollRun: {
				...completePayrollRun,
				concepts: [
					...completePayrollRun.concepts,
					{
						internalConceptType: 'PRODUCTIVITY_BONUS',
						cfdiNode: 'PERCEPTION',
					},
				],
			},
			catalogEntries: [
				...completeCatalogEntries,
				{
					catalogName: 'nomina_c_TipoPercepcion',
					code: '038',
					validFrom: '2022-01-01',
					validTo: null,
					isActive: true,
				},
			],
			conceptMappings: [
				...completeConceptMappings,
				{
					organizationId: 'org-1',
					internalConceptType: 'PRODUCTIVITY_BONUS',
					cfdiNode: 'PERCEPTION',
					satTypeCode: '038',
					isSupportedForStamping: true,
				},
			],
		};

		const supportedResult = evaluatePayrollFiscalPreflight(customConceptInput);
		const missingMappingResult = evaluatePayrollFiscalPreflight({
			...customConceptInput,
			conceptMappings: completeConceptMappings,
		});

		expect(supportedResult.canPrepareFiscalVouchers).toBe(true);
		expect(supportedResult.organizationIssues).toEqual([]);
		expect(missingMappingResult.canPrepareFiscalVouchers).toBe(false);
		expect(missingMappingResult.organizationIssues.map((issue) => issue.code)).toContain(
			'UNMAPPED_PAYROLL_CONCEPT',
		);
	});

	it('blocks unsupported payroll run types', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			payrollRun: {
				...completePayrollRun,
				runType: 'EXTRAORDINARY',
			},
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues.map((issue) => issue.code)).toContain(
			'UNSUPPORTED_PAYROLL_RUN_TYPE',
		);
	});

	it('blocks payroll runs that are not processed', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			payrollRun: {
				...completePayrollRun,
				status: 'DRAFT',
			},
		});

		expect(result.canPrepareFiscalVouchers).toBe(false);
		expect(result.organizationIssues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'PAYROLL_RUN_NOT_PROCESSED',
					field: 'payrollRun.status',
				}),
			]),
		);
	});

	it('uses payment date for catalog effective-date checks', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			catalogEntries: completeCatalogEntries.map((entry) => ({
				...entry,
				validTo: weeklyPayrollFixture.paymentDateKey,
			})),
		});

		expect(result.canPrepareFiscalVouchers).toBe(true);
		expect(result.organizationIssues).toEqual([]);
		expect(result.employeeResults[0]?.issues).toEqual([]);
	});

	it('warns without blocking when a needed catalog version is not loaded', () => {
		const result = evaluatePayrollFiscalPreflight({
			...completePreflightInput,
			catalogEntries: completeCatalogEntries.filter(
				(entry) => entry.catalogName !== 'c_UsoCFDI',
			),
		});

		const [employee] = result.employeeResults;
		expect(result.canPrepareFiscalVouchers).toBe(true);
		expect(employee?.status).toBe('READY');
		expect(employee?.issues).toEqual([]);
		expect(employee?.warnings.map((issue) => issue.code)).toContain(
			'CATALOG_VERSION_UNVERIFIED',
		);
	});

	it('returns READY for the synthetic weekly run with complete profiles and mappings', () => {
		const result = evaluatePayrollFiscalPreflight(completePreflightInput);

		expect(result).toMatchObject({
			organizationId: 'org-1',
			payrollRunId: 'run-weekly-1',
			canPrepareFiscalVouchers: true,
			summary: {
				employeesTotal: 1,
				employeesReady: 1,
				employeesBlocked: 0,
				unsupportedConcepts: 0,
			},
			organizationIssues: [],
			employeeResults: [
				{
					employeeId: 'emp-1',
					employeeNumber: 'E-001',
					displayName: 'Persona Uno',
					status: 'READY',
					issues: [],
					warnings: [],
				},
			],
		});
	});
});
