import { and, eq, sql } from 'drizzle-orm';

import db from '../db/index.js';
import { employeeTerminationDraft, organizationDisciplinaryFolioCounter } from '../db/schema.js';
import { parseDateKey } from '../utils/date-key.js';

/**
 * Converts a date key to a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at UTC midnight
 */
function dateKeyToUtcDate(dateKey: string): Date {
	const parsed = parseDateKey(dateKey);
	return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

/**
 * Validates a suspension date range according to disciplinary policy.
 *
 * @param args - Suspension date inputs
 * @param args.startDateKey - Suspension start date key (YYYY-MM-DD)
 * @param args.endDateKey - Suspension end date key (YYYY-MM-DD)
 * @returns Validation result with computed day count when valid
 */
export function validateSuspensionRange(args: {
	startDateKey: string;
	endDateKey: string;
}): { isValid: true; days: number } | { isValid: false; message: string } {
	const startDate = dateKeyToUtcDate(args.startDateKey);
	const endDate = dateKeyToUtcDate(args.endDateKey);
	if (endDate < startDate) {
		return {
			isValid: false,
			message: 'suspensionEndDateKey must be on or after suspensionStartDateKey',
		};
	}

	const days =
		Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
	if (days > 8) {
		return {
			isValid: false,
			message: 'suspension range cannot exceed 8 days',
		};
	}

	return { isValid: true, days };
}

/**
 * Atomically increments and returns the next disciplinary folio for an organization.
 *
 * @param organizationId - Organization identifier
 * @returns Next folio number
 * @throws Error when the counter row cannot be created or incremented
 */
export async function createNextDisciplinaryFolio(organizationId: string): Promise<number> {
	const result = await db.transaction(async (tx) => {
		await tx
			.insert(organizationDisciplinaryFolioCounter)
			.values({ organizationId })
			.onConflictDoNothing({
				target: organizationDisciplinaryFolioCounter.organizationId,
			});

		const rows = await tx
			.update(organizationDisciplinaryFolioCounter)
			.set({
				lastFolio: sql`${organizationDisciplinaryFolioCounter.lastFolio} + 1`,
			})
			.where(eq(organizationDisciplinaryFolioCounter.organizationId, organizationId))
			.returning({ nextFolio: organizationDisciplinaryFolioCounter.lastFolio });

		return rows[0] ?? null;
	});

	if (!result) {
		throw new Error('Failed to generate disciplinary folio');
	}

	return result.nextFolio;
}

/**
 * Creates or reactivates a termination draft for a disciplinary measure.
 *
 * @param args - Draft creation data
 * @param args.organizationId - Organization identifier
 * @param args.employeeId - Employee identifier
 * @param args.measureId - Disciplinary measure identifier
 * @param args.actorUserId - User performing the action
 * @param args.payload - Optional termination draft payload
 * @returns Upserted draft record
 */
export async function ensureTerminationDraftForMeasure(args: {
	organizationId: string;
	employeeId: string;
	measureId: string;
	actorUserId: string;
	payload?: Record<string, unknown>;
}): Promise<typeof employeeTerminationDraft.$inferSelect> {
	const payload = args.payload ?? {};

	const existingRows = await db
		.select()
		.from(employeeTerminationDraft)
		.where(eq(employeeTerminationDraft.measureId, args.measureId))
		.limit(1);

	const existing = existingRows[0] ?? null;
	if (!existing) {
		const insertedRows = await db
			.insert(employeeTerminationDraft)
			.values({
				organizationId: args.organizationId,
				employeeId: args.employeeId,
				measureId: args.measureId,
				status: 'ACTIVE',
				payload,
				createdByUserId: args.actorUserId,
				updatedByUserId: args.actorUserId,
			})
			.returning();

		return insertedRows[0] as typeof employeeTerminationDraft.$inferSelect;
	}

	const updatedRows = await db
		.update(employeeTerminationDraft)
		.set({
			status: 'ACTIVE',
			payload,
			consumedAt: null,
			cancelledAt: null,
			updatedByUserId: args.actorUserId,
		})
		.where(eq(employeeTerminationDraft.id, existing.id))
		.returning();

	return updatedRows[0] as typeof employeeTerminationDraft.$inferSelect;
}

/**
 * Cancels an active termination draft linked to a disciplinary measure.
 *
 * @param args - Cancellation arguments
 * @param args.measureId - Disciplinary measure identifier
 * @param args.actorUserId - User performing the cancellation
 * @returns Updated draft record when a draft was cancelled, otherwise null
 */
export async function cancelTerminationDraftForMeasure(args: {
	measureId: string;
	actorUserId: string;
}): Promise<typeof employeeTerminationDraft.$inferSelect | null> {
	const updatedRows = await db
		.update(employeeTerminationDraft)
		.set({
			status: 'CANCELLED',
			cancelledAt: new Date(),
			updatedByUserId: args.actorUserId,
		})
		.where(
			and(
				eq(employeeTerminationDraft.measureId, args.measureId),
				eq(employeeTerminationDraft.status, 'ACTIVE'),
			),
		)
		.returning();

	return updatedRows[0] ?? null;
}
