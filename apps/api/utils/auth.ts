import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
	admin,
	apiKey,
	bearer,
	deviceAuthorization,
	organization,
	username,
} from 'better-auth/plugins';
import db from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

/**
 * BetterAuth configuration for the Sen CheckIn API.
 * Provides authentication with email/password, API keys, admin management,
 * and organization support.
 */
export const auth: ReturnType<typeof betterAuth> = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	/**
	 * Trusted origins are required for Better Auth to accept -origin requests
	 * from the Next.js web app (dev runs on 3001). Update or extend as needed for
	 * preview/staging hosts.
	 */
	trustedOrigins: [
		'http://localhost:3000', // API host (fallback baseURL)
		'http://localhost:3001', // Next.js web dev server origin
		'http://127.0.0.1:3000',
		'http://127.0.0.1:3001',
		'http://10.0.2.2:3000', // Android emulator
		'http://10.0.3.2:3000', // Genymotion
		'http://0.0.0.0:3000',
		'http://localhost:19000', // Expo dev (metro)
		'http://127.0.0.1:19000',
		'http://100.110.215.102:3000',
		'http://100.89.145.51:3000',
		'sen-checkin://',
		'null', // allow native/Expo fetches with null Origin header
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
		/**
		 * Device Authorization plugin for kiosk/mobile login.
		 * See RFC 8628. Verification page served by web app at /device.
		 */
		deviceAuthorization({
			// Extend validity to reduce premature expirations seen during manual approval.
			expiresIn: '30m',
			interval: '5s',
			userCodeLength: 8,
		}),
		/**
		 * Bearer plugin to enable Authorization header authentication.
		 * Required for device authorization flow to work - allows mobile clients
		 * to authenticate using the access_token returned by /device/token.
		 */
		bearer(),
	],
});
