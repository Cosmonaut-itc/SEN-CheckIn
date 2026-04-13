import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const mockUpdatePayrollSettingsAction = vi.fn();

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
	updatePayrollSettingsAction: (...args: unknown[]) => mockUpdatePayrollSettingsAction(...args),
}));

vi.mock('@/components/document-workflow-settings-section', () => ({
	DocumentWorkflowSettingsSection: (): React.ReactElement => (
		<div data-testid="document-workflow-section" />
	),
}));

/**
 * Renders payroll settings client page with query and i18n providers.
 *
 * @param orgOverrides - Optional organization context overrides
 * @returns Render result
 */
function renderWithProviders(
	orgOverrides: Partial<React.ComponentProps<typeof OrgProvider>['value']> = {},
): ReturnType<typeof render> {
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
					organizationRole: 'owner',
					...orgOverrides,
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
		mockUpdatePayrollSettingsAction.mockReset();
		mockUpdatePayrollSettingsAction.mockResolvedValue({ success: true, data: null });
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
			enableDualPayroll: false,
			countSaturdayAsWorkedForSeventhDay: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: false,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
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
		expect(document.getElementById('enableDualPayroll')).toBeInTheDocument();
	});

	it('hides the dual payroll toggle for organization members', async () => {
		renderWithProviders({ organizationRole: 'member', userRole: 'member' });

		await waitFor(() => {
			expect(
				screen.getByText('disciplinary.fields.enableDisciplinaryMeasures'),
			).toBeInTheDocument();
		});

		expect(document.getElementById('enableDualPayroll')).not.toBeInTheDocument();
	});

	it('renders payroll settings in read-only mode for organization members', async () => {
		renderWithProviders({ organizationRole: 'member', userRole: 'member' });

		const riskWorkRateInput = await screen.findByLabelText('taxSettings.fields.riskWorkRate');

		await waitFor(() => {
			expect(riskWorkRateInput).toBeDisabled();
		});
		expect(screen.queryByRole('button', { name: 'save' })).not.toBeInTheDocument();
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
			enableDualPayroll: false,
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

	it('renders lunch break deduction toggle as enabled when settings enable automatic deduction', async () => {
		mockFetchPayrollSettings.mockResolvedValueOnce({
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
			enableDualPayroll: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 45,
			lunchBreakThresholdHours: 7,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders();

		const autoDeductInput = await screen.findByLabelText(
			'lunchBreak.fields.autoDeductLunchBreak',
		);

		await waitFor(() => {
			expect(autoDeductInput).toBeChecked();
		});
	});

	it('submits lunch break deduction settings through the payroll settings action', async () => {
		renderWithProviders();

		const autoDeductInput = await screen.findByLabelText(
			'lunchBreak.fields.autoDeductLunchBreak',
		);
		await waitFor(() => {
			expect(autoDeductInput).not.toBeDisabled();
		});
		fireEvent.click(autoDeductInput);
		fireEvent.click(screen.getByRole('button', { name: 'save' }));

		await waitFor(() => {
			expect(mockUpdatePayrollSettingsAction).toHaveBeenCalledWith(
				expect.objectContaining({
					autoDeductLunchBreak: true,
					lunchBreakMinutes: 60,
					lunchBreakThresholdHours: 6,
				}),
				expect.objectContaining({
					mutationKey: ['payrollSettings', 'update'],
				}),
			);
		});
	});

	it('submits the dual payroll toggle through the payroll settings action', async () => {
		renderWithProviders();

		const dualPayrollInput = await screen.findByLabelText(
			'taxSettings.fields.enableDualPayroll',
		);
		await waitFor(() => {
			expect(dualPayrollInput).not.toBeChecked();
		});
		fireEvent.click(dualPayrollInput);
		await waitFor(() => {
			expect(dualPayrollInput).toBeChecked();
		});
		fireEvent.click(screen.getByRole('button', { name: 'save' }));

		await waitFor(() => {
			expect(mockUpdatePayrollSettingsAction).toHaveBeenCalledWith(
				expect.objectContaining({
					enableDualPayroll: true,
				}),
				expect.objectContaining({
					mutationKey: ['payrollSettings', 'update'],
				}),
			);
		});
	});

	it('submits separated fiscal and real vacation premium rates', async () => {
		renderWithProviders();

		const fiscalRateInput = await screen.findByLabelText(
			'taxSettings.fields.vacationPremiumRate',
		);
		const realRateInput = screen.getByLabelText(
			'taxSettings.fields.realVacationPremiumRate',
		);

		fireEvent.change(fiscalRateInput, { target: { value: '0.30' } });
		fireEvent.change(realRateInput, { target: { value: '0.45' } });
		fireEvent.click(screen.getByRole('button', { name: 'save' }));

		await waitFor(() => {
			expect(mockUpdatePayrollSettingsAction).toHaveBeenCalledWith(
				expect.objectContaining({
					vacationPremiumRate: 0.3,
					realVacationPremiumRate: 0.45,
				}),
				expect.objectContaining({
					mutationKey: ['payrollSettings', 'update'],
				}),
			);
		});
	});

	it('renders dual payroll explainer cards with theme-aware contrast classes', async () => {
		renderWithProviders();

		const realTitle = await screen.findByText('taxSettings.dualPayroll.realTitle');
		const realDescription = screen.getByText('taxSettings.dualPayroll.realDescription');
		const realCard = realTitle.parentElement;

		expect(realCard).not.toBeNull();
		expect(realCard).toHaveClass('bg-[color:var(--bg-elevated)]/95');
		expect(realCard?.className).not.toContain('bg-white/80');
		expect(realTitle).toHaveClass('text-[color:var(--accent-primary)]');
		expect(realDescription).toHaveClass('text-[color:var(--text-secondary)]');
	});

	it('persists valid lunch break fields when automatic deduction is disabled before saving', async () => {
		mockFetchPayrollSettings.mockResolvedValueOnce({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0.1,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			enableDualPayroll: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 45,
			lunchBreakThresholdHours: 7,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders();

		const autoDeductInput = await screen.findByLabelText(
			'lunchBreak.fields.autoDeductLunchBreak',
		);
		await waitFor(() => {
			expect(autoDeductInput).toBeChecked();
			expect(autoDeductInput).not.toBeDisabled();
		});

		fireEvent.click(autoDeductInput);
		fireEvent.click(screen.getByRole('button', { name: 'save' }));

		await waitFor(() => {
			expect(mockUpdatePayrollSettingsAction).toHaveBeenCalled();
		});

		const [payload, options] = mockUpdatePayrollSettingsAction.mock.calls[0] ?? [];
		expect(payload).toMatchObject({
			autoDeductLunchBreak: false,
			lunchBreakMinutes: 45,
			lunchBreakThresholdHours: 7,
		});
		expect(options).toMatchObject({
			mutationKey: ['payrollSettings', 'update'],
		});
	});

	it('omits hidden lunch break fields when their values become invalid', async () => {
		mockFetchPayrollSettings.mockResolvedValueOnce({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0.1,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			enableDualPayroll: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 10,
			lunchBreakThresholdHours: 7,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders();

		const autoDeductInput = await screen.findByLabelText(
			'lunchBreak.fields.autoDeductLunchBreak',
		);
		await waitFor(() => {
			expect(autoDeductInput).toBeChecked();
		});

		fireEvent.click(autoDeductInput);
		fireEvent.click(screen.getByRole('button', { name: 'save' }));

		await waitFor(() => {
			expect(mockUpdatePayrollSettingsAction).toHaveBeenCalled();
		});

		const [payload] = mockUpdatePayrollSettingsAction.mock.calls[0] ?? [];
		expect(payload).toMatchObject({
			autoDeductLunchBreak: false,
		});
		expect(payload).not.toHaveProperty('lunchBreakMinutes');
		expect(payload).not.toHaveProperty('lunchBreakThresholdHours');
	});
});
