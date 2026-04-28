import { beforeAll, describe, expect, it, mock } from 'bun:test';

mock.module('../db/index.js', () => ({
	default: {},
}));

let routeHelpers: typeof import('./payroll.js');

beforeAll(async () => {
	routeHelpers = await import('./payroll.js');
});

describe('payroll fiscal workflow authorization helpers', () => {
	it('allows owner, admin, payroll-fiscal, and api key callers to access fiscal workflow actions', () => {
		const { canAccessPayrollFiscalWorkflow } = routeHelpers;

		expect(canAccessPayrollFiscalWorkflow({ authType: 'session', role: 'owner' })).toBe(true);
		expect(canAccessPayrollFiscalWorkflow({ authType: 'session', role: 'admin' })).toBe(true);
		expect(
			canAccessPayrollFiscalWorkflow({ authType: 'session', role: 'payroll-fiscal' }),
		).toBe(true);
		expect(canAccessPayrollFiscalWorkflow({ authType: 'apiKey', role: null })).toBe(true);
		expect(canAccessPayrollFiscalWorkflow({ authType: 'session', role: 'member' })).toBe(false);
		expect(canAccessPayrollFiscalWorkflow({ authType: 'session', role: null })).toBe(false);
	});
});
