import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, lte, sql, type InferInsertModel, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import {
	holidayAuditEvent,
	holidayCalendarEntry,
	holidayKind,
	holidaySource,
	holidayStatus,
	holidaySyncRun,
	member,
	organization,
	payrollSetting,
} from '../db/schema.js';
import { parseDateKey } from '../utils/date-key.js';
import {
	getMexicoMandatoryRestDayKeysForYear,
	getMexicoMandatoryRestDaysForYear,
} from '../utils/mexico-mandatory-rest-days.js';
import type { PayrollCalculationRow } from './payroll-calculation.js';

const HOLIDAY_PROVIDER = 'NAGER_DATE';
const ANNUAL_PROJECTION_YEARS = 5;
const RETENTION_YEARS = 3;

const NAGER_API_BASE_URL = process.env.NAGER_API_BASE_URL ?? 'https://date.nager.at/api/v3';

type HolidaySourceValue = (typeof holidaySource.enumValues)[number];
type HolidayStatusValue = (typeof holidayStatus.enumValues)[number];
type HolidayKindValue = (typeof holidayKind.enumValues)[number];

type HolidayEntryInsert = InferInsertModel<typeof holidayCalendarEntry>;

type HolidaySyncRunRow = typeof holidaySyncRun.$inferSelect;

type HolidaySyncRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export type PayrollHolidayLegalReference = 'LFT Art. 74' | 'LFT Art. 75' | 'LFT Art. 74/75';

export interface PayrollEmployeeHolidayImpact {
	affectedHolidayDateKeys: string[];
	mandatoryPremiumAmount: number;
}

export interface PayrollHolidayNotice {
	kind: 'HOLIDAY_PAYROLL_IMPACT';
	title: string;
	message: string;
	legalReference: PayrollHolidayLegalReference;
	periodStartDateKey: string;
	periodEndDateKey: string;
	affectedHolidayDateKeys: string[];
	affectedEmployees: number;
	estimatedMandatoryPremiumTotal: number;
	generatedAt: string;
}

export interface PayrollHolidayContext {
	additionalMandatoryRestDays: string[];
	holidayNotices: PayrollHolidayNotice[];
	employeeHolidayImpactByEmployeeId: Record<string, PayrollEmployeeHolidayImpact>;
}

export interface HolidaySyncResult {
	run: HolidaySyncRunRow;
	importedCount: number;
	pendingCount: number;
	errorCount: number;
}

interface AdditionalMandatoryRestDaysArgs {
	organizationId: string;
	periodStartDateKey: string;
	periodEndDateKey: string;
	legacyAdditionalMandatoryRestDays: string[];
}

interface NagerHoliday {
	date: string;
	localName: string;
	name: string;
	countryCode: string;
	fixed: boolean;
	global: boolean;
	counties: string[] | null;
	launchYear: number | null;
	types: string[];
}

/**
 * Returns true when the provided year is a leap year.
 *
 * @param year - Calendar year
 * @returns True for leap years
 */
function isLeapYear(year: number): boolean {
	if (year % 400 === 0) {
		return true;
	}
	if (year % 100 === 0) {
		return false;
	}
	return year % 4 === 0;
}

/**
 * Builds a stable set of years included in a date-key range.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Sorted list of years in range
 */
function getYearsInRange(startDateKey: string, endDateKey: string): number[] {
	const startYear = Number(startDateKey.slice(0, 4));
	const endYear = Number(endDateKey.slice(0, 4));
	const minYear = Math.min(startYear, endYear);
	const maxYear = Math.max(startYear, endYear);
	const years: number[] = [];
	for (let year = minYear; year <= maxYear; year += 1) {
		years.push(year);
	}
	return years;
}

/**
 * Produces a deterministic entry key used by unique indexes and upserts.
 *
 * @param args - Key parts
 * @returns Deterministic entry key
 */
function buildEntryKey(args: {
	source: HolidaySourceValue;
	dateKey: string;
	name: string;
	recurrenceKey?: string | null;
	externalId?: string | null;
	subdivisionCode?: string | null;
}): string {
	const normalizedName = args.name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	const recurrence = args.recurrenceKey ?? 'none';
	const externalId = args.externalId ?? 'none';
	const subdivision = args.subdivisionCode ?? 'none';
	return [
		args.source,
		args.dateKey,
		normalizedName || 'holiday',
		recurrence,
		externalId,
		subdivision,
	].join(':');
}

/**
 * Resolves a yearly recurrence date key preserving month/day semantics.
 * For 29/02 in non-leap years, the effective date is moved to 28/02.
 *
 * @param monthDay - Month/day as MM-DD
 * @param year - Target year
 * @returns Date key for the target year
 */
export function resolveAnnualDateKey(monthDay: string, year: number): string {
	if (monthDay === '02-29' && !isLeapYear(year)) {
		return `${year}-02-28`;
	}
	return `${year}-${monthDay}`;
}

/**
 * Parses and validates a date key.
 *
 * @param dateKey - Date key candidate
 * @returns Normalized date key
 * @throws Error when invalid
 */
function normalizeDateKey(dateKey: string): string {
	parseDateKey(dateKey);
	return dateKey;
}

