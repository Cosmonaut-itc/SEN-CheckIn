import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { parseSetCookieHeader } from 'better-auth/cookies';

import db from '../db/index.js';
import { member, organization } from '../db/schema.js';

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
 * Builds a cookie header string from a Better Auth sign-in response.
 *
 * @param setCookieHeader - Raw Set-Cookie header returned by Better Auth
 * @returns Serialized Cookie header value
 * @throws Error when the response does not include any cookies
 */
function buildCookieHeader(setCookieHeader: string | null): string {
	if (!setCookieHeader) {
		throw new Error('Missing Set-Cookie header from sign-in response.');
	}

	const parsedCookies = parseSetCookieHeader(setCookieHeader);
	const cookiePairs = Array.from(parsedCookies.entries()).map(
		([cookieName, cookieValue]) => `${cookieName}=${cookieValue.value}`,
	);

	if (cookiePairs.length === 0) {
		throw new Error('No cookies found in Set-Cookie header.');
	}

	return cookiePairs.join('; ');
}

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

/**
 * Signs in a test user and returns its cookie header.
 *
 * @param email - User email address
 * @param password - User password
 * @returns Cookie header for authenticated requests
 * @throws Error when the sign-in response does not include cookies
 */
async function signInAsUser(email: string, password: string): Promise<string> {
	const signInResponse = await authInstance.api.signInEmail({
		body: { email, password },
		asResponse: true,
	});

	return buildCookieHeader(signInResponse.headers.get('set-cookie'));
}

/**
 * Creates an organization row directly in the Better Auth tables for contract tests.
 *
 * @param suffix - Unique suffix used to avoid slug collisions
 * @returns Created organization identifier
 */
async function createTestOrganization(suffix: string): Promise<string> {
	const organizationId = randomUUID();

	await db.insert(organization).values({
		id: organizationId,
		name: `Organización ${suffix}`,
		slug: `organizacion-${suffix}`,
		logo: null,
		metadata: null,
	});

	return organizationId;
}

/**
 * Creates a membership row for a user in a target organization.
 *
 * @param userId - User identifier
 * @param organizationId - Organization identifier
 * @param role - Membership role to assign
 * @returns Membership identifier
 */
