import { beforeAll, describe, expect, it, mock } from 'bun:test';

mock.module('../db/index.js', () => ({
	default: {},
}));

let routeHelpers: typeof import('./payroll-fiscal.js');

beforeAll(async () => {
	routeHelpers = await import('./payroll-fiscal.js');
});

describe('payroll fiscal route authorization helpers', () => {
	it('allows owner, admin, payroll-fiscal, and api key callers to access fiscal profiles', () => {
		const { canAccessPayrollFiscalProfiles } = routeHelpers;

		expect(canAccessPayrollFiscalProfiles({ authType: 'session', role: 'owner' })).toBe(true);
		expect(canAccessPayrollFiscalProfiles({ authType: 'session', role: 'admin' })).toBe(true);
		expect(
			canAccessPayrollFiscalProfiles({ authType: 'session', role: 'payroll-fiscal' }),
		).toBe(true);
		expect(canAccessPayrollFiscalProfiles({ authType: 'apiKey', role: null })).toBe(true);
		expect(canAccessPayrollFiscalProfiles({ authType: 'session', role: 'member' })).toBe(false);
		expect(canAccessPayrollFiscalProfiles({ authType: 'session', role: null })).toBe(false);
	});

	it('reveals sensitive fiscal data only to owner, admin, and api key callers', () => {
		const { canRevealPayrollFiscalSensitiveData } = routeHelpers;

		expect(canRevealPayrollFiscalSensitiveData({ authType: 'session', role: 'owner' })).toBe(
			true,
		);
		expect(canRevealPayrollFiscalSensitiveData({ authType: 'session', role: 'admin' })).toBe(
			true,
		);
		expect(canRevealPayrollFiscalSensitiveData({ authType: 'apiKey', role: null })).toBe(true);
		expect(
			canRevealPayrollFiscalSensitiveData({ authType: 'session', role: 'payroll-fiscal' }),
		).toBe(false);
		expect(canRevealPayrollFiscalSensitiveData({ authType: 'session', role: 'member' })).toBe(
			false,
		);
	});

	it('masks bank accounts while preserving the last four digits', () => {
		const { maskBankAccount } = routeHelpers;

		expect(maskBankAccount(null)).toBeNull();
		expect(maskBankAccount('')).toBeNull();
		expect(maskBankAccount('7856')).toBe('7856');
		expect(maskBankAccount('0123456789017856')).toBe('************7856');
	});

	it('marks organization fiscal profiles incomplete until required issuer fields are present', () => {
		const { buildOrganizationFiscalProfileResponse } = routeHelpers;
		const now = new Date('2026-04-28T00:00:00.000Z');

		const fiscalProfileRow = {
			id: 'org-fiscal-profile-1',
			organizationId: 'org-1',
			legalName: 'Acme SA de CV',
			rfc: 'AAA010101AAA',
			fiscalRegimeCode: '601',
			expeditionPostalCode: '01000',
			employerRegistrationNumber: null,
			defaultFederalEntityCode: null,
			payrollCfdiSeries: null,
			payrollStampingMode: 'PER_RUN' as const,
			csdCertificateSerial: null,
			csdCertificateValidFrom: null,
			csdCertificateValidTo: null,
			csdSecretRef: null,
			pacProvider: null,
			pacCredentialsSecretRef: null,
			createdAt: now,
			updatedAt: now,
		};
		const incomplete = buildOrganizationFiscalProfileResponse(fiscalProfileRow);
		const complete = buildOrganizationFiscalProfileResponse({
			...fiscalProfileRow,
			employerRegistrationNumber: 'Y1234567890',
		});

		expect(incomplete.status).toBe('INCOMPLETE');
		expect(complete.status).toBe('COMPLETE');
	});
});
