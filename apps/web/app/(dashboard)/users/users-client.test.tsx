import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import rawMessages from '@/messages/es.json';

import { UsersPageClient } from './users-client';

const messages =
	(rawMessages as unknown as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchOrganizationMembers = vi.fn();
const mockFetchUsers = vi.fn();
const mockFetchAllOrganizations = vi.fn();
const mockUseSession = vi.fn();
const mockUpdateOrganizationMemberRole = vi.fn();
const mockDeleteGlobalUser = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('next-intl', async () => {
	const rawIntlMessages = await import('@/messages/es.json');
	const intlMessages =
		(rawIntlMessages as unknown as { default?: typeof rawMessages }).default ?? rawIntlMessages;

	/**
	 * Resolves a dot-notated translation path from the Spanish test messages.
	 *
	 * @param path - Translation namespace and key path
	 * @returns Localized string when found, otherwise the original path
	 */
	function resolveTranslation(path: string): string {
		const resolved = path
			.split('.')
			.reduce<unknown>(
				(currentValue, segment) =>
					currentValue && typeof currentValue === 'object' && segment in currentValue
						? (currentValue as Record<string, unknown>)[segment]
						: undefined,
				intlMessages,
			);

		return typeof resolved === 'string' ? resolved : path;
	}

	return {
		NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
		useTranslations:
			(namespace: string) =>
			(key: string, values?: Record<string, string | number>): string => {
				const localizedMessage = resolveTranslation(`${namespace}.${key}`);

				if (!values) {
					return localizedMessage;
				}

				return Object.entries(values).reduce(
					(currentMessage, [placeholder, value]) =>
						currentMessage.replace(`{${placeholder}}`, String(value)),
					localizedMessage,
				);
			},
	};
});

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		refresh: mockRouterRefresh,
		push: vi.fn(),
		replace: vi.fn(),
	}),
}));

vi.mock('@/lib/client-functions', () => ({
	fetchOrganizationMembers: (...args: unknown[]) => mockFetchOrganizationMembers(...args),
	fetchUsers: (...args: unknown[]) => mockFetchUsers(...args),
	fetchAllOrganizations: (...args: unknown[]) => mockFetchAllOrganizations(...args),
}));

vi.mock('@/lib/auth-client', () => ({
	useSession: (...args: unknown[]) => mockUseSession(...args),
}));

