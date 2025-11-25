import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey, admin, organization } from 'better-auth/plugins';
import db from '../src/db/index.js';

/**
 * BetterAuth configuration for the Sen CheckIn API.
 * Provides authentication with email/password, API keys, admin management,
 * and organization support.
 */
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
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
		 * Only admins can create organizations.
		 */
		organization({
			allowUserToCreateOrganization: false,
		}),
	],
});
