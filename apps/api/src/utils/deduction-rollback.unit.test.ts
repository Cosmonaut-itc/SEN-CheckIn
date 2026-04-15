import { describe, expect, it } from 'bun:test';

import { buildDeductionRollbackPlansFromRows } from './deduction-rollback.js';

describe('deduction rollback utils', () => {
	it('coerces persisted numeric strings when rebuilding deduction rollback plans', () => {
		const plans = buildDeductionRollbackPlansFromRows([
			{
				employeeId: 'employee-1',
				deductionsBreakdown: [
					{
						deductionId: 'deduction-1',
						calculationMethod: 'FIXED',
						frequency: 'BIWEEKLY',
						sourceValue: '150.5',
						sourceTotalInstallments: '12',
						completedInstallmentsBefore: '3',
						completedInstallmentsAfter: '4',
						remainingAmountBefore: '1250.25',
						remainingAmountAfter: '1100.75',
						sourceTotalAmount: '1800.00',
						statusBefore: 'PAUSED',
						statusAfter: 'ACTIVE',
						sourceStartDateKey: '2026-04-01',
						sourceEndDateKey: null,
					},
					{
						deductionId: 'deduction-2',
						calculationMethod: 'PERCENTAGE',
						frequency: 'MONTHLY',
						sourceValue: 250,
						sourceTotalInstallments: null,
						completedInstallmentsBefore: 1,
						completedInstallmentsAfter: 1,
						remainingAmountBefore: 300,
						remainingAmountAfter: 300,
						sourceTotalAmount: null,
						statusBefore: 'ACTIVE',
						statusAfter: 'ACTIVE',
						sourceStartDateKey: '2026-04-01',
						sourceEndDateKey: null,
					},
				],
			},
		]);

		expect(plans).toEqual([
			{
				deductionId: 'deduction-1',
				employeeId: 'employee-1',
				statusBefore: 'PAUSED',
				statusAfter: 'ACTIVE',
				completedInstallmentsBefore: 3,
				completedInstallmentsAfter: 4,
				remainingAmountBefore: '1250.25',
				remainingAmountAfter: '1100.75',
				calculationMethod: 'FIXED',
				frequency: 'BIWEEKLY',
				sourceValue: '150.5000',
				sourceTotalInstallments: 12,
				sourceTotalAmount: '1800.00',
				sourceStartDateKey: '2026-04-01',
				sourceEndDateKey: null,
			},
		]);
	});

	it('rejects malformed numeric strings in persisted deduction snapshots', () => {
		expect(() =>
			buildDeductionRollbackPlansFromRows([
				{
					employeeId: 'employee-1',
					deductionsBreakdown: [
						{
							deductionId: 'deduction-1',
							calculationMethod: 'FIXED',
							frequency: 'BIWEEKLY',
							sourceValue: '150.5.1',
							sourceTotalInstallments: '12',
							completedInstallmentsBefore: '3',
							completedInstallmentsAfter: '4',
							remainingAmountBefore: '1250.25',
							remainingAmountAfter: '1100.75',
							sourceTotalAmount: '1800.00',
							statusBefore: 'PAUSED',
							statusAfter: 'ACTIVE',
							sourceStartDateKey: '2026-04-01',
							sourceEndDateKey: null,
						},
					],
				},
			]),
		).toThrow();
	});
});