/**
 * Reads holiday provider data for MX from Nager.Date.
 *
 * @param year - Calendar year
 * @param fetchFn - HTTP fetch function
 * @returns Provider holiday rows
 * @throws Error when provider response is invalid
 */
async function fetchNagerHolidays(year: number, fetchFn: typeof fetch): Promise<NagerHoliday[]> {
	const response = await fetchFn(`${NAGER_API_BASE_URL}/PublicHolidays/${year}/MX`, {
		headers: { accept: 'application/json' },
	});

	if (!response.ok) {
		throw new Error(`Nager.Date request failed (${response.status}) for year ${year}.`);
	}

	const payload = (await response.json()) as unknown;
	if (!Array.isArray(payload)) {
		throw new Error(`Nager.Date returned invalid payload for year ${year}.`);
	}

	return payload as NagerHoliday[];
}

/**
 * Maps provider holiday metadata to the canonical holiday kind.
 *
 * @param row - Provider holiday row
 * @returns Canonical holiday kind
 */
export function mapProviderHolidayKind(row: NagerHoliday): HolidayKindValue {
	const countiesCount = Array.isArray(row.counties) ? row.counties.length : 0;
	if (countiesCount > 0) {
		return 'OPTIONAL';
	}

	const lowerName = `${row.name} ${row.localName}`.toLowerCase();
	if (lowerName.includes('election') || lowerName.includes('electoral')) {
		return 'MANDATORY';
	}

	return row.global ? 'MANDATORY' : 'OPTIONAL';
}

/**
 * Maps a provider row into a holiday calendar entry candidate.
 *
 * @param args - Mapping arguments
 * @returns Holiday entry payload
 */
export function mapProviderHolidayToEntry(args: {
	organizationId: string;
	runId: string;
	row: NagerHoliday;
	internalMandatoryKeys: Set<string>;
}): HolidayEntryInsert {
	const dateKey = normalizeDateKey(args.row.date);
	const name = (args.row.localName || args.row.name || 'Feriado sugerido').trim();
	const kind = mapProviderHolidayKind(args.row);
	const lowerName = `${args.row.localName} ${args.row.name}`.toLowerCase();
	const electionHint = lowerName.includes('election') || lowerName.includes('electoral');
	const conflictReason = args.internalMandatoryKeys.has(dateKey)
		? 'Conflicto con calendario interno. Requiere revisión manual.'
		: electionHint
			? 'Jornada electoral sugerida por proveedor. Requiere validación.'
			: null;

	const externalId = `${args.row.countryCode}:${dateKey}:${args.row.name}`;
	return {
		organizationId: args.organizationId,
		dateKey,
		name,
		kind,
		source: 'PROVIDER',
		status: 'PENDING_APPROVAL',
		isRecurring: false,
		seriesId: null,
		provider: HOLIDAY_PROVIDER,
		providerExternalId: externalId,
		subdivisionCode:
			Array.isArray(args.row.counties) && args.row.counties.length > 0
				? args.row.counties.join(',')
				: null,
		legalReference: kind === 'MANDATORY' ? 'LFT Art. 74' : null,
		conflictReason,
		active: true,
		entryKey: buildEntryKey({
			source: 'PROVIDER',
			dateKey,
			name,
			externalId,
			subdivisionCode:
				Array.isArray(args.row.counties) && args.row.counties.length > 0
					? args.row.counties.join(',')
					: null,
		}),
		syncRunId: args.runId,
		approvedBy: null,
		approvedAt: null,
		rejectedBy: null,
		rejectedAt: null,
	};
}

/**
 * Persists a holiday audit event.
 *
 * @param args - Audit payload
 * @returns Nothing
 */
async function insertHolidayAuditEvent(args: {
	organizationId: string;
	holidayEntryId?: string | null;
	syncRunId?: string | null;
	action: string;
	actorType: string;
	actorUserId?: string | null;
	reason?: string | null;
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
}): Promise<void> {
	await db.insert(holidayAuditEvent).values({
		organizationId: args.organizationId,
		holidayEntryId: args.holidayEntryId ?? null,
		syncRunId: args.syncRunId ?? null,
		action: args.action,
		actorType: args.actorType,
		actorUserId: args.actorUserId ?? null,
		reason: args.reason ?? null,
		before: args.before ?? null,
		after: args.after ?? null,
		metadata: args.metadata ?? null,
	});
}

/**
 * Ensures INTERNAL mandatory holidays exist as approved active entries for requested years.
 *
 * @param args - Organization and years
 * @returns Number of upserted rows
 */
