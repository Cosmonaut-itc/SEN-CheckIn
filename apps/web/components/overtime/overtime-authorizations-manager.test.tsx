import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('OvertimeAuthorizationsManager', () => {
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

		expect(screen.getByText('title')).toBeInTheDocument();
		expect(screen.getAllByText('status.ACTIVE').length).toBeGreaterThan(0);
		expect(screen.getByText('Admin Test')).toBeInTheDocument();
	});

	it('captures the authorization form values from the dialog flow', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('actions.create')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('actions.create'));
		const dialog = screen.getByRole('dialog');
		const dialogQueries = within(dialog);

		fireEvent.change(dialogQueries.getByLabelText('form.fields.search'), {
			target: { value: 'Ada' },
		});
		fireEvent.change(dialogQueries.getByLabelText('form.fields.date'), {
			target: { value: '2026-03-25' },
		});
		fireEvent.change(dialogQueries.getByLabelText('form.fields.hours'), {
			target: { value: '2.5' },
		});
		fireEvent.change(dialogQueries.getByLabelText('form.fields.notes'), {
			target: { value: 'Soporte al cierre mensual' },
		});
		fireEvent.change(dialogQueries.getByLabelText('form.fields.employee'), {
			target: { value: 'emp-1' },
		});

		expect((dialogQueries.getByLabelText('form.fields.date') as HTMLInputElement).value).toBe(
			'2026-03-25',
		);
		expect((dialogQueries.getByLabelText('form.fields.hours') as HTMLInputElement).value).toBe(
			'2.5',
		);
		expect((dialogQueries.getByLabelText('form.fields.notes') as HTMLInputElement).value).toBe(
			'Soporte al cierre mensual',
		);
		expect(dialogQueries.getByText('form.actions.submit')).toBeInTheDocument();
	});

	it('cancels an active authorization from the table action', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('actions.cancel')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('actions.cancel'));

		await waitFor(() => {
			expect(mockCancelOvertimeAuthorizationAction).toHaveBeenCalled();
		});

		expect(mockCancelOvertimeAuthorizationAction.mock.calls[0]?.[0]).toEqual({
			organizationId: 'org-1',
			id: 'ot-1',
		});
	});
});
