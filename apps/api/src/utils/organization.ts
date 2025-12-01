import type { AuthSession } from '../plugins/auth.js';

export interface ResolveOrganizationInput {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
	requestedOrganizationId?: string | null;
}

/**
 * Resolve the organization ID that should be used for the current request.
 *
 * Session users prefer their active organization but can fall back to an
 * explicit request value. API-key callers are restricted to organizations the
 * key owner belongs to and, when present, to the organization encoded in the
 * key metadata.
 */
export function resolveOrganizationId({
	authType,
	session,
	sessionOrganizationIds,
	apiKeyOrganizationId,
	apiKeyOrganizationIds,
	requestedOrganizationId,
}: ResolveOrganizationInput): string | null {
	const requested = requestedOrganizationId ?? null;

	if (authType === 'session') {
		const active = session?.activeOrganizationId ?? null;
		if (active) {
			return active;
		}

		if (requested) {
			return sessionOrganizationIds.includes(requested) ? requested : null;
		}

		if (sessionOrganizationIds.length === 1) {
			return sessionOrganizationIds[0] ?? null;
		}

		return null;
	}

	// API key callers
	if (apiKeyOrganizationId) {
		if (requested && requested !== apiKeyOrganizationId) {
			return null;
		}
		return apiKeyOrganizationId;
	}

	if (requested && apiKeyOrganizationIds.includes(requested)) {
		return requested;
	}

	if (!requested && apiKeyOrganizationIds.length === 1) {
		return apiKeyOrganizationIds[0] ?? null;
	}

	return null;
}

/**
 * Check if the caller has access to a specific organization.
 */
export function hasOrganizationAccess(
        authType: 'session' | 'apiKey',
        session: AuthSession | null,
        sessionOrganizationIds: string[],
        apiKeyOrganizationIds: string[],
        targetOrganizationId: string | null | undefined,
): boolean {
        if (!targetOrganizationId) {
                return false;
        }

	if (authType === 'session') {
		const activeOrgId = session?.activeOrganizationId ?? null;
		if (activeOrgId) {
			return activeOrgId === targetOrganizationId;
		}
		return sessionOrganizationIds.includes(targetOrganizationId);
	}

	return apiKeyOrganizationIds.includes(targetOrganizationId);
}