async function ensureInternalHolidays(args: {
	organizationId: string;
	years: number[];
	syncRunId: string;
}): Promise<number> {
	let upsertedCount = 0;

	for (const year of args.years) {
		const rows = getMexicoMandatoryRestDaysForYear(year);
		if (rows.length === 0) {
			continue;
		}

		const payload: HolidayEntryInsert[] = rows.map((row) => ({
			organizationId: args.organizationId,
			dateKey: row.dateKey,
			name: row.name,
			kind: 'MANDATORY',
			source: 'INTERNAL',
			status: 'APPROVED',
			isRecurring: false,
			seriesId: null,
			provider: 'LFT_MX',
			providerExternalId: `INTERNAL:${row.dateKey}`,
			subdivisionCode: null,
			legalReference: row.legalReference,
			conflictReason: null,
			active: true,
			entryKey: buildEntryKey({
				source: 'INTERNAL',
				dateKey: row.dateKey,
				name: row.name,
				externalId: `INTERNAL:${row.dateKey}`,
			}),
			syncRunId: args.syncRunId,
			approvedAt: new Date(),
		}));

		const inserted = await db
			.insert(holidayCalendarEntry)
			.values(payload)
			.onConflictDoUpdate({
				target: [
					holidayCalendarEntry.organizationId,
					holidayCalendarEntry.dateKey,
					holidayCalendarEntry.source,
					holidayCalendarEntry.entryKey,
				],
				set: {
					name: sql`excluded.name`,
					kind: sql`excluded.kind`,
					status: 'APPROVED',
					active: true,
					legalReference: sql`excluded.legal_reference`,
					conflictReason: null,
					syncRunId: args.syncRunId,
					approvedAt: new Date(),
					rejectedAt: null,
					rejectedBy: null,
				},
			})
			.returning({ id: holidayCalendarEntry.id });

		upsertedCount += inserted.length;
	}

	return upsertedCount;
}

/**
 * Starts a holiday sync run record.
 *
 * @param args - Sync run args
 * @returns Created run row
 */
async function startHolidaySyncRun(args: {
	organizationId: string | null;
	years: number[];
}): Promise<HolidaySyncRunRow> {
	const [run] = await db
		.insert(holidaySyncRun)
		.values({
			organizationId: args.organizationId,
			provider: HOLIDAY_PROVIDER,
			requestedYears: args.years,
			status: 'RUNNING',
			startedAt: new Date(),
			stale: false,
		})
		.returning();

	if (!run) {
		throw new Error('Failed to create holiday sync run.');
	}

	return run;
}

/**
 * Completes a holiday sync run.
 *
 * @param args - Completion args
 * @returns Updated sync run row
 */
async function finalizeHolidaySyncRun(args: {
	runId: string;
	status: HolidaySyncRunStatus;
	importedCount: number;
	pendingCount: number;
	errorCount: number;
	errorPayload?: Record<string, unknown> | null;
	stale: boolean;
}): Promise<HolidaySyncRunRow> {
	const [updatedRun] = await db
		.update(holidaySyncRun)
		.set({
			status: args.status,
			importedCount: args.importedCount,
			pendingCount: args.pendingCount,
			errorCount: args.errorCount,
			errorPayload: args.errorPayload ?? null,
			stale: args.stale,
			finishedAt: new Date(),
		})
		.where(eq(holidaySyncRun.id, args.runId))
		.returning();

	if (!updatedRun) {
		throw new Error('Failed to finalize holiday sync run.');
	}

	return updatedRun;
}

/**
 * Synchronizes INTERNAL and PROVIDER holidays for an organization.
 *
 * @param args - Sync arguments
 * @returns Sync result with run summary
 */
export async function syncOrganizationHolidayCalendar(args: {
	organizationId: string;
	years: number[];
	requestedByUserId?: string | null;
	fetchFn?: typeof fetch;
}): Promise<HolidaySyncResult> {
	const years = Array.from(new Set(args.years)).sort((a, b) => a - b);
	if (years.length === 0) {
		throw new Error('At least one year is required to synchronize holidays.');
	}

	const run = await startHolidaySyncRun({ organizationId: args.organizationId, years });
	const fetchFn = args.fetchFn ?? fetch;
	let importedCount = 0;
	let pendingCount = 0;
	let errorCount = 0;
	let stale = false;
	let errorPayload: Record<string, unknown> | null = null;

	try {
		importedCount += await ensureInternalHolidays({
			organizationId: args.organizationId,
			years,
			syncRunId: run.id,
		});

		for (const year of years) {
			const providerRows = await fetchNagerHolidays(year, fetchFn);
			const internalMandatoryKeys = getMexicoMandatoryRestDayKeysForYear(year);
			const mappedRows = providerRows.map((row) =>
				mapProviderHolidayToEntry({
					organizationId: args.organizationId,
					runId: run.id,
					row,
					internalMandatoryKeys,
				}),
			);

			if (mappedRows.length === 0) {
				continue;
			}

			const inserted = await db
				.insert(holidayCalendarEntry)
				.values(mappedRows)
				.onConflictDoUpdate({
					target: [
						holidayCalendarEntry.organizationId,
						holidayCalendarEntry.dateKey,
						holidayCalendarEntry.source,
						holidayCalendarEntry.entryKey,
					],
					set: {
						name: sql`excluded.name`,
						kind: sql`excluded.kind`,
						status: 'PENDING_APPROVAL',
						active: true,
						provider: HOLIDAY_PROVIDER,
						providerExternalId: sql`excluded.provider_external_id`,
						subdivisionCode: sql`excluded.subdivision_code`,
						legalReference: sql`excluded.legal_reference`,
						conflictReason: sql`excluded.conflict_reason`,
						syncRunId: run.id,
						rejectedAt: null,
						rejectedBy: null,
					},
				})
				.returning({ id: holidayCalendarEntry.id });

			importedCount += inserted.length;
		}

		const pendingRows = await db
			.select({ id: holidayCalendarEntry.id })
			.from(holidayCalendarEntry)
			.where(
				and(
					eq(holidayCalendarEntry.organizationId, args.organizationId),
					eq(holidayCalendarEntry.syncRunId, run.id),
					eq(holidayCalendarEntry.status, 'PENDING_APPROVAL'),
				),
			);
		pendingCount = pendingRows.length;

		await insertHolidayAuditEvent({
			organizationId: args.organizationId,
			syncRunId: run.id,
			action: 'holiday.sync.completed',
			actorType: args.requestedByUserId ? 'session' : 'system',
			actorUserId: args.requestedByUserId ?? null,
			metadata: {
				years,
				importedCount,
				pendingCount,
			},
		});
	} catch (error) {
		errorCount += 1;
		stale = true;
		errorPayload = {
			message: error instanceof Error ? error.message : 'Unknown sync failure',
		};
		await insertHolidayAuditEvent({
			organizationId: args.organizationId,
			syncRunId: run.id,
			action: 'holiday.sync.failed',
			actorType: args.requestedByUserId ? 'session' : 'system',
			actorUserId: args.requestedByUserId ?? null,
			metadata: errorPayload,
		});
	}

	const finalizedRun = await finalizeHolidaySyncRun({
		runId: run.id,
		status: errorCount > 0 ? 'FAILED' : 'COMPLETED',
		importedCount,
		pendingCount,
		errorCount,
		errorPayload,
		stale,
	});

	return {
		run: finalizedRun,
		importedCount,
		pendingCount,
		errorCount,
	};
}

