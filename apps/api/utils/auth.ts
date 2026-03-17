import { betterAuth, type Auth, type UnionToIntersection } from 'better-auth';
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
import { buildConfiguredOriginAllowlist, resolveTrustedOrigins } from '../src/utils/origin-allowlist.js';

/**
 * BetterAuth configuration for the Sen CheckIn API.
 * Provides authentication with email/password, API keys, admin management,
 * and organization support.
 */
type AuthPlugins = [
	ReturnType<typeof apiKey>,
	ReturnType<typeof admin>,
	ReturnType<typeof organization>,
	ReturnType<typeof username>,
	ReturnType<typeof deviceAuthorization>,
	ReturnType<typeof bearer>,
];

type AuthOptions = Omit<Parameters<typeof betterAuth>[0], 'plugins'> & {
	plugins: AuthPlugins;
};

type PluginEndpoints = AuthPlugins[number]['endpoints'];

type AuthApi = Auth<AuthOptions>['api'] & UnionToIntersection<PluginEndpoints>;

const AUTH_BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const configuredOrigins = buildConfiguredOriginAllowlist({
	authBaseUrl: AUTH_BASE_URL,
	corsOrigin: process.env.CORS_ORIGIN,
});

const authOptions: AuthOptions = {
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: schema,
	}),
	baseURL: AUTH_BASE_URL,
	/**
	 * Trusted origins are required for Better Auth to accept cross-origin requests.
	 * In development we also trust local LAN/Tailscale hosts dynamically so Expo
	 * simulators/devices keep working when the host IP changes.
	 */
	trustedOrigins: async (request) =>
		resolveTrustedOrigins(request.headers.get('origin'), {
			configuredOrigins,
			nodeEnv: process.env.NODE_ENV,
		}),
	emailAndPassword: {
		enabled: true,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
	},
	plugins: [
		/**
		 * API Key plugin for programmatic authentication.
		 */
		apiKey({
			enableMetadata: true,
		}),
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
			// Restrict organization creation to platform superusers.
			allowUserToCreateOrganization: async (user) =>
				process.env.NODE_ENV === 'production' ? user.role === 'admin' : true,
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
	] as AuthPlugins,
};

export const auth = betterAuth(authOptions) as Auth<typeof authOptions> & {
	api: AuthApi;
};

export type AuthInstance = typeof auth;
