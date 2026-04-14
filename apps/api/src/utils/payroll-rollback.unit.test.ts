import { describe, expect, it } from 'bun:test';

import { buildGratificationRollbackPlansFromRows } from './payroll-rollback.js';

describe('payroll rollback utils', () => {
	it('rebuilds gratification status transitions from the persisted snapshot', () => {
		const plans = buildGratificationRollbackPlansFromRows([
			{
				employeeId: 'employee-1',
				taxBreakdown: {
					gratificationsBreakdown: [
						{
							gratificationId: 'gratification-1',
							periodicity: 'ONE_TIME',
							applicationMode: 'MANUAL',
							sourceAmount: '1200.00',
							sourceStartDateKey: '2026-04-01',
							sourceEndDateKey: null,
							statusBefore: 'ACTIVE',
							statusAfter: 'COMPLETED',
							notes: null,
						},
						{
							gratificationId: 'gratification-2',
							periodicity: 'RECURRING',
							applicationMode: 'AUTOMATIC',
							sourceAmount: 500,
							sourceStartDateKey: '2026-04-01',
							sourceEndDateKey: '2026-04-30',
							statusBefore: 'ACTIVE',
							statusAfter: 'ACTIVE',
							notes: 'unchanged',
						},
					],
				},
			},
		]);

		expect(plans).toEqual([
			{
				gratificationId: 'gratification-1',
				employeeId: 'employee-1',
				statusBefore: 'ACTIVE',
				statusAfter: 'COMPLETED',
				sourceAmount: '1200.00',
				periodicity: 'ONE_TIME',
				applicationMode: 'MANUAL',
				sourceStartDateKey: '2026-04-01',
				sourceEndDateKey: null,
				notes: null,
			},
		]);
	});

	it('rejects malformed persisted source amounts', () => {
		expect(() =>
			buildGratificationRollbackPlansFromRows([
				{
					employeeId: 'employee-1',
					taxBreakdown: {
						gratificationsBreakdown: [
							{
								gratificationId: 'gratification-1',
								periodicity: 'ONE_TIME',
								applicationMode: 'MANUAL',
								sourceAmount: null,
								sourceStartDateKey: '2026-04-01',
								sourceEndDateKey: null,
								statusBefore: 'ACTIVE',
								statusAfter: 'COMPLETED',
								notes: null,
							},
						],
					},
				},
			]),
		).toThrow();
	});
});
