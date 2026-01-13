import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

export interface ActiveOrganizationContext {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
}

export type OrganizationMemberRole = 'admin' | 'owner' | 'member' | null;

export interface AdminAccessContext {
	organization: ActiveOrganizationContext;
	isSuperUser: boolean;
	organizationRole: OrganizationMemberRole;
	canAccessAdminRoutes: boolean;
}

type SessionResult = Awaited<ReturnType<typeof serverAuthClient.getSession>>;

/**
 * Resolves the active organization context from the session and org list.
 *
 * @param fetchOptions - Fetch options with forwarded headers
 * @param sessionResult - Session lookup result for the current request
 * @returns Active organization context for the request
 */
async function resolveActiveOrganizationContext(
	fetchOptions: { headers: Headers },
	sessionResult: SessionResult,
): Promise<ActiveOrganizationContext> {
	const organizationIdFromSession = sessionResult.error
		? null
		: (sessionResult.data?.session?.activeOrganizationId ?? null);

	const organizationsResponse = await serverAuthClient.organization.list(undefined, fetchOptions);

	if (organizationsResponse.error) {
		console.error(
			'[organization-context] Failed to list organizations',
			organizationsResponse.error,
		);
		return { organizationId: null, organizationSlug: null, organizationName: null };
	}

	const organizations = organizationsResponse.data ?? [];

	let organizationId = organizationIdFromSession;
	let activeOrg = organizations.find((org) => org.id === organizationId) ?? null;

	// Clear stale active organization ids that no longer exist
	if (organizationId && !activeOrg) {
		organizationId = null;
	}

	// Default to the first available organization and persist it on the session
	if (!organizationId && organizations.length > 0) {
		const fallback = organizations[0] ?? null;
		if (fallback) {
			try {
				await serverAuthClient.organization.setActive(
					{ organizationId: fallback.id },
					fetchOptions,
				);
			} catch (error) {
				console.error('[organization-context] Failed to set active organization', error);
			}
			organizationId = fallback.id;
			activeOrg = fallback;
		}
	}

	return {
		organizationId,
		organizationSlug: activeOrg?.slug ?? null,
		organizationName: activeOrg?.name ?? null,
	};
}

/**
 * Resolves the active organization from the BetterAuth session.
 *
 * The BetterAuth organization plugin stores the active organization ID on the
 * session (accessible via `session.activeOrganizationId`). We fetch the session
 * on the server using forwarded request headers, then hydrate the slug/name by
 * listing organizations and selecting the matching entry. This avoids encoding
 * the org slug in the URL while still providing client components the context
 * they need for organization-scoped actions.
 */
export async function getActiveOrganizationContext(): Promise<ActiveOrganizationContext> {
	const fetchOptions = await getServerFetchOptions();
	const sessionResult = await serverAuthClient.getSession(undefined, fetchOptions);

	return resolveActiveOrganizationContext(fetchOptions, sessionResult);
}

/**
 * Resolves admin access context for the current request.
 *
 * @returns Admin access context with organization and role metadata
 */
export async function getAdminAccessContext(): Promise<AdminAccessContext> {
	const fetchOptions = await getServerFetchOptions();
	const sessionResult = await serverAuthClient.getSession(undefined, fetchOptions);
	const organization = await resolveActiveOrganizationContext(fetchOptions, sessionResult);
	const userRole = sessionResult.data?.user?.role ?? 'user';
	const isSuperUser = userRole === 'admin';
	let organizationRole: OrganizationMemberRole = null;

	if (organization.organizationId) {
		try {
			const memberRoleResult = await serverAuthClient.organization.getActiveMemberRole(
				undefined,
				fetchOptions,
			);
			const resolvedRole = memberRoleResult.data?.role ?? null;
			if (resolvedRole === 'admin' || resolvedRole === 'owner' || resolvedRole === 'member') {
				organizationRole = resolvedRole;
			}
		} catch (error) {
			console.error('[organization-context] Failed to resolve active member role', error);
		}
	}

	const canAccessAdminRoutes =
		isSuperUser || organizationRole === 'admin' || organizationRole === 'owner';

	return {
		organization,
		isSuperUser,
		organizationRole,
		canAccessAdminRoutes,
	};
}
