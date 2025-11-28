import React, { type ReactNode } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { OrgProvider } from '@/lib/org-client-context';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { NoOrganizationState } from '@/components/no-organization-state';
import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

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

	const content =
		orgContext.organizationId === null ? (
			<NoOrganizationState role={userRole} />
		) : (
			<OrgProvider value={orgContext}>{children}</OrgProvider>
		);

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<div className="ml-auto flex items-center gap-2">
						<ThemeModeToggle />
					</div>
				</header>
				<main className="flex-1 overflow-auto p-6">{content}</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
