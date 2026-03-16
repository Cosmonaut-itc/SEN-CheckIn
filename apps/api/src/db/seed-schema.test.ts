import { describe, expect, it } from 'bun:test';

import { seedSchema } from './seed-schema.js';

describe('seedSchema', () => {
	it('includes the domain tables added for employee lifecycle and overtime flows', () => {
		expect(seedSchema).toHaveProperty('client');
		expect(seedSchema).toHaveProperty('employeeAuditEvent');
		expect(seedSchema).toHaveProperty('employeeTerminationSettlement');
		expect(seedSchema).toHaveProperty('employeeIncapacity');
		expect(seedSchema).toHaveProperty('employeeIncapacityDocument');
		expect(seedSchema).toHaveProperty('employeeDocumentVersion');
		expect(seedSchema).toHaveProperty('overtimeAuthorization');
		expect(seedSchema).toHaveProperty('employeeDeduction');
	});
});
