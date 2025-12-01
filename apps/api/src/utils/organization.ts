import type { AuthSession } from '../plugins/auth.js';

export interface ResolveOrganizationInput {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
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
	apiKeyOrganizationId,
	apiKeyOrganizationIds,
	requestedOrganizationId,
}: ResolveOrganizationInput): string | null {
	const requested = requestedOrganizationId ?? null;

	if (authType === 'session') {
		return session?.activeOrganizationId ?? requested ?? null;
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
	apiKeyOrganizationIds: string[],
	targetOrganizationId: string | null | undefined,
): boolean {
	if (!targetOrganizationId) {
		return true;
	}

	if (authType === 'session') {
		const activeOrgId = session?.activeOrganizationId ?? null;
		return !activeOrgId || activeOrgId === targetOrganizationId;
	}

	return apiKeyOrganizationIds.includes(targetOrganizationId);
}
