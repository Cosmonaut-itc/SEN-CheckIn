import { calculateIsrFromTable } from './mexico-payroll-taxes.js';
import { roundCurrency } from '../utils/money.js';

/**
 * Supported withholding methods for extra payments.
 */
export type ExtraPaymentWithholdingMethod = 'RLISR_174' | 'STANDARD';

/**
 * Tax breakdown for extra payments (PTU/Aguinaldo).
 */
export interface ExtraPaymentTaxBreakdown {
	/** Exempt portion of the payment. */
	exemptAmount: number;
	/** Taxable portion of the payment. */
	taxableAmount: number;
	/** ISR withheld for the payment. */
	withheldIsr: number;
	/** Net amount after withholding. */
	netAmount: number;
	/** Withholding method applied. */
	withholdingMethod: ExtraPaymentWithholdingMethod;
}

/**
 * Calculates ISR withholding using the RLISR 174 optional method.
 *
 * @param args - RLISR 174 inputs
 * @param args.taxableAmount - Taxable portion of the extra payment
 * @param args.ordinaryMonthlyIncome - Ordinary monthly income base
 * @param args.paymentDateKey - Payment date key (YYYY-MM-DD)
 * @returns ISR withholding amount
 */
export function calculateRlisr174Withholding(args: {
	taxableAmount: number;
	ordinaryMonthlyIncome: number;
	paymentDateKey: string;
}): number {
	const taxableAmount = Math.max(0, args.taxableAmount);
	if (taxableAmount <= 0) {
		return 0;
	}
	const monthlyExtra = (taxableAmount / 365) * 30.4;
	if (monthlyExtra <= 0) {
		return 0;
	}
	const isrWithExtra = calculateIsrFromTable(
		args.ordinaryMonthlyIncome + monthlyExtra,
		'MONTHLY',
		args.paymentDateKey,
	);
	const isrWithoutExtra = calculateIsrFromTable(
		args.ordinaryMonthlyIncome,
		'MONTHLY',
		args.paymentDateKey,
	);
	const isrDiff = Math.max(0, isrWithExtra - isrWithoutExtra);
	const effectiveRate = isrDiff / monthlyExtra;
	return roundCurrency(taxableAmount * effectiveRate);
}

/**
 * Calculates extra payment taxes (exempt/gravado + ISR) using RLISR 174.
 *
 * @param args - Extra payment tax inputs
 * @param args.grossAmount - Gross amount of the payment
 * @param args.smgDaily - SMG daily value for the employee zone
 * @param args.exemptDays - Exempt days multiplier (15 for PTU, 30 for Aguinaldo)
 * @param args.paymentDateKey - Payment date key (YYYY-MM-DD)
 * @param args.ordinaryMonthlyIncome - Ordinary monthly income used for RLISR 174
 * @returns Tax breakdown for the payment
 */
export function calculateExtraPaymentTaxes(args: {
	grossAmount: number;
	smgDaily: number;
	exemptDays: number;
	paymentDateKey: string;
	ordinaryMonthlyIncome: number;
}): ExtraPaymentTaxBreakdown {
	const grossAmount = roundCurrency(Math.max(0, args.grossAmount));
	const exemptCap = roundCurrency(Math.max(0, args.smgDaily) * Math.max(0, args.exemptDays));
	const exemptAmount = roundCurrency(Math.min(grossAmount, exemptCap));
	const taxableAmount = roundCurrency(Math.max(0, grossAmount - exemptAmount));
	const withheldIsr = calculateRlisr174Withholding({
		taxableAmount,
		ordinaryMonthlyIncome: Math.max(0, args.ordinaryMonthlyIncome),
		paymentDateKey: args.paymentDateKey,
	});
	const netAmount = roundCurrency(Math.max(0, grossAmount - withheldIsr));
	return {
		exemptAmount,
		taxableAmount,
		withheldIsr,
		netAmount,
		withholdingMethod: 'RLISR_174',
	};
}
