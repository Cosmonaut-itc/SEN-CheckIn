import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { endOfDay, format, startOfDay } from 'date-fns';
import { z } from 'zod';
import type { IncapacityType, SatTipoIncapacidad } from '@sen-checkin/types';

import db from '../db/index.js';
import {
	employee,
	employeeIncapacity,
	employeeIncapacityDocument,
	member,
	payrollSetting,
	scheduleException,
	scheduleTemplateDay,
	vacationRequest,
	vacationRequestDay,
	employeeSchedule,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import type { AuthSession } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { idParamSchema } from '../schemas/crud.js';
import {
	MAX_INCAPACITY_RANGE_DAYS,
	incapacityCreateSchema,
	incapacityDocumentConfirmSchema,
	incapacityDocumentPresignSchema,
	incapacityQuerySchema,
	incapacityUpdateSchema,
} from '../schemas/incapacities.js';
import {
	buildMandatoryRestDayKeys,
	buildVacationDayBreakdown,
	type VacationScheduleDay,
	type VacationScheduleException,
} from '../services/vacations.js';
import { addDaysToDateKey } from '../utils/date-key.js';
import {
	createRailwayPresignedGetUrl,
	createRailwayPresignedPost,
	getRailwayBucketConfig,
	headRailwayObject,
} from '../services/railway-bucket.js';

const INCAPACITY_ERROR_CODES = {
	EMPLOYEE_REQUIRED: 'INCAPACITY_EMPLOYEE_REQUIRED',
	EMPLOYEE_NOT_FOUND: 'INCAPACITY_EMPLOYEE_NOT_FOUND',
	INVALID_RANGE: 'INCAPACITY_INVALID_RANGE',
	SAT_MISMATCH: 'INCAPACITY_SAT_MISMATCH',
	BUCKET_NOT_CONFIGURED: 'INCAPACITY_BUCKET_NOT_CONFIGURED',
	INVALID_DOCUMENT: 'INCAPACITY_DOCUMENT_INVALID',
	DOCUMENT_NOT_FOUND: 'INCAPACITY_DOCUMENT_NOT_FOUND',
} as const;

const INCAPACITY_TYPE_SAT_MAP: Record<IncapacityType, SatTipoIncapacidad> = {
	EG: '02',
	RT: '01',
	MAT: '03',
	LIC140BIS: '04',
};

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

/**
 * Ensures the caller is an organization admin or owner.
 *
 * @param args - Auth context and organization identifier
 * @param args.authType - Authentication type
 * @param args.session - Session info when authType is session
 * @param args.organizationId - Organization identifier
 * @param set - Elysia response setter
 * @returns True when authorized
 */
async function ensureAdminRole(
	args: { authType: 'session' | 'apiKey'; session: AuthSession | null; organizationId: string },
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	if (args.authType !== 'session' || !args.session) {
		set.status = 403;
		return false;
	}

	const membership = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);

	const role = membership[0]?.role ?? null;
	if (!role || (role !== 'admin' && role !== 'owner')) {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Builds a list of date keys between start and end inclusive.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Array of date keys in ascending order
 */
function buildDateKeyRange(startDateKey: string, endDateKey: string): string[] {
	if (endDateKey < startDateKey) {
		return [];
	}

	// Calculate the actual number of days in the range
	const startDate = new Date(`${startDateKey}T00:00:00Z`);
	const endDate = new Date(`${endDateKey}T00:00:00Z`);
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return [];
	}

	const dayCount =
		Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

	// Cap at MAX_INCAPACITY_RANGE_DAYS for safety, but allow the full calculated range
	const maxIterations = Math.min(dayCount, MAX_INCAPACITY_RANGE_DAYS);

	const dateKeys: string[] = [];
	let cursor = startDateKey;
	for (let i = 0; i < maxIterations && cursor <= endDateKey; i += 1) {
		dateKeys.push(cursor);
		if (cursor === endDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}
	return dateKeys;
}

/**
 * Resolves the SAT incapacity code for the given type.
 *
 * @param type - Incapacity type
 * @returns SAT incapacity code
 */
function resolveSatTipoIncapacidad(type: IncapacityType): SatTipoIncapacidad {
	return INCAPACITY_TYPE_SAT_MAP[type];
}

/**
 * Creates a human-friendly reason for schedule exceptions.
 *
 * @param type - Incapacity type
 * @returns Reason string
 */
function buildIncapacityReason(type: IncapacityType): string {
	switch (type) {
		case 'RT':
			return 'Incapacidad IMSS (Riesgo de trabajo)';
		case 'MAT':
			return 'Incapacidad IMSS (Maternidad)';
		case 'LIC140BIS':
			return 'Incapacidad IMSS (Licencia 140 Bis)';
		case 'EG':
		default:
			return 'Incapacidad IMSS (Enfermedad general)';
	}
}

/**
 * Normalizes a file name to avoid path traversal and invalid characters.
 *
 * @param fileName - Original file name
 * @returns Sanitized file name
 */
function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[\\/]+/g, '_')
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.slice(0, 200);
}

