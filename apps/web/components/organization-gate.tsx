'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { NoOrganizationState } from '@/components/no-organization-state';

/**
 * Props for the OrganizationGate component.
 */
interface OrganizationGateProps {
	/** The user's role (admin, owner, user, etc.) */
	role: string;
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
	hasOrganization,
	children,
}: OrganizationGateProps): ReactNode {
	const pathname = usePathname();
	const isAdmin = role === 'admin' || role === 'owner';
	const isOrganizationsRoute =
		pathname === '/organizations' || pathname.startsWith('/organizations/');

	// Show NoOrganizationState if no organization, unless admin on organizations route
	const shouldShowNoOrganizationState = !hasOrganization && !(isAdmin && isOrganizationsRoute);

	if (shouldShowNoOrganizationState) {
		return <NoOrganizationState role={role} />;
	}

	return children;
}





