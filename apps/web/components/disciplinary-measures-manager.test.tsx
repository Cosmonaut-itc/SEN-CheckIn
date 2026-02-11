import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateDisciplinaryActaAction } from '@/actions/disciplinary-measures';
import { DisciplinaryMeasuresManager } from '@/components/disciplinary-measures-manager';
import { OrgProvider } from '@/lib/org-client-context';
import rawMessages from '@/messages/es.json';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchDisciplinaryMeasures = vi.fn();
const mockFetchDisciplinaryKpis = vi.fn();
const mockFetchEmployeesList = vi.fn();
const mockFetchDisciplinaryMeasureById = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockCreateObjectURL = vi.fn(() => 'blob:disciplinary-test');
const mockRevokeObjectURL = vi.fn();

const anchorClickSpy = vi
	.spyOn(HTMLAnchorElement.prototype, 'click')
	.mockImplementation(() => undefined);

vi.mock('next/navigation', async (importOriginal) => {
	const actual = await importOriginal<typeof import('next/navigation')>();
	return {
		...actual,
		useSearchParams: () => new URLSearchParams(),
	};
});

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchDisciplinaryMeasures: (...args: unknown[]) => mockFetchDisciplinaryMeasures(...args),
		fetchDisciplinaryKpis: (...args: unknown[]) => mockFetchDisciplinaryKpis(...args),
		fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
		fetchDisciplinaryMeasureById: (...args: unknown[]) =>
			mockFetchDisciplinaryMeasureById(...args),
		fetchDisciplinaryDocumentUrl: vi.fn().mockResolvedValue('https://example.com/doc.pdf'),
	};
});

vi.mock('sonner', () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
	},
}));

