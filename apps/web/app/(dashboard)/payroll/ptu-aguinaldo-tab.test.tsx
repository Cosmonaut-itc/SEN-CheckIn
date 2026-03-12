import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';
import type { PayrollSettings } from '@/lib/client-functions';

import { PtuTab } from './ptu-tab';
import { AguinaldoTab } from './aguinaldo-tab';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchPtuRuns: vi.fn().mockResolvedValue([]),
		fetchPtuRunDetail: vi.fn().mockResolvedValue(null),
		calculatePtu: vi.fn(),
		createPtuRun: vi.fn(),
		updatePtuRun: vi.fn(),
		processPtuRun: vi.fn(),
		cancelPtuRun: vi.fn(),
		fetchAguinaldoRuns: vi.fn().mockResolvedValue([]),
		fetchAguinaldoRunDetail: vi.fn().mockResolvedValue(null),
		calculateAguinaldo: vi.fn(),
		createAguinaldoRun: vi.fn(),
		updateAguinaldoRun: vi.fn(),
		processAguinaldoRun: vi.fn(),
		cancelAguinaldoRun: vi.fn(),
	};
});

/**
 * Builds a minimal payroll settings object for UI tests.
 *
 * @param overrides - Partial overrides for base settings
 * @returns Payroll settings object
 */
function buildSettings(overrides: Partial<PayrollSettings> = {}): PayrollSettings {
	return {
		id: 'settings-1',
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
		ptuEnabled: true,
		ptuMode: 'DEFAULT_RULES',
		ptuIsExempt: false,
		ptuExemptReason: null,
		employerType: 'PERSONA_MORAL',
		aguinaldoEnabled: true,
		enableDisciplinaryMeasures: false,
		autoDeductLunchBreak: false,
		lunchBreakMinutes: 60,
		lunchBreakThresholdHours: 6,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides,
	};
}

/**
 * Renders UI with query, org, and intl providers.
 *
 * @param ui - React element to render
 * @returns Render result
 */
function renderWithProviders(ui: React.ReactElement) {
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
					organizationSlug: 'org-1',
					organizationName: 'Org Test',
					organizationRole: 'owner',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					{ui}
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('PTU and Aguinaldo tabs', () => {
	it('shows disabled state when PTU is off', () => {
		renderWithProviders(
			<PtuTab settings={buildSettings({ ptuEnabled: false })} isLoading={false} />,
		);
		expect(screen.getByText('disabled.title')).toBeInTheDocument();
	});

	it('shows disabled state when Aguinaldo is off', () => {
		renderWithProviders(
			<AguinaldoTab
				settings={buildSettings({ aguinaldoEnabled: false })}
				isLoading={false}
			/>,
		);
		expect(screen.getByText('disabled.title')).toBeInTheDocument();
	});
});