async function createMembership(
	userId: string,
	organizationId: string,
	role: 'owner' | 'admin' | 'member',
): Promise<string> {
	const memberId = randomUUID();

	await db.insert(member).values({
		id: memberId,
		organizationId,
		userId,
		role,
	});

	return memberId;
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

	it('provisions a user and adds them to the organization', async () => {
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
	}, 15_000);

	it('allows organization admins to update a member role in their organization', async () => {
		const suffix = randomUUID().slice(0, 8);
		const orgAdminEmail = `org-admin.${suffix}@example.com`;
		const orgAdminUserId = await createMembershipUser(orgAdminEmail, `org_admin_${suffix}`);
		await createMembership(orgAdminUserId, seed.organizationId, 'admin');
		const memberUserId = await createMembershipUser(
			`role-target.${suffix}@example.com`,
			`role_target_${suffix}`,
		);
		const memberId = await createMembership(memberUserId, seed.organizationId, 'member');
		const orgAdminCookie = await signInAsUser(orgAdminEmail, 'User123!Test');

		const response = await client.organization['update-member-role-direct'].post({
			memberId,
			organizationId: seed.organizationId,
			role: 'admin',
			$headers: { cookie: orgAdminCookie },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.success).toBe(true);
		expect(payload.data?.member?.role).toBe('admin');

		const updatedMembership = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.id, memberId))
			.limit(1);

		expect(updatedMembership[0]?.role).toBe('admin');
	});

	it('allows platform superusers to update member roles without belonging to the organization', async () => {
		const suffix = randomUUID().slice(0, 8);
		const otherOrganizationId = await createTestOrganization(`superuser-${suffix}`);
		const memberUserId = await createMembershipUser(
			`superuser-target.${suffix}@example.com`,
			`superuser_target_${suffix}`,
		);
		const memberId = await createMembership(memberUserId, otherOrganizationId, 'member');

		const response = await client.organization['update-member-role-direct'].post({
			memberId,
			organizationId: otherOrganizationId,
			role: 'admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.success).toBe(true);
		expect(payload.data?.member?.role).toBe('admin');

		const updatedMembership = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.id, memberId))
			.limit(1);

		expect(updatedMembership[0]?.role).toBe('admin');
	});

	it('allows organization admins to demote themselves', async () => {
		const suffix = randomUUID().slice(0, 8);
		const orgAdminEmail = `self-demote.${suffix}@example.com`;
		const orgAdminUserId = await createMembershipUser(orgAdminEmail, `self_demote_${suffix}`);
		const orgAdminMemberId = await createMembership(
			orgAdminUserId,
			seed.organizationId,
			'admin',
		);
		const orgAdminCookie = await signInAsUser(orgAdminEmail, 'User123!Test');

		const response = await client.organization['update-member-role-direct'].post({
			memberId: orgAdminMemberId,
			organizationId: seed.organizationId,
			role: 'member',
			$headers: { cookie: orgAdminCookie },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.success).toBe(true);
		expect(payload.data?.member?.role).toBe('member');

		const updatedMembership = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.id, orgAdminMemberId))
			.limit(1);

		expect(updatedMembership[0]?.role).toBe('member');
	});

	it('allows organization owners to update members in their own organization', async () => {
		const suffix = randomUUID().slice(0, 8);
		const ownerEmail = `org-owner.${suffix}@example.com`;
		const ownerUserId = await createMembershipUser(ownerEmail, `org_owner_${suffix}`);
		await createMembership(ownerUserId, seed.organizationId, 'owner');

		const targetUserId = await createMembershipUser(
			`org-member.${suffix}@example.com`,
			`org_member_${suffix}`,
		);
		const targetMemberId = await createMembership(targetUserId, seed.organizationId, 'member');
		const ownerCookie = await signInAsUser(ownerEmail, 'User123!Test');

		const response = await client.organization['update-member-role-direct'].post({
			memberId: targetMemberId,
			organizationId: seed.organizationId,
			role: 'admin',
			$headers: { cookie: ownerCookie },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.success).toBe(true);
		expect(payload.data?.member?.role).toBe('admin');
	});

	it('blocks member-role callers from updating organization roles', async () => {
		const suffix = randomUUID().slice(0, 8);
		const targetUserId = await createMembershipUser(
			`member-target.${suffix}@example.com`,
			`member_target_${suffix}`,
		);
		const targetMemberId = await createMembership(targetUserId, seed.organizationId, 'member');

		const response = await client.organization['update-member-role-direct'].post({
			memberId: targetMemberId,
			organizationId: seed.organizationId,
			role: 'admin',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'member role update');
		expect(errorPayload.error.message).toBe('Only organization admins can update member roles');

		const unchangedMembership = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.id, targetMemberId))
			.limit(1);

		expect(unchangedMembership[0]?.role).toBe('member');
	});

	it('blocks organization admins from other organizations', async () => {
		const suffix = randomUUID().slice(0, 8);
		const otherOrganizationId = await createTestOrganization(`ajena-${suffix}`);
		const foreignAdminEmail = `foreign-admin.${suffix}@example.com`;
		const foreignAdminUserId = await createMembershipUser(
			foreignAdminEmail,
			`foreign_admin_${suffix}`,
		);
		await createMembership(foreignAdminUserId, otherOrganizationId, 'admin');

		const targetUserId = await createMembershipUser(
			`foreign-target.${suffix}@example.com`,
			`foreign_target_${suffix}`,
		);
		const targetMemberId = await createMembership(targetUserId, seed.organizationId, 'member');
		const foreignAdminCookie = await signInAsUser(foreignAdminEmail, 'User123!Test');

		const response = await client.organization['update-member-role-direct'].post({
			memberId: targetMemberId,
			organizationId: seed.organizationId,
			role: 'admin',
			$headers: { cookie: foreignAdminCookie },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'cross-organization admin update');
		expect(errorPayload.error.message).toBe(
			'You must belong to the organization to update members',
		);

		const unchangedMembership = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.id, targetMemberId))
			.limit(1);

		expect(unchangedMembership[0]?.role).toBe('member');
	});

	it('rejects attempts to change owner memberships from the direct endpoint', async () => {
		const suffix = randomUUID().slice(0, 8);
		const ownerUserId = await createMembershipUser(
			`owner-target.${suffix}@example.com`,
			`owner_target_${suffix}`,
		);
		const ownerMemberId = await createMembership(ownerUserId, seed.organizationId, 'owner');

		const response = await client.organization['update-member-role-direct'].post({
			memberId: ownerMemberId,
			organizationId: seed.organizationId,
			role: 'admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'owner role protection');
		expect(errorPayload.error.message).toBe('Owner role cannot be changed from this endpoint');
	});
});
