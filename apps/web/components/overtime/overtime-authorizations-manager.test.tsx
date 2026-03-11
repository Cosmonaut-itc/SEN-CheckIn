import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';

import { OvertimeAuthorizationsManager } from './overtime-authorizations-manager';

const mockFetchEmployeesList = vi.fn();
const mockFetchOvertimeAuthorizationsList = vi.fn();
const mockCreateOvertimeAuthorizationAction = vi.fn();
const mockCancelOvertimeAuthorizationAction = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
		fetchOvertimeAuthorizationsList: (...args: unknown[]) =>
			mockFetchOvertimeAuthorizationsList(...args),
	};
});

vi.mock('@/actions/overtime-authorizations', () => ({
	createOvertimeAuthorizationAction: (...args: unknown[]) =>
		mockCreateOvertimeAuthorizationAction(...args),
	cancelOvertimeAuthorizationAction: (...args: unknown[]) =>
		mockCancelOvertimeAuthorizationAction(...args),
}));

const messages = {
	OvertimeAuthorizations: {
		title: 'Horas extra autorizadas',
		subtitle: 'Gestiona preaprobaciones por colaborador y fecha.',
		noOrganization: 'Selecciona una organización activa.',
		actions: {
			create: 'Autorizar horas extra',
			createSubmitting: 'Guardando...',
			cancel: 'Cancelar autorización',
		},
		filters: {
			employee: 'Empleado',
			status: 'Estatus',
			startDate: 'Desde',
			endDate: 'Hasta',
			allEmployees: 'Todos',
			allStatuses: 'Todos',
		},
		status: {
			PENDING: 'Pendiente',
			ACTIVE: 'Activa',
			CANCELLED: 'Cancelada',
		},
		table: {
			headers: {
				employee: 'Empleado',
				date: 'Fecha',
				hours: 'Horas autorizadas',
				status: 'Estatus',
				createdBy: 'Autorizó',
				actions: 'Acciones',
			},
			empty: 'No se encontraron autorizaciones.',
		},
		form: {
			title: 'Nueva autorización',
			fields: {
				employee: 'Empleado',
				date: 'Fecha',
				hours: 'Horas',
				notes: 'Notas',
				search: 'Buscar empleado',
			},
			placeholders: {
				employee: 'Selecciona un empleado',
				date: 'AAAA-MM-DD',
				hours: '0',
				notes: 'Opcional',
				search: 'Busca por nombre',
			},
			helper: {
				legalLimit: 'La LFT sugiere un máximo de 3 horas diarias.',
			},
			actions: {
				submit: 'Guardar autorización',
			},
		},
		toast: {
			createSuccess: 'Autorización creada',
			createError: 'No se pudo crear la autorización',
			cancelSuccess: 'Autorización cancelada',
			cancelError: 'No se pudo cancelar la autorización',
		},
	},
	Common: {
		loading: 'Cargando...',
		next: 'Siguiente',
		previous: 'Anterior',
		cancel: 'Cancelar',
	},
};

/**
 * Renders the overtime authorization manager with required providers.
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
					organizationTimeZone: 'America/Mexico_City',
					organizationRole: 'admin',
					userRole: 'admin',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<OvertimeAuthorizationsManager />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

/**
 * Picks the first enabled day from the overtime date picker popover.
 *
 * @returns Selected day label
 */
function selectFirstAvailableDate(): string {
	const calendar = screen.getByTestId('overtime-date-calendar');
	const dayButton = within(calendar)
		.getAllByRole('button')
		.find((button) => !button.hasAttribute('disabled') && /^\d+$/.test(button.textContent ?? ''));

	if (!dayButton || !dayButton.textContent) {
		throw new Error('Expected an enabled calendar day button.');
	}

	fireEvent.click(dayButton);
	return dayButton.textContent;
}

