'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { NoOrganizationState } from '@/components/no-organization-state';

/**
 * Admin-only route prefixes under the dashboard layout.
 */
const ADMIN_ROUTE_PREFIXES = [
	'/api-keys',
	'/payroll-settings',
	'/users',
	'/organizations',
];

/**
 * Determines whether a path points to an admin-only dashboard route.
 *
 * @param pathname - Current pathname from the Next.js router
 * @returns True when the route is admin-only
 */
function isAdminRoute(pathname: string): boolean {
	return ADMIN_ROUTE_PREFIXES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

/**
 * Props for the OrganizationGate component.
 */
interface OrganizationGateProps {
	/** The user's role (admin, owner, user, etc.) */
	role: string;
	/** Active organization role for the user */
	organizationRole: 'admin' | 'owner' | 'member' | null;
	/** Whether the user has an active organization */
	hasOrganization: boolean;
	/** The children to render when access is granted */
	children: ReactNode;
}

/**
 * Client component that gates access based on organization status.
 * Allows admins to access the organizations route even without an organization.
 *
 * @param props - Component props
 * @returns The gated content or NoOrganizationState
 */
export function OrganizationGate({
	role,
	organizationRole,
	hasOrganization,
	children,
}: OrganizationGateProps): ReactNode {
	const pathname = usePathname();
	const router = useRouter();
	const isSuperUser = role === 'admin' || role === 'owner';
	const isOrgAdmin = organizationRole === 'admin' || organizationRole === 'owner';
	const canAccessAdminRoutes = isSuperUser || isOrgAdmin;
	const shouldRedirectToRestricted = isAdminRoute(pathname) && !canAccessAdminRoutes;
	const isOrganizationsRoute =
		pathname === '/organizations' || pathname.startsWith('/organizations/');

	useEffect(() => {
		if (shouldRedirectToRestricted) {
			router.replace('/acceso-restringido');
		}
	}, [router, shouldRedirectToRestricted]);

	// Show NoOrganizationState if no organization, unless admin on organizations route
	const shouldShowNoOrganizationState =
		!hasOrganization && !(isSuperUser && isOrganizationsRoute);

	if (shouldRedirectToRestricted) {
		return null;
	}

	if (shouldShowNoOrganizationState) {
		return <NoOrganizationState role={role} />;
	}

	return children;
}
