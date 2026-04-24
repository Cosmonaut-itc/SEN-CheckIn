import { roundCurrency, sumMoney } from '../utils/money.js';
import type {
	PayrollCalculationRow,
	PayrollDeductionBreakdownItem,
} from './payroll-calculation.js';
import type {
	PayrollEmployeeWithholdings,
	PayrollInformationalLines,
} from './mexico-payroll-taxes.js';

export type PayrollFiscalVoucherValidationStatus = 'READY_TO_STAMP' | 'BLOCKED';

export type PayrollFiscalVoucherValidationIssueCode =
	| 'ISSUER_RFC_REQUIRED'
	| 'ISSUER_FISCAL_REGIME_REQUIRED'
	| 'ISSUER_EXPEDITION_POSTAL_CODE_REQUIRED'
	| 'RECEIVER_RFC_REQUIRED'
	| 'RECEIVER_CURP_REQUIRED'
	| 'RECEIVER_NSS_REQUIRED'
	| 'RECEIVER_FISCAL_REGIME_REQUIRED'
	| 'RECEIVER_FISCAL_POSTAL_CODE_REQUIRED'
	| 'RECEIVER_CONTRACT_TYPE_REQUIRED'
	| 'RECEIVER_WORKDAY_TYPE_REQUIRED'
	| 'PAYMENT_DATE_REQUIRED'
	| 'PERCEPTION_SAT_CODE_REQUIRED'
	| 'PERCEPTION_AMOUNT_INVALID'
	| 'DEDUCTION_SAT_CODE_REQUIRED'
	| 'NET_PAY_TOTAL_MISMATCH';

export interface PayrollFiscalVoucherValidationIssue {
	code: PayrollFiscalVoucherValidationIssueCode;
	field: string;
	message: string;
}

export interface PayrollFiscalVoucherValidationResult {
	status: PayrollFiscalVoucherValidationStatus;
	errors: PayrollFiscalVoucherValidationIssue[];
	warnings: PayrollFiscalVoucherValidationIssue[];
}

export interface PayrollFiscalIssuer {
	name: string | null;
	rfc: string | null;
	fiscalRegime: string | null;
	expeditionPostalCode: string | null;
}

export interface PayrollFiscalReceiver {
	name: string;
	rfc: string | null;
	curp: string | null;
	nss: string | null;
	fiscalRegime: string | null;
	fiscalPostalCode: string | null;
	contractType: string | null;
	workdayType: string | null;
}

export type PayrollFiscalPerceptionInternalType = 'FISCAL_GROSS_PAY';

export interface PayrollFiscalPerceptionLine {
	internalType: PayrollFiscalPerceptionInternalType;
	satTypeCode: string;
	internalCode: string;
	description: string;
	taxedAmount: number;
	exemptAmount: number;
	totalAmount: number;
}

export type PayrollFiscalDeductionInternalType =
	| 'IMSS_EMPLOYEE'
	| 'ISR'
	| 'INFONAVIT'
	| 'ALIMONY'
	| 'FONACOT'
	| 'LOAN'
	| 'UNION_FEE'
	| 'ADVANCE'
	| 'OTHER';

export interface PayrollFiscalDeductionLine {
	internalType: PayrollFiscalDeductionInternalType;
	satTypeCode: string;
	internalCode: string;
	description: string;
	amount: number;
}

export interface PayrollFiscalOtherPaymentLine {
	internalType: 'SUBSIDY_APPLIED';
	satTypeCode: string;
	internalCode: string;
	description: string;
	amount: number;
}

export interface PayrollFiscalVoucherTotals {
	totalPerceptions: number;
	totalDeductions: number;
	totalOtherPayments: number;
	netPay: number;
}

export interface PayrollFiscalVoucher {
	payrollRunId: string;
	payrollRunEmployeeId: string;
	organizationId: string;
	employeeId: string;
	issuer: PayrollFiscalIssuer;
	receiver: PayrollFiscalReceiver;
	paymentFrequency: PayrollCalculationRow['paymentFrequency'];
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentDateKey: string | null;
	perceptions: PayrollFiscalPerceptionLine[];
	deductions: PayrollFiscalDeductionLine[];
	otherPayments: PayrollFiscalOtherPaymentLine[];
	totals: PayrollFiscalVoucherTotals;
	employeeWithholdings: PayrollEmployeeWithholdings;
	informationalLines: PayrollInformationalLines;
	realPayrollComplementPay: number | null;
}

export interface BuildPayrollFiscalVoucherArgs {
	row: PayrollCalculationRow;
	payrollRunId: string;
	payrollRunEmployeeId: string;
	organizationId: string;
	issuer: PayrollFiscalIssuer;
	receiver: PayrollFiscalReceiver;
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentDateKey: string | null;
}

const SAT_PERCEPTION_SALARY_CODE = '001';
const SAT_DEDUCTION_IMSS_CODE = '001';
const SAT_DEDUCTION_ISR_CODE = '002';

/**
 * Checks whether a value has non-whitespace text.
 *
 * @param value - Candidate text value
 * @returns True when the value is a non-empty string
 */