describe('OvertimeAuthorizationsManager', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		mockFetchEmployeesList.mockReset();
		mockFetchOvertimeAuthorizationsList.mockReset();
		mockCreateOvertimeAuthorizationAction.mockReset();
		mockCancelOvertimeAuthorizationAction.mockReset();

		mockFetchEmployeesList.mockResolvedValue({
			data: [
				{
					id: 'emp-1',
					code: 'EMP-1',
					firstName: 'Ada',
					lastName: 'Lovelace',
					email: null,
					phone: null,
					jobPositionId: null,
					jobPositionName: null,
					department: null,
					status: 'ACTIVE',
					hireDate: null,
					locationId: null,
					organizationId: 'org-1',
					rekognitionUserId: null,
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		mockFetchOvertimeAuthorizationsList.mockResolvedValue({
			data: [
				{
					id: 'ot-1',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					dateKey: '2026-03-20',
					authorizedHours: 2,
					status: 'ACTIVE',
					authorizedByUserId: 'user-1',
					authorizedByName: 'Admin Test',
					notes: 'Cierre contable',
					createdAt: new Date('2026-03-10T00:00:00.000Z'),
					updatedAt: new Date('2026-03-10T00:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 20, offset: 0 },
		});
		mockCreateOvertimeAuthorizationAction.mockResolvedValue({
			success: true,
			data: null,
		});
		mockCancelOvertimeAuthorizationAction.mockResolvedValue({
			success: true,
			data: null,
		});
	});

	it('renders the authorization table with employee and status data', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
		});

		expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		expect(screen.getByTestId('overtime-authorization-status-ot-1')).not.toHaveTextContent(
			/^$/,
		);
		expect(screen.getByText('Admin Test')).toBeInTheDocument();
	});

	it('captures the authorization form values from the dialog flow', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));
		const dialog = screen.getByRole('dialog');
		const dialogQueries = within(dialog);

		fireEvent.change(dialogQueries.getByTestId('overtime-employee-search'), {
			target: { value: 'Ada' },
		});
		fireEvent.click(dialogQueries.getByTestId('overtime-date-trigger'));
		const selectedDay = selectFirstAvailableDate();
		fireEvent.change(dialogQueries.getByTestId('overtime-hours-input'), {
			target: { value: '2.5' },
		});
		fireEvent.change(dialogQueries.getByTestId('overtime-notes-input'), {
			target: { value: 'Soporte al cierre mensual' },
		});
		fireEvent.change(dialogQueries.getByTestId('overtime-employee-select'), {
			target: { value: 'emp-1' },
		});

		expect(dialogQueries.getByTestId('overtime-date-trigger')).toHaveTextContent(selectedDay);
		expect((dialogQueries.getByTestId('overtime-hours-input') as HTMLInputElement).value).toBe(
			'2.5',
		);
		expect((dialogQueries.getByTestId('overtime-notes-input') as HTMLInputElement).value).toBe(
			'Soporte al cierre mensual',
		);
		expect(dialogQueries.getByTestId('overtime-submit-button')).toBeInTheDocument();
	});

	it('prevents submitting the form again while create mutation is pending', async () => {
		let resolveCreate: ((value: { success: boolean; data: null }) => void) | undefined;
		const createPromise = new Promise<{ success: boolean; data: null }>((resolve) => {
			resolveCreate = resolve;
		});
		mockCreateOvertimeAuthorizationAction.mockReturnValue(createPromise);

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));
		const dialog = screen.getByRole('dialog');
		const dialogQueries = within(dialog);

		fireEvent.click(dialogQueries.getByTestId('overtime-date-trigger'));
		selectFirstAvailableDate();
		fireEvent.change(dialogQueries.getByTestId('overtime-hours-input'), {
			target: { value: '2' },
		});
		fireEvent.change(dialogQueries.getByTestId('overtime-employee-select'), {
			target: { value: 'emp-1' },
		});

		fireEvent.click(dialogQueries.getByTestId('overtime-submit-button'));

		await waitFor(() => {
			expect(dialogQueries.getByTestId('overtime-submit-button')).toBeDisabled();
		});

		fireEvent.click(dialogQueries.getByTestId('overtime-submit-button'));

		expect(mockCreateOvertimeAuthorizationAction).toHaveBeenCalledTimes(1);

		if (!resolveCreate) {
			throw new Error('Expected create mutation resolver.');
		}
		resolveCreate({ success: true, data: null });

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});
	});

	it('uses the organization timezone for the minimum selectable authorization date', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-03-12T01:30:00.000Z'));
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));
		fireEvent.click(screen.getByTestId('overtime-date-trigger'));

		const calendar = screen.getByTestId('overtime-date-calendar');
		const firstAvailableDay = within(calendar)
			.getAllByRole('button')
			.find((button) => !button.hasAttribute('disabled') && /^\d+$/.test(button.textContent ?? ''));

		expect(firstAvailableDay?.textContent).toBe('11');
	});

	it('cancels an active authorization from the table action', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-cancel-button-ot-1')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-cancel-button-ot-1'));

		await waitFor(() => {
			expect(mockCancelOvertimeAuthorizationAction).toHaveBeenCalled();
		});

		expect(mockCancelOvertimeAuthorizationAction.mock.calls[0]?.[0]).toEqual({
			organizationId: 'org-1',
			id: 'ot-1',
		});
	});

	it('disables submit button when required fields are empty', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));
		const submitButton = screen.getByTestId('overtime-submit-button');

		expect(submitButton).toBeDisabled();

		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCreateOvertimeAuthorizationAction).not.toHaveBeenCalled();
		});
	});

	it('resets form when dialog is closed without submitting', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));

		fireEvent.change(screen.getByTestId('overtime-employee-search'), {
			target: { value: 'Ada' },
		});
		fireEvent.click(screen.getByTestId('overtime-date-trigger'));
		selectFirstAvailableDate();
		fireEvent.change(screen.getByTestId('overtime-hours-input'), {
			target: { value: '4' },
		});
		fireEvent.change(screen.getByTestId('overtime-notes-input'), {
			target: { value: 'Cobertura de cierre' },
		});
		fireEvent.change(screen.getByTestId('overtime-employee-select'), {
			target: { value: 'emp-1' },
		});

		fireEvent.click(screen.getByTestId('overtime-cancel-dialog'));

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));

		expect((screen.getByTestId('overtime-employee-search') as HTMLInputElement).value).toBe('');
		expect(screen.getByTestId('overtime-date-trigger')).not.toHaveTextContent(/^\d+$/);
		expect((screen.getByTestId('overtime-hours-input') as HTMLInputElement).value).toBe('');
		expect((screen.getByTestId('overtime-notes-input') as HTMLInputElement).value).toBe('');
		expect((screen.getByTestId('overtime-employee-select') as HTMLSelectElement).value).toBe(
			'',
		);
	});

	it('shows warning helper text when authorized hours exceed 3', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('overtime-create-trigger')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByTestId('overtime-create-trigger'));
		fireEvent.change(screen.getByTestId('overtime-hours-input'), {
			target: { value: '3.5' },
		});

		expect(screen.getByTestId('overtime-legal-warning')).toHaveClass(
			'text-[var(--status-warning)]',
		);
	});
});
