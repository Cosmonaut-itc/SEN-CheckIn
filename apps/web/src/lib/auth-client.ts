import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";

/**
 * Better-auth client configured to point to the API server.
 * Includes the API key plugin for managing API keys.
 *
 * The auth server runs on the Elysia API at localhost:3000.
 */
export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
	plugins: [apiKeyClient()],
});

/**
 * Convenience exports for common auth operations.
 */
export const {
	signIn,
	signUp,
	signOut,
	useSession,
	getSession,
} = authClient;
