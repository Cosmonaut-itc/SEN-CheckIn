import { describe, expect, it } from 'bun:test';
import { getTableColumns } from 'drizzle-orm';

import { attendanceRecord } from './schema.js';

describe('attendance schema lunch break checkout reason', () => {
	it('exports the supported check-out reason enum values', async () => {
		const schemaModule = await import('./schema.js');

		expect('checkOutReason' in schemaModule).toBe(true);
		if (!('checkOutReason' in schemaModule)) {
			throw new Error('Expected checkOutReason enum export.');
		}

		expect(schemaModule.checkOutReason.enumValues).toEqual([
			'REGULAR',
			'LUNCH_BREAK',
			'PERSONAL',
		]);
	});

	it('adds a nullable checkOutReason column to attendance_record', () => {
		const columns = getTableColumns(attendanceRecord) as Record<string, { notNull: boolean }>;

		expect(columns).toHaveProperty('checkOutReason');
		const checkOutReasonColumn = columns.checkOutReason;
		if (!checkOutReasonColumn) {
			throw new Error('Expected checkOutReason column.');
		}

		expect(checkOutReasonColumn.notNull).toBe(false);
	});
});
