import { describe, expect, it } from 'bun:test';
import { getTableColumns } from 'drizzle-orm';

import { attendanceRecord, tourProgress } from './schema.js';

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

describe('tour progress schema', () => {
	it('exports the supported tour progress status enum values', async () => {
		const schemaModule = await import('./schema.js');

		expect('tourProgressStatus' in schemaModule).toBe(true);
		if (!('tourProgressStatus' in schemaModule)) {
			throw new Error('Expected tourProgressStatus enum export.');
		}

		expect(schemaModule.tourProgressStatus.enumValues).toEqual(['completed', 'skipped']);
	});

	it('exports the expected tour_progress columns', () => {
		const columns = getTableColumns(tourProgress) as Record<string, { notNull: boolean }>;

		expect(columns).toHaveProperty('id');
		expect(columns).toHaveProperty('userId');
		expect(columns).toHaveProperty('organizationId');
		expect(columns).toHaveProperty('tourId');
		expect(columns).toHaveProperty('status');
		expect(columns).toHaveProperty('completedAt');
		expect(columns.userId?.notNull).toBe(true);
		expect(columns.organizationId?.notNull).toBe(true);
		expect(columns.tourId?.notNull).toBe(true);
		expect(columns.status?.notNull).toBe(true);
		expect(columns.completedAt?.notNull).toBe(true);
	});
});
