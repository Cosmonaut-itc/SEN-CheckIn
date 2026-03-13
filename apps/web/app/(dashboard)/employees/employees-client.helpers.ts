/**
 * Resolves the fiscal daily pay validation error for employee form submissions.
 *
 * @param args - Submission validation arguments
 * @param args.canManageDualPayrollCompensation - Whether the user can manage dual payroll data
 * @param args.dailyPay - Real daily pay
 * @param args.isEditMode - Whether the form is editing an existing employee
 * @param args.parsedFiscalDailyPay - Parsed fiscal daily pay input
 * @returns Translation key for the validation error, or null when valid
 */
export function getFiscalDailyPaySubmissionError(args: {
	canManageDualPayrollCompensation: boolean;
	dailyPay: number;
	isEditMode: boolean;
	parsedFiscalDailyPay: number | null | undefined;
}): 'validation.fiscalDailyPay' | 'validation.fiscalDailyPayLessThanDailyPay' | null {
	if (!args.canManageDualPayrollCompensation || !args.isEditMode) {
		return null;
	}

	if (args.parsedFiscalDailyPay === undefined) {
		return 'validation.fiscalDailyPay';
	}

	if (args.parsedFiscalDailyPay !== null && args.parsedFiscalDailyPay >= args.dailyPay) {
		return 'validation.fiscalDailyPayLessThanDailyPay';
	}

	return null;
}