/**
 * Formats a numeric percent override for persistence in numeric columns.
 *
 * @param percentOverride - Optional override rate
 * @returns String value for numeric storage or null
 */
function formatPercentOverride(percentOverride?: number | null): string | null {
	if (percentOverride === null || percentOverride === undefined) {
		return null;
	}
	return percentOverride.toString();
}

/**
 * Builds a bucket object key for an incapacity document.
 *
 * @param args - Key components
 * @returns Object key string
 */
function buildDocumentObjectKey(args: {
	organizationId: string;
	employeeId: string;
	incapacityId: string;
	documentId: string;
	fileName: string;
}): string {
	return `org/${args.organizationId}/employees/${args.employeeId}/incapacities/${args.incapacityId}/${args.documentId}-${args.fileName}`;
}

/**
 * Determines whether an error is due to missing AWS SDK dependencies.
 *
 * @param error - Error to inspect
 * @returns True when the error indicates missing bucket dependencies
 */
function isBucketDependencyError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('@aws-sdk');
}

/**
 * Loads base schedule days for an employee.
 *
 * @param tx - Database transaction
 * @param employeeRecord - Employee record
 * @returns Schedule days
 */
async function loadBaseScheduleDays(
	tx: DbClient,
	employeeRecord: typeof employee.$inferSelect,
): Promise<VacationScheduleDay[]> {
	if (employeeRecord.scheduleTemplateId) {
		const rows = await tx
			.select({
				dayOfWeek: scheduleTemplateDay.dayOfWeek,
				isWorkingDay: scheduleTemplateDay.isWorkingDay,
			})
			.from(scheduleTemplateDay)
			.where(eq(scheduleTemplateDay.templateId, employeeRecord.scheduleTemplateId));
		return rows.map((row) => ({
			dayOfWeek: row.dayOfWeek,
			isWorkingDay: row.isWorkingDay ?? true,
		}));
	}

	const rows = await tx
		.select({
			dayOfWeek: employeeSchedule.dayOfWeek,
			isWorkingDay: employeeSchedule.isWorkingDay,
		})
		.from(employeeSchedule)
		.where(eq(employeeSchedule.employeeId, employeeRecord.id));

	return rows.map((row) => ({
		dayOfWeek: row.dayOfWeek,
		isWorkingDay: row.isWorkingDay ?? true,
	}));
}

/**
 * Loads schedule exceptions for an employee within a date key range,
 * excluding specified vacation request or incapacity references.
 *
 * @param tx - Database transaction
 * @param employeeId - Employee identifier
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @param excludeVacationRequestIds - Vacation request IDs to ignore
 * @returns Schedule exceptions for the range
 */
async function loadScheduleExceptionsForRange(
	tx: DbClient,
	employeeId: string,
	startDateKey: string,
	endDateKey: string,
	excludeVacationRequestIds: Set<string>,
): Promise<VacationScheduleException[]> {
	const rangeStart = startOfDay(new Date(`${startDateKey}T00:00:00`));
	const rangeEnd = endOfDay(new Date(`${endDateKey}T00:00:00`));

	const rows = await tx
		.select({
			exceptionDate: scheduleException.exceptionDate,
			exceptionType: scheduleException.exceptionType,
			vacationRequestId: scheduleException.vacationRequestId,
			incapacityId: scheduleException.incapacityId,
		})
		.from(scheduleException)
		.where(
			and(
				eq(scheduleException.employeeId, employeeId),
				gte(scheduleException.exceptionDate, rangeStart),
				lte(scheduleException.exceptionDate, rangeEnd),
			)!,
		);

	return rows
		.filter((row) => {
			if (row.incapacityId) {
				return false;
			}
			if (row.vacationRequestId && excludeVacationRequestIds.has(row.vacationRequestId)) {
				return false;
			}
			return true;
		})
		.map((row) => ({
			exceptionDate: row.exceptionDate,
			exceptionType: row.exceptionType,
		}));
}

/**
 * Builds a set of date keys covered by active incapacities.
 *
 * @param tx - Database transaction
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @param startDateKey - Range start date key
 * @param endDateKey - Range end date key
 * @param excludeIncapacityId - Incapacity ID to exclude
 * @returns Set of active incapacity date keys
 */