/**
 * Returns the latest sync status and staleness indicators for an organization.
 *
 * @param organizationId - Organization identifier
 * @returns Sync status payload
 */
export async function getHolidaySyncStatus(organizationId: string): Promise<{
	lastRun: HolidaySyncRunRow | null;
	pendingApprovalCount: number;
	stale: boolean;
}> {
	const [lastRun] = await db
		.select()
		.from(holidaySyncRun)
		.where(eq(holidaySyncRun.organizationId, organizationId))
		.orderBy(sql`${holidaySyncRun.startedAt} desc`)
		.limit(1);

	const pendingRows = await db
		.select({ id: holidayCalendarEntry.id })
		.from(holidayCalendarEntry)
		.where(
			and(
				eq(holidayCalendarEntry.organizationId, organizationId),
				eq(holidayCalendarEntry.status, 'PENDING_APPROVAL'),
				eq(holidayCalendarEntry.active, true),
			),
		);

	const staleByTime =
		lastRun?.startedAt !== undefined
			? Date.now() - lastRun.startedAt.getTime() > 1000 * 60 * 60 * 24 * 8
			: true;

	return {
		lastRun: lastRun ?? null,
		pendingApprovalCount: pendingRows.length,
		stale: Boolean(lastRun?.stale) || staleByTime,
	};
}

/**
 * Approves all pending entries associated with a sync run.
 *
 * @param args - Approval args
 * @returns Number of approved rows
 */
export async function approveHolidaySyncRun(args: {
	runId: string;
	organizationId: string;
	actorUserId: string;
	reason: string;
}): Promise<number> {
	const rows = await db
		.update(holidayCalendarEntry)
		.set({
			status: 'APPROVED',
			active: true,
			approvedAt: new Date(),
			approvedBy: args.actorUserId,
			rejectedAt: null,
			rejectedBy: null,
		})
		.where(
			and(
				eq(holidayCalendarEntry.organizationId, args.organizationId),
				eq(holidayCalendarEntry.syncRunId, args.runId),
				eq(holidayCalendarEntry.status, 'PENDING_APPROVAL'),
			),
		)
		.returning({ id: holidayCalendarEntry.id });

	await db
		.update(holidaySyncRun)
		.set({
			status: 'COMPLETED',
			pendingCount: 0,
			stale: false,
			finishedAt: new Date(),
		})
		.where(eq(holidaySyncRun.id, args.runId));

	await insertHolidayAuditEvent({
		organizationId: args.organizationId,
		syncRunId: args.runId,
		action: 'holiday.sync.approved',
		actorType: 'session',
		actorUserId: args.actorUserId,
		reason: args.reason,
		metadata: { approvedCount: rows.length },
	});

	return rows.length;
}

/**
 * Rejects all pending entries associated with a sync run.
 *
 * @param args - Rejection args
 * @returns Number of rejected rows
 */
export async function rejectHolidaySyncRun(args: {
	runId: string;
	organizationId: string;
	actorUserId: string;
	reason: string;
}): Promise<number> {
	const rows = await db
		.update(holidayCalendarEntry)
		.set({
			status: 'REJECTED',
			active: false,
			approvedAt: null,
			approvedBy: null,
			rejectedAt: new Date(),
			rejectedBy: args.actorUserId,
		})
		.where(
			and(
				eq(holidayCalendarEntry.organizationId, args.organizationId),
				eq(holidayCalendarEntry.syncRunId, args.runId),
				eq(holidayCalendarEntry.status, 'PENDING_APPROVAL'),
			),
		)
		.returning({ id: holidayCalendarEntry.id });

	await db
		.update(holidaySyncRun)
		.set({
			status: 'COMPLETED',
			pendingCount: 0,
			stale: false,
			finishedAt: new Date(),
		})
		.where(eq(holidaySyncRun.id, args.runId));

	await insertHolidayAuditEvent({
		organizationId: args.organizationId,
		syncRunId: args.runId,
		action: 'holiday.sync.rejected',
		actorType: 'session',
		actorUserId: args.actorUserId,
		reason: args.reason,
		metadata: { rejectedCount: rows.length },
	});

	return rows.length;
}

