import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	ensureTestDatabaseUrl,
	getAdminSession,
	getSeedData,
	getUserIdByEmail,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
} from '../test-utils/contract-helpers.js';

let authInstance: typeof import('../../utils/auth.js').auth;

/**
 * Creates a BetterAuth user for organization membership tests.
 *
 * @param email - Email address for the new user
 * @param username - Username for the new user
 * @returns User ID for the created user
 * @throws Error when the user cannot be created
 */
async function createMembershipUser(email: string, username: string): Promise<string> {
	if (!authInstance) {
		throw new Error('Auth instance not initialized for contract tests.');
	}

	const signUpResult = await authInstance.api.signUpEmail({
		body: {
			name: 'Usuario Invitado',
			email,
			password: 'User123!Test',
			username,
		},
	});

	if ((signUpResult as { error?: unknown }).error) {
		throw new Error('Failed to create membership test user.');
	}

	return getUserIdByEmail(email);
}

describe('organization routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let userSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		ensureTestDatabaseUrl();
		const authModule = await import('../../utils/auth.js');
		authInstance = authModule.auth;
		adminSession = await getAdminSession();
		userSession = await getUserSession();
		seed = await getSeedData();
	});

	it('lists all organizations for superusers', async () => {
		const response = await client.organization.all.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.organizations)).toBe(true);
	});

	it('blocks non-superusers from listing all organizations', async () => {
		const response = await client.organization.all.get({
			$headers: { cookie: userSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'non-superuser list all');
		expect(errorPayload.error.message).toBe('Only superusers can list all organizations');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});

	it('lists organization members for standard users', async () => {
		const response = await client.organization.members.get({
			$headers: { cookie: userSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.members)).toBe(true);
	});

	it('adds members directly with BetterAuth', async () => {
		const suffix = randomUUID().slice(0, 8);
		const email = `invitado.${suffix}@example.com`;
		const username = `invite_${suffix}`;
		const userId = await createMembershipUser(email, username);

		const response = await client.organization['add-member-direct'].post({
			userId,
			role: 'member',
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.success).toBe(true);
	});

	it(
		'provisions a user and adds them to the organization',
		async () => {
			const suffix = randomUUID().slice(0, 8);
			const response = await client.organization['provision-user'].post({
				name: 'Nuevo Usuario',
				email: `provision.${suffix}@example.com`,
				username: `prov_${suffix}`,
				password: 'User123!Test',
				role: 'member',
				organizationId: seed.organizationId,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(200);
			const payload = requireResponseData(response);
			expect(payload.success).toBe(true);
			expect(payload.data?.userId).toBeDefined();
		},
		15_000,
	);
});