async function buildActiveIncapacityDateKeySet(
	tx: DbClient,
	organizationId: string,
	employeeId: string,
	startDateKey: string,
	endDateKey: string,
	excludeIncapacityId?: string,
): Promise<Set<string>> {
	const rows = await tx
		.select({
			id: employeeIncapacity.id,
			startDateKey: employeeIncapacity.startDateKey,
			endDateKey: employeeIncapacity.endDateKey,
		})
		.from(employeeIncapacity)
		.where(
			and(
				eq(employeeIncapacity.organizationId, organizationId),
				eq(employeeIncapacity.employeeId, employeeId),
				eq(employeeIncapacity.status, 'ACTIVE'),
				lte(employeeIncapacity.startDateKey, endDateKey),
				gte(employeeIncapacity.endDateKey, startDateKey),
			),
		);

	const dateKeys = new Set<string>();
	for (const row of rows) {
		if (excludeIncapacityId && row.id === excludeIncapacityId) {
			continue;
		}
		const overlapStart = row.startDateKey < startDateKey ? startDateKey : row.startDateKey;
		const overlapEnd = row.endDateKey > endDateKey ? endDateKey : row.endDateKey;
		for (const key of buildDateKeyRange(overlapStart, overlapEnd)) {
			dateKeys.add(key);
		}
	}

	return dateKeys;
}

/**
 * Syncs schedule exceptions for incapacity days.
 *
 * @param tx - Database transaction
 * @param employeeId - Employee identifier
 * @param incapacityId - Incapacity identifier
 * @param dateKeys - Date keys to mark as day off
 * @param reason - Exception reason
 * @returns Nothing
 */
async function syncIncapacityScheduleExceptions(
	tx: DbClient,
	employeeId: string,
	incapacityId: string,
	dateKeys: string[],
	reason: string,
): Promise<void> {
	const exceptionDates = dateKeys.map((dateKey) => new Date(`${dateKey}T00:00:00`));
	if (exceptionDates.length === 0) {
		return;
	}

	await tx
		.delete(scheduleException)
		.where(
			and(
				eq(scheduleException.employeeId, employeeId),
				inArray(scheduleException.exceptionDate, exceptionDates),
			)!,
		);

	await tx.insert(scheduleException).values(
		exceptionDates.map((exceptionDate) => ({
			employeeId,
			exceptionDate,
			exceptionType: 'DAY_OFF' as const,
			reason,
			incapacityId,
		})),
	);
}

/**
 * Ensures schedule exceptions exist for approved vacation days.
 *
 * @param tx - Database transaction
 * @param employeeId - Employee identifier
 * @param requestId - Vacation request identifier
 * @param days - Vacation request day rows
 * @returns Nothing
 */
async function syncVacationScheduleExceptions(
	tx: DbClient,
	employeeId: string,
	requestId: string,
	days: { dateKey: string; countsAsVacationDay: boolean }[],
): Promise<void> {
	const vacationDateKeys = days
		.filter((day) => day.countsAsVacationDay)
		.map((day) => day.dateKey);
	const exceptionDates = vacationDateKeys.map((dateKey) => new Date(`${dateKey}T00:00:00`));
	if (exceptionDates.length === 0) {
		return;
	}

	const existingExceptions = await tx
		.select({ exceptionDate: scheduleException.exceptionDate })
		.from(scheduleException)
		.where(
			and(
				eq(scheduleException.employeeId, employeeId),
				inArray(scheduleException.exceptionDate, exceptionDates),
			)!,
		);

	const existingKeys = new Set(
		existingExceptions.map((row) => format(row.exceptionDate, 'yyyy-MM-dd')),
	);

	const newRows = exceptionDates
		.map((exceptionDate) => format(exceptionDate, 'yyyy-MM-dd'))
		.filter((dateKey) => !existingKeys.has(dateKey))
		.map((dateKey) => ({
			employeeId,
			exceptionDate: new Date(`${dateKey}T00:00:00`),
			exceptionType: 'DAY_OFF' as const,
			reason: 'Vacaciones aprobadas',
			vacationRequestId: requestId,
		}));

	if (newRows.length > 0) {
		await tx.insert(scheduleException).values(newRows);
	}
}

/**
 * Rebuilds vacation request day breakdowns for affected requests.
 *
 * @param tx - Database transaction
 * @param args - Rebuild parameters
 * @returns Nothing
 */
