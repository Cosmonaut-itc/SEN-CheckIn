import { describe, expect, it } from 'bun:test';

import {
	overtimeAuthorizationCreateSchema,
	overtimeAuthorizationUpdateSchema,
} from './overtime-authorizations.js';

describe('overtime authorization schemas', () => {
	it('rejects authorized hours that exceed numeric(5,2) precision on create', () => {
		const result = overtimeAuthorizationCreateSchema.safeParse({
			employeeId: 'emp-1',
			dateKey: '2026-03-25',
			authorizedHours: 1000,
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected create schema validation to fail.');
		}
		expect(result.error.issues[0]?.message).toBe(
			'authorizedHours must be less than or equal to 999.99',
		);
	});

	it('rejects authorized hours that exceed numeric(5,2) precision on update', () => {
		const result = overtimeAuthorizationUpdateSchema.safeParse({
			authorizedHours: 1000,
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected update schema validation to fail.');
		}
		expect(result.error.issues[0]?.message).toBe(
			'authorizedHours must be less than or equal to 999.99',
		);
	});

	it('rejects empty update payloads', () => {
		const result = overtimeAuthorizationUpdateSchema.safeParse({});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected update schema validation to fail.');
		}
		expect(result.error.issues[0]?.message).toBe(
			'At least one field must be provided for update',
		);
	});

	it('rejects pending as an update status target', () => {
		const result = overtimeAuthorizationUpdateSchema.safeParse({
			status: 'PENDING',
		});

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected update schema validation to fail.');
		}
		expect(result.error.issues[0]?.message).toBe(
			"Invalid enum value. Expected 'ACTIVE' | 'CANCELLED', received 'PENDING'",
		);
	});
});
