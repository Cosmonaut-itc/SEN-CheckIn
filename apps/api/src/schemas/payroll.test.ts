import { describe, expect, it } from 'bun:test';

import {
	payrollEmployeeBreakdownSchema,
	payrollWarningSchema,
} from './payroll.js';

describe('payroll schemas', () => {
	it('accepts the lunch-break auto-deducted warning type', () => {
		const result = payrollWarningSchema.safeParse({
			type: 'LUNCH_BREAK_AUTO_DEDUCTED',
			message: 'Se desconto comida',
			severity: 'warning',
		});

		expect(result.success).toBe(true);
	});

	it('exposes lunch-break deduction metrics in employee breakdowns', () => {
		expect(payrollEmployeeBreakdownSchema.shape.lunchBreakAutoDeductedDays).toBeDefined();
		expect(payrollEmployeeBreakdownSchema.shape.lunchBreakAutoDeductedMinutes).toBeDefined();
	});
});
