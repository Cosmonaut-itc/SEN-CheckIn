import { and, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import { auth } from '../../utils/auth.js';
import db from '../db/index.js';
import { member, organization, user as userTable } from '../db/schema.js';
import { authPlugin } from '../plugins/auth.js';
import { organizationAllQuerySchema, organizationMembersQuerySchema } from '../schemas/crud.js';

const addMemberSchema = z.object({
	userId: z.string().min(1, 'userId is required'),
	organizationId: z.string().optional(),
	role: z.enum(['admin', 'member']),
	teamId: z.string().optional(),
});

const provisionUserSchema = z.object({
	name: z.string().min(1, 'name is required'),
	email: z.string().email('email must be valid'),
	username: z.string().min(1, 'username is required'),
	password: z.string().min(8, 'password must be at least 8 characters'),
	role: z.enum(['admin', 'member']),
	organizationId: z.string().min(1, 'organizationId is required'),
});

/**
 * Parses organization metadata when stored as JSON text.
 *
 * @param rawMetadata - Raw metadata string from the database
 * @returns Parsed metadata object or null when unavailable/invalid
 */
function parseOrganizationMetadata(rawMetadata: string | null): Record<string, unknown> | null {
	if (!rawMetadata) {
		return null;
	}

	try {
		return JSON.parse(rawMetadata) as Record<string, unknown>;
	} catch (error) {
		console.warn('[organization] Failed to parse metadata JSON:', error);
		return null;
	}
}

/**
 * Escapes special characters for ILIKE pattern matching.
 *
 * @param value - Raw search string
 * @returns Escaped string safe for ILIKE patterns
 */
function escapeIlikePattern(value: string): string {
	return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Organization routes for member management.
 */
export const organizationRoutes = new Elysia({ prefix: '/organization' })
	.use(authPlugin)
	/**
	 * List all organizations (superuser only) with pagination and optional search.
	 *
	 * @route GET /organization/all
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.search - Search by name or slug (optional)
	 * @returns Array of organizations with total count
	 */
	.get(
		'/all',
		async ({ query, set, user }) => {
			if (user.role !== 'admin') {
				set.status = 403;
				return { error: 'Only superusers can list all organizations' };
			}

			const { limit, offset, search } = query;
			const conditions: SQL<unknown>[] = [];
			const normalizedSearch = search?.trim();

			if (normalizedSearch) {
				const escapedSearch = escapeIlikePattern(normalizedSearch);
				conditions.push(
					or(
						ilike(organization.name, `%${escapedSearch}%`),
						ilike(organization.slug, `%${escapedSearch}%`),
					)!,
				);
			}

			let baseQuery = db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					logo: organization.logo,
					metadata: organization.metadata,
					createdAt: organization.createdAt,
				})
				.from(organization);

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const organizationsResult = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(organization.name);

			let countQuery = db.select({ count: count() }).from(organization);

			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}

			const countResult = await countQuery;
			const total = countResult[0]?.count ?? 0;

			return {
				organizations: organizationsResult.map((org) => ({
					...org,
					metadata: parseOrganizationMetadata(org.metadata),
				})),
				total,
			};
		},
		{
			query: organizationAllQuerySchema,
		},
	)
	/**
	 * List organization members with pagination and optional search.
	 *
	 * @route GET /organization/members
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.search - Search by member name or email (optional)
	 * @param query.organizationId - Organization ID override (optional)
	 * @returns Array of organization members with total count
	 */
	.get(
		'/members',
		async ({ query, session, set, user }) => {
			const { limit, offset, search, organizationId: organizationIdQuery } = query;
			const organizationId = organizationIdQuery ?? session.activeOrganizationId ?? null;
			const isSuperUser = user.role === 'admin';

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			if (!isSuperUser) {
				const membership = await db
					.select({ id: member.id })
					.from(member)
					.where(
						and(eq(member.userId, session.userId), eq(member.organizationId, organizationId)),
					)
					.limit(1);

				if (!membership[0]) {
					set.status = 403;
					return { error: 'You must belong to the organization to view members' };
				}
			}

			const conditions: SQL<unknown>[] = [eq(member.organizationId, organizationId)];
			const normalizedSearch = search?.trim();
			if (normalizedSearch) {
				const escapedSearch = escapeIlikePattern(normalizedSearch);
				conditions.push(
					or(
						ilike(userTable.name, `%${escapedSearch}%`),
						ilike(userTable.email, `%${escapedSearch}%`),
					)!,
				);
			}

			let baseQuery = db
				.select({
					id: member.id,
					userId: member.userId,
					organizationId: member.organizationId,
					role: member.role,
					createdAt: member.createdAt,
					user: {
						id: userTable.id,
						name: userTable.name,
						email: userTable.email,
						image: userTable.image,
					},
				})
				.from(member)
				.innerJoin(userTable, eq(member.userId, userTable.id));

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const members = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(userTable.name, userTable.email);

			let countQuery = db
				.select({ count: count() })
				.from(member)
				.innerJoin(userTable, eq(member.userId, userTable.id));

			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}

			const countResult = await countQuery;
			const total = countResult[0]?.count ?? 0;

			return { members, total };
		},
		{
			query: organizationMembersQuerySchema,
		},
	)
	/**
	 * Add a user as a member of an organization using BetterAuth's server-only API.
	 *
	 * @route POST /organization/add-member-direct
	 * @returns success flag and optional member id
	 */
	.post(
		'/add-member-direct',
		async ({ body, session, set, user }) => {
			const organizationId = body.organizationId ?? session.activeOrganizationId ?? null;
			const isSuperUser = user.role === 'admin';

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			if (!isSuperUser) {
				const membership = await db
					.select({ role: member.role })
					.from(member)
					.where(
						and(
							eq(member.userId, session.userId),
							eq(member.organizationId, organizationId),
						),
					)
					.limit(1);

				const callerRole = membership[0]?.role ?? null;

				if (!callerRole) {
					set.status = 403;
					return { error: 'You must belong to the organization to add members' };
				}

				if (callerRole !== 'admin' && callerRole !== 'owner') {
					set.status = 403;
					return { error: 'Only organization admins can add members' };
				}
			}

			try {
				const payload: {
					userId: string;
					organizationId: string;
					role: 'admin' | 'member';
					teamId?: string;
				} = {
					userId: body.userId,
					organizationId,
					role: body.role,
				};

				if (body.teamId) {
					payload.teamId = body.teamId;
				}

				const result = await auth.api.addMember({
					body: payload,
				});

				const errorMessage = (result as { error?: { message?: string } }).error?.message;
				const success = (result as { success?: boolean }).success ?? !errorMessage;

				if (!success) {
					set.status = 400;
					return { error: errorMessage ?? 'Failed to add member' };
				}

				const memberId = (result as { data?: { id?: string } })?.data?.id ?? null;

				return { success: true, data: { memberId } };
			} catch (error) {
				console.error('Failed to add member to organization:', error);
				set.status = 500;
				return { error: 'Failed to add member to organization' };
			}
		},
		{
			body: addMemberSchema,
		},
	)
	/**
	 * Provision a user via sign-up and add them to an organization.
	 *
	 * @route POST /organization/provision-user
	 * @returns success flag and new user id
	 */
	.post(
		'/provision-user',
		async ({ body, request, session, set, user }) => {
			const organizationId = body.organizationId;
			const isSuperUser = user.role === 'admin';

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			if (!isSuperUser) {
				const membership = await db
					.select({ role: member.role })
					.from(member)
					.where(
						and(
							eq(member.userId, session.userId),
							eq(member.organizationId, organizationId),
						),
					)
					.limit(1);

				const callerRole = membership[0]?.role ?? null;

				if (!callerRole) {
					set.status = 403;
					return { error: 'You must belong to the organization to add members' };
				}

				if (callerRole !== 'admin' && callerRole !== 'owner') {
					set.status = 403;
					return { error: 'Only organization admins can add members' };
				}
			}

			try {
				const signUpResult = await auth.api.signUpEmail({
					body: {
						name: body.name,
						email: body.email,
						password: body.password,
						username: body.username,
					},
				});

				const signUpError = (signUpResult as { error?: { message?: string } }).error?.message;
				const createdUserId =
					(signUpResult as { data?: { user?: { id?: string } } }).data?.user?.id ?? null;

				if (signUpError || !createdUserId) {
					set.status = 400;
					return { error: signUpError ?? 'Failed to create user' };
				}

				const addMemberResult = await auth.api.addMember({
					body: {
						userId: createdUserId,
						organizationId,
						role: body.role,
					},
				});

				const addMemberError = (addMemberResult as { error?: { message?: string } }).error
					?.message;
				const addMemberSuccess =
					(addMemberResult as { success?: boolean }).success ?? !addMemberError;

				if (!addMemberSuccess) {
					try {
						await auth.api.removeUser({
							headers: request.headers,
							body: { userId: createdUserId },
						});
					} catch (rollbackError) {
						console.error('[organization] Rollback (remove user) failed:', rollbackError);
					}

					set.status = 400;
					return { error: addMemberError ?? 'Failed to add member' };
				}

				return { success: true, data: { userId: createdUserId } };
			} catch (error) {
				console.error('Failed to provision organization user:', error);
				set.status = 500;
				return { error: 'Failed to provision user' };
			}
		},
		{
			body: provisionUserSchema,
		},
	);
