import { AppSidebar } from '@/components/app-sidebar';
import { OrganizationGate } from '@/components/organization-gate';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { OrgProvider } from '@/lib/org-client-context';
import { getAdminAccessContext } from '@/lib/organization-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import { headers } from 'next/headers';
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
	const { organization, userRole, isSuperUser, organizationRole } = await getAdminAccessContext();
	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';
	const payrollSettings = organization.organizationId
		? await fetchPayrollSettingsServer(cookieHeader, organization.organizationId)
		: null;
	const enableDisciplinaryMeasures = Boolean(payrollSettings?.enableDisciplinaryMeasures);

	return (
		<SidebarProvider>
			<AppSidebar
				isSuperUser={isSuperUser}
				organizationRole={organizationRole}
				enableDisciplinaryMeasures={enableDisciplinaryMeasures}
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
						hasOrganization={organization.organizationId !== null}
					>
						<OrgProvider
							value={{
								...organization,
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
