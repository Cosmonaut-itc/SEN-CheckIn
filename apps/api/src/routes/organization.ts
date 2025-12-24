import { and, eq, ilike, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import { auth } from '../../utils/auth.js';
import db from '../db/index.js';
import { member, user } from '../db/schema.js';
import { authPlugin } from '../plugins/auth.js';
import { organizationMembersQuerySchema } from '../schemas/crud.js';

const addMemberSchema = z.object({
	userId: z.string().min(1, 'userId is required'),
	organizationId: z.string().optional(),
	role: z.enum(['admin', 'member']),
	teamId: z.string().optional(),
});

/**
 * Organization routes for member management.
 */
export const organizationRoutes = new Elysia({ prefix: '/organization' })
	.use(authPlugin)
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
		async ({ query, session, set }) => {
			const { limit, offset, search, organizationId: organizationIdQuery } = query;
			const organizationId = organizationIdQuery ?? session.activeOrganizationId ?? null;

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			const membership = await db
				.select({ id: member.id })
				.from(member)
				.where(and(eq(member.userId, session.userId), eq(member.organizationId, organizationId)))
				.limit(1);

			if (!membership[0]) {
				set.status = 403;
				return { error: 'You must belong to the organization to view members' };
			}

			const conditions: SQL<unknown>[] = [eq(member.organizationId, organizationId)];
			const normalizedSearch = search?.trim();
			if (normalizedSearch) {
				conditions.push(
					or(
						ilike(user.name, `%${normalizedSearch}%`),
						ilike(user.email, `%${normalizedSearch}%`),
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
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
					},
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id));

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const members = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(user.name, user.email);

			let countQuery = db
				.select({ id: member.id })
				.from(member)
				.innerJoin(user, eq(member.userId, user.id));

			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}

			const total = (await countQuery).length;

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
		async ({ body, request, session, set }) => {
			const organizationId = body.organizationId ?? session.activeOrganizationId ?? null;

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

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
					headers: request.headers,
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
	);
