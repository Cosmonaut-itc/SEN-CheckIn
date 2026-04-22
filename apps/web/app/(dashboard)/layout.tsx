import { AppSidebar } from '@/components/app-sidebar';
import { OrganizationGate } from '@/components/organization-gate';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { getDashboardOrganizationContext } from '@/lib/dashboard-organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { getAdminAccessContext } from '@/lib/organization-context';
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
	const [
		{ userRole, isSuperUser, organizationRole },
		dashboardOrganization,
	] = await Promise.all([
		getAdminAccessContext(),
		getDashboardOrganizationContext(),
	]);

	return (
		<SidebarProvider>
			<AppSidebar
				isSuperUser={isSuperUser}
				organizationRole={organizationRole}
				enableDisciplinaryMeasures={dashboardOrganization.enableDisciplinaryMeasures}
			/>
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<div className="ml-auto flex items-center gap-2">
						<ThemeModeToggle />
					</div>
				</header>
				<main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6">
					<OrganizationGate
						role={userRole}
						organizationRole={organizationRole}
						hasOrganization={dashboardOrganization.organizationId !== null}
					>
						<OrgProvider
							value={{
								...dashboardOrganization,
								organizationRole,
								userRole,
							}}
						>
							{children}
						</OrgProvider>
					</OrganizationGate>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
