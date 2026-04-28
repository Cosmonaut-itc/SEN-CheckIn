// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import { JobPositionsPageClient } from './job-positions-client';

const mockFetchJobPositionsList = vi.fn();
const mockFetchLocationsAll = vi.fn();
const mockFetchStaffingRequirementsList = vi.fn();
const mockCreateStaffingRequirement = vi.fn();
const mockUpdateStaffingRequirement = vi.fn();
const mockDeleteStaffingRequirement = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next-intl', async () => {
	return import('@/lib/test-utils/next-intl');
});

vi.mock('@/hooks/use-tour', () => ({
	useTour: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
	useIsMobile: () => false,
}));

vi.mock('@/lib/client-functions', () => ({
	fetchJobPositionsList: (...args: unknown[]) => mockFetchJobPositionsList(...args),
	fetchLocationsAll: (...args: unknown[]) => mockFetchLocationsAll(...args),
	fetchStaffingRequirementsList: (...args: unknown[]) =>
		mockFetchStaffingRequirementsList(...args),
}));

vi.mock('@/actions/job-positions', () => ({
	createJobPosition: vi.fn(),
	updateJobPosition: vi.fn(),
	deleteJobPosition: vi.fn(),
}));

vi.mock('@/actions/staffing-requirements', () => ({
	createStaffingRequirement: (...args: unknown[]) => mockCreateStaffingRequirement(...args),
	updateStaffingRequirement: (...args: unknown[]) => mockUpdateStaffingRequirement(...args),
	deleteStaffingRequirement: (...args: unknown[]) => mockDeleteStaffingRequirement(...args),
}));

vi.mock('sonner', () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
	},
}));

vi.mock('date-fns', () => ({
	format: () => '10/01/2026',
}));

/**
 * Renders the job positions page with query, organization, and i18n providers.
 *
 * @returns Render result
 */
