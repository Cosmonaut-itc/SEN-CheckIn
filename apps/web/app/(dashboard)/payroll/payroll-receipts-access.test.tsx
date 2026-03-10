import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AguinaldoRun, PayrollRun, PtuRun } from '@/lib/client-functions';
import { OrgProvider } from '@/lib/org-client-context';

vi.mock('next-intl', () => ({
	NextIntlClientProvider: ({ children }: { children: React.ReactNode }): React.ReactElement =>
		React.createElement(React.Fragment, null, children),
	useTranslations: () => (key: string) => (key === 'dateFormat' ? 'dd/MM/yyyy' : key),
}));

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchPayrollRunDetail: vi.fn(),
		fetchPtuRunDetail: vi.fn(),
		fetchAguinaldoRunDetail: vi.fn(),
	};
});

import { AguinaldoRunReceiptsDialog } from './aguinaldo-run-receipts-dialog';
import { PayrollRunReceiptsDialog } from './payroll-run-receipts-dialog';
import { PtuRunReceiptsDialog } from './ptu-run-receipts-dialog';

/**
 * Renders a dialog component with query and organization providers.
 *
 * @param ui - Dialog element to render
 * @param organizationRole - Active organization role for the test
 * @returns Render result
 */
function renderWithProviders(
	ui: React.ReactElement,
	organizationRole: 'admin' | 'owner' | 'member',
): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationSlug: 'org-1',
					organizationName: 'Org Test',
					organizationRole,
					userRole: 'user',
				}}
			>
				{ui}
			</OrgProvider>
		</QueryClientProvider>,
	);
}

/**
 * Builds a payroll run fixture for dialog tests.
 *
 * @returns Payroll run record
 */
function buildPayrollRun(): PayrollRun {
	return {
		id: 'payroll-run-1',
		organizationId: 'org-1',
		organizationName: 'Org Test',
		periodStart: new Date('2026-01-01T00:00:00.000Z'),
		periodEnd: new Date('2026-01-07T00:00:00.000Z'),
		paymentFrequency: 'WEEKLY',
		status: 'PROCESSED',
		totalAmount: 2500,
		employeeCount: 3,
		holidayNotices: [],
		processedAt: new Date('2026-01-08T00:00:00.000Z'),
		createdAt: new Date('2026-01-08T00:00:00.000Z'),
		updatedAt: new Date('2026-01-08T00:00:00.000Z'),
	};
}

/**
 * Builds a PTU run fixture for dialog tests.
 *
 * @returns PTU run record
 */
function buildPtuRun(): PtuRun {
	return {
		id: 'ptu-run-1',
		organizationId: 'org-1',
		fiscalYear: 2025,
		paymentDate: new Date('2026-05-15T00:00:00.000Z'),
		taxableIncome: 100000,
		ptuPercentage: 0.1,
		includeInactive: false,
		status: 'PROCESSED',
		totalAmount: 12000,
		employeeCount: 3,
		taxSummary: null,
		settingsSnapshot: null,
		processedAt: new Date('2026-05-15T00:00:00.000Z'),
		cancelledAt: null,
		cancelReason: null,
		createdAt: new Date('2026-05-15T00:00:00.000Z'),
		updatedAt: new Date('2026-05-15T00:00:00.000Z'),
	};
}

/**
 * Builds an aguinaldo run fixture for dialog tests.
 *
 * @returns Aguinaldo run record
 */
function buildAguinaldoRun(): AguinaldoRun {
	return {
		id: 'aguinaldo-run-1',
		organizationId: 'org-1',
		calendarYear: 2025,
		paymentDate: new Date('2025-12-20T00:00:00.000Z'),
		includeInactive: false,
		status: 'PROCESSED',
		totalAmount: 15000,
		employeeCount: 3,
		taxSummary: null,
		settingsSnapshot: null,
		processedAt: new Date('2025-12-20T00:00:00.000Z'),
		cancelledAt: null,
		cancelReason: null,
		createdAt: new Date('2025-12-20T00:00:00.000Z'),
		updatedAt: new Date('2025-12-20T00:00:00.000Z'),
	};
}

describe('Payroll receipt access', () => {
	it('shows payroll download controls for members', () => {
		renderWithProviders(<PayrollRunReceiptsDialog run={buildPayrollRun()} />, 'member');

		expect(screen.getByText('receipts.trigger')).toBeInTheDocument();
		expect(screen.queryByText('receipts.restricted')).not.toBeInTheDocument();
	});

	it('shows payroll download controls for organization owners', () => {
		renderWithProviders(<PayrollRunReceiptsDialog run={buildPayrollRun()} />, 'owner');

		expect(screen.getByText('receipts.trigger')).toBeInTheDocument();
		expect(screen.queryByText('receipts.restricted')).not.toBeInTheDocument();
	});

	it('shows PTU download controls for members', () => {
		renderWithProviders(<PtuRunReceiptsDialog run={buildPtuRun()} />, 'member');

		expect(screen.getByText('receipts.trigger')).toBeInTheDocument();
		expect(screen.queryByText('receipts.restricted')).not.toBeInTheDocument();
	});

	it('shows aguinaldo download controls for members', () => {
		renderWithProviders(<AguinaldoRunReceiptsDialog run={buildAguinaldoRun()} />, 'member');

		expect(screen.getByText('receipts.trigger')).toBeInTheDocument();
		expect(screen.queryByText('receipts.restricted')).not.toBeInTheDocument();
	});
});