async function rebuildVacationRequestDays(
	tx: DbClient,
	args: {
		employeeRecord: typeof employee.$inferSelect;
		requests: (typeof vacationRequest.$inferSelect)[];
		additionalMandatoryRestDays: string[];
		activeIncapacityDateKeys: Set<string>;
	},
): Promise<void> {
	const { employeeRecord, requests, additionalMandatoryRestDays, activeIncapacityDateKeys } =
		args;

	if (requests.length === 0) {
		return;
	}

	const scheduleDays = await loadBaseScheduleDays(tx, employeeRecord);

	for (const request of requests) {
		const exceptions = await loadScheduleExceptionsForRange(
			tx,
			employeeRecord.id,
			request.startDateKey,
			request.endDateKey,
			new Set([request.id]),
		);

		const mandatoryRestDayKeys = buildMandatoryRestDayKeys(
			request.startDateKey,
			request.endDateKey,
			additionalMandatoryRestDays,
		);

		const breakdown = buildVacationDayBreakdown({
			startDateKey: request.startDateKey,
			endDateKey: request.endDateKey,
			scheduleDays,
			exceptions,
			mandatoryRestDayKeys,
			hireDate: employeeRecord.hireDate ?? null,
		});

		const adjustedDays = breakdown.days.map((day) => {
			if (activeIncapacityDateKeys.has(day.dateKey)) {
				return {
					...day,
					countsAsVacationDay: false,
					dayType: 'INCAPACITY' as const,
				};
			}
			return day;
		});

		await tx.delete(vacationRequestDay).where(eq(vacationRequestDay.requestId, request.id));

		if (adjustedDays.length > 0) {
			await tx.insert(vacationRequestDay).values(
				adjustedDays.map((day) => ({
					requestId: request.id,
					employeeId: employeeRecord.id,
					dateKey: day.dateKey,
					countsAsVacationDay: day.countsAsVacationDay,
					dayType: day.dayType,
					serviceYearNumber: day.serviceYearNumber ?? null,
				})),
			);
		}

		if (request.status === 'APPROVED') {
			await syncVacationScheduleExceptions(tx, employeeRecord.id, request.id, adjustedDays);
		}
	}
}

/**
 * Fetches incapacity detail with documents.
 *
 * @param incapacityId - Incapacity identifier
 * @returns Incapacity detail record
 */
async function fetchIncapacityDetail(incapacityId: string): Promise<{
	id: string;
	organizationId: string;
	employeeId: string;
	caseId: string;
	type: IncapacityType;
	satTipoIncapacidad: SatTipoIncapacidad;
	startDateKey: string;
	endDateKey: string;
	daysAuthorized: number;
	certificateFolio: string | null;
	issuedBy: 'IMSS' | 'recognized_by_IMSS';
	sequence: 'inicial' | 'subsecuente' | 'recaida';
	percentOverride: number | null;
	status: 'ACTIVE' | 'CANCELLED';
	createdAt: Date;
	updatedAt: Date;
	employeeName: string | null;
	employeeLastName: string | null;
	documents: (typeof employeeIncapacityDocument.$inferSelect)[];
} | null> {
	const rows = await db
		.select({
			id: employeeIncapacity.id,
			organizationId: employeeIncapacity.organizationId,
			employeeId: employeeIncapacity.employeeId,
			caseId: employeeIncapacity.caseId,
			type: employeeIncapacity.type,
			satTipoIncapacidad: employeeIncapacity.satTipoIncapacidad,
			startDateKey: employeeIncapacity.startDateKey,
			endDateKey: employeeIncapacity.endDateKey,
			daysAuthorized: employeeIncapacity.daysAuthorized,
			certificateFolio: employeeIncapacity.certificateFolio,
			issuedBy: employeeIncapacity.issuedBy,
			sequence: employeeIncapacity.sequence,
			percentOverride: employeeIncapacity.percentOverride,
			status: employeeIncapacity.status,
			createdAt: employeeIncapacity.createdAt,
			updatedAt: employeeIncapacity.updatedAt,
			employeeName: employee.firstName,
			employeeLastName: employee.lastName,
		})
		.from(employeeIncapacity)
		.leftJoin(employee, eq(employeeIncapacity.employeeId, employee.id))
		.where(eq(employeeIncapacity.id, incapacityId))
		.limit(1);

	const record = rows[0];
	if (!record) {
		return null;
	}

	const documents = await db
		.select()
		.from(employeeIncapacityDocument)
		.where(eq(employeeIncapacityDocument.incapacityId, record.id));

	return {
		...record,
		percentOverride:
			record.percentOverride !== null && record.percentOverride !== undefined
				? Number(record.percentOverride)
				: null,
		documents,
	};
}

/**
 * Incapacity routes for HR/admin workflows.
 */
