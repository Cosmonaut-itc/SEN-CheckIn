import { type SQL, and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

import db from '../db/index.js';
import {
	device,
	deviceSettingsPinOverride,
	location,
	member,
	organization,
	organizationDeviceSettingsPinConfig,
} from '../db/schema.js';
import { combinedAuthPlugin, type AuthSession, type AuthUser } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import {
	createDeviceSchema,
	deviceHeartbeatSchema,
	deviceSettingsPinConfigQuerySchema,
	deviceQuerySchema,
	idParamSchema,
	registerDeviceSchema,
	updateDeviceSettingsPinConfigSchema,
	updateDeviceSettingsPinOverrideSchema,
	updateDeviceSchema,
	verifyDeviceSettingsPinSchema,
} from '../schemas/crud.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';

/**
 * Device routes for managing kiosk/device records.
 * Provides full CRUD operations for the device table plus heartbeat functionality.
 *
 * @module routes/devices
 */

const SETTINGS_PIN_HASH_PREFIX = 'scrypt:v1';
const SETTINGS_PIN_SALT_BYTES = 16;
const SETTINGS_PIN_KEY_LENGTH = 32;
const SETTINGS_PIN_VERIFY_FAILED_ATTEMPT_LIMIT = 5;
const SETTINGS_PIN_VERIFY_WINDOW_MS = 10 * 60 * 1000;
const SETTINGS_PIN_VERIFY_FAILURE_BUCKET_LIMIT = 10_000;
const scryptAsync = promisify(crypto.scrypt);

type DeviceSettingsPinMode = 'GLOBAL' | 'PER_DEVICE';
type DeviceSettingsPinSource = 'GLOBAL' | 'DEVICE' | 'NONE';
type DeviceSettingsPinListStatus = 'OWN_PIN' | 'USES_GLOBAL' | 'NOT_CONFIGURED';
type DeviceRecord = typeof device.$inferSelect;
type DeviceSettingsPinConfigRecord = typeof organizationDeviceSettingsPinConfig.$inferSelect;
type DeviceSettingsPinStatusPayload = {
	deviceId: string;
	mode: DeviceSettingsPinMode;
	pinRequired: boolean;
	source: DeviceSettingsPinSource;
	globalPinConfigured: boolean;
	deviceOverrideConfigured: boolean;
};
type SettingsPinVerifyFailure = {
	failedAttempts: number;
	firstFailedAtMs: number;
};

// Process-local limiter; see documentacion/settings-pin-checadores.md for scaling notes.
const settingsPinVerifyFailures = new Map<string, SettingsPinVerifyFailure>();

/**
 * Hashes a four-digit settings PIN using scrypt.
 *
 * @param pin - Plain settings PIN that already passed policy validation
 * @returns Encoded scrypt hash with salt
 */
async function hashSettingsPin(pin: string): Promise<string> {
	const salt = crypto.randomBytes(SETTINGS_PIN_SALT_BYTES).toString('hex');
	const derivedKey = (await scryptAsync(pin, salt, SETTINGS_PIN_KEY_LENGTH)) as Buffer;
	return `${SETTINGS_PIN_HASH_PREFIX}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a settings PIN against an encoded scrypt hash.
 *
 * @param pin - Plain PIN supplied by the caller
 * @param encodedHash - Encoded scrypt hash from storage
 * @returns True when the PIN matches the stored hash
 */
async function verifySettingsPin(pin: string, encodedHash: string): Promise<boolean> {
	const [algorithm, version, salt, digest] = encodedHash.split(':');
	if (`${algorithm}:${version}` !== SETTINGS_PIN_HASH_PREFIX || !salt || !digest) {
		return false;
	}

	const expected = Buffer.from(digest, 'hex');
	const actual = (await scryptAsync(pin, salt, expected.length)) as Buffer;
	if (actual.length !== expected.length) {
		return false;
	}

	return crypto.timingSafeEqual(actual, expected);
}

/**
 * Removes expired settings PIN verification failure buckets and caps memory use.
 *
 * @param nowMs - Current timestamp in milliseconds
 * @returns Nothing
 */
function pruneSettingsPinVerifyFailures(nowMs: number): void {
	settingsPinVerifyFailures.forEach((failure, key) => {
		if (nowMs - failure.firstFailedAtMs >= SETTINGS_PIN_VERIFY_WINDOW_MS) {
			settingsPinVerifyFailures.delete(key);
		}
	});

	if (settingsPinVerifyFailures.size <= SETTINGS_PIN_VERIFY_FAILURE_BUCKET_LIMIT) {
		return;
	}

	const sortedEntries = Array.from(settingsPinVerifyFailures.entries()).sort(
		([, left], [, right]) => left.firstFailedAtMs - right.firstFailedAtMs,
	);
	const entriesToDelete = sortedEntries.length - SETTINGS_PIN_VERIFY_FAILURE_BUCKET_LIMIT;
	for (let index = 0; index < entriesToDelete; index += 1) {
		const [key] = sortedEntries[index]!;
		settingsPinVerifyFailures.delete(key);
	}
}

/**
 * Builds the failed-attempt key for online settings PIN verification.
 *
 * @param args - Device, actor, and request context
 * @returns Rate limit key
 */
function buildSettingsPinVerifyFailureKey(args: {
	pinScope: string;
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	apiKeyId: string | null;
}): string {
	const actor =
		args.authType === 'session'
			? `session:${args.session?.userId ?? 'unknown'}`
			: `api-key:${args.apiKeyId ?? 'unknown'}`;
	return `${args.pinScope}:${actor}`;
}

/**
 * Returns current lockout state for failed settings PIN attempts.
 *
 * @param key - Failed-attempt key
 * @param nowMs - Current timestamp in milliseconds
 * @returns Lockout status and retry delay
 */
function getSettingsPinVerifyLockout(
	key: string,
	nowMs: number,
): { locked: boolean; retryAfterSeconds: number } {
	pruneSettingsPinVerifyFailures(nowMs);
	const failure = settingsPinVerifyFailures.get(key);
	if (!failure) {
		return { locked: false, retryAfterSeconds: 0 };
	}

	const elapsedMs = nowMs - failure.firstFailedAtMs;
	if (elapsedMs >= SETTINGS_PIN_VERIFY_WINDOW_MS) {
		settingsPinVerifyFailures.delete(key);
		return { locked: false, retryAfterSeconds: 0 };
	}

	if (failure.failedAttempts < SETTINGS_PIN_VERIFY_FAILED_ATTEMPT_LIMIT) {
		return { locked: false, retryAfterSeconds: 0 };
	}

	return {
		locked: true,
		retryAfterSeconds: Math.ceil((SETTINGS_PIN_VERIFY_WINDOW_MS - elapsedMs) / 1000),
	};
}

/**
 * Records a failed settings PIN verification attempt.
 *
 * @param key - Failed-attempt key
 * @param nowMs - Current timestamp in milliseconds
 * @returns Nothing
 */
function recordSettingsPinVerifyFailure(key: string, nowMs: number): void {
	pruneSettingsPinVerifyFailures(nowMs);
	const failure = settingsPinVerifyFailures.get(key);
	if (!failure || nowMs - failure.firstFailedAtMs >= SETTINGS_PIN_VERIFY_WINDOW_MS) {
		settingsPinVerifyFailures.set(key, {
			failedAttempts: 1,
			firstFailedAtMs: nowMs,
		});
		pruneSettingsPinVerifyFailures(nowMs);
		return;
	}

	settingsPinVerifyFailures.set(key, {
		...failure,
		failedAttempts: failure.failedAttempts + 1,
	});
	pruneSettingsPinVerifyFailures(nowMs);
}

/**
 * Clears failed settings PIN attempts for a lockout scope.
 *
 * @param pinScope - Effective PIN lockout scope
 * @returns Nothing
 */
function clearSettingsPinVerifyFailuresForScope(pinScope: string): void {
	const keyPrefix = `${pinScope}:`;
	settingsPinVerifyFailures.forEach((_failure, key) => {
		if (key.startsWith(keyPrefix)) {
			settingsPinVerifyFailures.delete(key);
		}
	});
}

/**
 * Checks whether a session caller can manage settings PIN policy.
 *
 * @param args - Auth and organization context
 * @returns True when caller is a platform admin or organization owner/admin
 */
async function canManageSettingsPin(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	user: AuthUser | null;
	organizationId: string;
}): Promise<boolean> {
	if (args.authType !== 'session' || !args.session) {
		return false;
	}

	if (args.user?.role === 'admin') {
		return true;
	}

	const membershipRows = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);
	const role = membershipRows[0]?.role ?? null;
	return role === 'owner' || role === 'admin';
}

/**
 * Resolves the target organization for settings PIN config reads/writes.
 * Platform admins may target any existing organization explicitly, while
 * ordinary sessions and API keys remain constrained by membership/key scope.
 *
 * @param args - Auth context and requested organization
 * @returns Organization identifier when permitted, otherwise null
 */
async function resolveSettingsPinConfigOrganization(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	user: AuthUser | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
	requestedOrganizationId: string | null;
}): Promise<string | null> {
	if (
		args.authType === 'session' &&
		args.user?.role === 'admin' &&
		args.requestedOrganizationId
	) {
		const organizationRows = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, args.requestedOrganizationId))
			.limit(1);
		return organizationRows[0]?.id ?? null;
	}

	if (args.authType === 'session' && args.requestedOrganizationId) {
		return args.sessionOrganizationIds.includes(args.requestedOrganizationId)
			? args.requestedOrganizationId
			: null;
	}

	return resolveOrganizationId({
		authType: args.authType,
		session: args.session,
		sessionOrganizationIds: args.sessionOrganizationIds,
		apiKeyOrganizationId: args.apiKeyOrganizationId,
		apiKeyOrganizationIds: args.apiKeyOrganizationIds,
		requestedOrganizationId: args.requestedOrganizationId,
	});
}

/**
 * Loads the organization settings PIN config, returning defaults when absent.
 *
 * @param organizationId - Organization identifier
 * @returns Effective configuration record without creating database rows
 */
async function getSettingsPinConfig(organizationId: string): Promise<{
	mode: DeviceSettingsPinMode;
	globalPinHash: string | null;
	existing: DeviceSettingsPinConfigRecord | null;
}> {
	const rows = await db
		.select()
		.from(organizationDeviceSettingsPinConfig)
		.where(eq(organizationDeviceSettingsPinConfig.organizationId, organizationId))
		.limit(1);
	const existing = rows[0] ?? null;
	return {
		mode: existing?.mode ?? 'GLOBAL',
		globalPinHash: existing?.globalPinHash ?? null,
		existing,
	};
}

/**
 * Builds per-device status fields for API-safe responses.
 *
 * @param args - Mode and configured PIN state
 * @returns API-safe settings PIN status metadata
 */
function buildDeviceSettingsPinStatus(args: {
	mode: DeviceSettingsPinMode;
	globalPinConfigured: boolean;
	overrideConfigured: boolean;
}): {
	pinRequired: boolean;
	pinSource: DeviceSettingsPinSource;
	listStatus: DeviceSettingsPinListStatus;
} {
	const pinSource: DeviceSettingsPinSource =
		args.mode === 'GLOBAL'
			? args.globalPinConfigured
				? 'GLOBAL'
				: 'NONE'
			: args.overrideConfigured
				? 'DEVICE'
				: args.globalPinConfigured
					? 'GLOBAL'
					: 'NONE';

	return {
		pinRequired: pinSource !== 'NONE',
		pinSource,
		listStatus:
			pinSource === 'DEVICE'
				? 'OWN_PIN'
				: pinSource === 'GLOBAL'
					? 'USES_GLOBAL'
					: 'NOT_CONFIGURED',
	};
}

/**
 * Builds an API-safe organization settings PIN config payload.
 *
 * @param organizationId - Organization identifier
 * @returns Config payload without hashes
 */
async function buildSettingsPinConfigPayload(organizationId: string): Promise<{
	mode: DeviceSettingsPinMode;
	globalPinConfigured: boolean;
	devices: Array<{
		id: string;
		code: string;
		name: string | null;
		deviceStatus: DeviceRecord['status'];
		overrideConfigured: boolean;
		pinRequired: boolean;
		pinSource: DeviceSettingsPinSource;
		status: DeviceSettingsPinListStatus;
	}>;
}> {
	const config = await getSettingsPinConfig(organizationId);
	const globalPinConfigured = Boolean(config.globalPinHash);
	const deviceRows = await db
		.select({
			id: device.id,
			code: device.code,
			name: device.name,
			status: device.status,
		})
		.from(device)
		.where(eq(device.organizationId, organizationId))
		.orderBy(device.name, device.code);
	const overrideRows = await db
		.select({ deviceId: deviceSettingsPinOverride.deviceId })
		.from(deviceSettingsPinOverride)
		.where(
			deviceRows.length > 0
				? inArray(
						deviceSettingsPinOverride.deviceId,
						deviceRows.map((row) => row.id),
					)
				: sql`false`,
		);
	const overrideDeviceIds = new Set(overrideRows.map((row) => row.deviceId));

	return {
		mode: config.mode,
		globalPinConfigured,
		devices: deviceRows.map((row) => {
			const overrideConfigured = overrideDeviceIds.has(row.id);
			const status = buildDeviceSettingsPinStatus({
				mode: config.mode,
				globalPinConfigured,
				overrideConfigured,
			});
			return {
				id: row.id,
				code: row.code,
				name: row.name,
				deviceStatus: row.status,
				overrideConfigured,
				pinRequired: status.pinRequired,
				pinSource: status.pinSource,
				status: status.listStatus,
			};
		}),
	};
}

/**
 * Loads a device and checks caller access.
 *
 * @param args - Auth context and target device ID
 * @returns Device row when accessible, otherwise an error response descriptor
 */
async function loadAccessibleDevice(args: {
	id: string;
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	user: AuthUser | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationIds: string[];
}): Promise<
	| { ok: true; record: DeviceRecord }
	| { ok: false; status: 403 | 404; message: string; code?: string }
> {
	const rows = await db.select().from(device).where(eq(device.id, args.id)).limit(1);
	const record = rows[0] ?? null;
	if (!record) {
		return { ok: false, status: 404, message: 'Device not found', code: 'DEVICE_NOT_FOUND' };
	}

	if (args.authType === 'session' && args.user?.role === 'admin') {
		return { ok: true, record };
	}

	if (
		!hasOrganizationAccess(
			args.authType,
			args.session,
			args.sessionOrganizationIds,
			args.apiKeyOrganizationIds,
			record.organizationId,
		)
	) {
		return { ok: false, status: 403, message: 'You do not have access to this device' };
	}

	return { ok: true, record };
}

/**
 * Loads a device settings PIN override hash by device ID.
 *
 * @param deviceId - Device identifier
 * @returns Stored override hash when configured, otherwise null
 */
async function getDeviceSettingsPinOverrideHash(deviceId: string): Promise<string | null> {
	const overrideRows = await db
		.select({ pinHash: deviceSettingsPinOverride.pinHash })
		.from(deviceSettingsPinOverride)
		.where(eq(deviceSettingsPinOverride.deviceId, deviceId))
		.limit(1);
	return overrideRows[0]?.pinHash ?? null;
}

/**
 * Builds the default no-PIN payload for devices without organization context.
 *
 * @param record - Device record
 * @returns Device settings PIN status payload without hashes
 */
function buildSettingsPinStatusPayloadWithoutOrganization(
	record: DeviceRecord,
): DeviceSettingsPinStatusPayload {
	return {
		deviceId: record.id,
		mode: 'GLOBAL',
		pinRequired: false,
		source: 'NONE',
		globalPinConfigured: false,
		deviceOverrideConfigured: false,
	};
}

/**
 * Builds API-safe settings PIN status from preloaded PIN state.
 *
 * @param args - Device, config, and override state
 * @returns Device settings PIN status payload without hashes
 */
function buildDeviceSettingsPinStatusPayloadFromState(args: {
	record: DeviceRecord;
	config: Awaited<ReturnType<typeof getSettingsPinConfig>>;
	overrideHash: string | null;
}): DeviceSettingsPinStatusPayload {
	const deviceOverrideConfigured = Boolean(args.overrideHash);
	const globalPinConfigured = Boolean(args.config.globalPinHash);
	const status = buildDeviceSettingsPinStatus({
		mode: args.config.mode,
		globalPinConfigured,
		overrideConfigured: deviceOverrideConfigured,
	});

	return {
		deviceId: args.record.id,
		mode: args.config.mode,
		pinRequired: status.pinRequired,
		source: status.pinSource,
		globalPinConfigured,
		deviceOverrideConfigured,
	};
}

/**
 * Builds API-safe settings PIN status for a device.
 *
 * @param record - Device record
 * @returns Device settings PIN status payload without hashes
 */
async function buildDeviceSettingsPinStatusPayload(
	record: DeviceRecord,
): Promise<DeviceSettingsPinStatusPayload> {
	const organizationId = record.organizationId;
	if (!organizationId) {
		return buildSettingsPinStatusPayloadWithoutOrganization(record);
	}

	const config = await getSettingsPinConfig(organizationId);
	const overrideHash = await getDeviceSettingsPinOverrideHash(record.id);
	return buildDeviceSettingsPinStatusPayloadFromState({
		record,
		config,
		overrideHash,
	});
}

/**
 * Resolves the effective PIN hash for a device according to current policy.
 *
 * @param record - Device record
 * @returns Effective hash and status metadata
 */
async function resolveEffectiveSettingsPin(record: DeviceRecord): Promise<{
	pinHash: string | null;
	lockoutScope: string | null;
	status: Awaited<ReturnType<typeof buildDeviceSettingsPinStatusPayload>>;
}> {
	const organizationId = record.organizationId;
	if (!organizationId) {
		return {
			pinHash: null,
			lockoutScope: null,
			status: buildSettingsPinStatusPayloadWithoutOrganization(record),
		};
	}

	const config = await getSettingsPinConfig(organizationId);
	const overrideHash = await getDeviceSettingsPinOverrideHash(record.id);
	const usesDeviceOverride = config.mode === 'PER_DEVICE' && Boolean(overrideHash);
	const pinHash = usesDeviceOverride ? overrideHash : config.globalPinHash;
	const lockoutScope = pinHash
		? usesDeviceOverride
			? `device:${record.id}:settings-pin`
			: `organization:${organizationId}:settings-pin:global`
		: null;

	return {
		pinHash,
		lockoutScope,
		status: buildDeviceSettingsPinStatusPayloadFromState({
			record,
			config,
			overrideHash,
		}),
	};
}

/**
 * Device routes plugin for Elysia.
 */
export const deviceRoutes = new Elysia({ prefix: '/devices' })
	.use(combinedAuthPlugin)
	/**
	 * Returns a status summary for devices in the resolved organization.
	 *
	 * @route GET /devices/status-summary
	 * @returns Device summary rows with related location names
	 */
	.get(
		'/status-summary',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
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

			const results = await db
				.select({
					id: device.id,
					code: device.code,
					name: device.name,
					status: device.status,
					batteryLevel: device.batteryLevel,
					lastHeartbeat: device.lastHeartbeat,
					locationId: device.locationId,
					locationName: location.name,
				})
				.from(device)
				.leftJoin(
					location,
					and(
						eq(device.locationId, location.id),
						eq(location.organizationId, organizationId),
					),
				)
				.where(eq(device.organizationId, organizationId))
				.orderBy(device.name, device.code);

			return {
				data: results,
				total: results.length,
			};
		},
		{
			query: t.Object({
				organizationId: t.Optional(t.String()),
			}),
		},
	)
	/**
	 * Returns settings PIN configuration and per-device status metadata.
	 *
	 * @route GET /devices/settings-pin-config
	 * @returns Organization settings PIN config without hashes
	 */
	.get(
		'/settings-pin-config',
		async ({
			query,
			authType,
			user,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = await resolveSettingsPinConfigOrganization({
				authType,
				session,
				user,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' || query.organizationId ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			return {
				data: await buildSettingsPinConfigPayload(organizationId),
			};
		},
		{
			query: deviceSettingsPinConfigQuerySchema,
		},
	)
	/**
	 * Updates organization settings PIN policy.
	 *
	 * @route PUT /devices/settings-pin-config
	 * @returns Updated organization settings PIN config without hashes
	 */
	.put(
		'/settings-pin-config',
		async ({
			body,
			authType,
			user,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = await resolveSettingsPinConfigOrganization({
				authType,
				session,
				user,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' || body.organizationId ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const canManage = await canManageSettingsPin({
				authType,
				session,
				user,
				organizationId,
			});
			if (!canManage) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can manage device settings PIN', 403);
			}

			const config = await getSettingsPinConfig(organizationId);
			const globalPinHash =
				body.globalPin === undefined
					? config.globalPinHash
					: body.globalPin === null
						? null
						: await hashSettingsPin(body.globalPin);
			const now = new Date();

			if (config.existing) {
				await db
					.update(organizationDeviceSettingsPinConfig)
					.set({
						mode: body.mode,
						globalPinHash,
						updatedAt: now,
					})
					.where(eq(organizationDeviceSettingsPinConfig.organizationId, organizationId));
			} else {
				await db.insert(organizationDeviceSettingsPinConfig).values({
					organizationId,
					mode: body.mode,
					globalPinHash,
					createdAt: now,
					updatedAt: now,
				});
			}

			clearSettingsPinVerifyFailuresForScope(
				`organization:${organizationId}:settings-pin:global`,
			);

			return {
				data: await buildSettingsPinConfigPayload(organizationId),
			};
		},
		{
			body: updateDeviceSettingsPinConfigSchema,
		},
	)
	/**
	 * Updates or clears a device settings PIN override.
	 *
	 * @route PUT /devices/:id/settings-pin
	 * @returns Device settings PIN status without hashes
	 */
	.put(
		'/:id/settings-pin',
		async ({
			params,
			body,
			authType,
			user,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const loaded = await loadAccessibleDevice({
				id: params.id,
				authType,
				session,
				user,
				sessionOrganizationIds,
				apiKeyOrganizationIds,
			});

			if (!loaded.ok) {
				set.status = loaded.status;
				return buildErrorResponse(
					loaded.message,
					loaded.status,
					loaded.code ? { code: loaded.code } : undefined,
				);
			}

			const organizationId = loaded.record.organizationId;
			if (!organizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			const canManage = await canManageSettingsPin({
				authType,
				session,
				user,
				organizationId,
			});
			if (!canManage) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can manage device settings PIN', 403);
			}

			if (body.pin === null) {
				await db
					.delete(deviceSettingsPinOverride)
					.where(eq(deviceSettingsPinOverride.deviceId, loaded.record.id));
			} else {
				const pinHash = await hashSettingsPin(body.pin);
				const now = new Date();
				const existing = await db
					.select({ deviceId: deviceSettingsPinOverride.deviceId })
					.from(deviceSettingsPinOverride)
					.where(eq(deviceSettingsPinOverride.deviceId, loaded.record.id))
					.limit(1);

				if (existing[0]) {
					await db
						.update(deviceSettingsPinOverride)
						.set({
							pinHash,
							organizationId,
							updatedAt: now,
						})
						.where(eq(deviceSettingsPinOverride.deviceId, loaded.record.id));
				} else {
					await db.insert(deviceSettingsPinOverride).values({
						deviceId: loaded.record.id,
						organizationId,
						pinHash,
						createdAt: now,
						updatedAt: now,
					});
				}
			}

			clearSettingsPinVerifyFailuresForScope(`device:${loaded.record.id}:settings-pin`);

			return {
				data: await buildDeviceSettingsPinStatusPayload(loaded.record),
			};
		},
		{
			params: idParamSchema,
			body: updateDeviceSettingsPinOverrideSchema,
		},
	)
	/**
	 * Returns the effective settings PIN status for a device.
	 *
	 * @route GET /devices/:id/settings-pin-status
	 * @returns Device settings PIN status without hashes
	 */
	.get(
		'/:id/settings-pin-status',
		async ({
			params,
			authType,
			user,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const loaded = await loadAccessibleDevice({
				id: params.id,
				authType,
				session,
				user,
				sessionOrganizationIds,
				apiKeyOrganizationIds,
			});

			if (!loaded.ok) {
				set.status = loaded.status;
				return buildErrorResponse(
					loaded.message,
					loaded.status,
					loaded.code ? { code: loaded.code } : undefined,
				);
			}

			return {
				data: await buildDeviceSettingsPinStatusPayload(loaded.record),
			};
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Verifies a device settings PIN online.
	 *
	 * @route POST /devices/:id/settings-pin-verify
	 * @returns Boolean validation result only
	 */
	.post(
		'/:id/settings-pin-verify',
		async ({
			params,
			body,
			authType,
			apiKeyId,
			user,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const loaded = await loadAccessibleDevice({
				id: params.id,
				authType,
				session,
				user,
				sessionOrganizationIds,
				apiKeyOrganizationIds,
			});

			if (!loaded.ok) {
				set.status = loaded.status;
				return buildErrorResponse(
					loaded.message,
					loaded.status,
					loaded.code ? { code: loaded.code } : undefined,
				);
			}

			const effectivePin = await resolveEffectiveSettingsPin(loaded.record);
			if (!effectivePin.pinHash) {
				return {
					data: {
						valid: true,
					},
				};
			}

			const pinScope = effectivePin.lockoutScope;
			if (!pinScope) {
				set.status = 500;
				return buildErrorResponse('Settings PIN lockout scope unavailable', 500);
			}

			const failureKey = buildSettingsPinVerifyFailureKey({
				pinScope,
				authType,
				session,
				apiKeyId,
			});
			const nowMs = Date.now();
			const lockout = getSettingsPinVerifyLockout(failureKey, nowMs);
			if (lockout.locked) {
				set.status = 429;
				set.headers['retry-after'] = String(lockout.retryAfterSeconds);
				return buildErrorResponse('Too many invalid PIN attempts', 429, {
					code: 'RATE_LIMITED',
					details: {
						retryAfterSeconds: lockout.retryAfterSeconds,
					},
				});
			}

			const valid = await verifySettingsPin(body.pin, effectivePin.pinHash);
			if (valid) {
				settingsPinVerifyFailures.delete(failureKey);
				return {
					data: {
						valid,
					},
				};
			}

			recordSettingsPinVerifyFailure(failureKey, nowMs);
			return {
				data: {
					valid,
				},
			};
		},
		{
			params: idParamSchema,
			body: verifyDeviceSettingsPinSchema,
		},
	)
	/**
	 * List all devices with pagination and optional filters.
	 *
	 * @route GET /devices
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.locationId - Filter by location ID (optional)
	 * @param query.status - Filter by device status (optional)
	 * @returns Array of device records
	 */
	.get(
		'/',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const {
				limit,
				offset,
				locationId,
				status,
				search,
				organizationId: organizationIdQuery,
			} = query;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdQuery ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			let baseQuery = db.select().from(device);

			// Build conditions array
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(device.organizationId, organizationId),
			];
			if (locationId) {
				conditions.push(eq(device.locationId, locationId));
			}
			if (status) {
				conditions.push(eq(device.status, status));
			}
			if (search) {
				const searchClause = or(
					ilike(device.code, `%${search}%`),
					ilike(device.name, `%${search}%`),
					ilike(device.deviceType, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery.limit(limit).offset(offset).orderBy(device.name);

			// Get total count with same filters
			let countQuery = db.select().from(device);
			const countWhere = and(...conditions)!;
			countQuery = countQuery.where(countWhere) as typeof countQuery;
			const countResult = await countQuery;
			const total = countResult.length;

			return {
				data: results,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + results.length < total,
				},
			};
		},
		{
			query: deviceQuerySchema,
		},
	)

	/**
	 * Get a single device by ID.
	 *
	 * @route GET /devices/:id
	 * @param id - Device UUID
	 * @returns Device record or 404 error
	 */
	.get(
		'/:id',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const results = await db.select().from(device).where(eq(device.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Device not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this device', 403);
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Register or upsert a device using a stable device code.
	 * When the code already exists for the same organization, metadata is refreshed and
	 * the device is marked online. Otherwise, a new device is created.
	 *
	 * @route POST /devices/register
	 * @param body.code - Stable device code generated by the mobile client
	 * @param body.name - Friendly device name (optional)
	 * @param body.deviceType - Device type label (optional)
	 * @param body.platform - Platform identifier (e.g., ios, android) (optional)
	 * @returns Upserted device record
	 */
	.post(
		'/register',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { code, name, deviceType, platform, organizationId: organizationIdInput } = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdInput ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const normalizedDeviceType =
				deviceType ?? (platform ? `MOBILE_${platform.toUpperCase()}` : null);

			const existing = await db.select().from(device).where(eq(device.code, code)).limit(1);
			const now = new Date();

			if (existing[0]) {
				if (existing[0].organizationId && existing[0].organizationId !== organizationId) {
					set.status = 403;
					return buildErrorResponse(
						'Device code is registered to another organization',
						403,
					);
				}

				const updates: Partial<typeof device.$inferInsert> = {
					status: 'ONLINE' as const,
					lastHeartbeat: now,
				};

				if (name !== undefined && name !== existing[0].name) {
					updates.name = name ?? null;
				}

				if (normalizedDeviceType && normalizedDeviceType !== existing[0].deviceType) {
					updates.deviceType = normalizedDeviceType;
				}

				if (!existing[0].organizationId) {
					updates.organizationId = organizationId;
				}

				if (Object.keys(updates).length > 0) {
					await db
						.update(device)
						.set({
							...updates,
							updatedAt: now,
						})
						.where(eq(device.id, existing[0].id));
				}

				const refreshed = await db
					.select()
					.from(device)
					.where(eq(device.id, existing[0].id))
					.limit(1);

				return { data: refreshed[0], isNew: false };
			}

			const id = crypto.randomUUID();

			const newDevice: typeof device.$inferInsert = {
				id,
				code,
				name: name ?? null,
				deviceType: normalizedDeviceType ?? 'MOBILE',
				status: 'ONLINE',
				lastHeartbeat: now,
				locationId: null,
				organizationId,
				createdAt: now,
				updatedAt: now,
			};

			await db.insert(device).values(newDevice);

			set.status = 201;
			return {
				data: newDevice,
				isNew: true,
			};
		},
		{
			body: registerDeviceSchema,
		},
	)

	/**
	 * Create a new device.
	 *
	 * @route POST /devices
	 * @param body.code - Unique device code
	 * @param body.name - Device name (optional)
	 * @param body.deviceType - Type of device (optional)
	 * @param body.status - Device status (default: OFFLINE)
	 * @param body.locationId - Location ID (optional)
	 * @returns Created device record
	 */
	.post(
		'/',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const {
				code,
				name,
				deviceType,
				status: deviceStatus,
				locationId,
				organizationId: organizationIdInput,
			} = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdInput ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			// Verify organization exists
			const organizationExists = await db
				.select()
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);

			if (!organizationExists[0]) {
				set.status = 400;
				return buildErrorResponse('Organization not found', 400);
			}

			// Verify location exists if provided
			if (locationId) {
				const locationExists = await db
					.select()
					.from(location)
					.where(eq(location.id, locationId))
					.limit(1);

				if (!locationExists[0]) {
					set.status = 400;
					return buildErrorResponse('Location not found', 400);
				}

				if (
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== organizationId
				) {
					set.status = 403;
					return buildErrorResponse('Location does not belong to this organization', 403);
				}
			}

			// Check if code is unique
			const codeExists = await db.select().from(device).where(eq(device.code, code)).limit(1);

			if (codeExists[0]) {
				set.status = 409;
				return buildErrorResponse('Device code already exists', 409);
			}

			const id = crypto.randomUUID();

			const newDevice = {
				id,
				code,
				name: name ?? null,
				deviceType: deviceType ?? null,
				status: deviceStatus,
				locationId: locationId ?? null,
				organizationId,
			};

			await db.insert(device).values(newDevice);

			set.status = 201;
			return {
				data: {
					...newDevice,
					lastHeartbeat: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createDeviceSchema,
		},
	)

	/**
	 * Update an existing device.
	 *
	 * @route PUT /devices/:id
	 * @param id - Device UUID
	 * @param body - Fields to update
	 * @returns Updated device record
	 */
	.put(
		'/:id',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return buildErrorResponse('Device not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing[0].organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this device', 403);
			}

			const targetOrgId = existing[0].organizationId ?? null;
			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: targetOrgId,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			// Check if code is unique (if being updated)
			if (body.code && body.code !== existing[0].code) {
				const codeExists = await db
					.select()
					.from(device)
					.where(eq(device.code, body.code))
					.limit(1);

				if (codeExists[0]) {
					set.status = 409;
					return buildErrorResponse('Device code already exists', 409);
				}
			}

			// Verify location exists if being updated
			if (body.locationId) {
				const locationExists = await db
					.select()
					.from(location)
					.where(eq(location.id, body.locationId))
					.limit(1);

				if (!locationExists[0]) {
					set.status = 400;
					return buildErrorResponse('Location not found', 400);
				}

				if (
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return buildErrorResponse('Location does not belong to this organization', 403);
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(device).set(body).where(eq(device.id, id));

			// Fetch updated record
			const updated = await db.select().from(device).where(eq(device.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateDeviceSchema,
		},
	)

	/**
	 * Delete a device.
	 *
	 * @route DELETE /devices/:id
	 * @param id - Device UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return buildErrorResponse('Device not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing[0].organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this device', 403);
			}

			await db.delete(device).where(eq(device.id, id));

			return { message: 'Device deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Update device heartbeat timestamp and set status to ONLINE.
	 * Called periodically by devices to indicate they are active.
	 *
	 * @route POST /devices/:id/heartbeat
	 * @param id - Device UUID
	 * @returns Updated device record with new heartbeat timestamp
	 */
	.post(
		'/:id/heartbeat',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return buildErrorResponse('Device not found', 404, {
					code: 'DEVICE_NOT_FOUND',
				});
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing[0].organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this device', 403);
			}

			if (existing[0].status === 'MAINTENANCE') {
				set.status = 403;
				return buildErrorResponse('Device disabled', 403, { code: 'DEVICE_DISABLED' });
			}

			const now = new Date();
			const updatePayload: Partial<typeof device.$inferInsert> = {
				lastHeartbeat: now,
				status: 'ONLINE',
			};
			if (body.batteryLevel !== undefined) {
				updatePayload.batteryLevel = body.batteryLevel;
			}

			await db.update(device).set(updatePayload).where(eq(device.id, id));

			// Fetch updated record
			const updated = await db.select().from(device).where(eq(device.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			body: deviceHeartbeatSchema,
			params: idParamSchema,
		},
	);
