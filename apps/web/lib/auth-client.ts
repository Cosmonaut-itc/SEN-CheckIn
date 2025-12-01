import { createAuthClient } from 'better-auth/react';
import {
	apiKeyClient,
	adminClient,
	deviceAuthorizationClient,
	organizationClient,
	usernameClient,
} from 'better-auth/client/plugins';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const API_ORIGIN: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const API_BASE_URL: string = API_ORIGIN.endsWith('/api/auth')
	? API_ORIGIN
	: `${API_ORIGIN}/api/auth`;

/**
 * Better Auth client configured with Admin, Organization, and API Key plugins.
 * Provides authentication methods and hooks for the admin portal.
 */
export const authClient = createAuthClient({
	baseURL: API_BASE_URL,
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
