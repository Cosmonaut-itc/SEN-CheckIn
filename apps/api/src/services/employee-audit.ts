import { sql } from 'drizzle-orm';

import type db from '../db/index.js';
import { employee, employeeAuditEvent } from '../db/schema.js';
import type { EmployeeAuditActorType } from '@sen-checkin/types';
import type { AuthSession } from '../plugins/auth.js';

type AuditDb = Pick<typeof db, 'insert' | 'execute'>;
type EmployeeRow = typeof employee.$inferSelect;

/**
 * Sets a session flag so audit triggers skip inserts within the current transaction.
 *
 * @param tx - Drizzle transaction or database client
 * @returns Nothing
 */
export async function setEmployeeAuditSkip(tx: AuditDb): Promise<void> {
	await tx.execute(sql`select set_config('sen_checkin.skip_employee_audit', '1', true)`);
}

/**
 * Resolves audit actor metadata from the auth context.
 *
 * @param authType - Authentication type
 * @param session - Auth session when using session auth
 * @returns Actor type and optional user ID
 */
export function resolveEmployeeAuditActor(
	authType: 'session' | 'apiKey',
	session: AuthSession | null,
): { actorType: EmployeeAuditActorType; actorUserId: string | null } {
	if (authType === 'session' && session) {
		return { actorType: 'user', actorUserId: session.userId };
	}
	if (authType === 'apiKey') {
		return { actorType: 'apiKey', actorUserId: null };
	}
	return { actorType: 'system', actorUserId: null };
}

/**
 * Normalizes values for audit snapshots to ensure stable comparisons.
 *
 * @param value - Value to normalize
 * @returns Normalized value
 */
function normalizeAuditValue(value: unknown): unknown {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'bigint') {
		return value.toString();
	}
	return value;
}

/**
 * Builds a flat snapshot of employee fields for auditing.
 *
 * @param record - Employee record
 * @returns Snapshot object with employee fields
 */
export function buildEmployeeAuditSnapshot(record: EmployeeRow): Record<string, unknown> {
	return {
		id: record.id,
		code: record.code,
		firstName: record.firstName,
		lastName: record.lastName,
		nss: record.nss,
		rfc: record.rfc,
		email: record.email,
		phone: record.phone,
		jobPositionId: record.jobPositionId,
		department: record.department,
		status: record.status,
		terminationDateKey: record.terminationDateKey,
		lastDayWorkedDateKey: record.lastDayWorkedDateKey,
		terminationReason: record.terminationReason,
		contractType: record.contractType,
		terminationNotes: record.terminationNotes,
		shiftType: record.shiftType,
		hireDate: record.hireDate,
		dailyPay: record.dailyPay,
		paymentFrequency: record.paymentFrequency,
		sbcDailyOverride: record.sbcDailyOverride,
		locationId: record.locationId,
		scheduleTemplateId: record.scheduleTemplateId,
		organizationId: record.organizationId,
		userId: record.userId,
		lastPayrollDate: record.lastPayrollDate,
		rekognitionUserId: record.rekognitionUserId,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

/**
 * Computes changed fields between two audit snapshots.
 *
 * @param before - Snapshot before the change
 * @param after - Snapshot after the change
 * @returns Array of changed field names
 */
export function getEmployeeAuditChangedFields(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): string[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	const changes: string[] = [];

	for (const key of keys) {
		if (key === 'updatedAt') {
			continue;
		}
		const beforeValue = normalizeAuditValue(before[key]);
		const afterValue = normalizeAuditValue(after[key]);
		if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
			changes.push(key);
		}
	}

	return changes;
}

/**
 * Inserts an employee audit event.
 *
 * @param tx - Drizzle transaction or database client
 * @param args - Audit event inputs
 * @param args.employeeId - Employee identifier
 * @param args.organizationId - Organization identifier
 * @param args.action - Audit action string
 * @param args.actorType - Actor type
 * @param args.actorUserId - Actor user identifier
 * @param args.before - Snapshot before the change
 * @param args.after - Snapshot after the change
 * @param args.changedFields - Changed field names
 * @returns Nothing
 */
export async function createEmployeeAuditEvent(
	tx: AuditDb,
	args: {
		employeeId: string;
		organizationId: string | null;
		action: string;
		actorType: EmployeeAuditActorType;
		actorUserId: string | null;
		before?: Record<string, unknown> | null;
		after?: Record<string, unknown> | null;
		changedFields?: string[] | null;
	},
): Promise<void> {
	await tx.insert(employeeAuditEvent).values({
		employeeId: args.employeeId,
		organizationId: args.organizationId,
		action: args.action,
		actorType: args.actorType,
		actorUserId: args.actorUserId,
		before: args.before ?? null,
		after: args.after ?? null,
		changedFields: args.changedFields ?? [],
	});
}
