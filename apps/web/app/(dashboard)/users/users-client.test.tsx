import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import rawMessages from '@/messages/es.json';

import { UsersPageClient } from './users-client';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchOrganizationMembers = vi.fn();
const mockFetchUsers = vi.fn();
const mockFetchAllOrganizations = vi.fn();
const mockUseSession = vi.fn();
const mockUpdateOrganizationMemberRole = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('next-intl', async () => {
	const rawIntlMessages = await import('@/messages/es.json');
	const intlMessages =
		(rawIntlMessages as { default?: typeof rawIntlMessages }).default ?? rawIntlMessages;

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
					currentValue &&
					typeof currentValue === 'object' &&
					segment in currentValue
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
	updateOrganizationMemberRole: (...args: unknown[]) =>
		mockUpdateOrganizationMemberRole(...args),
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
		mockFetchOrganizationMembers.mockReset();
		mockFetchUsers.mockReset();
		mockFetchAllOrganizations.mockReset();
		mockUseSession.mockReset();
		mockUpdateOrganizationMemberRole.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockRouterRefresh.mockReset();

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

	it('keeps role changes disabled for superusers without organization membership', async () => {
		renderWithProviders({ organizationRole: null, userRole: 'admin' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		expect(
			screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }),
		).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' })).toBeDisabled();
		expect(screen.getAllByText('Miembro')).toHaveLength(2);
		expect(mockUpdateOrganizationMemberRole).not.toHaveBeenCalled();
	});

	it('shows an error toast when updating the role fails', async () => {
		mockUpdateOrganizationMemberRole.mockResolvedValueOnce({
			success: false,
			error: 'Failed to update member role',
		});

		renderWithProviders({ organizationRole: 'owner' });

		await waitFor(() => {
			expect(screen.getByText('Ana Miembro')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Cambiar rol de Ana Miembro' }));
		fireEvent.click(screen.getByRole('option', { name: 'Administrador' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar rol de Ana Miembro' }));

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith('No se pudo actualizar el rol');
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
