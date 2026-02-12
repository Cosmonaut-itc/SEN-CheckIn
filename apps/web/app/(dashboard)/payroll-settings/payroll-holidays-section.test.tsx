import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HolidayCalendarEntry } from '@sen-checkin/types';
import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';
import type { PayrollHolidaySyncRun } from '@/lib/client-functions';

import { PayrollHolidaysSection } from './payroll-holidays-section';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchPayrollHolidays = vi.fn();
const mockFetchPayrollHolidaySyncStatus = vi.fn();
const mockSyncPayrollHolidays = vi.fn();
const mockCreatePayrollHolidayCustom = vi.fn();
const mockUpdatePayrollHoliday = vi.fn();
const mockImportPayrollHolidaysCsv = vi.fn();
const mockExportPayrollHolidaysCsv = vi.fn();
const mockApprovePayrollHolidaySyncRun = vi.fn();
const mockRejectPayrollHolidaySyncRun = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchPayrollHolidays: (...args: unknown[]) => mockFetchPayrollHolidays(...args),
		fetchPayrollHolidaySyncStatus: (...args: unknown[]) =>
			mockFetchPayrollHolidaySyncStatus(...args),
		syncPayrollHolidays: (...args: unknown[]) => mockSyncPayrollHolidays(...args),
		createPayrollHolidayCustom: (...args: unknown[]) => mockCreatePayrollHolidayCustom(...args),
		updatePayrollHoliday: (...args: unknown[]) => mockUpdatePayrollHoliday(...args),
		importPayrollHolidaysCsv: (...args: unknown[]) => mockImportPayrollHolidaysCsv(...args),
		exportPayrollHolidaysCsv: (...args: unknown[]) => mockExportPayrollHolidaysCsv(...args),
		approvePayrollHolidaySyncRun: (...args: unknown[]) =>
			mockApprovePayrollHolidaySyncRun(...args),
		rejectPayrollHolidaySyncRun: (...args: unknown[]) =>
			mockRejectPayrollHolidaySyncRun(...args),
	};
});

vi.mock('sonner', () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
	},
}));

/**
 * Builds a payroll holiday entry fixture.
 *
 * @param overrides - Entry field overrides
 * @returns Holiday entry fixture
 */
function buildHolidayEntry(overrides: Partial<HolidayCalendarEntry>): HolidayCalendarEntry {
	const baseTimestamp = new Date('2026-01-01T00:00:00.000Z');
	return {
		id: overrides.id ?? 'holiday-1',
		organizationId: overrides.organizationId ?? 'org-1',
		dateKey: overrides.dateKey ?? '2026-01-01',
		name: overrides.name ?? 'Feriado base',
		kind: overrides.kind ?? 'MANDATORY',
		source: overrides.source ?? 'PROVIDER',
		status: overrides.status ?? 'PENDING_APPROVAL',
		isRecurring: overrides.isRecurring ?? false,
		seriesId: overrides.seriesId ?? null,
		provider: overrides.provider ?? 'NAGER_DATE',
		providerExternalId: overrides.providerExternalId ?? 'MX:2026-01-01:Feriado base',
		subdivisionCode: overrides.subdivisionCode ?? null,
		legalReference: overrides.legalReference ?? 'LFT Art. 74',
		conflictReason: overrides.conflictReason ?? null,
		syncRunId: overrides.syncRunId ?? null,
		active: overrides.active ?? true,
		approvedAt: overrides.approvedAt ?? null,
		rejectedAt: overrides.rejectedAt ?? null,
		createdAt: overrides.createdAt ?? baseTimestamp,
		updatedAt: overrides.updatedAt ?? baseTimestamp,
	};
}

/**
 * Builds a payroll holiday sync run fixture.
 *
 * @param overrides - Sync run field overrides
 * @returns Sync run fixture
 */
