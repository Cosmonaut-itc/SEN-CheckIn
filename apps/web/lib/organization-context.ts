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
	const sessionResult = await serverAuthClient.getSession(undefined, fetchOptions);

	const organizationIdFromSession = sessionResult.error
		? null
		: (sessionResult.data?.session?.activeOrganizationId ?? null);

	const organizationsResponse = await serverAuthClient.organization.list(undefined, fetchOptions);

	if (organizationsResponse.error) {
		console.error('[organization-context] Failed to list organizations', organizationsResponse.error);
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
