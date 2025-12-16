import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { member } from '../db/schema.js';
import { auth } from '../../utils/auth.js';
import { UnauthorizedError } from '../errors/index.js';

/**
 * Session resolution result shape from BetterAuth.
 */
type AuthSessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Construct a Headers object that only carries authentication-related entries.
 *
 * This ensures we forward bearer tokens produced by the device authorization flow
 * and session cookies without leaking unrelated headers into BetterAuth internals.
 *
 * @param request - Incoming HTTP request
 * @returns Headers containing authorization and cookie data when present
 */
const buildSessionHeaders = (request: Request): Headers => {
	const sessionHeaders = new Headers();
	const authHeader = request.headers.get('authorization');
	const cookieHeader = request.headers.get('cookie');

	if (authHeader) {
		sessionHeaders.set('authorization', authHeader);
	}

	if (cookieHeader) {
		sessionHeaders.set('cookie', cookieHeader);
	}

	return sessionHeaders;
};

/**
 * Resolve a BetterAuth session from either a cookie-backed session or a bearer token.
 *
 * The bearer token path is required for OAuth 2.0 device code flows, where the client
 * receives an access token instead of a browser cookie.
 *
 * @param request - Incoming HTTP request
 * @returns Session result when authenticated, otherwise null
 */
const resolveSessionFromRequest = async (request: Request): Promise<AuthSessionResult | null> => {
	const session = await auth.api.getSession({
		headers: buildSessionHeaders(request),
	});

	return session ?? null;
};

/**
 * Type definition for an authenticated user from BetterAuth session.
 */
export interface AuthUser {
	/** Unique user identifier */
	id: string;
	/** User's email address */
	email: string;
	/** Whether the email has been verified */
	emailVerified: boolean;
	/** User's display name */
	name: string;
	/** User's profile image URL */
	image: string | null;
	/** Account creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
	/** User's role (e.g., 'user', 'admin') */
	role?: string;
	/** Whether the user is banned */
	banned?: boolean;
	/** Reason for ban if applicable */
	banReason?: string;
	/** Ban expiration date if applicable */
	banExpires?: Date;
}

/**
 * Type definition for an authenticated session from BetterAuth.
 */
export interface AuthSession {
	/** Unique session identifier */
	id: string;
	/** Session expiration timestamp */
	expiresAt: Date;
	/** Session token */
	token: string;
	/** Session creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
	/** IP address associated with session */
	ipAddress?: string;
	/** User agent string */
	userAgent?: string;
	/** User ID associated with session */
	userId: string;
	/** ID of the impersonating user if applicable */
	impersonatedBy?: string;
	/** ID of the active organization if applicable */
	activeOrganizationId?: string;
}

/**
 * Authentication plugin for Elysia using BetterAuth.
 * Provides session validation and injects user/session into the request context.
 *
 * This plugin should be used on routes that require authentication.
 * It will return a 401 Unauthorized response if no valid session is found.
 *
 * @example
 * ```typescript
 * // Apply to a group of routes
 * const protectedRoutes = new Elysia()
 *   .use(authPlugin)
 *   .get('/protected', ({ user, session }) => {
 *     return { userId: user.id, sessionId: session.id };
 *   });
 * ```
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' }).derive(
	{ as: 'scoped' },
	async ({ request }): Promise<{ user: AuthUser; session: AuthSession }> => {
		const session = await resolveSessionFromRequest(request);

		if (!session) {
			throw new UnauthorizedError('No valid session found');
		}

		return {
			user: session.user as AuthUser,
			session: session.session as AuthSession,
		};
	},
);

/**
 * API Key authentication plugin for Elysia using BetterAuth.
 * Validates API key from Authorization header (Bearer token) or x-api-key header.
 *
 * This plugin is designed for machine-to-machine authentication scenarios.
 * It will return a 401 Unauthorized response if no valid API key is found.
 *
 * @example
 * ```typescript
 * // Apply to a group of routes for API key auth
 * const apiRoutes = new Elysia()
 *   .use(apiKeyAuthPlugin)
 *   .get('/api/data', ({ apiKeyId }) => {
 *     return { authenticatedWithApiKey: apiKeyId };
 *   });
 * ```
 */
/**
 * Extracts organization ID from API key metadata.
 *
 * @param metadata - Unknown value that may contain organizationId as a string or JSON string
 * @returns Organization ID string if found in metadata, otherwise null
 */
const extractOrganizationIdFromMetadata = (metadata: unknown): string | null => {
	if (!metadata) return null;

	let parsed: unknown = metadata;

	if (typeof metadata === 'string') {
		try {
			parsed = JSON.parse(metadata);
		} catch (error) {
			console.warn('Failed to parse API key metadata JSON', error);
			return null;
		}
	}

	if (parsed && typeof parsed === 'object' && 'organizationId' in parsed) {
		const orgId = (parsed as { organizationId?: unknown }).organizationId;
		return typeof orgId === 'string' ? orgId : null;
	}

	return null;
};

/**
 * Builds API key context with organization information.
 *
 * @param apiKey - API key object containing id, optional name, userId, and optional metadata
 * @returns Promise resolving to context object with apiKeyId (string), apiKeyName (string | null),
 *   apiKeyUserId (string), apiKeyOrganizationId (string | null), and apiKeyOrganizationIds (string[])
 */
