import { describe, expect, it } from 'bun:test';

import { shouldValidateStaffingRequirementScopeUpdate } from './staffing-requirements.helpers.js';

describe('staffing requirement route helpers', () => {
	it('does not require scope validation for minimum-only updates', () => {
		expect(
			shouldValidateStaffingRequirementScopeUpdate({
				minimumRequired: 4,
			}),
		).toBe(false);
	});

	it('requires scope validation when location or job position changes', () => {
		expect(
			shouldValidateStaffingRequirementScopeUpdate({
				locationId: 'location-1',
			}),
		).toBe(true);
		expect(
			shouldValidateStaffingRequirementScopeUpdate({
				jobPositionId: 'position-1',
			}),
		).toBe(true);
	});
});