/**
 * Validates that a user has admin or owner role in an organization.
 *
 * @param args - User and organization identifiers
 * @returns True when the user has admin privileges
 */
export async function isOrganizationAdmin(args: {
	userId: string;
	organizationId: string;
}): Promise<boolean> {
	const membershipRows = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, args.userId), eq(member.organizationId, args.organizationId)))
		.limit(1);
	const role = membershipRows[0]?.role;
	return role === 'owner' || role === 'admin';
}

/**
 * Creates custom holiday entries (one-time or annual projection).
 *
 * @param args - Creation args
 * @returns Inserted calendar entries
 */
export async function createCustomHolidayEntries(args: {
	organizationId: string;
	dateKey: string;
	name: string;
	kind: HolidayKindValue;
	recurrence: 'ONE_TIME' | 'ANNUAL';
	legalReference?: string | null;
	actorUserId: string;
}): Promise<(typeof holidayCalendarEntry.$inferSelect)[]> {
	const normalizedDateKey = normalizeDateKey(args.dateKey);
	const baseYear = Number(normalizedDateKey.slice(0, 4));
	const monthDay = normalizedDateKey.slice(5);
	const seriesId = args.recurrence === 'ANNUAL' ? randomUUID() : null;

	const projectedDateKeys =
		args.recurrence === 'ANNUAL'
			? Array.from({ length: ANNUAL_PROJECTION_YEARS + 1 }).map((_, offset) =>
					resolveAnnualDateKey(monthDay, baseYear + offset),
				)
			: [normalizedDateKey];

	const payload: HolidayEntryInsert[] = projectedDateKeys.map((dateKey) => ({
		organizationId: args.organizationId,
		dateKey,
		name: args.name.trim(),
		kind: args.kind,
		source: 'CUSTOM',
		status: 'APPROVED',
		isRecurring: args.recurrence === 'ANNUAL',
		seriesId,
		provider: null,
		providerExternalId: null,
		subdivisionCode: null,
		legalReference: args.legalReference ?? null,
		conflictReason: null,
		active: true,
		entryKey: buildEntryKey({
			source: 'CUSTOM',
			dateKey,
			name: args.name,
			recurrenceKey: seriesId,
		}),
		syncRunId: null,
		approvedBy: args.actorUserId,
		approvedAt: new Date(),
	}));

	const inserted = await db
		.insert(holidayCalendarEntry)
		.values(payload)
		.onConflictDoUpdate({
			target: [
				holidayCalendarEntry.organizationId,
				holidayCalendarEntry.dateKey,
				holidayCalendarEntry.source,
				holidayCalendarEntry.entryKey,
			],
			set: {
				name: sql`excluded.name`,
				kind: sql`excluded.kind`,
				status: 'APPROVED',
				active: true,
				legalReference: sql`excluded.legal_reference`,
				approvedBy: args.actorUserId,
				approvedAt: new Date(),
			},
		})
		.returning();

	await insertHolidayAuditEvent({
		organizationId: args.organizationId,
		action: 'holiday.custom.created',
		actorType: 'session',
		actorUserId: args.actorUserId,
		metadata: {
			recurrence: args.recurrence,
			count: inserted.length,
			dateKey: normalizedDateKey,
		},
	});

	return inserted;
}

/**
 * Updates a holiday entry with auditable reason.
 *
 * @param args - Update args
 * @returns Updated holiday entry
 * @throws Error when the entry is not found or immutable
 */
export async function updateHolidayEntry(args: {
	organizationId: string;
	holidayId: string;
	actorUserId: string;
	reason: string;
	name?: string;
	kind?: HolidayKindValue;
	dateKey?: string;
	active?: boolean;
	legalReference?: string | null;
}): Promise<typeof holidayCalendarEntry.$inferSelect> {
	const [existing] = await db
		.select()
		.from(holidayCalendarEntry)
		.where(
			and(
				eq(holidayCalendarEntry.id, args.holidayId),
				eq(holidayCalendarEntry.organizationId, args.organizationId),
			),
		)
		.limit(1);

	if (!existing) {
		throw new Error('Holiday entry not found.');
	}
	if (existing.source === 'INTERNAL') {
		throw new Error('Internal holidays are read-only.');
	}

	const nextDateKey = args.dateKey ? normalizeDateKey(args.dateKey) : existing.dateKey;
	const nextName = args.name?.trim() ?? existing.name;
	const nextKind = args.kind ?? existing.kind;
	const nextActive = args.active ?? existing.active;
	const nextStatus: HolidayStatusValue = nextActive ? existing.status : 'DEACTIVATED';

	const [updated] = await db
		.update(holidayCalendarEntry)
		.set({
			dateKey: nextDateKey,
			name: nextName,
			kind: nextKind,
			active: nextActive,
			status: nextStatus,
			legalReference:
				args.legalReference !== undefined ? args.legalReference : existing.legalReference,
			entryKey: buildEntryKey({
				source: existing.source,
				dateKey: nextDateKey,
				name: nextName,
				recurrenceKey: existing.seriesId,
				externalId: existing.providerExternalId,
				subdivisionCode: existing.subdivisionCode,
			}),
			approvedBy:
				nextActive && existing.status !== 'APPROVED'
					? args.actorUserId
					: existing.approvedBy,
			approvedAt:
				nextActive && existing.status !== 'APPROVED' ? new Date() : existing.approvedAt,
			rejectedBy: !nextActive ? args.actorUserId : null,
			rejectedAt: !nextActive ? new Date() : null,
		})
		.where(eq(holidayCalendarEntry.id, args.holidayId))
		.returning();

	if (!updated) {
		throw new Error('Failed to update holiday entry.');
	}

	await insertHolidayAuditEvent({
		organizationId: args.organizationId,
		holidayEntryId: updated.id,
		action: 'holiday.entry.updated',
		actorType: 'session',
		actorUserId: args.actorUserId,
		reason: args.reason,
		before: existing as unknown as Record<string, unknown>,
		after: updated as unknown as Record<string, unknown>,
	});

	return updated;
}

