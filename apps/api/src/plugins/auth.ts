import { Elysia } from 'elysia';
import { auth } from '../../utils/auth.js';

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
	async ({ request: { headers }, set }): Promise<{ user: AuthUser; session: AuthSession }> => {
		const session = await auth.api.getSession({
			headers,
		});

		if (!session) {
			set.status = 401;
			throw new Error('Unauthorized: No valid session found');
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
export const apiKeyAuthPlugin = new Elysia({ name: 'api-key-auth-plugin' }).derive(
	{ as: 'scoped' },
	async ({ request, set }): Promise<{ apiKeyId: string; apiKeyName: string | null }> => {
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
			set.status = 401;
			throw new Error('Unauthorized: No API key provided');
		}

		// Validate the API key using BetterAuth
		const result = await auth.api.verifyApiKey({
			body: {
				key: apiKey,
			},
		});

		if (!result.valid || !result.key) {
			set.status = 401;
			throw new Error('Unauthorized: Invalid API key');
		}

		return {
			apiKeyId: result.key.id,
			apiKeyName: result.key.name ?? null,
		};
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
		set,
	}): Promise<
		| { authType: 'session'; user: AuthUser; session: AuthSession; apiKeyId: null; apiKeyName: null }
		| { authType: 'apiKey'; user: null; session: null; apiKeyId: string; apiKeyName: string | null }
	> => {
		// First, try session authentication
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (session) {
			return {
				authType: 'session',
				user: session.user as AuthUser,
				session: session.session as AuthSession,
				apiKeyId: null,
				apiKeyName: null,
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
				return {
					authType: 'apiKey',
					user: null,
					session: null,
					apiKeyId: result.key.id,
					apiKeyName: result.key.name ?? null,
				};
			}
		}

		// Neither authentication method succeeded
		set.status = 401;
		throw new Error('Unauthorized: No valid session or API key found');
	},
);

