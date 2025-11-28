import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey, admin, organization, username } from 'better-auth/plugins';
import db from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

/**
 * BetterAuth configuration for the Sen CheckIn API.
 * Provides authentication with email/password, API keys, admin management,
 * and organization support.
 */
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	/**
	 * Trusted origins are required for Better Auth to accept cross-origin requests
	 * from the Next.js web app (dev runs on 3001). Update or extend as needed for
	 * preview/staging hosts.
	 */
	trustedOrigins: [
		'http://localhost:3000', // API host (fallback baseURL)
		'http://localhost:3001', // Next.js web dev server origin
		'http://127.0.0.1:3000',
		'http://127.0.0.1:3001',
	].filter(Boolean),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		/**
		 * API Key plugin for programmatic authentication.
		 */
		apiKey(),
		/**
		 * Admin plugin for user management.
		 * Allows listing users, changing roles, banning/unbanning users.
		 */
		admin({
			defaultRole: 'user',
			adminRoles: ['admin'],
		}),
		/**
		 * Organization plugin for multi-tenant support.
		 */
		organization({
			// Allow any authenticated user to create an organization; downstream
			// access is still governed by roles on the organization itself.
			allowUserToCreateOrganization: true,
		}),
		/**
		 * Username plugin to enable username-based sign-in.
		 */
		username(),
	],
});
