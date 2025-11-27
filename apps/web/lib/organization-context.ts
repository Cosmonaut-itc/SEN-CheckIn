import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

export interface ActiveOrganizationContext {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
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
	const sessionResult = await serverAuthClient.getSession({ fetchOptions });

	const organizationId = sessionResult.error
		? null
		: (sessionResult.data?.session?.activeOrganizationId ?? null);

	if (!organizationId) {
		return { organizationId: null, organizationSlug: null, organizationName: null };
	}

	const organizations = await serverAuthClient.organization.list({ fetchOptions });
	const activeOrg = organizations.data?.find((org) => org.id === organizationId);

	return {
		organizationId,
		organizationSlug: activeOrg?.slug ?? null,
		organizationName: activeOrg?.name ?? null,
	};
}
