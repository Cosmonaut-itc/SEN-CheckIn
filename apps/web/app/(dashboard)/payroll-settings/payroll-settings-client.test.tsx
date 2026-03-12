import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';
import { PayrollSettingsClient } from './payroll-settings-client';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchPayrollSettings = vi.fn();
const mockFetchPayrollHolidays = vi.fn();
const mockFetchPayrollHolidaySyncStatus = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchPayrollSettings: (...args: unknown[]) => mockFetchPayrollSettings(...args),
		fetchPayrollHolidays: (...args: unknown[]) => mockFetchPayrollHolidays(...args),
		fetchPayrollHolidaySyncStatus: (...args: unknown[]) =>
			mockFetchPayrollHolidaySyncStatus(...args),
	};
});

vi.mock('@/actions/payroll', () => ({
	updatePayrollSettingsAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

vi.mock('@/components/document-workflow-settings-section', () => ({
	DocumentWorkflowSettingsSection: (): React.ReactElement => (
		<div data-testid="document-workflow-section" />
	),
}));

/**
 * Renders payroll settings client page with query and i18n providers.
 *
 * @returns Render result
 */
function renderWithProviders(): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationName: 'Org Test',
					organizationSlug: 'org-test',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<PayrollSettingsClient />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('PayrollSettingsClient', () => {
	beforeEach(() => {
		mockFetchPayrollSettings.mockReset();
		mockFetchPayrollHolidays.mockReset();
		mockFetchPayrollHolidaySyncStatus.mockReset();
		mockFetchPayrollSettings.mockResolvedValue({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			countSaturdayAsWorkedForSeventhDay: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});
		mockFetchPayrollHolidays.mockResolvedValue([]);
		mockFetchPayrollHolidaySyncStatus.mockResolvedValue({
			lastRun: null,
			pendingApprovalCount: 0,
			stale: false,
		});
	});

	it('renders disciplinary module toggle in payroll settings form', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(
				screen.getByText('disciplinary.fields.enableDisciplinaryMeasures'),
			).toBeInTheDocument();
		});
		expect(screen.getByText('holidays.title')).toBeInTheDocument();
		expect(
			document.getElementById('countSaturdayAsWorkedForSeventhDay'),
		).not.toBeInTheDocument();
	});

	it('shows saturday counting toggle only when seventh day pay is enabled', async () => {
		mockFetchPayrollSettings.mockResolvedValue({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: true,
			countSaturdayAsWorkedForSeventhDay: true,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders();

		await waitFor(() => {
			expect(
				document.getElementById('countSaturdayAsWorkedForSeventhDay'),
			).toBeInTheDocument();
		});
	});
});
