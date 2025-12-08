import {
	adminClient,
	apiKeyClient,
	deviceAuthorizationClient,
	organizationClient,
	usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Resolve an absolute BetterAuth base URL that points to the web-host proxy.
 * BetterAuth requires an absolute URL; we build it from the current origin
 * on the client, or from NEXT_PUBLIC_WEB_URL on the server (SSG/SSR).
 *
 * @returns Absolute auth base URL (e.g., https://app.example.com/api/auth)
 */
function resolveAuthBaseUrl(): string {
	const envWebUrl = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? null;

	if (typeof window !== 'undefined' && window.location?.origin) {
		return `${window.location.origin}/api/auth`;
	}

	if (envWebUrl) {
		return `${envWebUrl}/api/auth`;
	}

	// Safe fallback for local dev/preview; should be overridden in production.
	return 'http://localhost:3001/api/auth';
}

const API_BASE_URL: string = resolveAuthBaseUrl();

/**
 * Better Auth client configured with Admin, Organization, and API Key plugins.
 * Provides authentication methods and hooks for the admin portal.
 * Ensures cookies are forwarded for session-aware endpoints.
 */
export const authClient = createAuthClient({
	baseURL: API_BASE_URL,
	fetchOptions: {
		credentials: 'include',
		mode: 'cors',
	},
	plugins: [
		apiKeyClient(),
		adminClient(),
		organizationClient(),
		usernameClient(),
		deviceAuthorizationClient(),
	],
});

/**
 * Destructured auth methods and hooks for convenient access.
 */
export const {
	signIn,
	signUp,
	signOut,
	useSession,
	/** Admin plugin methods for user management */
	admin,
	/** Organization plugin methods for org management */
	organization,
} = authClient;
