import { describe, expect, it } from 'bun:test';

import * as schema from './schema.js';

describe('overtime authorization schema', () => {
	it('exports overtime authorization table and payroll overtime tracking columns', () => {
		expect(schema).toHaveProperty('overtimeAuthorizationStatus');
		expect(schema).toHaveProperty('overtimeAuthorization');

		const overtimeAuthorization = (
			schema as Record<string, Record<string, unknown> | undefined>
		).overtimeAuthorization;
		expect(overtimeAuthorization).toBeDefined();
		expect(overtimeAuthorization).toHaveProperty('organizationId');
		expect(overtimeAuthorization).toHaveProperty('employeeId');
		expect(overtimeAuthorization).toHaveProperty('dateKey');
		expect(overtimeAuthorization).toHaveProperty('authorizedHours');
		expect(overtimeAuthorization).toHaveProperty('authorizedByUserId');
		expect(overtimeAuthorization).toHaveProperty('status');
		expect(overtimeAuthorization).toHaveProperty('notes');

		expect(schema.payrollRunEmployee).toHaveProperty('authorizedOvertimeHours');
		expect(schema.payrollRunEmployee).toHaveProperty('unauthorizedOvertimeHours');
	});
});
