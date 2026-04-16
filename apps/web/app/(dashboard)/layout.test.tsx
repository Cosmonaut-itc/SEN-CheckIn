import type React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAccessContext } from '@/lib/organization-context';

const mockOrgProvider = vi.fn(
	({
		children,
	}: {
		children: React.ReactNode;
		value: {
			organizationId: string | null;
			organizationName: string | null;
			organizationRole?: 'admin' | 'owner' | 'member' | null;
			organizationSlug: string | null;
			organizationTimeZone?: string | null;
			userRole?: string;
		};
	}): React.ReactElement => <>{children}</>,
);

vi.mock('@/components/app-sidebar', () => ({
	AppSidebar: (): React.ReactElement => <div data-testid="app-sidebar" />,
}));

vi.mock('@/components/organization-gate', () => ({
	OrganizationGate: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
}));

vi.mock('@/components/theme-mode-toggle', () => ({
	ThemeModeToggle: (): React.ReactElement => <div data-testid="theme-mode-toggle" />,
}));

vi.mock('@/components/ui/separator', () => ({
	Separator: (): React.ReactElement => <div data-testid="separator" />,
}));

vi.mock('@/components/ui/sidebar', () => ({
	SidebarInset: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
	SidebarProvider: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
	SidebarTrigger: (): React.ReactElement => <div data-testid="sidebar-trigger" />,
}));

vi.mock('@/lib/org-client-context', () => ({
	OrgProvider: mockOrgProvider,
}));

vi.mock('@/lib/organization-context', () => ({
	getAdminAccessContext: vi.fn(),
}));

vi.mock('@/lib/server-client-functions', () => ({
	fetchPayrollSettingsServer: vi.fn(),
}));

vi.mock('next/headers', () => ({
	headers: vi.fn(),
}));

describe('DashboardLayout', () => {
	beforeEach(async () => {
		mockOrgProvider.mockClear();

		const organizationContextModule = await import('@/lib/organization-context');
		const serverClientFunctionsModule = await import('@/lib/server-client-functions');
		const nextHeadersModule = await import('next/headers');
		const getAdminAccessContext =
			organizationContextModule.getAdminAccessContext as unknown as ReturnType<typeof vi.fn>;
		const fetchPayrollSettingsServer =
			serverClientFunctionsModule.fetchPayrollSettingsServer as unknown as ReturnType<
				typeof vi.fn
			>;
		const headers = nextHeadersModule.headers as unknown as ReturnType<typeof vi.fn>;

		getAdminAccessContext.mockReset();
		fetchPayrollSettingsServer.mockReset();
		headers.mockReset();

		getAdminAccessContext.mockResolvedValue({
			organization: {
				organizationId: 'org-1',
				organizationSlug: 'org-1',
				organizationName: 'Org 1',
			},
			organizationRole: 'owner',
			userRole: 'admin',
			isSuperUser: false,
			canAccessAdminRoutes: true,
		} satisfies AdminAccessContext);
		fetchPayrollSettingsServer.mockResolvedValue({
			enableDisciplinaryMeasures: false,
			timeZone: 'America/Tijuana',
		});
		headers.mockResolvedValue(
			new Headers({
				cookie: 'session=abc123',
			}),
		);
	});

	it('passes the payroll settings timezone into the org client context', async () => {
		const { default: DashboardLayout } = await import('./layout');
		const layout = await DashboardLayout({
			children: <div data-testid="attendance-page" />,
		});

		render(layout);

		expect(mockOrgProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				value: expect.objectContaining({
					organizationId: 'org-1',
					organizationTimeZone: 'America/Tijuana',
				}),
			}),
			undefined,
		);
	});
});
