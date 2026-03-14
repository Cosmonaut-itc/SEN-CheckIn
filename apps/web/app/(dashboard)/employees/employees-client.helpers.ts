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

/**
 * Resolves the inline helper or error copy for the fiscal daily pay preview.
 *
 * @param args - Preview validation arguments
 * @param args.canManageDualPayrollCompensation - Whether the user can manage dual payroll data
 * @param args.dailyPay - Real daily pay
 * @param args.fiscalDailyPayValue - Raw fiscal daily pay input
 * @param args.isEditMode - Whether the form is editing an existing employee
 * @param args.parsedFiscalDailyPay - Parsed fiscal daily pay input
 * @returns Translation key for the preview feedback copy
 */
export function getFiscalDailyPayPreviewFeedbackKey(args: {
	canManageDualPayrollCompensation: boolean;
	dailyPay: number;
	fiscalDailyPayValue: string;
	isEditMode: boolean;
	parsedFiscalDailyPay: number | null | undefined;
}):
	| 'compensation.liveHelper'
	| 'validation.fiscalDailyPay'
	| 'validation.fiscalDailyPayLessThanDailyPay' {
	if (args.fiscalDailyPayValue.trim() === '') {
		return 'compensation.liveHelper';
	}

	return (
		getFiscalDailyPaySubmissionError({
			canManageDualPayrollCompensation: args.canManageDualPayrollCompensation,
			dailyPay: args.dailyPay,
			isEditMode: args.isEditMode,
			parsedFiscalDailyPay: args.parsedFiscalDailyPay,
		}) ?? 'compensation.liveHelper'
	);
}
