import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import { auth } from '../../utils/auth.js';
import db from '../db/index.js';
import { member } from '../db/schema.js';
import { authPlugin } from '../plugins/auth.js';

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
