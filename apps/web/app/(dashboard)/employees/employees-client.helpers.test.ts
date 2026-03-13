import { describe, expect, it } from 'vitest';

import { getFiscalDailyPaySubmissionError } from './employees-client.helpers';

describe('getFiscalDailyPaySubmissionError', () => {
	it('skips fiscal daily pay validation while creating employees', () => {
		expect(
			getFiscalDailyPaySubmissionError({
				canManageDualPayrollCompensation: true,
				dailyPay: 300,
				isEditMode: false,
				parsedFiscalDailyPay: undefined,
			}),
		).toBeNull();
	});

	it('requires a valid fiscal daily pay while editing employees with dual payroll access', () => {
		expect(
			getFiscalDailyPaySubmissionError({
				canManageDualPayrollCompensation: true,
				dailyPay: 300,
				isEditMode: true,
				parsedFiscalDailyPay: undefined,
			}),
		).toBe('validation.fiscalDailyPay');
	});

	it('requires fiscal daily pay to stay below the real daily pay while editing', () => {
		expect(
			getFiscalDailyPaySubmissionError({
				canManageDualPayrollCompensation: true,
				dailyPay: 300,
				isEditMode: true,
				parsedFiscalDailyPay: 300,
			}),
		).toBe('validation.fiscalDailyPayLessThanDailyPay');
	});
});
