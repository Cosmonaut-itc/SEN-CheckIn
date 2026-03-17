import { type SQL, and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import { auth, organizationHooks } from '../../utils/auth.js';
import db from '../db/index.js';
import { member, organization, user as userTable } from '../db/schema.js';
import { authPlugin, buildSessionHeaders } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { organizationAllQuerySchema, organizationMembersQuerySchema } from '../schemas/crud.js';

const addMemberSchema = z.object({
	userId: z.string().min(1, 'userId is required'),
	organizationId: z.string().optional(),
	role: z.enum(['admin', 'member']),
	teamId: z.string().optional(),
});

const provisionUserSchema = z.object({
	name: z.string().min(1, 'NAME_REQUIRED'),
	email: z.string().email('INVALID_EMAIL'),
	username: z.string().min(1, 'USERNAME_REQUIRED'),
	password: z.string().min(8, 'PASSWORD_TOO_SHORT'),
	role: z.enum(['admin', 'member']),
	organizationId: z.string().min(1, 'ORGANIZATION_REQUIRED'),
});

const updateMemberRoleSchema = z.object({
	memberId: z.string().min(1, 'memberId is required'),
	organizationId: z.string().optional(),
	role: z.enum(['admin', 'member']),
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

type BetterAuthErrorBody = {
	code?: string;
	message?: string;
};

type BetterAuthErrorShape = {
	message?: string;
	status?: string | number;
	statusCode?: number;
	body?: BetterAuthErrorBody;
};

type BetterAuthNormalizedError = {
	message: string;
	code?: string;
	status: number;
};

const BETTER_AUTH_STATUS_CODES: Record<string, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	UNPROCESSABLE_ENTITY: 422,
	INTERNAL_SERVER_ERROR: 500,
};

/**
 * Resolves the HTTP status code for a BetterAuth error status value.
 *
 * @param status - Status value from BetterAuth error
 * @returns HTTP status code
 */
function resolveBetterAuthStatusCode(status: string | number | undefined): number {
	if (typeof status === 'number' && Number.isFinite(status)) {
		return status;
	}

	if (typeof status === 'string') {
		const normalized = status.toUpperCase();
		return BETTER_AUTH_STATUS_CODES[normalized] ?? 400;
	}

	return 400;
}

/**
 * Normalizes BetterAuth errors for consistent API responses.
 *
 * @param error - Unknown error thrown by BetterAuth
 * @param fallbackMessage - Default error message when none is provided
 * @returns Normalized error payload with status, code, and message
 */
function normalizeBetterAuthError(
	error: unknown,
	fallbackMessage: string,
): BetterAuthNormalizedError {
	if (!error || typeof error !== 'object') {
		return { message: fallbackMessage, status: 400 };
	}

	const typedError = error as BetterAuthErrorShape;
	const body = typedError.body ?? null;
	const message =
		typeof body?.message === 'string'
			? body.message
			: typeof typedError.message === 'string'
				? typedError.message
				: fallbackMessage;
	const code = typeof body?.code === 'string' ? body.code : undefined;
	const statusValue = typedError.statusCode ?? typedError.status;

	return {
		message,
		code,
		status: resolveBetterAuthStatusCode(statusValue),
	};
}

/**
 * Extracts error metadata from a BetterAuth response payload.
 *
 * @param result - BetterAuth response payload
 * @returns Error payload when present, otherwise null
 */
function extractBetterAuthResultError(result: unknown): { message?: string; code?: string } | null {
	if (!result || typeof result !== 'object') {
		return null;
	}

	if (!('error' in result)) {
		return null;
	}

	const errorValue = (result as { error?: unknown }).error;
	if (!errorValue || typeof errorValue !== 'object') {
		return null;
	}

	const errorMessage = (errorValue as { message?: unknown }).message;
	const errorCode = (errorValue as { code?: unknown }).code;

	if (typeof errorMessage !== 'string' && typeof errorCode !== 'string') {
		return null;
	}

	return {
		message: typeof errorMessage === 'string' ? errorMessage : undefined,
		code: typeof errorCode === 'string' ? errorCode : undefined,
	};
}

/**
 * Extracts the created user id from a BetterAuth sign-up response.
 *
 * @param result - Payload returned by BetterAuth signUpEmail
 * @returns User id or null when missing
 */
function extractSignUpUserId(result: unknown): string | null {
	if (!result || typeof result !== 'object') {
		return null;
	}

	const directUser = (result as { user?: unknown }).user;
	if (directUser && typeof directUser === 'object') {
		const directId = (directUser as { id?: unknown }).id;
		if (typeof directId === 'string' && directId.trim().length > 0) {
			return directId;
		}
	}

	const nestedData = (result as { data?: unknown }).data;
	if (nestedData && typeof nestedData === 'object') {
		const nestedUser = (nestedData as { user?: unknown }).user;
		if (nestedUser && typeof nestedUser === 'object') {
			const nestedId = (nestedUser as { id?: unknown }).id;
			if (typeof nestedId === 'string' && nestedId.trim().length > 0) {
				return nestedId;
			}
		}
	}

	return null;
}

/**
 * Wraps BetterAuth calls to normalize thrown errors and inline error payloads.
 *
 * @param action - BetterAuth API call to execute
 * @param fallbackMessage - Default error message when none is provided
 * @returns Wrapped result with data or normalized error
 */
async function callBetterAuth<T>(
	action: () => Promise<T>,
	fallbackMessage: string,
): Promise<{ data?: T; error?: BetterAuthNormalizedError }> {
	try {
		const result = await action();
		const resultError = extractBetterAuthResultError(result);

		if (resultError) {
			return {
				error: {
					message: resultError.message ?? fallbackMessage,
					code: resultError.code,
					status: 400,
				},
			};
		}

		return { data: result };
	} catch (error) {
		return { error: normalizeBetterAuthError(error, fallbackMessage) };
	}
}

/**
 * Resolves organization sorting for the list endpoint.
 *
 * @param sortBy - Field name to sort by
 * @param sortDir - Sort direction
 * @returns Drizzle order-by expression
 */
function resolveOrganizationOrderBy(
	sortBy: 'name' | 'slug' | 'createdAt' | undefined,
	sortDir: 'asc' | 'desc' | undefined,
): SQL<unknown> {
	const sortColumn =
		sortBy === 'slug'
			? organization.slug
			: sortBy === 'createdAt'
				? organization.createdAt
				: organization.name;
	return sortDir === 'desc' ? desc(sortColumn) : asc(sortColumn);
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
				return buildErrorResponse('Only superusers can list all organizations', 403);
			}

			const { limit, offset, search, sortBy, sortDir } = query;
			const conditions: SQL<unknown>[] = [];
			const normalizedSearch = search?.trim();
			const orderByClause = resolveOrganizationOrderBy(sortBy, sortDir);

			if (normalizedSearch) {
				const escapedSearch = escapeIlikePattern(normalizedSearch);
				const searchCondition = or(
					ilike(organization.name, `%${escapedSearch}%`),
					ilike(organization.slug, `%${escapedSearch}%`),
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
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
				.orderBy(orderByClause);

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
				return buildErrorResponse('Organization is required', 400, {
					code: 'ORGANIZATION_REQUIRED',
				});
			}

			if (!isSuperUser) {
				const membership = await db
					.select({ id: member.id })
					.from(member)
					.where(
						and(
							eq(member.userId, session.userId),
							eq(member.organizationId, organizationId),
						),
					)
					.limit(1);

				if (!membership[0]) {
					set.status = 403;
					return buildErrorResponse(
						'You must belong to the organization to view members',
						403,
					);
				}
			}

			const conditions: SQL<unknown>[] = [eq(member.organizationId, organizationId)];
			const normalizedSearch = search?.trim();
			if (normalizedSearch) {
				const escapedSearch = escapeIlikePattern(normalizedSearch);
				const searchCondition = or(
					ilike(userTable.name, `%${escapedSearch}%`),
					ilike(userTable.email, `%${escapedSearch}%`),
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
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
		async ({ body, request, session, set, user }) => {
			const organizationId = body.organizationId ?? session.activeOrganizationId ?? null;
			const isSuperUser = user.role === 'admin';

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
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
					return buildErrorResponse(
						'You must belong to the organization to add members',
						403,
					);
				}

				if (callerRole !== 'admin' && callerRole !== 'owner') {
					set.status = 403;
					return buildErrorResponse('Only organization admins can add members', 403);
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

				const sessionHeaders = buildSessionHeaders(request);
				const result = await auth.api.addMember({
					body: payload,
					headers: sessionHeaders,
				});

				const errorMessage = (result as { error?: { message?: string } }).error?.message;
				const success = (result as { success?: boolean }).success ?? !errorMessage;

				if (!success) {
					set.status = 400;
					return buildErrorResponse(errorMessage ?? 'Failed to add member', 400);
				}

				const memberId = (result as { data?: { id?: string } })?.data?.id ?? null;

				return { success: true, data: { memberId } };
			} catch (error) {
				console.error('Failed to add member to organization:', error);
				set.status = 500;
				return buildErrorResponse('Failed to add member to organization', 500);
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
			const sessionHeaders = buildSessionHeaders(request);
			let createdUserId: string | null = null;

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
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
					return buildErrorResponse(
						'You must belong to the organization to add members',
						403,
						{ code: 'ORGANIZATION_MEMBERSHIP_REQUIRED' },
					);
				}

				if (callerRole !== 'admin' && callerRole !== 'owner') {
					set.status = 403;
					return buildErrorResponse('Only organization admins can add members', 403, {
						code: 'ORGANIZATION_ADMIN_REQUIRED',
					});
				}
			}

			try {
				const signUpCall = await callBetterAuth(
					() =>
						auth.api.signUpEmail({
							body: {
								name: body.name,
								email: body.email,
								password: body.password,
								username: body.username,
							},
						}),
					'Failed to create user',
				);

				if (signUpCall.error) {
					console.error('[organization] Failed to sign up user during provisioning', {
						organizationId,
						error: signUpCall.error,
					});
					set.status = signUpCall.error.status;
					return buildErrorResponse(signUpCall.error.message, signUpCall.error.status, {
						code: signUpCall.error.code ?? 'USER_SIGNUP_FAILED',
					});
				}

				createdUserId = extractSignUpUserId(signUpCall.data);

				if (!createdUserId) {
					console.error('[organization] Missing user id after sign up', {
						organizationId,
					});
					set.status = 400;
					return buildErrorResponse('Failed to create user', 400, {
						code: 'USER_SIGNUP_FAILED',
					});
				}

				const addMemberCall = await callBetterAuth(
					() =>
						auth.api.addMember({
							body: {
								userId: createdUserId,
								organizationId,
								role: body.role,
							},
							headers: sessionHeaders,
						}),
					'Failed to add member',
				);

				if (addMemberCall.error) {
					console.error('[organization] Failed to add member during provisioning', {
						organizationId,
						userId: createdUserId,
						error: addMemberCall.error,
					});
					if (createdUserId) {
						try {
							await auth.api.removeUser({
								body: { userId: createdUserId },
								headers: sessionHeaders,
							});
						} catch (rollbackError) {
							console.error(
								'[organization] Rollback (remove user) failed:',
								rollbackError,
							);
						}
					}

					set.status = addMemberCall.error.status;
					return buildErrorResponse(
						addMemberCall.error.message,
						addMemberCall.error.status,
						{ code: addMemberCall.error.code ?? 'ADD_MEMBER_FAILED' },
					);
				}

				const addMemberResult = addMemberCall.data as {
					error?: { message?: string };
					success?: boolean;
				};

				const addMemberError = addMemberResult?.error?.message;
				const addMemberSuccess = addMemberResult?.success ?? !addMemberError;

				if (!addMemberSuccess) {
					console.error('[organization] Add member response indicated failure', {
						organizationId,
						userId: createdUserId,
						error: addMemberError ?? 'Unknown error',
					});
					if (createdUserId) {
						try {
							await auth.api.removeUser({
								body: { userId: createdUserId },
								headers: sessionHeaders,
							});
						} catch (rollbackError) {
							console.error(
								'[organization] Rollback (remove user) failed:',
								rollbackError,
							);
						}
					}

					set.status = 400;
					return buildErrorResponse(addMemberError ?? 'Failed to add member', 400, {
						code: 'ADD_MEMBER_FAILED',
					});
				}

				return { success: true, data: { userId: createdUserId } };
			} catch (error) {
				if (createdUserId) {
					try {
						await auth.api.removeUser({
							body: { userId: createdUserId },
							headers: sessionHeaders,
						});
					} catch (rollbackError) {
						console.error(
							'[organization] Rollback (remove user) failed:',
							rollbackError,
						);
					}
				}

				console.error('Failed to provision organization user:', error);
				set.status = 500;
				return buildErrorResponse('Failed to provision user', 500, {
					code: 'PROVISION_USER_FAILED',
				});
			}
		},
		{
			body: provisionUserSchema,
		},
	)
	/**
	 * Update an organization member role for organization admins and owners.
	 *
	 * @route POST /organization/update-member-role-direct
	 * @returns success flag and updated member snapshot
	 */
	.post(
		'/update-member-role-direct',
		async ({ body, request, session, set, user }) => {
			const organizationId = body.organizationId ?? session.activeOrganizationId ?? null;
			const isSuperUser = user.role === 'admin';

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
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
					return buildErrorResponse(
						'You must belong to the organization to update members',
						403,
					);
				}

				if (callerRole !== 'admin' && callerRole !== 'owner') {
					set.status = 403;
					return buildErrorResponse(
						'Only organization admins can update member roles',
						403,
					);
				}
			}

			const targetMembership = await db
				.select({
					createdAt: member.createdAt,
					id: member.id,
					organizationId: member.organizationId,
					role: member.role,
					userId: member.userId,
				})
				.from(member)
				.where(and(eq(member.id, body.memberId), eq(member.organizationId, organizationId)))
				.limit(1);

			const targetMember = targetMembership[0] ?? null;

			if (!targetMember) {
				set.status = 404;
				return buildErrorResponse('Member not found', 404);
			}

			if (targetMember.role === 'owner') {
				set.status = 403;
				return buildErrorResponse('Owner role cannot be changed from this endpoint', 403);
			}

			try {
				if (isSuperUser) {
					const shouldRunOrganizationHooks = Boolean(
						organizationHooks.beforeUpdateMemberRole ||
						organizationHooks.afterUpdateMemberRole,
					);
					const organizationRecord = shouldRunOrganizationHooks
						? await db.query.organization.findFirst({
								where: eq(organization.id, organizationId),
							})
						: null;
					const userBeingUpdated = shouldRunOrganizationHooks
						? await db.query.user.findFirst({
								where: eq(userTable.id, targetMember.userId),
							})
						: null;
					const beforeHookResult =
						shouldRunOrganizationHooks &&
						organizationRecord &&
						userBeingUpdated &&
						organizationHooks.beforeUpdateMemberRole
							? await organizationHooks.beforeUpdateMemberRole({
									member: targetMember,
									newRole: body.role,
									organization: organizationRecord,
									user: userBeingUpdated,
								})
							: undefined;
					const hookRole =
						beforeHookResult &&
						typeof beforeHookResult === 'object' &&
						'data' in beforeHookResult
							? (beforeHookResult.data?.role ?? body.role)
							: body.role;
					const roleToPersist =
						hookRole === 'admin' || hookRole === 'member' ? hookRole : body.role;

					await db
						.update(member)
						.set({ role: roleToPersist })
						.where(
							and(
								eq(member.id, body.memberId),
								eq(member.organizationId, organizationId),
							),
						);
				} else {
					const sessionHeaders = buildSessionHeaders(request);
					const result = await auth.api.updateMemberRole({
						body: {
							memberId: body.memberId,
							organizationId,
							role: body.role,
						},
						headers: sessionHeaders,
					});

					const errorMessage = (result as { error?: { message?: string } }).error
						?.message;
					const success = (result as { success?: boolean }).success ?? !errorMessage;

					if (!success) {
						set.status = 400;
						return buildErrorResponse(
							errorMessage ?? 'Failed to update member role',
							400,
						);
					}
				}

				const updatedMembership = await db
					.select({
						createdAt: member.createdAt,
						id: member.id,
						organizationId: member.organizationId,
						role: member.role,
						userId: member.userId,
					})
					.from(member)
					.where(
						and(
							eq(member.id, body.memberId),
							eq(member.organizationId, organizationId),
						),
					)
					.limit(1);
				const updatedMember = updatedMembership[0] ?? null;
				if (isSuperUser && updatedMember && organizationHooks.afterUpdateMemberRole) {
					const organizationRecord = await db.query.organization.findFirst({
						where: eq(organization.id, organizationId),
					});
					const userBeingUpdated = await db.query.user.findFirst({
						where: eq(userTable.id, updatedMember.userId),
					});

					if (organizationRecord && userBeingUpdated) {
						await organizationHooks.afterUpdateMemberRole({
							member: updatedMember,
							organization: organizationRecord,
							previousRole: targetMember.role,
							user: userBeingUpdated,
						});
					}
				}

				return { success: true, data: { member: updatedMember } };
			} catch (error) {
				console.error('Failed to update member role:', error);
				const errorObject =
					error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
				const isBetterAuthError = errorObject
					? 'status' in errorObject ||
						'statusCode' in errorObject ||
						'body' in errorObject
					: false;
				if (!isBetterAuthError) {
					set.status = 500;
					return buildErrorResponse('Failed to update member role', 500);
				}

				const normalizedError = normalizeBetterAuthError(
					error,
					'Failed to update member role',
				);
				set.status = normalizedError.status;
				return buildErrorResponse(normalizedError.message, normalizedError.status, {
					code: normalizedError.code,
				});
			}
		},
		{
			body: updateMemberRoleSchema,
		},
	);