export const incapacityRoutes = new Elysia({ prefix: '/incapacities' })
	.use(combinedAuthPlugin)
	/**
	 * Lists incapacity records.
	 */
	.get(
		'/',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employeeIncapacity.organizationId, organizationId),
			];

			if (query.employeeId) {
				conditions.push(eq(employeeIncapacity.employeeId, query.employeeId));
			}
			if (query.status) {
				conditions.push(eq(employeeIncapacity.status, query.status));
			}
			if (query.type) {
				conditions.push(eq(employeeIncapacity.type, query.type));
			}
			if (query.from) {
				conditions.push(gte(employeeIncapacity.endDateKey, query.from));
			}
			if (query.to) {
				conditions.push(lte(employeeIncapacity.startDateKey, query.to));
			}
			if (query.search) {
				const searchTerm = `%${query.search.trim()}%`;
				conditions.push(
					or(
						ilike(employeeIncapacity.caseId, searchTerm),
						ilike(employeeIncapacity.certificateFolio, searchTerm),
						ilike(employee.firstName, searchTerm),
						ilike(employee.lastName, searchTerm),
					)!,
				);
			}

			const whereClause = and(...conditions)!;

			const results = await db
				.select({
					id: employeeIncapacity.id,
					organizationId: employeeIncapacity.organizationId,
					employeeId: employeeIncapacity.employeeId,
					caseId: employeeIncapacity.caseId,
					type: employeeIncapacity.type,
					satTipoIncapacidad: employeeIncapacity.satTipoIncapacidad,
					startDateKey: employeeIncapacity.startDateKey,
					endDateKey: employeeIncapacity.endDateKey,
					daysAuthorized: employeeIncapacity.daysAuthorized,
					certificateFolio: employeeIncapacity.certificateFolio,
					issuedBy: employeeIncapacity.issuedBy,
					sequence: employeeIncapacity.sequence,
					percentOverride: employeeIncapacity.percentOverride,
					status: employeeIncapacity.status,
					createdAt: employeeIncapacity.createdAt,
					updatedAt: employeeIncapacity.updatedAt,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
				})
				.from(employeeIncapacity)
				.leftJoin(employee, eq(employeeIncapacity.employeeId, employee.id))
				.where(whereClause)
				.limit(query.limit)
				.offset(query.offset)
				.orderBy(desc(employeeIncapacity.createdAt));

			const total = (
				await db
					.select()
					.from(employeeIncapacity)
					.leftJoin(employee, eq(employeeIncapacity.employeeId, employee.id))
					.where(whereClause)
			).length;

			const incapacityIds = results.map((row) => row.id);
			const documents =
				incapacityIds.length === 0
					? []
					: await db
							.select()
							.from(employeeIncapacityDocument)
							.where(inArray(employeeIncapacityDocument.incapacityId, incapacityIds));
			const documentsByIncapacity = new Map<string, typeof documents>();
			for (const document of documents) {
				const list = documentsByIncapacity.get(document.incapacityId) ?? [];
				list.push(document);
				documentsByIncapacity.set(document.incapacityId, list);
			}

			return {
				data: results.map((row) => ({
					...row,
					percentOverride:
						row.percentOverride !== null && row.percentOverride !== undefined
							? Number(row.percentOverride)
							: null,
					documents: documentsByIncapacity.get(row.id) ?? [],
				})),
				pagination: {
					total,
					limit: query.limit,
					offset: query.offset,
					hasMore: query.offset + results.length < total,
				},
			};
		},
		{
			query: incapacityQuerySchema,
		},
	)
	/**
	 * Creates a new incapacity record.
	 */
	.post(
		'/',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const employeeRecord = await db
				.select()
				.from(employee)
				.where(
					and(
						eq(employee.id, body.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);

			const employeeRow = employeeRecord[0];
			if (!employeeRow) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404, {
					code: INCAPACITY_ERROR_CODES.EMPLOYEE_NOT_FOUND,
				});
			}

			const expectedSat = resolveSatTipoIncapacidad(body.type);
			if (body.satTipoIncapacidad && body.satTipoIncapacidad !== expectedSat) {
				set.status = 400;
				return buildErrorResponse('SAT incapacity type does not match IMSS type', 400, {
					code: INCAPACITY_ERROR_CODES.SAT_MISMATCH,
				});
			}

			const incapacityId = crypto.randomUUID();
			const satTipoIncapacidad = body.satTipoIncapacidad ?? expectedSat;
			const dateKeys = buildDateKeyRange(body.startDateKey, body.endDateKey);

			await db.transaction(async (tx) => {
				await tx.insert(employeeIncapacity).values({
					id: incapacityId,
					organizationId,
					employeeId: body.employeeId,
					caseId: body.caseId,
					type: body.type,
					satTipoIncapacidad,
					startDateKey: body.startDateKey,
					endDateKey: body.endDateKey,
					daysAuthorized: body.daysAuthorized,
					certificateFolio: body.certificateFolio ?? null,
					issuedBy: body.issuedBy ?? 'IMSS',
					sequence: body.sequence ?? 'inicial',
					percentOverride: formatPercentOverride(body.percentOverride),
					status: 'ACTIVE',
				});

				await syncIncapacityScheduleExceptions(
					tx,
					body.employeeId,
					incapacityId,
					dateKeys,
					buildIncapacityReason(body.type),
				);

				const settings = await tx
					.select({
						additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays,
					})
					.from(payrollSetting)
					.where(eq(payrollSetting.organizationId, organizationId))
					.limit(1);
				const additionalMandatoryRestDays = settings[0]?.additionalMandatoryRestDays ?? [];

				const activeIncapacityDateKeys = await buildActiveIncapacityDateKeySet(
					tx,
					organizationId,
					body.employeeId,
					body.startDateKey,
					body.endDateKey,
				);

				const requests = await tx
					.select()
					.from(vacationRequest)
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							eq(vacationRequest.employeeId, body.employeeId),
							inArray(vacationRequest.status, ['SUBMITTED', 'APPROVED']),
							lte(vacationRequest.startDateKey, body.endDateKey),
							gte(vacationRequest.endDateKey, body.startDateKey),
						),
					);

				if (requests.length > 0) {
					await rebuildVacationRequestDays(tx, {
						employeeRecord: employeeRow,
						requests,
						additionalMandatoryRestDays,
						activeIncapacityDateKeys,
					});
				}
			});

			const detail = await fetchIncapacityDetail(incapacityId);
			return { data: detail };
		},
		{
			body: incapacityCreateSchema,
		},
	)
	/**
	 * Updates an incapacity record.
	 */
	.put(
		'/:id',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const existingRows = await db
				.select()
				.from(employeeIncapacity)
				.where(eq(employeeIncapacity.id, params.id))
				.limit(1);
			const existing = existingRows[0];
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Incapacity not found', 404);
			}

			if (existing.organizationId !== organizationId) {
				set.status = 403;
				return buildErrorResponse('Not authorized', 403);
			}

			const nextType = body.type ?? existing.type;
			const expectedSat = resolveSatTipoIncapacidad(nextType as IncapacityType);
			if (body.satTipoIncapacidad && body.satTipoIncapacidad !== expectedSat) {
				set.status = 400;
				return buildErrorResponse('SAT incapacity type does not match IMSS type', 400, {
					code: INCAPACITY_ERROR_CODES.SAT_MISMATCH,
				});
			}

			const nextStartDateKey = body.startDateKey ?? existing.startDateKey;
			const nextEndDateKey = body.endDateKey ?? existing.endDateKey;
			const nextStatus = body.status ?? existing.status;
			const nextSatTipoIncapacidad = body.satTipoIncapacidad ?? expectedSat;
			const nextDateKeys =
				nextStatus === 'ACTIVE' ? buildDateKeyRange(nextStartDateKey, nextEndDateKey) : [];
			const rangeStart =
				nextStartDateKey < existing.startDateKey ? nextStartDateKey : existing.startDateKey;
			const rangeEnd =
				nextEndDateKey > existing.endDateKey ? nextEndDateKey : existing.endDateKey;

			await db.transaction(async (tx) => {
				await tx
					.update(employeeIncapacity)
					.set({
						caseId: body.caseId ?? existing.caseId,
						type: nextType,
						satTipoIncapacidad: nextSatTipoIncapacidad,
						startDateKey: nextStartDateKey,
						endDateKey: nextEndDateKey,
						daysAuthorized: body.daysAuthorized ?? existing.daysAuthorized,
						certificateFolio: body.certificateFolio ?? existing.certificateFolio,
						issuedBy: body.issuedBy ?? existing.issuedBy,
						sequence: body.sequence ?? existing.sequence,
						percentOverride:
							body.percentOverride !== undefined
								? formatPercentOverride(body.percentOverride)
								: existing.percentOverride,
						status: nextStatus,
					})
					.where(eq(employeeIncapacity.id, existing.id));

				await tx
					.delete(scheduleException)
					.where(eq(scheduleException.incapacityId, existing.id));

				if (nextStatus === 'ACTIVE') {
					await syncIncapacityScheduleExceptions(
						tx,
						existing.employeeId,
						existing.id,
						nextDateKeys,
						buildIncapacityReason(nextType as IncapacityType),
					);
				}

				const settings = await tx
					.select({
						additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays,
					})
					.from(payrollSetting)
					.where(eq(payrollSetting.organizationId, organizationId))
					.limit(1);
				const additionalMandatoryRestDays = settings[0]?.additionalMandatoryRestDays ?? [];

				const activeIncapacityDateKeys = await buildActiveIncapacityDateKeySet(
					tx,
					organizationId,
					existing.employeeId,
					rangeStart,
					rangeEnd,
					nextStatus === 'ACTIVE' ? undefined : existing.id,
				);

				const requests = await tx
					.select()
					.from(vacationRequest)
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							eq(vacationRequest.employeeId, existing.employeeId),
							inArray(vacationRequest.status, ['SUBMITTED', 'APPROVED']),
							lte(vacationRequest.startDateKey, rangeEnd),
							gte(vacationRequest.endDateKey, rangeStart),
						),
					);

				const employeeRecord = await tx
					.select()
					.from(employee)
					.where(
						and(
							eq(employee.id, existing.employeeId),
							eq(employee.organizationId, organizationId),
						),
					)
					.limit(1);

				if (requests.length > 0 && employeeRecord[0]) {
					await rebuildVacationRequestDays(tx, {
						employeeRecord: employeeRecord[0],
						requests,
						additionalMandatoryRestDays,
						activeIncapacityDateKeys,
					});
				}
			});

			const detail = await fetchIncapacityDetail(existing.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
			body: incapacityUpdateSchema,
		},
	)
	/**
	 * Cancels an incapacity record.
	 */
	.post(
		'/:id/cancel',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select()
				.from(employeeIncapacity)
				.where(eq(employeeIncapacity.id, params.id))
				.limit(1);
			const record = rows[0];
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Incapacity not found', 404);
			}

			if (record.organizationId !== organizationId) {
				set.status = 403;
				return buildErrorResponse('Not authorized', 403);
			}

			await db.transaction(async (tx) => {
				await tx
					.update(employeeIncapacity)
					.set({ status: 'CANCELLED' })
					.where(eq(employeeIncapacity.id, record.id));

				await tx
					.delete(scheduleException)
					.where(eq(scheduleException.incapacityId, record.id));

				const settings = await tx
					.select({
						additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays,
					})
					.from(payrollSetting)
					.where(eq(payrollSetting.organizationId, organizationId))
					.limit(1);
				const additionalMandatoryRestDays = settings[0]?.additionalMandatoryRestDays ?? [];

				const activeIncapacityDateKeys = await buildActiveIncapacityDateKeySet(
					tx,
					organizationId,
					record.employeeId,
					record.startDateKey,
					record.endDateKey,
					record.id,
				);

				const requests = await tx
					.select()
					.from(vacationRequest)
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							eq(vacationRequest.employeeId, record.employeeId),
							inArray(vacationRequest.status, ['SUBMITTED', 'APPROVED']),
							lte(vacationRequest.startDateKey, record.endDateKey),
							gte(vacationRequest.endDateKey, record.startDateKey),
						),
					);

				const employeeRecord = await tx
					.select()
					.from(employee)
					.where(
						and(
							eq(employee.id, record.employeeId),
							eq(employee.organizationId, organizationId),
						),
					)
					.limit(1);

				if (requests.length > 0 && employeeRecord[0]) {
					await rebuildVacationRequestDays(tx, {
						employeeRecord: employeeRecord[0],
						requests,
						additionalMandatoryRestDays,
						activeIncapacityDateKeys,
					});
				}
			});

			const detail = await fetchIncapacityDetail(record.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Creates a presigned POST for document upload.
	 */
	.post(
		'/:id/documents/presign',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select({
					id: employeeIncapacity.id,
					employeeId: employeeIncapacity.employeeId,
					organizationId: employeeIncapacity.organizationId,
				})
				.from(employeeIncapacity)
				.where(eq(employeeIncapacity.id, params.id))
				.limit(1);
			const record = rows[0];
			if (!record || record.organizationId !== organizationId) {
				set.status = 404;
				return buildErrorResponse('Incapacity not found', 404);
			}

			if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) {
				set.status = 400;
				return buildErrorResponse('Invalid document type', 400, {
					code: INCAPACITY_ERROR_CODES.INVALID_DOCUMENT,
				});
			}

			if (body.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
				set.status = 400;
				return buildErrorResponse('Document exceeds maximum size', 400, {
					code: INCAPACITY_ERROR_CODES.INVALID_DOCUMENT,
				});
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig> | null = null;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: INCAPACITY_ERROR_CODES.BUCKET_NOT_CONFIGURED },
				);
			}

			const documentId = crypto.randomUUID();
			const safeFileName = sanitizeFileName(body.fileName);
			const objectKey = buildDocumentObjectKey({
				organizationId: record.organizationId,
				employeeId: record.employeeId,
				incapacityId: record.id,
				documentId,
				fileName: safeFileName,
			});

			let presigned: Awaited<ReturnType<typeof createRailwayPresignedPost>>;
			try {
				presigned = await createRailwayPresignedPost({
					key: objectKey,
					contentType: body.contentType,
					maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
				});
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: INCAPACITY_ERROR_CODES.BUCKET_NOT_CONFIGURED },
				);
			}

			return {
				data: {
					url: presigned.url,
					fields: presigned.fields,
					documentId,
					objectKey,
					bucket: bucketConfig.bucket,
				},
			};
		},
		{
			params: idParamSchema,
			body: incapacityDocumentPresignSchema,
		},
	)
	/**
	 * Confirms an uploaded document and stores metadata.
	 */
	.post(
		'/:id/documents/confirm',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select({
					id: employeeIncapacity.id,
					employeeId: employeeIncapacity.employeeId,
					organizationId: employeeIncapacity.organizationId,
				})
				.from(employeeIncapacity)
				.where(eq(employeeIncapacity.id, params.id))
				.limit(1);
			const record = rows[0];
			if (!record || record.organizationId !== organizationId) {
				set.status = 404;
				return buildErrorResponse('Incapacity not found', 404);
			}

			const prefix = `org/${record.organizationId}/employees/${record.employeeId}/incapacities/${record.id}/`;
			if (!body.objectKey.startsWith(prefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid document object key', 400, {
					code: INCAPACITY_ERROR_CODES.INVALID_DOCUMENT,
				});
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: INCAPACITY_ERROR_CODES.BUCKET_NOT_CONFIGURED },
				);
			}

			let headResult: Awaited<ReturnType<typeof headRailwayObject>>;
			try {
				headResult = await headRailwayObject({ key: body.objectKey });
			} catch (error) {
				set.status = 400;
				if (isBucketDependencyError(error)) {
					return buildErrorResponse(
						error instanceof Error ? error.message : 'Bucket not configured',
						400,
						{ code: INCAPACITY_ERROR_CODES.BUCKET_NOT_CONFIGURED },
					);
				}
				return buildErrorResponse('Document not found in bucket', 400, {
					code: INCAPACITY_ERROR_CODES.DOCUMENT_NOT_FOUND,
				});
			}

			if (
				(headResult.ContentLength ?? 0) > MAX_DOCUMENT_SIZE_BYTES ||
				(headResult.ContentLength ?? 0) !== body.sizeBytes
			) {
				set.status = 400;
				return buildErrorResponse('Document size mismatch', 400, {
					code: INCAPACITY_ERROR_CODES.INVALID_DOCUMENT,
				});
			}

			if (headResult.ContentType && headResult.ContentType !== body.contentType) {
				set.status = 400;
				return buildErrorResponse('Document content type mismatch', 400, {
					code: INCAPACITY_ERROR_CODES.INVALID_DOCUMENT,
				});
			}

			const inserted = await db
				.insert(employeeIncapacityDocument)
				.values({
					id: body.documentId,
					incapacityId: record.id,
					bucket: bucketConfig.bucket,
					objectKey: body.objectKey,
					fileName: body.fileName,
					contentType: body.contentType,
					sizeBytes: body.sizeBytes,
					sha256: body.sha256,
				})
				.returning();

			return { data: inserted[0] };
		},
		{
			params: idParamSchema,
			body: incapacityDocumentConfirmSchema,
		},
	)
	/**
	 * Retrieves a presigned GET URL for an incapacity document.
	 */
	.get(
		'/:id/documents/:docId/url',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const record = await db
				.select({
					id: employeeIncapacityDocument.id,
					incapacityId: employeeIncapacityDocument.incapacityId,
					objectKey: employeeIncapacityDocument.objectKey,
				})
				.from(employeeIncapacityDocument)
				.where(eq(employeeIncapacityDocument.id, params.docId))
				.limit(1);

			const document = record[0];
			if (!document || document.incapacityId !== params.id) {
				set.status = 404;
				return buildErrorResponse('Document not found', 404, {
					code: INCAPACITY_ERROR_CODES.DOCUMENT_NOT_FOUND,
				});
			}

			try {
				const url = await createRailwayPresignedGetUrl({ key: document.objectKey });
				return { data: { url } };
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: INCAPACITY_ERROR_CODES.BUCKET_NOT_CONFIGURED },
				);
			}
		},
		{
			params: z.object({
				id: z.string().uuid(),
				docId: z.string().uuid(),
			}),
		},
	);
