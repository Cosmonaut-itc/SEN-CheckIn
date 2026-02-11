import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		html: string,
		options?: {
			url?: string;
		},
	) => {
		window: Window & typeof globalThis;
	};
};

if (typeof document === 'undefined') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'http://localhost',
	});

	Object.defineProperty(globalThis, 'window', {
		value: dom.window,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'document', {
		value: dom.window.document,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'navigator', {
		value: dom.window.navigator,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'HTMLElement', {
		value: dom.window.HTMLElement,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'HTMLAnchorElement', {
		value: dom.window.HTMLAnchorElement,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'DOMParser', {
		value: dom.window.DOMParser,
		configurable: true,
	});
	Object.defineProperty(globalThis, 'Node', {
		value: dom.window.Node,
		configurable: true,
	});
}

vi.mock('next/navigation', () => {
	return {
		useSearchParams: () => new URLSearchParams(),
	};
});

vi.mock('next-intl', () => ({
	NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
	useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/client-functions', () => {
	return {
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

type MockedGenerateDisciplinaryActaAction = {
	(...args: unknown[]): unknown;
	mockReset: () => void;
	mockResolvedValue: (value: unknown) => void;
	mockRejectedValue: (reason: unknown) => void;
	mock: { calls: unknown[][] };
};

const mockedGenerateDisciplinaryActaAction =
	generateDisciplinaryActaAction as unknown as MockedGenerateDisciplinaryActaAction;

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
		mockedGenerateDisciplinaryActaAction.mockReset();
		mockedGenerateDisciplinaryActaAction.mockResolvedValue({
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
		const view = renderWithProviders();

		await waitFor(() => {
			expect(view.getByText('kpis.employeesWithMeasures')).toBeTruthy();
		});

		expect(view.getByText('filters.search')).toBeTruthy();
		expect(view.getByText('filters.employee')).toBeTruthy();
		expect(view.getByText('actions.create')).toBeTruthy();
		expect(view.getByText('table.headers.folio')).toBeTruthy();
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
		mockedGenerateDisciplinaryActaAction.mockResolvedValue({
			success: true,
			data: {
				renderedHtml: '<html><body>Acta administrativa</body></html>',
			},
		});

		const view = renderWithProviders();

		await waitFor(() => {
			expect(view.getByRole('button', { name: 'actions.viewDetail' })).toBeTruthy();
		});

		fireEvent.click(view.getByRole('button', { name: 'actions.viewDetail' }));

		await waitFor(() => {
			expect(view.getByRole('button', { name: 'actions.generateActa' })).toBeTruthy();
		});

		fireEvent.click(view.getByRole('button', { name: 'actions.generateActa' }));

		await waitFor(() => {
			expect(mockedGenerateDisciplinaryActaAction).toHaveBeenCalledTimes(1);
			expect(mockedGenerateDisciplinaryActaAction.mock.calls[0]?.[0]).toEqual({
				id: 'measure-1',
			});
			expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
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
		mockedGenerateDisciplinaryActaAction.mockRejectedValue(
			new Error('network error'),
		);

		const view = renderWithProviders();

		await waitFor(() => {
			expect(view.getByRole('button', { name: 'actions.viewDetail' })).toBeTruthy();
		});

		fireEvent.click(view.getByRole('button', { name: 'actions.viewDetail' }));

		await waitFor(() => {
			expect(view.getByRole('button', { name: 'actions.generateActa' })).toBeTruthy();
		});

		fireEvent.click(view.getByRole('button', { name: 'actions.generateActa' }));

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith('toast.generateActaError');
		});

			consoleErrorSpy.mockRestore();
		});

		it('shows settings validation toast when acta settings are incomplete', async () => {
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
			mockedGenerateDisciplinaryActaAction.mockResolvedValue({
				success: false,
				errorCode: 'DISCIPLINARY_ACTA_SETTINGS_INCOMPLETE',
				error: 'settings missing',
			});

			const view = renderWithProviders();

			await waitFor(() => {
				expect(view.getByRole('button', { name: 'actions.viewDetail' })).toBeTruthy();
			});

			fireEvent.click(view.getByRole('button', { name: 'actions.viewDetail' }));

			await waitFor(() => {
				expect(view.getByRole('button', { name: 'actions.generateActa' })).toBeTruthy();
			});

			fireEvent.click(view.getByRole('button', { name: 'actions.generateActa' }));

			await waitFor(() => {
				expect(mockToastError).toHaveBeenCalledWith('toast.validation.actaSettingsRequired');
			});
		});
	});