function renderJobPositionsPage(): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationName: 'Organización Demo',
					organizationSlug: 'organizacion-demo',
					organizationRole: 'owner',
					userRole: 'user',
				}}
			>
				<JobPositionsPageClient />
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('JobPositionsPageClient staffing requirements', () => {
	beforeEach(() => {
		mockFetchJobPositionsList.mockReset();
		mockFetchLocationsAll.mockReset();
		mockFetchStaffingRequirementsList.mockReset();
		mockCreateStaffingRequirement.mockReset();
		mockUpdateStaffingRequirement.mockReset();
		mockDeleteStaffingRequirement.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();

		mockFetchJobPositionsList.mockResolvedValue({
			data: [
				{
					id: 'position-1',
					name: 'Cajero',
					description: 'Atención en caja',
					organizationId: 'org-1',
					createdAt: new Date('2026-01-10T00:00:00.000Z'),
					updatedAt: new Date('2026-01-10T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 1,
				limit: 10,
				offset: 0,
			},
		});
		mockFetchLocationsAll.mockResolvedValue([
			{
				id: 'location-1',
				name: 'Matriz',
				code: 'MTZ',
				address: null,
				latitude: null,
				longitude: null,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
			{
				id: 'location-2',
				name: 'Sucursal Norte',
				code: 'NOR',
				address: null,
				latitude: null,
				longitude: null,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		]);
		mockFetchStaffingRequirementsList.mockResolvedValue({
			data: [
				{
					id: 'requirement-1',
					organizationId: 'org-1',
					locationId: 'location-1',
					jobPositionId: 'position-1',
					minimumRequired: 3,
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 1,
				limit: 100,
				offset: 0,
			},
		});
		mockCreateStaffingRequirement.mockResolvedValue({ success: true });
		mockUpdateStaffingRequirement.mockResolvedValue({ success: true });
		mockDeleteStaffingRequirement.mockResolvedValue({ success: true });
	});

	it('configures staffing minimums by location for a selected job position', async () => {
		renderJobPositionsPage();

		await waitFor(() => {
			expect(screen.getByText('Cajero')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'Configurar mínimos de Cajero' }));

		await waitFor(() => {
			expect(mockFetchLocationsAll).toHaveBeenCalledWith({ organizationId: 'org-1' });
			expect(mockFetchStaffingRequirementsList.mock.calls[0]?.[0]).toEqual({
				organizationId: 'org-1',
				jobPositionId: 'position-1',
				limit: 100,
				offset: 0,
			});
		});

		const matrizInput = await screen.findByLabelText('Mínimo requerido para Matriz');
		const norteInput = await screen.findByLabelText('Mínimo requerido para Sucursal Norte');

		expect(matrizInput).toHaveValue(3);
		expect(norteInput).toHaveValue(null);

		fireEvent.change(matrizInput, { target: { value: '4' } });
		fireEvent.click(screen.getByRole('button', { name: 'Guardar mínimo para Matriz' }));

		await waitFor(() => {
			expect(mockUpdateStaffingRequirement).toHaveBeenCalled();
			expect(mockUpdateStaffingRequirement.mock.calls[0]?.[0]).toEqual({
				id: 'requirement-1',
				minimumRequired: 4,
			});
		});
		await waitFor(() => {
			expect(matrizInput).toHaveValue(3);
		});

		fireEvent.change(norteInput, { target: { value: '2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Guardar mínimo para Sucursal Norte' }));

		await waitFor(() => {
			expect(mockCreateStaffingRequirement).toHaveBeenCalled();
			expect(mockCreateStaffingRequirement.mock.calls[0]?.[0]).toEqual({
				organizationId: 'org-1',
				locationId: 'location-2',
				jobPositionId: 'position-1',
				minimumRequired: 2,
			});
		});

		fireEvent.click(screen.getByRole('button', { name: 'Eliminar mínimo para Matriz' }));

		expect(mockDeleteStaffingRequirement).not.toHaveBeenCalled();
		expect(screen.getByText('Eliminar mínimo de personal')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));

		await waitFor(() => {
			expect(mockDeleteStaffingRequirement).toHaveBeenCalled();
			expect(mockDeleteStaffingRequirement.mock.calls[0]?.[0]).toBe('requirement-1');
		});
		await waitFor(() => {
			expect(matrizInput).toHaveValue(3);
		});
	});

	it('loads staffing requirements across all pages for the selected position', async () => {
		mockFetchLocationsAll.mockResolvedValue([
			{
				id: 'location-1',
				name: 'Matriz',
				code: 'MTZ',
				address: null,
				latitude: null,
				longitude: null,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
			{
				id: 'location-2',
				name: 'Sucursal Norte',
				code: 'NOR',
				address: null,
				latitude: null,
				longitude: null,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		]);
		mockFetchStaffingRequirementsList
			.mockResolvedValueOnce({
				data: [
					{
						id: 'requirement-1',
						organizationId: 'org-1',
						locationId: 'location-1',
						jobPositionId: 'position-1',
						minimumRequired: 3,
						createdAt: new Date('2026-01-01T00:00:00.000Z'),
						updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					},
				],
				pagination: {
					total: 2,
					limit: 1,
					offset: 0,
				},
			})
			.mockResolvedValueOnce({
				data: [
					{
						id: 'requirement-2',
						organizationId: 'org-1',
						locationId: 'location-2',
						jobPositionId: 'position-1',
						minimumRequired: 5,
						createdAt: new Date('2026-01-01T00:00:00.000Z'),
						updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					},
				],
				pagination: {
					total: 2,
					limit: 1,
					offset: 1,
				},
			});

		renderJobPositionsPage();

		await waitFor(() => {
			expect(screen.getByText('Cajero')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'Configurar mínimos de Cajero' }));

		const norteInput = await screen.findByLabelText('Mínimo requerido para Sucursal Norte');

		expect(mockFetchStaffingRequirementsList.mock.calls[0]?.[0]).toEqual({
			organizationId: 'org-1',
			jobPositionId: 'position-1',
			limit: 100,
			offset: 0,
		});
		expect(mockFetchStaffingRequirementsList.mock.calls[1]?.[0]).toEqual({
			organizationId: 'org-1',
			jobPositionId: 'position-1',
			limit: 1,
			offset: 1,
		});
		expect(norteInput).toHaveValue(5);
	});

	it('announces staffing minimum loading state in the dialog', async () => {
		let resolveLocations: (value: Awaited<ReturnType<typeof mockFetchLocationsAll>>) => void;
		mockFetchLocationsAll.mockReturnValue(
			new Promise((resolve) => {
				resolveLocations = resolve;
			}),
		);

		renderJobPositionsPage();

		await waitFor(() => {
			expect(screen.getByText('Cajero')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'Configurar mínimos de Cajero' }));

		expect(
			await screen.findByRole('status', { name: 'Cargando mínimos de personal' }),
		).toBeInTheDocument();

		resolveLocations!([]);
	});
});
