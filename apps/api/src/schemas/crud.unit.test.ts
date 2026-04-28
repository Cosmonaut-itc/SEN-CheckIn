import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createStaffingRequirementSchema,
	updateStaffingRequirementSchema,
} from './crud.js';

describe('staffing requirement CRUD schemas', () => {
	it('rejects blank staffing minimums while allowing explicit zero', () => {
		const baseBody = {
			locationId: randomUUID(),
			jobPositionId: randomUUID(),
		};

		expect(
			createStaffingRequirementSchema.safeParse({
				...baseBody,
				minimumRequired: '',
			}).success,
		).toBe(false);
		expect(
			updateStaffingRequirementSchema.safeParse({
				minimumRequired: '   ',
			}).success,
		).toBe(false);
		expect(
			createStaffingRequirementSchema.safeParse({
				...baseBody,
				minimumRequired: 0,
			}).success,
		).toBe(true);
		expect(
			updateStaffingRequirementSchema.safeParse({
				minimumRequired: '0',
			}).success,
		).toBe(true);
	});

	it('rejects staffing minimums above the Postgres integer range', () => {
		const baseBody = {
			locationId: randomUUID(),
			jobPositionId: randomUUID(),
		};

		expect(
			createStaffingRequirementSchema.safeParse({
				...baseBody,
				minimumRequired: 2_147_483_648,
			}).success,
		).toBe(false);
		expect(
			updateStaffingRequirementSchema.safeParse({
				minimumRequired: '2147483648',
			}).success,
		).toBe(false);
		expect(
			createStaffingRequirementSchema.safeParse({
				...baseBody,
				minimumRequired: 2_147_483_647,
			}).success,
		).toBe(true);
	});
});
