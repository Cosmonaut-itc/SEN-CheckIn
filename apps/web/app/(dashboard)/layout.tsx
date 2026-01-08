import { AppSidebar } from '@/components/app-sidebar';
import { OrganizationGate } from '@/components/organization-gate';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { OrgProvider } from '@/lib/org-client-context';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';
import { redirect } from 'next/navigation';
import React, { type ReactNode } from 'react';

/**
 * Props for the DashboardLayout component.
 */
interface DashboardLayoutProps {
	/** Child components to render within the dashboard layout */
	children: ReactNode;
}

/**
 * Dashboard layout component with sidebar navigation.
 * Provides the main structure for all dashboard pages.
 *
 * @param props - Component props containing children
 * @returns The dashboard layout JSX element
 */
export default async function DashboardLayout({
	children,
}: DashboardLayoutProps): Promise<React.ReactElement> {
	const orgContext = await getActiveOrganizationContext();
	const fetchOptions = await getServerFetchOptions();
	const sessionResult = await serverAuthClient.getSession(undefined, fetchOptions);
	const userRole = sessionResult.data?.user?.role ?? 'user';
	const isSuperUser = userRole === 'admin';
	let memberRole: 'admin' | 'owner' | 'member' | null = null;

	if (orgContext.organizationId) {
		try {
			const memberRoleResult = await serverAuthClient.organization.getActiveMemberRole(
				undefined,
				fetchOptions,
			);
			const resolvedRole = memberRoleResult.data?.role ?? null;
			if (resolvedRole === 'admin' || resolvedRole === 'owner' || resolvedRole === 'member') {
				memberRole = resolvedRole;
			}
		} catch (error) {
			console.error('[dashboard-layout] Failed to resolve active member role', error);
		}
	}

	const isOrgAdmin = memberRole === 'admin' || memberRole === 'owner';

	if (!isSuperUser && orgContext.organizationId && !isOrgAdmin) {
		redirect('/acceso-restringido');
	}

	return (
		<SidebarProvider>
			<AppSidebar isSuperUser={isSuperUser} organizationRole={memberRole} />
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<div className="ml-auto flex items-center gap-2">
						<ThemeModeToggle />
					</div>
				</header>
				<main className="flex-1 overflow-auto p-6">
					<OrganizationGate
						role={userRole}
						hasOrganization={orgContext.organizationId !== null}
					>
						<OrgProvider value={orgContext}>{children}</OrgProvider>
					</OrganizationGate>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
