import { describe, expect, it } from 'bun:test';

import { calculateExtraPaymentTaxes } from './extra-payment-taxes.js';

describe('extra-payment-taxes', () => {
	it('returns full exempt amount when gross is below the exemption cap', () => {
		const result = calculateExtraPaymentTaxes({
			grossAmount: 1000,
			smgDaily: 300,
			exemptDays: 15,
			paymentDateKey: '2026-01-15',
			ordinaryMonthlyIncome: 10000,
		});

		expect(result.exemptAmount).toBe(1000);
		expect(result.taxableAmount).toBe(0);
		expect(result.withheldIsr).toBe(0);
		expect(result.netAmount).toBe(1000);
	});

	it('applies withholding for taxable amounts and respects ordinary income', () => {
		const baseline = calculateExtraPaymentTaxes({
			grossAmount: 100000,
			smgDaily: 300,
			exemptDays: 15,
			paymentDateKey: '2026-01-15',
			ordinaryMonthlyIncome: 0,
		});
		const higherIncome = calculateExtraPaymentTaxes({
			grossAmount: 100000,
			smgDaily: 300,
			exemptDays: 15,
			paymentDateKey: '2026-01-15',
			ordinaryMonthlyIncome: 20000,
		});

		expect(baseline.taxableAmount).toBeGreaterThan(0);
		expect(baseline.withheldIsr).toBeGreaterThan(0);
		expect(baseline.netAmount).toBeLessThan(100000);
		expect(higherIncome.withheldIsr).toBeGreaterThanOrEqual(baseline.withheldIsr);
	});
});