vi.mock('@/actions/users', () => ({
	createOrganizationUser: vi.fn(),
	addOrganizationMember: vi.fn(),
	updateOrganizationMemberRole: (...args: unknown[]) => mockUpdateOrganizationMemberRole(...args),
	deleteGlobalUser: (...args: unknown[]) => mockDeleteGlobalUser(...args),
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
 * Renders the users page client with query, org, and i18n providers.
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
					organizationName: 'Organización Demo',
					organizationSlug: 'organizacion-demo',
					organizationRole: 'owner',
					userRole: 'user',
					...orgOverrides,
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<UsersPageClient />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('UsersPageClient', () => {
	beforeEach(() => {
		Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
			configurable: true,
			value: vi.fn(),
			writable: true,
		});

		mockFetchOrganizationMembers.mockReset();
		mockFetchUsers.mockReset();
		mockFetchAllOrganizations.mockReset();
		mockUseSession.mockReset();
		mockUpdateOrganizationMemberRole.mockReset();
		mockDeleteGlobalUser.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockRouterRefresh.mockReset();
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true),
		);

		mockUseSession.mockReturnValue({
			data: {
				user: {
					id: 'user-admin',
					name: 'Persona Admin',
					email: 'admin@example.com',
					image: null,
					role: 'user',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					emailVerified: true,
					banned: false,
				},
				session: {
					id: 'session-1',
					userId: 'user-admin',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					expiresAt: new Date('2099-01-01T00:00:00.000Z'),
					token: 'token',
					ipAddress: null,
					userAgent: null,
				},
			},
			isPending: false,
			isRefetching: false,
			error: null,
			refetch: vi.fn(),
		});

		mockFetchOrganizationMembers.mockResolvedValue({
			members: [
				{
					id: 'member-1',
					userId: 'user-1',
					organizationId: 'org-1',
					role: 'member',
					createdAt: new Date('2026-01-10T00:00:00.000Z'),
					user: {
						id: 'user-1',
						name: 'Ana Miembro',
						email: 'ana@example.com',
						image: null,
					},
				},
			],
			total: 1,
		});
		mockFetchUsers.mockResolvedValue([]);
		mockFetchAllOrganizations.mockResolvedValue({ organizations: [] });
		mockUpdateOrganizationMemberRole.mockResolvedValue({
			success: true,
			data: {
				member: {
					id: 'member-1',
					userId: 'user-1',
					organizationId: 'org-1',
					role: 'admin',
				},
			},
		});
		mockDeleteGlobalUser.mockResolvedValue({
			success: true,
			data: {
				removedMemberships: 1,
				unlinkedEmployees: 1,
				reassignedDeductions: 0,
			},
		});
	});

	it('allows organization owners to change a member role', async () => {
		renderWithProviders({ organizationRole: 'owner', userRole: 'user' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockUpdateOrganizationMemberRole).toHaveBeenCalledWith({
				memberId: 'member-1',
				role: 'admin',
				organizationId: 'org-1',
				userId: 'user-1',
			});
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Rol actualizado correctamente');
	});

	it('keeps owner rows as read-only with helper copy', async () => {
		mockFetchOrganizationMembers.mockResolvedValueOnce({
			members: [
				{
					id: 'member-owner',
					userId: 'user-owner',
					organizationId: 'org-1',
					role: 'owner',
					createdAt: new Date('2026-01-10T00:00:00.000Z'),
					user: {
						id: 'user-owner',
						name: 'Olga Owner',
						email: 'owner@example.com',
						image: null,
					},
				},
			],
			total: 1,
		});

		renderWithProviders({ organizationRole: 'owner' });

		await waitFor(() => {
			expect(screen.getByText('Olga Owner')).toBeInTheDocument();
		});

		expect(
			screen.getByText('El rol de propietario se mantiene fuera de este flujo.'),
		).toBeInTheDocument();
		expect(screen.queryByRole('combobox', { name: 'Cambiar rol de Olga Owner' })).toBeNull();
	});

	it('allows platform superusers to edit roles without organization membership', async () => {
		renderWithProviders({ organizationRole: null, userRole: 'admin' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockUpdateOrganizationMemberRole).toHaveBeenCalledWith({
				memberId: 'member-1',
				organizationId: 'org-1',
				role: 'admin',
				userId: 'user-1',
			});
		});
	});

	it('shows an error toast when updating the role fails', async () => {
		mockUpdateOrganizationMemberRole.mockResolvedValueOnce({
			success: false,
			error: 'Only organization admins can update member roles',
			errorCode: 'ORGANIZATION_ADMIN_REQUIRED',
		});

		renderWithProviders({ organizationRole: 'owner' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith(
				'Solo los administradores de la organización pueden actualizar roles.',
			);
		});
	});

	it('refreshes members when the target member no longer exists', async () => {
		mockFetchOrganizationMembers
			.mockResolvedValueOnce({
				members: [
					{
						id: 'member-1',
						userId: 'user-1',
						organizationId: 'org-1',
						role: 'member',
						createdAt: new Date('2026-01-10T00:00:00.000Z'),
						user: {
							id: 'user-1',
							name: 'Ana Miembro',
							email: 'ana@example.com',
							image: null,
						},
					},
				],
				total: 1,
			})
			.mockResolvedValueOnce({
				members: [],
				total: 0,
			});
		mockUpdateOrganizationMemberRole.mockResolvedValueOnce({
			success: false,
			error: 'Member not found',
			errorCode: 'MEMBER_NOT_FOUND',
		});

		renderWithProviders({ organizationRole: 'owner' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith(
				'El miembro ya no existe en esta organización.',
			);
		});
		await waitFor(() => {
			expect(mockFetchOrganizationMembers).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(screen.queryByText('Ana Miembro')).not.toBeInTheDocument();
		});
	});

	it('allows self-demotion requests for non-superusers', async () => {
		mockUseSession.mockReturnValue({
			data: {
				user: {
					id: 'user-1',
					name: 'Ana Miembro',
					email: 'ana@example.com',
					image: null,
					role: 'user',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					emailVerified: true,
					banned: false,
				},
				session: {
					id: 'session-1',
					userId: 'user-1',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					expiresAt: new Date('2099-01-01T00:00:00.000Z'),
					token: 'token',
					ipAddress: null,
					userAgent: null,
				},
			},
			isPending: false,
			isRefetching: false,
			error: null,
			refetch: vi.fn(),
		});
		mockFetchOrganizationMembers.mockResolvedValueOnce({
			members: [
				{
					id: 'member-1',
					userId: 'user-1',
					organizationId: 'org-1',
					role: 'admin',
					createdAt: new Date('2026-01-10T00:00:00.000Z'),
					user: {
						id: 'user-1',
						name: 'Ana Miembro',
						email: 'ana@example.com',
						image: null,
					},
				},
			],
			total: 1,
		});
		mockUpdateOrganizationMemberRole.mockResolvedValueOnce({
			success: true,
			data: {
				member: {
					id: 'member-1',
					userId: 'user-1',
					organizationId: 'org-1',
					role: 'member',
				},
			},
		});

		renderWithProviders({ organizationRole: 'admin', userRole: 'user' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Miembro' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockUpdateOrganizationMemberRole).toHaveBeenCalledWith({
				memberId: 'member-1',
				organizationId: 'org-1',
				role: 'member',
				userId: 'user-1',
			});
		});
		expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
		await waitFor(() => {
			expect(
				screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }),
			).toHaveTextContent('Miembro');
		});
		expect(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' })).toBeDisabled();
		expect(screen.getByTestId('users-create-button')).toBeDisabled();
	});

	it('allows superusers to edit roles after switching organizations', async () => {
		mockFetchAllOrganizations.mockResolvedValueOnce({
			organizations: [
				{ id: 'org-1', name: 'Organización Demo', slug: 'organizacion-demo' },
				{ id: 'org-2', name: 'Organización Secundaria', slug: 'organizacion-secundaria' },
			],
		});

		renderWithProviders({
			organizationId: 'org-1',
			organizationRole: 'owner',
			userRole: 'admin',
		});

		await waitFor(() => {
			expect(screen.getByRole('combobox', { name: 'Organización' })).not.toBeDisabled();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Organización' }));
		fireEvent.click(await screen.findByRole('option', { name: 'Organización Secundaria' }));

		await waitFor(() => {
			expect(mockFetchOrganizationMembers).toHaveBeenLastCalledWith({
				limit: 10,
				offset: 0,
				organizationId: 'org-2',
			});
		});
		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: 'Buscar miembros...' })).not.toBeDisabled();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(await screen.findByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockUpdateOrganizationMemberRole).toHaveBeenLastCalledWith({
				memberId: 'member-1',
				organizationId: 'org-2',
				role: 'admin',
				userId: 'user-1',
			});
		});
	});

	it('deletes a user globally after confirmation', async () => {
		renderWithProviders({ organizationRole: 'owner', userRole: 'admin' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'Borrar usuario Ana Miembro' }));

		await waitFor(() => {
			expect(globalThis.confirm).toHaveBeenCalledWith(
				'¿Seguro que deseas borrar globalmente a Ana Miembro? Se eliminarán sus accesos y membresías, se conservará el empleado ligado y se preservará el historial operativo.',
			);
		});
		await waitFor(() => {
			expect(mockDeleteGlobalUser).toHaveBeenCalledWith(
				{
					userId: 'user-1',
				},
				expect.anything(),
			);
		});
		expect(mockToastSuccess).toHaveBeenCalledWith('Usuario borrado correctamente');
	});

	it('clears unsaved member role overrides after switching organizations', async () => {
		mockFetchAllOrganizations.mockResolvedValueOnce({
			organizations: [
				{ id: 'org-1', name: 'Organización Demo', slug: 'organizacion-demo' },
				{ id: 'org-2', name: 'Organización Secundaria', slug: 'organizacion-secundaria' },
			],
		});
		mockFetchOrganizationMembers.mockImplementation(
			async ({ organizationId }: { organizationId: string }) => {
				if (organizationId === 'org-2') {
					return {
						members: [
							{
								id: 'member-2',
								userId: 'user-2',
								organizationId: 'org-2',
								role: 'member',
								createdAt: new Date('2026-01-10T00:00:00.000Z'),
								user: {
									id: 'user-2',
									name: 'Bruno Secundario',
									email: 'bruno@example.com',
									image: null,
								},
							},
						],
						total: 1,
					};
				}

				return {
					members: [
						{
							id: 'member-1',
							userId: 'user-1',
							organizationId: 'org-1',
							role: 'member',
							createdAt: new Date('2026-01-10T00:00:00.000Z'),
							user: {
								id: 'user-1',
								name: 'Ana Miembro',
								email: 'ana@example.com',
								image: null,
							},
						},
					],
					total: 1,
				};
			},
		);

		renderWithProviders({
			organizationId: 'org-1',
			organizationRole: 'owner',
			userRole: 'admin',
		});

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		expect(
			screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }),
		).toHaveTextContent('Administrador');

		fireEvent.click(screen.getByRole('combobox', { name: 'Organización' }));
		fireEvent.click(await screen.findByRole('option', { name: 'Organización Secundaria' }));

		await waitFor(() => {
			expect(screen.getByText('Bruno Secundario')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Organización' }));
		fireEvent.click(await screen.findByRole('option', { name: 'Organización Demo' }));

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(
				screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }),
			).toHaveTextContent('Miembro');
		});
		expect(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' })).toBeDisabled();
	});

	it('surfaces member query failures instead of showing a silent empty state', async () => {
		mockFetchOrganizationMembers.mockRejectedValueOnce(new Error('network'));

		renderWithProviders({ organizationRole: 'owner' });

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith('No se pudieron cargar los miembros');
		});
		expect(screen.getByText('No se pudieron cargar los miembros.')).toBeInTheDocument();
	});
});
