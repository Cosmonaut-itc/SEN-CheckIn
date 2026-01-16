import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';
import { after } from 'next/server';
import { cache } from 'react';

export interface ActiveOrganizationContext {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
}

export type OrganizationMemberRole = 'admin' | 'owner' | 'member' | null;

export interface AdminAccessContext {
	organization: ActiveOrganizationContext;
	userRole: string;
	isSuperUser: boolean;
	organizationRole: OrganizationMemberRole;
	canAccessAdminRoutes: boolean;
}

type SessionResult = Awaited<ReturnType<typeof serverAuthClient.getSession>>;
type OrganizationListResult = Awaited<ReturnType<typeof serverAuthClient.organization.list>>;

interface SessionAndOrganizationsResult {
	fetchOptions: { headers: Headers };
	sessionResult: SessionResult;
	organizationsResponse: OrganizationListResult;
}

/**
 * Fetches the session and organization list in parallel for the current request.
 *
 * @returns Request headers plus session and organization list results
 */
const getSessionAndOrganizations = cache(
	async (): Promise<SessionAndOrganizationsResult> => {
		const fetchOptions = await getServerFetchOptions();
		const [sessionResult, organizationsResponse] = await Promise.all([
			serverAuthClient.getSession(undefined, fetchOptions),
			serverAuthClient.organization.list(undefined, fetchOptions),
		]);

		return { fetchOptions, sessionResult, organizationsResponse };
	},
);

/**
 * Resolves the active organization context from the session and org list.
 *
 * @param fetchOptions - Fetch options with forwarded headers
 * @param sessionResult - Session lookup result for the current request
 * @param organizationsResponse - Organization list response for the current request
 * @returns Active organization context for the request
 */
async function resolveActiveOrganizationContext(
	fetchOptions: { headers: Headers },
	sessionResult: SessionResult,
	organizationsResponse: OrganizationListResult,
): Promise<ActiveOrganizationContext> {
	const organizationIdFromSession = sessionResult.error
		? null
		: (sessionResult.data?.session?.activeOrganizationId ?? null);

	if (organizationsResponse.error) {
		console.error(
			'[organization-context] Failed to list organizations',
			organizationsResponse.error,
		);
		return { organizationId: null, organizationSlug: null, organizationName: null };
	}

	const organizations = (organizationsResponse.data ?? []) as Array<{
		id: string;
		slug?: string | null;
		name?: string | null;
	}>;

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
			after(async () => {
				try {
					await serverAuthClient.organization.setActive(
						{ organizationId: fallback.id },
						fetchOptions,
					);
				} catch (error) {
					console.error('[organization-context] Failed to set active organization', error);
				}
			});
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

export const getActiveOrganizationContext = cache(
	/**
	 * Resolves the active organization from the BetterAuth session.
	 *
	 * The BetterAuth organization plugin stores the active organization ID on the
	 * session (accessible via `session.activeOrganizationId`). We fetch the session
	 * on the server using forwarded request headers, then hydrate the slug/name by
	 * listing organizations and selecting the matching entry. This avoids encoding
	 * the org slug in the URL while still providing client components the context
	 * they need for organization-scoped actions.
	 *
	 * @returns Active organization context for the current request
	 */
	async (): Promise<ActiveOrganizationContext> => {
		const { fetchOptions, sessionResult, organizationsResponse } =
			await getSessionAndOrganizations();

		return resolveActiveOrganizationContext(
			fetchOptions,
			sessionResult,
			organizationsResponse,
		);
	},
);

export const getAdminAccessContext = cache(
	/**
	 * Resolves admin access context for the current request.
	 *
	 * @returns Admin access context with organization and role metadata
	 */
	async (): Promise<AdminAccessContext> => {
		const { fetchOptions, sessionResult, organizationsResponse } =
			await getSessionAndOrganizations();
		const organization = await resolveActiveOrganizationContext(
			fetchOptions,
			sessionResult,
			organizationsResponse,
		);
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
			userRole,
			isSuperUser,
			organizationRole,
			canAccessAdminRoutes,
		};
	},
);