function hasText(value: string | null): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Creates a validation issue object.
 *
 * @param code - Stable issue code
 * @param field - Field path associated with the issue
 * @param message - Human-readable issue description
 * @returns Validation issue
 */
function createIssue(
	code: PayrollFiscalVoucherValidationIssueCode,
	field: string,
	message: string,
): PayrollFiscalVoucherValidationIssue {
	return { code, field, message };
}

/**
 * Resolves the amount that belongs on the fiscal CFDI-facing payroll voucher.
 *
 * @param row - Payroll calculation row
 * @returns Fiscal gross when present, otherwise real gross
 */
function resolveFiscalGrossPay(row: PayrollCalculationRow): number {
	return roundCurrency(row.fiscalGrossPay ?? row.grossPay);
}

/**
 * Builds the base salary/raya perception line used by the current payroll engine.
 *
 * @param amount - Fiscal gross amount
 * @returns Fiscal perception line
 */
function buildFiscalGrossPerception(amount: number): PayrollFiscalPerceptionLine {
	return {
		internalType: 'FISCAL_GROSS_PAY',
		satTypeCode: SAT_PERCEPTION_SALARY_CODE,
		internalCode: 'FISCAL_GROSS_PAY',
		description: 'Sueldos, salarios, rayas y jornales',
		taxedAmount: amount,
		exemptAmount: 0,
		totalAmount: amount,
	};
}

/**
 * Converts employee ISR/IMSS withholdings into SAT deduction lines.
 *
 * @param employeeWithholdings - Employee fiscal withholding breakdown
 * @returns Fiscal deduction lines for payroll taxes withheld from the employee
 */
function buildWithholdingDeductionLines(
	employeeWithholdings: PayrollEmployeeWithholdings,
): PayrollFiscalDeductionLine[] {
	const deductions: PayrollFiscalDeductionLine[] = [];

	if (employeeWithholdings.imssEmployee.total > 0) {
		deductions.push({
			internalType: 'IMSS_EMPLOYEE',
			satTypeCode: SAT_DEDUCTION_IMSS_CODE,
			internalCode: 'IMSS_EMPLOYEE',
			description: 'Seguridad social',
			amount: roundCurrency(employeeWithholdings.imssEmployee.total),
		});
	}

	if (employeeWithholdings.isrWithheld > 0) {
		deductions.push({
			internalType: 'ISR',
			satTypeCode: SAT_DEDUCTION_ISR_CODE,
			internalCode: 'ISR',
			description: 'ISR',
			amount: roundCurrency(employeeWithholdings.isrWithheld),
		});
	}

	return deductions;
}

/**
 * Converts configured employee deductions with SAT codes into fiscal voucher lines.
 *
 * @param deductionsBreakdown - Payroll deduction calculation rows
 * @returns SAT-coded fiscal deduction lines
 */
function buildConfiguredDeductionLines(
	deductionsBreakdown: PayrollDeductionBreakdownItem[],
): PayrollFiscalDeductionLine[] {
	return deductionsBreakdown
		.filter((deduction) => deduction.appliedAmount > 0 && hasText(deduction.satDeductionCode))
		.map((deduction) => ({
			internalType: deduction.type,
			satTypeCode: deduction.satDeductionCode ?? '',
			internalCode: deduction.deductionId,
			description: deduction.label,
			amount: roundCurrency(deduction.appliedAmount),
		}));
}

/**
 * Builds SAT other-payment lines from informational payroll values.
 *
 * @returns Fiscal other-payment lines
 */
function buildOtherPaymentLines(): PayrollFiscalOtherPaymentLine[] {
	return [];
}

/**
 * Builds a deterministic fiscal voucher from a payroll calculation row.
 *
 * @param args - Voucher construction arguments
 * @returns Fiscal voucher snapshot ready for validation
 */
export function buildPayrollFiscalVoucherFromCalculationRow(
	args: BuildPayrollFiscalVoucherArgs,
): PayrollFiscalVoucher {
	const fiscalGrossPay = resolveFiscalGrossPay(args.row);
	const perceptions = [buildFiscalGrossPerception(fiscalGrossPay)];
	const deductions = [
		...buildWithholdingDeductionLines(args.row.employeeWithholdings),
		...buildConfiguredDeductionLines(args.row.deductionsBreakdown),
	];
	const otherPayments = buildOtherPaymentLines();
	const totalPerceptions = sumMoney(perceptions.map((line) => line.totalAmount));
	const totalDeductions = sumMoney(deductions.map((line) => line.amount));
	const totalOtherPayments = sumMoney(otherPayments.map((line) => line.amount));

	return {
		payrollRunId: args.payrollRunId,
		payrollRunEmployeeId: args.payrollRunEmployeeId,
		organizationId: args.organizationId,
		employeeId: args.row.employeeId,
		issuer: args.issuer,
		receiver: args.receiver,
		paymentFrequency: args.row.paymentFrequency,
		periodStartDateKey: args.periodStartDateKey,
		periodEndDateKey: args.periodEndDateKey,
		paymentDateKey: args.paymentDateKey,
		perceptions,
		deductions,
		otherPayments,
		totals: {
			totalPerceptions,
			totalDeductions,
			totalOtherPayments,
			netPay: roundCurrency(totalPerceptions + totalOtherPayments - totalDeductions),
		},
		employeeWithholdings: args.row.employeeWithholdings,
		informationalLines: args.row.informationalLines,
		realPayrollComplementPay: args.row.complementPay,
	};
}

