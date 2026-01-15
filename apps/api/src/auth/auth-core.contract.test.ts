import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	ensureTestDatabaseUrl,
	getAdminSession,
	getSeedData,
} from '../test-utils/contract-helpers.js';

describe('auth core endpoints (contract)', () => {
	let authInstance: typeof import('../../utils/auth.js').auth;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		ensureTestDatabaseUrl();
		const authModule = await import('../../utils/auth.js');
		authInstance = authModule.auth;
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('supports sign-up and sign-in with email/password', async () => {
		const suffix = randomUUID().slice(0, 8);
		const email = `auth.${suffix}@example.com`;
		const password = 'Auth123!Test';

		const signUpResult = await authInstance.api.signUpEmail({
			body: {
				name: 'Usuario Auth',
				email,
				password,
				username: `auth_${suffix}`,
			},
		});

		expect((signUpResult as { error?: unknown }).error).toBeUndefined();

		const signInResponse = await authInstance.api.signInEmail({
			body: { email, password },
			asResponse: true,
		});

		expect(signInResponse.status).toBe(200);
		const setCookieHeader = signInResponse.headers.get('set-cookie');
		expect(setCookieHeader).toBeTruthy();
	});

	it('returns a session for valid cookies', async () => {
		const session = await authInstance.api.getSession({
			headers: { cookie: adminSession.cookieHeader },
		});

		expect(session?.user?.id).toBe(adminSession.userId);
	});

	it('lists organizations and sets active organization', async () => {
		const listResponse = await authInstance.api.listOrganizations({
			headers: { cookie: adminSession.cookieHeader },
		});

		expect(Array.isArray(listResponse)).toBe(true);

		const setActiveResponse = await authInstance.api.setActiveOrganization({
			body: { organizationId: seed.organizationId },
			headers: { cookie: adminSession.cookieHeader },
			asResponse: true,
		});

		expect(setActiveResponse.status).toBe(200);
		expect(setActiveResponse.headers.get('set-cookie')).toBeTruthy();
	});

	it('creates, lists, and verifies API keys', async () => {
		const createResponse = await authInstance.api.createApiKey({
			body: {
				name: 'auth-contract',
				metadata: { organizationId: seed.organizationId },
			},
			headers: { cookie: adminSession.cookieHeader },
			asResponse: true,
		});

		expect(createResponse.status).toBe(200);
		const payload = (await createResponse.json()) as { key?: string };
		const apiKey = payload.key ?? '';
		expect(apiKey).toBeTruthy();

		const listResponse = await authInstance.api.listApiKeys({
			headers: { cookie: adminSession.cookieHeader },
		});

		expect(Array.isArray(listResponse)).toBe(true);

		const verifyResponse = await authInstance.api.verifyApiKey({
			body: { key: apiKey },
		});

		expect(verifyResponse.valid).toBe(true);
	});

	it('supports device authorization endpoints', async () => {
		const deviceCodeResponse = await authInstance.api.deviceCode({
			body: { client_id: 'sen-checkin-web' },
			asResponse: true,
		});

		expect(deviceCodeResponse.status).toBe(200);
		const devicePayload = (await deviceCodeResponse.json()) as {
			device_code?: string;
			user_code?: string;
		};
		expect(devicePayload.device_code).toBeTruthy();
		expect(devicePayload.user_code).toBeTruthy();

		const tokenResponse = await authInstance.api.deviceToken({
			body: {
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				device_code: 'invalid-device-code',
				client_id: 'sen-checkin-web',
			},
			asResponse: true,
		});

		expect(tokenResponse.status).toBe(400);
	});
});