vi.mock('@/actions/disciplinary-measures', () => ({
	createDisciplinaryMeasureAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	updateDisciplinaryMeasureAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	generateDisciplinaryActaAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
	generateDisciplinaryRefusalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	presignDisciplinarySignedActaAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmDisciplinarySignedActaAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	presignDisciplinaryRefusalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmDisciplinaryRefusalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	presignDisciplinaryAttachmentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmDisciplinaryAttachmentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	deleteDisciplinaryAttachmentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	closeDisciplinaryMeasureAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

/**
 * Renders component with org, i18n and query providers.
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
					organizationSlug: 'org-1',
					organizationName: 'Org 1',
					organizationRole: 'owner',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<DisciplinaryMeasuresManager />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('DisciplinaryMeasuresManager', () => {
	beforeEach(() => {
		mockFetchDisciplinaryMeasures.mockReset();
		mockFetchDisciplinaryKpis.mockReset();
		mockFetchEmployeesList.mockReset();
		mockFetchDisciplinaryMeasureById.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockCreateObjectURL.mockReset();
		mockCreateObjectURL.mockReturnValue('blob:disciplinary-test');
		mockRevokeObjectURL.mockReset();
		anchorClickSpy.mockClear();
		vi.mocked(generateDisciplinaryActaAction).mockReset();
		vi.mocked(generateDisciplinaryActaAction).mockResolvedValue({
			success: true,
			data: {},
		});

		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			writable: true,
			value: mockCreateObjectURL,
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			writable: true,
			value: mockRevokeObjectURL,
		});

		mockFetchDisciplinaryMeasures.mockResolvedValue({
			data: [
				{
					id: 'measure-1',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					folio: 101,
					status: 'DRAFT',
					incidentDateKey: '2026-01-10',
					reason: 'Retraso reiterado',
					policyReference: null,
					outcome: 'warning',
					suspensionStartDateKey: null,
					suspensionEndDateKey: null,
					signatureStatus: null,
					generatedActaGenerationId: null,
					generatedRefusalGenerationId: null,
					closedAt: null,
					closedByUserId: null,
					createdByUserId: null,
					updatedByUserId: null,
					createdAt: new Date('2026-01-10T00:00:00.000Z'),
					updatedAt: new Date('2026-01-10T00:00:00.000Z'),
					employeeCode: 'EMP-1',
					employeeFirstName: 'Ada',
					employeeLastName: 'Lovelace',
				},
			],
			pagination: {
				total: 1,
				limit: 20,
				offset: 0,
			},
		});

		mockFetchDisciplinaryKpis.mockResolvedValue({
			employeesWithMeasures: 1,
			measuresInPeriod: 1,
			activeSuspensions: 0,
			terminationEscalations: 0,
			openMeasures: 1,
		});

		mockFetchEmployeesList.mockResolvedValue({
			data: [
				{
					id: 'emp-1',
					code: 'EMP-1',
					firstName: 'Ada',
					lastName: 'Lovelace',
					status: 'ACTIVE',
					locationId: 'loc-1',
					jobPositionId: 'job-1',
					organizationId: 'org-1',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 1,
				limit: 200,
				offset: 0,
			},
		});

		mockFetchDisciplinaryMeasureById.mockResolvedValue(null);
	});

	it('renders KPI cards, filters and primary actions', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('kpis.employeesWithMeasures')).toBeInTheDocument();
		});

		expect(screen.getByText('filters.search')).toBeInTheDocument();
		expect(screen.getByText('filters.employee')).toBeInTheDocument();
		expect(screen.getByText('actions.create')).toBeInTheDocument();
		expect(screen.getByText('table.headers.folio')).toBeInTheDocument();
	});

	it('downloads generated acta after clicking generate', async () => {
		mockFetchDisciplinaryMeasureById.mockResolvedValue({
			id: 'measure-1',
			organizationId: 'org-1',
			employeeId: 'emp-1',
			folio: 101,
			status: 'DRAFT',
			incidentDateKey: '2026-01-10',
			reason: 'Retraso reiterado',
			policyReference: null,
			outcome: 'warning',
			suspensionStartDateKey: null,
			suspensionEndDateKey: null,
			signatureStatus: null,
			generatedActaGenerationId: null,
			generatedRefusalGenerationId: null,
			closedAt: null,
			closedByUserId: null,
			createdByUserId: null,
			updatedByUserId: null,
			createdAt: new Date('2026-01-10T00:00:00.000Z'),
			updatedAt: new Date('2026-01-10T00:00:00.000Z'),
			employeeCode: 'EMP-1',
			employeeFirstName: 'Ada',
			employeeLastName: 'Lovelace',
			documents: [],
			attachments: [],
			terminationDraft: null,
		});
		vi.mocked(generateDisciplinaryActaAction).mockResolvedValue({
			success: true,
			data: {
				renderedHtml: '<html><body>Acta administrativa</body></html>',
			},
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'actions.viewDetail' })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'actions.viewDetail' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'actions.generateActa' })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'actions.generateActa' }));

		await waitFor(() => {
			expect(vi.mocked(generateDisciplinaryActaAction)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(generateDisciplinaryActaAction).mock.calls[0]?.[0]).toEqual({
				id: 'measure-1',
			});
			expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
			expect(anchorClickSpy).toHaveBeenCalledTimes(1);
			expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:disciplinary-test');
			expect(mockToastSuccess).toHaveBeenCalledWith('toast.generateActaSuccess');
		});
	});

	it('shows an error toast when acta generation throws unexpectedly', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		mockFetchDisciplinaryMeasureById.mockResolvedValue({
			id: 'measure-1',
			organizationId: 'org-1',
			employeeId: 'emp-1',
			folio: 101,
			status: 'DRAFT',
			incidentDateKey: '2026-01-10',
			reason: 'Retraso reiterado',
			policyReference: null,
			outcome: 'warning',
			suspensionStartDateKey: null,
			suspensionEndDateKey: null,
			signatureStatus: null,
			generatedActaGenerationId: null,
			generatedRefusalGenerationId: null,
			closedAt: null,
			closedByUserId: null,
			createdByUserId: null,
			updatedByUserId: null,
			createdAt: new Date('2026-01-10T00:00:00.000Z'),
			updatedAt: new Date('2026-01-10T00:00:00.000Z'),
			employeeCode: 'EMP-1',
			employeeFirstName: 'Ada',
			employeeLastName: 'Lovelace',
			documents: [],
			attachments: [],
			terminationDraft: null,
		});
		vi.mocked(generateDisciplinaryActaAction).mockRejectedValue(
			new Error('network error'),
		);

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'actions.viewDetail' })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'actions.viewDetail' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'actions.generateActa' })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'actions.generateActa' }));

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith('toast.generateActaError');
		});

		consoleErrorSpy.mockRestore();
	});
});