function buildSyncRun(overrides: Partial<PayrollHolidaySyncRun> = {}): PayrollHolidaySyncRun {
	const baseTimestamp = new Date('2026-01-10T08:00:00.000Z');
	return {
		id: overrides.id ?? 'run-1',
		organizationId: overrides.organizationId ?? 'org-1',
		provider: overrides.provider ?? 'NAGER_DATE',
		requestedYears: overrides.requestedYears ?? [2026],
		status: overrides.status ?? 'COMPLETED',
		startedAt: overrides.startedAt ?? baseTimestamp,
		finishedAt: overrides.finishedAt ?? baseTimestamp,
		importedCount: overrides.importedCount ?? 1,
		pendingCount: overrides.pendingCount ?? 1,
		errorCount: overrides.errorCount ?? 0,
		errorPayload: overrides.errorPayload ?? null,
		stale: overrides.stale ?? false,
		createdAt: overrides.createdAt ?? baseTimestamp,
		updatedAt: overrides.updatedAt ?? baseTimestamp,
	};
}

/**
 * Renders payroll holidays section with required providers.
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
					organizationRole: 'owner',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<PayrollHolidaysSection />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('PayrollHolidaysSection', () => {
	beforeEach(() => {
		mockFetchPayrollHolidays.mockReset();
		mockFetchPayrollHolidaySyncStatus.mockReset();
		mockSyncPayrollHolidays.mockReset();
		mockCreatePayrollHolidayCustom.mockReset();
		mockUpdatePayrollHoliday.mockReset();
		mockImportPayrollHolidaysCsv.mockReset();
		mockExportPayrollHolidaysCsv.mockReset();
		mockApprovePayrollHolidaySyncRun.mockReset();
		mockRejectPayrollHolidaySyncRun.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();

		const pendingConflict = buildHolidayEntry({
			id: 'holiday-pending',
			name: 'Feriado en revisión',
			status: 'PENDING_APPROVAL',
			source: 'PROVIDER',
			dateKey: '2026-07-02',
			conflictReason: 'Conflicto proveedor vs calendario interno',
			syncRunId: 'run-1',
			approvedAt: new Date('2026-01-05T00:00:00.000Z'),
		});
		const approvedCustom = buildHolidayEntry({
			id: 'holiday-approved',
			name: 'Feriado aprobado',
			status: 'APPROVED',
			source: 'CUSTOM',
			dateKey: '2026-07-09',
			conflictReason: null,
			syncRunId: null,
			approvedAt: new Date('2026-01-06T00:00:00.000Z'),
		});

		mockFetchPayrollHolidays.mockImplementation(
			(params?: { status?: 'PENDING_APPROVAL' | 'APPROVED' }) => {
				if (params?.status === 'PENDING_APPROVAL') {
					return Promise.resolve([pendingConflict]);
				}
				if (params?.status === 'APPROVED') {
					return Promise.resolve([approvedCustom]);
				}
				return Promise.resolve([pendingConflict, approvedCustom]);
			},
		);
		mockFetchPayrollHolidaySyncStatus.mockResolvedValue({
			lastRun: buildSyncRun({ id: 'run-1', status: 'COMPLETED', pendingCount: 1 }),
			pendingApprovalCount: 1,
			stale: false,
		});
		mockSyncPayrollHolidays.mockResolvedValue({
			run: buildSyncRun(),
			importedCount: 1,
			pendingCount: 1,
			errorCount: 0,
		});
		mockCreatePayrollHolidayCustom.mockResolvedValue([]);
		mockUpdatePayrollHoliday.mockResolvedValue(pendingConflict);
		mockImportPayrollHolidaysCsv.mockResolvedValue({
			appliedRows: 1,
			rejectedRows: 0,
			errors: [],
		});
		mockExportPayrollHolidaysCsv.mockResolvedValue({
			count: 2,
			fileName: 'feriados.csv',
			csvContent: 'dateKey,name',
		});
		mockApprovePayrollHolidaySyncRun.mockResolvedValue({
			runId: 'run-1',
			approvedCount: 1,
		});
		mockRejectPayrollHolidaySyncRun.mockResolvedValue({
			runId: 'run-1',
			rejectedCount: 1,
		});
	});

	it('shows conflict panel with source and per-run decision', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('holidays.conflicts.title')).toBeInTheDocument();
		});
		expect(screen.getByText('Conflicto proveedor vs calendario interno')).toBeInTheDocument();
		expect(screen.getByText('run-1')).toBeInTheDocument();
		expect(
			screen.getByText('holidays.conflicts.decisionValues.PENDING_APPROVAL'),
		).toBeInTheDocument();
		expect(screen.getByText('holidays.filters.statusValues.APPROVED')).toBeInTheDocument();
	});

	it('filters the table to pending entries from review action', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Feriado en revisión')).toBeInTheDocument();
			expect(screen.getByText('Feriado aprobado')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'holidays.actions.reviewPending' }));

		await waitFor(() => {
			expect(mockFetchPayrollHolidays).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'PENDING_APPROVAL' }),
			);
			expect(screen.getByText('Feriado en revisión')).toBeInTheDocument();
			expect(screen.queryByText('Feriado aprobado')).not.toBeInTheDocument();
		});
	});

	it('submits approve and reject decisions with reason', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'holidays.actions.approvePending' }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'holidays.actions.approvePending' }));
		const approveDialog = screen.getByRole('dialog');
		fireEvent.change(within(approveDialog).getByLabelText('holidays.fields.reason'), {
			target: { value: 'Aprobación de prueba' },
		});
		fireEvent.click(
			within(approveDialog).getByRole('button', {
				name: 'holidays.actions.approvePending',
			}),
		);

		await waitFor(() => {
			expect(mockApprovePayrollHolidaySyncRun).toHaveBeenCalledWith(
				'run-1',
				'Aprobación de prueba',
			);
		});

		fireEvent.click(screen.getByRole('button', { name: 'holidays.actions.rejectPending' }));
		const rejectDialog = screen.getByRole('dialog');
		fireEvent.change(within(rejectDialog).getByLabelText('holidays.fields.reason'), {
			target: { value: 'Rechazo de prueba' },
		});
		fireEvent.click(
			within(rejectDialog).getByRole('button', {
				name: 'holidays.actions.rejectPending',
			}),
		);

		await waitFor(() => {
			expect(mockRejectPayrollHolidaySyncRun).toHaveBeenCalledWith(
				'run-1',
				'Rechazo de prueba',
			);
		});
	});

	it('renders partial CSV import errors summary', async () => {
		mockImportPayrollHolidaysCsv.mockResolvedValue({
			appliedRows: 1,
			rejectedRows: 2,
			errors: [
				{ line: 3, reason: 'name requerido' },
				{ line: 4, reason: 'dateKey inválido' },
			],
		});

		renderWithProviders();

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'holidays.actions.importCsv' }),
			).toBeInTheDocument();
		});

		const importInput = document.querySelector('input[type="file"]');
		if (!(importInput instanceof HTMLInputElement)) {
			throw new Error('Expected CSV input element.');
		}

		const csvFile = new File(
			['dateKey,name,kind,recurrence\n2026-07-02,Feriado,MANDATORY,ONE_TIME'],
			'feriados.csv',
			{
				type: 'text/csv',
			},
		);
		Object.defineProperty(csvFile, 'text', {
			value: async () =>
				'dateKey,name,kind,recurrence\n2026-07-02,Feriado,MANDATORY,ONE_TIME',
		});

		fireEvent.change(importInput, {
			target: {
				files: [csvFile],
			},
		});

		await waitFor(() => {
			expect(mockImportPayrollHolidaysCsv).toHaveBeenCalledTimes(1);
			expect(screen.getByText('holidays.import.summaryTitle')).toBeInTheDocument();
		});

		const reportBlock = screen.getByText('holidays.import.summaryTitle').closest('div');
		if (!reportBlock) {
			throw new Error('Expected import report block.');
		}
		expect(within(reportBlock).getAllByRole('listitem')).toHaveLength(2);
	});
});