const buildApiKeyContext = async (apiKey: {
	id: string;
	name?: string | null;
	userId: string;
	metadata?: unknown;
}): Promise<{
	apiKeyId: string;
	apiKeyName: string | null;
	apiKeyUserId: string;
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
}> => {
	const organizationIds = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, apiKey.userId));

	const scopedOrgFromMetadata = extractOrganizationIdFromMetadata(apiKey.metadata);
	const resolvedOrganizationId =
		scopedOrgFromMetadata ??
		(organizationIds.length === 1 ? (organizationIds[0]?.organizationId ?? null) : null);

	return {
		apiKeyId: apiKey.id,
		apiKeyName: apiKey.name ?? null,
		apiKeyUserId: apiKey.userId,
		apiKeyOrganizationId: resolvedOrganizationId,
		apiKeyOrganizationIds: organizationIds
			.map(({ organizationId }) => organizationId)
			.filter((orgId): orgId is string => Boolean(orgId)),
	};
};

export const apiKeyAuthPlugin = new Elysia({ name: 'api-key-auth-plugin' }).derive(
	{ as: 'scoped' },
	async ({
		request,
	}): Promise<{
		apiKeyId: string;
		apiKeyName: string | null;
		apiKeyUserId: string;
		apiKeyOrganizationId: string | null;
		apiKeyOrganizationIds: string[];
	}> => {
		// Extract API key from headers
		const authHeader = request.headers.get('authorization');
		const apiKeyHeader = request.headers.get('x-api-key');

		let apiKey: string | null = null;

		if (authHeader?.startsWith('Bearer ')) {
			apiKey = authHeader.slice(7);
		} else if (apiKeyHeader) {
			apiKey = apiKeyHeader;
		}

		if (!apiKey) {
			throw new UnauthorizedError('No API key provided');
		}

		// Validate the API key using BetterAuth
		const result = await auth.api.verifyApiKey({
			body: {
				key: apiKey,
			},
		});

		if (!result.valid || !result.key) {
			throw new UnauthorizedError('Invalid API key');
		}

		return buildApiKeyContext(result.key);
	},
);

/**
 * Combined authentication plugin that accepts either session or API key authentication.
 * Useful for routes that need to support both browser sessions and API key access.
 *
 * This plugin first tries session authentication, then falls back to API key authentication.
 * It will return a 401 Unauthorized response if neither method succeeds.
 *
 * @example
 * ```typescript
 * // Apply to routes that support both auth methods
 * const flexibleRoutes = new Elysia()
 *   .use(combinedAuthPlugin)
 *   .get('/data', ({ authType, user, apiKeyId }) => {
 *     if (authType === 'session') {
 *       return { user: user?.id };
 *     }
 *     return { apiKey: apiKeyId };
 *   });
 * ```
 */
export const combinedAuthPlugin = new Elysia({ name: 'combined-auth-plugin' }).derive(
	{ as: 'scoped' },
	async ({
		request,
	}): Promise<
		| {
				authType: 'session';
				user: AuthUser;
				session: AuthSession;
				sessionOrganizationIds: string[];
				apiKeyId: null;
				apiKeyName: null;
				apiKeyUserId: null;
				apiKeyOrganizationId: null;
				apiKeyOrganizationIds: [];
		  }
		| {
				authType: 'apiKey';
				user: null;
				session: null;
				sessionOrganizationIds: [];
				apiKeyId: string;
				apiKeyName: string | null;
				apiKeyUserId: string;
				apiKeyOrganizationId: string | null;
				apiKeyOrganizationIds: string[];
		  }
	> => {
		// First, try session authentication
		const session = await resolveSessionFromRequest(request);

		if (session) {
			const memberships = await db
				.select({ organizationId: member.organizationId })
				.from(member)
				.where(eq(member.userId, session.user.id));

			const sessionOrganizationIds = memberships
				.map(({ organizationId }) => organizationId)
				.filter((orgId): orgId is string => Boolean(orgId));

			return {
				authType: 'session',
				user: session.user as AuthUser,
				session: session.session as AuthSession,
				sessionOrganizationIds,
				apiKeyId: null,
				apiKeyName: null,
				apiKeyUserId: null,
				apiKeyOrganizationId: null,
				apiKeyOrganizationIds: [],
			};
		}

		// If no session, try API key authentication
		const authHeader = request.headers.get('authorization');
		const apiKeyHeader = request.headers.get('x-api-key');

		let apiKey: string | null = null;

		if (authHeader?.startsWith('Bearer ')) {
			apiKey = authHeader.slice(7);
		} else if (apiKeyHeader) {
			apiKey = apiKeyHeader;
		}

		if (apiKey) {
			const result = await auth.api.verifyApiKey({
				body: {
					key: apiKey,
				},
			});

			if (result.valid && result.key) {
				const apiKeyContext = await buildApiKeyContext(result.key);

				return {
					authType: 'apiKey',
					user: null,
					session: null,
					sessionOrganizationIds: [],
					...apiKeyContext,
				};
			}
		}

		// Neither authentication method succeeded
		throw new UnauthorizedError('No valid session or API key found');
	},
);