/**
 * Validates a fiscal payroll voucher before it can be stamped.
 *
 * @param voucher - Fiscal voucher snapshot
 * @returns Validation status plus blocking errors and warnings
 */
export function validatePayrollFiscalVoucher(
	voucher: PayrollFiscalVoucher,
): PayrollFiscalVoucherValidationResult {
	const errors: PayrollFiscalVoucherValidationIssue[] = [];

	if (!hasText(voucher.issuer.rfc)) {
		errors.push(createIssue('ISSUER_RFC_REQUIRED', 'issuer.rfc', 'Issuer RFC is required.'));
	}
	if (!hasText(voucher.issuer.fiscalRegime)) {
		errors.push(
			createIssue(
				'ISSUER_FISCAL_REGIME_REQUIRED',
				'issuer.fiscalRegime',
				'Issuer fiscal regime is required.',
			),
		);
	}
	if (!hasText(voucher.issuer.expeditionPostalCode)) {
		errors.push(
			createIssue(
				'ISSUER_EXPEDITION_POSTAL_CODE_REQUIRED',
				'issuer.expeditionPostalCode',
				'Issuer expedition postal code is required.',
			),
		);
	}
	if (!hasText(voucher.receiver.rfc)) {
		errors.push(createIssue('RECEIVER_RFC_REQUIRED', 'receiver.rfc', 'Receiver RFC is required.'));
	}
	if (!hasText(voucher.receiver.curp)) {
		errors.push(
			createIssue('RECEIVER_CURP_REQUIRED', 'receiver.curp', 'Receiver CURP is required.'),
		);
	}
	if (!hasText(voucher.receiver.nss)) {
		errors.push(createIssue('RECEIVER_NSS_REQUIRED', 'receiver.nss', 'Receiver NSS is required.'));
	}
	if (!hasText(voucher.receiver.fiscalRegime)) {
		errors.push(
			createIssue(
				'RECEIVER_FISCAL_REGIME_REQUIRED',
				'receiver.fiscalRegime',
				'Receiver fiscal regime is required.',
			),
		);
	}
	if (!hasText(voucher.receiver.fiscalPostalCode)) {
		errors.push(
			createIssue(
				'RECEIVER_FISCAL_POSTAL_CODE_REQUIRED',
				'receiver.fiscalPostalCode',
				'Receiver fiscal postal code is required.',
			),
		);
	}
	if (!hasText(voucher.receiver.contractType)) {
		errors.push(
			createIssue(
				'RECEIVER_CONTRACT_TYPE_REQUIRED',
				'receiver.contractType',
				'Receiver contract type is required.',
			),
		);
	}
	if (!hasText(voucher.receiver.workdayType)) {
		errors.push(
			createIssue(
				'RECEIVER_WORKDAY_TYPE_REQUIRED',
				'receiver.workdayType',
				'Receiver workday type is required.',
			),
		);
	}
	if (!hasText(voucher.paymentDateKey)) {
		errors.push(
			createIssue(
				'PAYMENT_DATE_REQUIRED',
				'paymentDateKey',
				'Payroll voucher payment date is required.',
			),
		);
	}

	for (const [index, perception] of voucher.perceptions.entries()) {
		if (!hasText(perception.satTypeCode)) {
			errors.push(
				createIssue(
					'PERCEPTION_SAT_CODE_REQUIRED',
					`perceptions.${index}.satTypeCode`,
					'Perception SAT code is required.',
				),
			);
		}
		if (perception.totalAmount <= 0) {
			errors.push(
				createIssue(
					'PERCEPTION_AMOUNT_INVALID',
					`perceptions.${index}.totalAmount`,
					'Perception amount must be greater than zero.',
				),
			);
		}
	}

	for (const [index, deduction] of voucher.deductions.entries()) {
		if (!hasText(deduction.satTypeCode)) {
			errors.push(
				createIssue(
					'DEDUCTION_SAT_CODE_REQUIRED',
					`deductions.${index}.satTypeCode`,
					'Deduction SAT code is required.',
				),
			);
		}
	}

	const expectedNetPay = roundCurrency(
		voucher.totals.totalPerceptions +
			voucher.totals.totalOtherPayments -
			voucher.totals.totalDeductions,
	);
	if (roundCurrency(voucher.totals.netPay - expectedNetPay) !== 0) {
		errors.push(
			createIssue(
				'NET_PAY_TOTAL_MISMATCH',
				'totals.netPay',
				'Net pay must match perceptions plus other payments minus deductions.',
			),
		);
	}

	return {
		status: errors.length === 0 ? 'READY_TO_STAMP' : 'BLOCKED',
		errors,
		warnings: [],
	};
}