/**
 * Parses CSV lines while preserving quoted values.
 *
 * @param line - CSV line
 * @returns Parsed cell values
 */
function parseCsvLine(line: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === '"') {
			if (inQuotes && line[index + 1] === '"') {
				current += '"';
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (char === ',' && !inQuotes) {
			values.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	values.push(current.trim());
	return values;
}

/**
 * Imports custom holidays from CSV content using partial upsert semantics.
 *
 * Expected headers: dateKey,name,kind,recurrence,legalReference
 *
 * @param args - CSV import arguments
 * @returns Import report
 */
export async function importHolidayCsv(args: {
	organizationId: string;
	csvContent: string;
	actorUserId: string;
}): Promise<{
	appliedRows: number;
	rejectedRows: number;
	errors: Array<{ line: number; reason: string }>;
}> {
	const lines = args.csvContent.split(/\r?\n/u).filter((line) => line.trim().length > 0);
	if (lines.length <= 1) {
		return { appliedRows: 0, rejectedRows: 0, errors: [] };
	}

	const [headerLine, ...dataLines] = lines;
	const headers = parseCsvLine(headerLine ?? '').map((header) => header.trim().toLowerCase());
	const headerIndex = new Map(headers.map((value, index) => [value, index]));

	const requiredHeaders = ['datekey', 'name'];
	for (const requiredHeader of requiredHeaders) {
		if (!headerIndex.has(requiredHeader)) {
			throw new Error(`CSV header "${requiredHeader}" is required.`);
		}
	}

	let appliedRows = 0;
	let rejectedRows = 0;
	const errors: Array<{ line: number; reason: string }> = [];

	for (let index = 0; index < dataLines.length; index += 1) {
		const lineNumber = index + 2;
		const values = parseCsvLine(dataLines[index] ?? '');
		const getValue = (header: string): string => {
			const valueIndex = headerIndex.get(header);
			if (valueIndex === undefined) {
				return '';
			}
			return (values[valueIndex] ?? '').trim();
		};

		const dateKey = getValue('datekey');
		const name = getValue('name');
		const kindRaw = getValue('kind').toUpperCase();
		const recurrenceRaw = getValue('recurrence').toUpperCase();
		const legalReference = getValue('legalreference') || null;

		if (!dateKey || !name) {
			rejectedRows += 1;
			errors.push({ line: lineNumber, reason: 'dateKey y name son obligatorios.' });
			continue;
		}

		const kind: HolidayKindValue =
			kindRaw === 'OPTIONAL'
				? 'OPTIONAL'
				: kindRaw === 'MANDATORY'
					? 'MANDATORY'
					: 'MANDATORY';
		const recurrence = recurrenceRaw === 'ANNUAL' ? 'ANNUAL' : 'ONE_TIME';

		try {
			await createCustomHolidayEntries({
				organizationId: args.organizationId,
				dateKey,
				name,
				kind,
				recurrence,
				legalReference,
				actorUserId: args.actorUserId,
			});
			appliedRows += 1;
		} catch (error) {
			rejectedRows += 1;
			errors.push({
				line: lineNumber,
				reason: error instanceof Error ? error.message : 'Fila inválida.',
			});
		}
	}

	await insertHolidayAuditEvent({
		organizationId: args.organizationId,
		action: 'holiday.csv.imported',
		actorType: 'session',
		actorUserId: args.actorUserId,
		metadata: {
			appliedRows,
			rejectedRows,
			errorsCount: errors.length,
		},
	});

	return {
		appliedRows,
		rejectedRows,
		errors,
	};
}

/**
 * Exports holiday entries to CSV string.
 *
 * @param entries - Holiday entries to export
 * @returns CSV content
 */
export function buildHolidayCsvExport(
	entries: (typeof holidayCalendarEntry.$inferSelect)[],
): string {
	const header = [
		'dateKey',
		'name',
		'kind',
		'source',
		'status',
		'isRecurring',
		'seriesId',
		'legalReference',
		'active',
	].join(',');

	const rows = entries.map((entry) => {
		const cells = [
			entry.dateKey,
			entry.name,
			entry.kind,
			entry.source,
			entry.status,
			String(entry.isRecurring),
			entry.seriesId ?? '',
			entry.legalReference ?? '',
			String(entry.active),
		];
		return cells
			.map((value) => {
				if (value.includes(',') || value.includes('"')) {
					return `"${value.replace(/"/g, '""')}"`;
				}
				return value;
			})
			.join(',');
	});

	return [header, ...rows].join('\n');
}

/**
 * Resolves additional mandatory rest days to be consumed by payroll calculation.
 *
 * Uses approved non-internal holiday entries when available. While a new sync run
 * is pending review, it also considers rows that were previously approved
 * (`approvedAt` present) to keep payroll aligned with the last approved calendar.
 * Falls back to legacy `additionalMandatoryRestDays` from payroll settings only
 * when no approved calendar rows are available.
 *
 * @param args - Resolution args
 * @returns Date keys consumed as additional mandatory rest days
 */
export async function resolveAdditionalMandatoryRestDaysForPeriod(
	args: AdditionalMandatoryRestDaysArgs,
): Promise<string[]> {
	const rows = await db
		.select({
			dateKey: holidayCalendarEntry.dateKey,
		})
		.from(holidayCalendarEntry)
		.where(
			and(
				eq(holidayCalendarEntry.organizationId, args.organizationId),
				eq(holidayCalendarEntry.active, true),
				sql`(
					${holidayCalendarEntry.status} = 'APPROVED'
					or (
						${holidayCalendarEntry.status} = 'PENDING_APPROVAL'
						and ${holidayCalendarEntry.approvedAt} is not null
					)
				)`,
				eq(holidayCalendarEntry.kind, 'MANDATORY'),
				inArray(holidayCalendarEntry.source, ['PROVIDER', 'CUSTOM']),
				gte(holidayCalendarEntry.dateKey, args.periodStartDateKey),
				lte(holidayCalendarEntry.dateKey, args.periodEndDateKey),
			),
		);

	const approvedAdditionalMandatoryRestDays = Array.from(
		new Set(rows.map((row) => row.dateKey)),
	).sort((a, b) => a.localeCompare(b));

	if (approvedAdditionalMandatoryRestDays.length > 0) {
		return approvedAdditionalMandatoryRestDays;
	}

	return args.legacyAdditionalMandatoryRestDays
		.filter((dateKey) => dateKey >= args.periodStartDateKey && dateKey <= args.periodEndDateKey)
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Builds holiday notice and employee impacts for payroll responses.
 *
 * @param args - Notice generation args
 * @returns Payroll holiday context
 */
export async function resolvePayrollHolidayContext(args: {
	organizationId: string;
	periodStartDateKey: string;
	periodEndDateKey: string;
	legacyAdditionalMandatoryRestDays: string[];
	employees: PayrollCalculationRow[];
	additionalMandatoryRestDays?: string[];
}): Promise<PayrollHolidayContext> {
	const additionalMandatoryRestDays =
		args.additionalMandatoryRestDays ??
		(await resolveAdditionalMandatoryRestDaysForPeriod({
			organizationId: args.organizationId,
			periodStartDateKey: args.periodStartDateKey,
			periodEndDateKey: args.periodEndDateKey,
			legacyAdditionalMandatoryRestDays: args.legacyAdditionalMandatoryRestDays,
		}));

	const years = getYearsInRange(args.periodStartDateKey, args.periodEndDateKey);
	const internalMandatoryDateKeys = years.flatMap((year) =>
		Array.from(getMexicoMandatoryRestDayKeysForYear(year)),
	);

	const affectedHolidayDateKeys = Array.from(
		new Set(
			[...internalMandatoryDateKeys, ...additionalMandatoryRestDays].filter(
				(dateKey) => dateKey >= args.periodStartDateKey && dateKey <= args.periodEndDateKey,
			),
		),
	).sort((a, b) => a.localeCompare(b));

	const employeeHolidayImpactByEmployeeId: Record<string, PayrollEmployeeHolidayImpact> = {};
	let estimatedMandatoryPremiumTotal = 0;
	for (const employee of args.employees) {
		const premiumAmount = Number(employee.mandatoryRestDayPremiumAmount ?? 0);
		const dateKeys = employee.mandatoryRestDayDateKeys ?? [];
		if (premiumAmount <= 0 && dateKeys.length === 0) {
			continue;
		}
		estimatedMandatoryPremiumTotal += premiumAmount;
		employeeHolidayImpactByEmployeeId[employee.employeeId] = {
			affectedHolidayDateKeys: dateKeys.length > 0 ? dateKeys : affectedHolidayDateKeys,
			mandatoryPremiumAmount: premiumAmount,
		};
	}

	const affectedEmployees = Object.keys(employeeHolidayImpactByEmployeeId).length;
	const holidayNotices: PayrollHolidayNotice[] = [];
	if (affectedHolidayDateKeys.length > 0) {
		const legalReference: PayrollHolidayLegalReference =
			estimatedMandatoryPremiumTotal > 0 ? 'LFT Art. 74/75' : 'LFT Art. 74';
		holidayNotices.push({
			kind: 'HOLIDAY_PAYROLL_IMPACT',
			title: 'Aviso de feriado',
			message:
				estimatedMandatoryPremiumTotal > 0
					? `El periodo incluye ${affectedHolidayDateKeys.length} feriado(s) aplicable(s). ${affectedEmployees} empleado(s) con prima estimada por descanso obligatorio.`
					: `El periodo incluye ${affectedHolidayDateKeys.length} feriado(s) aplicable(s). No se detectó prima estimada por descanso obligatorio.`,
			legalReference,
			periodStartDateKey: args.periodStartDateKey,
			periodEndDateKey: args.periodEndDateKey,
			affectedHolidayDateKeys,
			affectedEmployees,
			estimatedMandatoryPremiumTotal: Number(estimatedMandatoryPremiumTotal.toFixed(2)),
			generatedAt: new Date().toISOString(),
		});
	}

	return {
		additionalMandatoryRestDays,
		holidayNotices,
		employeeHolidayImpactByEmployeeId,
	};
}

/**
 * Collects organizations enabled for global sync operations.
 *
 * @returns Organization IDs
 */
export async function getAllOrganizationIdsForHolidaySync(): Promise<string[]> {
	const rows = await db.select({ id: organization.id }).from(organization);
	return rows.map((row) => row.id);
}

/**
 * Cleans holiday sync/audit history beyond the retention window.
 *
 * @param args - Optional organization scope
 * @returns Cleanup counters
 */
export async function cleanupHolidayHistory(args: {
	organizationId?: string;
}): Promise<{ deletedAuditEvents: number; deletedSyncRuns: number; deletedEntries: number }> {
	const threshold = new Date();
	threshold.setUTCFullYear(threshold.getUTCFullYear() - RETENTION_YEARS);

	const orgFilter =
		args.organizationId !== undefined
			? eq(holidayAuditEvent.organizationId, args.organizationId)
			: undefined;

	const deletedAudit = await db
		.delete(holidayAuditEvent)
		.where(
			orgFilter
				? and(orgFilter, lte(holidayAuditEvent.createdAt, threshold))
				: lte(holidayAuditEvent.createdAt, threshold),
		)
		.returning({ id: holidayAuditEvent.id });

	const deletedRuns = await db
		.delete(holidaySyncRun)
		.where(
			args.organizationId
				? and(
						eq(holidaySyncRun.organizationId, args.organizationId),
						lte(holidaySyncRun.startedAt, threshold),
					)
				: lte(holidaySyncRun.startedAt, threshold),
		)
		.returning({ id: holidaySyncRun.id });

	const entryFilters: SQL<unknown>[] = [
		inArray(holidayCalendarEntry.status, ['REJECTED', 'DEACTIVATED']),
		eq(holidayCalendarEntry.active, false),
		lte(holidayCalendarEntry.updatedAt, threshold),
	];
	if (args.organizationId) {
		entryFilters.push(eq(holidayCalendarEntry.organizationId, args.organizationId));
	}

	const deletedEntries = await db
		.delete(holidayCalendarEntry)
		.where(and(...entryFilters))
		.returning({ id: holidayCalendarEntry.id });

	return {
		deletedAuditEvents: deletedAudit.length,
		deletedSyncRuns: deletedRuns.length,
		deletedEntries: deletedEntries.length,
	};
}

/**
 * Resolves years for a sync request using defaults when none are provided.
 *
 * @param years - Optional explicit years
 * @returns Year list used by sync operations
 */
export function resolveSyncYears(years?: number[]): number[] {
	if (years && years.length > 0) {
		return Array.from(new Set(years)).sort((a, b) => a - b);
	}
	const currentYear = new Date().getUTCFullYear();
	return [currentYear, currentYear + 1];
}

/**
 * Reads approved holiday entries with optional filters.
 *
 * @param args - Query arguments
 * @returns Holiday entries
 */
export async function listHolidayEntries(args: {
	organizationId: string;
	year?: number;
	source?: HolidaySourceValue;
	status?: HolidayStatusValue;
	kind?: HolidayKindValue;
}): Promise<(typeof holidayCalendarEntry.$inferSelect)[]> {
	const filters: SQL<unknown>[] = [eq(holidayCalendarEntry.organizationId, args.organizationId)];

	if (args.year !== undefined) {
		filters.push(
			and(
				gte(holidayCalendarEntry.dateKey, `${args.year}-01-01`),
				lte(holidayCalendarEntry.dateKey, `${args.year}-12-31`),
			) as SQL<unknown>,
		);
	}
	if (args.source) {
		filters.push(eq(holidayCalendarEntry.source, args.source));
	}
	if (args.status) {
		filters.push(eq(holidayCalendarEntry.status, args.status));
	}
	if (args.kind) {
		filters.push(eq(holidayCalendarEntry.kind, args.kind));
	}

	return db
		.select()
		.from(holidayCalendarEntry)
		.where(and(...filters))
		.orderBy(holidayCalendarEntry.dateKey, holidayCalendarEntry.createdAt);
}

/**
 * Reads legacy additional mandatory rest days from payroll settings.
 *
 * @param organizationId - Organization identifier
 * @returns Legacy date keys
 */
export async function getLegacyAdditionalMandatoryRestDays(
	organizationId: string,
): Promise<string[]> {
	const [settings] = await db
		.select({ additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);

	return settings?.additionalMandatoryRestDays ?? [];
}
