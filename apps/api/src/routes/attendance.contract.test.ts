import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { addDaysToDateKey } from '../utils/date-key.js';
import { getUtcDateForZonedMidnight, toDateKeyInTimeZone } from '../utils/time-zone.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getTestApiKey,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type WorkOffsiteDayKind = 'LABORABLE' | 'NO_LABORABLE';

type OffsiteCreateResult =
	| {
			kind: 'created';
			recordId: string;
			dateKey: string;
	  }
	| {
			kind: 'payroll_locked';
			attemptedDateKeys: string[];
	  };

const PAYROLL_LOCK_ERROR_MESSAGE =
	'Cannot register offsite attendance for a processed payroll period';
const OFFSITE_CHECK_EVENTS_CONFLICT_MESSAGE =
	'Cannot register offsite attendance when check events already exist for that date.';
const OFFSITE_DUPLICATE_CONFLICT_MESSAGE =
	'An offsite attendance record already exists for that date';
const DEFAULT_TEST_TIME_ZONE = 'America/Mexico_City';

describe('attendance routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let apiKey: string;
	let activeEmployeeId: string;
	let activeEmployeeIds: string[];

	/**
	 * Tries to create a WORK_OFFSITE record in a bounded retroactive window.
	 * Falls back to a payroll-locked result when every candidate date is blocked
	 * by processed payroll periods in shared contract-test state.
	 *
	 * @param args - Creation parameters for WORK_OFFSITE attempts
	 * @returns Created record metadata or payroll-locked fallback
	 * @throws Error when no date is creatable for reasons other than processed payroll locks
	 */
	async function createOffsiteWithinWindow(args: {
		employeeId: string;
		baseDateKey: string;
		startOffsetDays?: number;
		dayKind: WorkOffsiteDayKind;
		reason: string;
	}): Promise<OffsiteCreateResult> {
		const conflicts: Array<{ dateKey: string; message: string }> = [];
		const attemptedDateKeys: string[] = [];
		for (let offset = args.startOffsetDays ?? 0; offset <= 30; offset += 1) {
			const candidateDateKey = addDaysToDateKey(args.baseDateKey, -offset);
			attemptedDateKeys.push(candidateDateKey);
			const response = await client.attendance.post({
				employeeId: args.employeeId,
				timestamp: new Date(),
				type: 'WORK_OFFSITE',
				offsiteDateKey: candidateDateKey,
				offsiteDayKind: args.dayKind,
				offsiteReason: `${args.reason} (${candidateDateKey})`,
				$headers: { cookie: adminSession.cookieHeader },
			});
			if (response.status === 201) {
				const payload = requireResponseData(response);
				const recordId = payload.data?.id;
				if (!recordId) {
					throw new Error('Expected WORK_OFFSITE record id.');
				}
				return {
					kind: 'created',
					recordId,
					dateKey: candidateDateKey,
				};
			}

			if (response.status === 409) {
				const errorPayload = requireErrorResponse(response, 'work offsite create conflict');
				const message = errorPayload.error.message;
				conflicts.push({
					dateKey: candidateDateKey,
					message,
				});
				if (
					message === OFFSITE_CHECK_EVENTS_CONFLICT_MESSAGE ||
					message === OFFSITE_DUPLICATE_CONFLICT_MESSAGE
				) {
					continue;
				}
				continue;
			}
		}

		if (
			conflicts.length > 0 &&
			conflicts.every((conflict) => conflict.message === PAYROLL_LOCK_ERROR_MESSAGE)
		) {
			return {
				kind: 'payroll_locked',
				attemptedDateKeys,
			};
		}

		const reasons = conflicts
			.map((conflict) => `${conflict.dateKey}: ${conflict.message}`)
			.join(' | ');
		throw new Error(
			`Unable to create WORK_OFFSITE within editable window. Conflicts: ${reasons || 'none'}`,
		);
	}

	/**
	 * Builds UTC day bounds for a local date key in the default test timezone.
	 *
	 * @param dateKey - Local date key in YYYY-MM-DD format
	 * @returns Inclusive start and exclusive end UTC bounds
	 */
	function buildUtcRangeForDateKey(dateKey: string): { fromDate: Date; toDate: Date } {
		return {
			fromDate: getUtcDateForZonedMidnight(dateKey, DEFAULT_TEST_TIME_ZONE),
			toDate: getUtcDateForZonedMidnight(
				addDaysToDateKey(dateKey, 1),
				DEFAULT_TEST_TIME_ZONE,
			),
		};
	}

	/**
	 * Creates a WORK_OFFSITE record for the first active employee that is
	 * actually eligible on the provided date.
	 *
	 * @param dateKey - Local organization date key returned by /attendance/offsite/today
	 * @returns Created record id or a payroll-locked fallback
	 * @throws Error when every active employee conflicts for reasons other than payroll lock
	 */
	async function createTodayOffsiteForAnyActiveEmployee(dateKey: string): Promise<
		| {
				kind: 'created';
				recordId: string;
		  }
		| {
				kind: 'payroll_locked';
		  }
	> {
		const conflictReasons: Array<{ employeeId: string; message: string }> = [];

		for (const employeeId of activeEmployeeIds) {
			const createResponse = await client.attendance.post({
				employeeId,
				timestamp: new Date(),
				type: 'WORK_OFFSITE',
				offsiteDateKey: dateKey,
				offsiteDayKind: 'LABORABLE',
				offsiteReason: 'Trabajo fuera por visita operativa.',
				$headers: { cookie: adminSession.cookieHeader },
			});

			if (createResponse.status === 201) {
				const createPayload = requireResponseData(createResponse);
				const recordId = createPayload.data?.id;
				if (!recordId) {
					throw new Error('Expected WORK_OFFSITE record id.');
				}

				return {
					kind: 'created',
					recordId,
				};
			}

			if (createResponse.status !== 409) {
				throw new Error(
					`Unexpected WORK_OFFSITE status ${createResponse.status} for employee ${employeeId}.`,
				);
			}

			const errorPayload = requireErrorResponse(createResponse, 'offsite create conflict');
			const message = errorPayload.error.message;
			if (message === PAYROLL_LOCK_ERROR_MESSAGE) {
				return { kind: 'payroll_locked' };
			}

			if (
				message === OFFSITE_CHECK_EVENTS_CONFLICT_MESSAGE ||
				message === OFFSITE_DUPLICATE_CONFLICT_MESSAGE
			) {
				conflictReasons.push({ employeeId, message });
				continue;
			}

			throw new Error(
				`Unexpected WORK_OFFSITE conflict for employee ${employeeId}: ${message}`,
			);
		}

		const formattedConflicts = conflictReasons
			.map((conflict) => `${conflict.employeeId}: ${conflict.message}`)
			.join(' | ');
		throw new Error(
			`Unable to create WORK_OFFSITE for any active employee on ${dateKey}. Conflicts: ${formattedConflicts || 'none'}`,
		);
	}

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();
		seed = await getSeedData();
		apiKey = await getTestApiKey();
		const activeEmployeesResponse = await client.employees.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 25, offset: 0, status: 'ACTIVE' },
		});
		const activeEmployeesPayload = requireResponseData(activeEmployeesResponse);
		const activeEmployees = activeEmployeesPayload.data ?? [];
		activeEmployeeIds = activeEmployees
			.map((employee: { id?: string }) => employee.id)
			.filter((employeeId): employeeId is string => typeof employeeId === 'string');
		const activeEmployee = activeEmployees[0];
		if (!activeEmployee?.id) {
			throw new Error('Expected at least one active employee for offsite tests.');
		}
		activeEmployeeId = activeEmployee.id;
	});

	it('lists attendance records with pagination', async () => {
		const response = await client.attendance.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
		expect(payload.pagination).toBeDefined();
	});

	it('filters attendance records by employee id', async () => {
		const response = await client.attendance.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 50, offset: 0, employeeId: seed.employeeId },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
		for (const row of payload.data as Array<{ employeeId?: string }>) {
			expect(row.employeeId).toBe(seed.employeeId);
		}
	});

	it('returns present attendance entries for a date range', async () => {
		const response = await client.attendance.present.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
				toDate: new Date(),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('returns attendance timeline entries with descending pagination', async () => {
		const olderTimestamp = new Date();
		olderTimestamp.setMinutes(olderTimestamp.getMinutes() - 10);
		const newerTimestamp = new Date();
		newerTimestamp.setMinutes(newerTimestamp.getMinutes() - 5);

		const olderResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: olderTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(olderResponse.status).toBe(201);

		const newerResponse = await client.attendance.post({
			employeeId: activeEmployeeId,
			deviceId: seed.deviceId,
			timestamp: newerTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(newerResponse.status).toBe(201);
		const newerPayload = requireResponseData(newerResponse);
		const newerRecordId = newerPayload.data?.id;
		if (!newerRecordId) {
			throw new Error('Expected attendance record ID for timeline pagination test.');
		}

		const response = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 1,
				offset: 0,
				kind: 'in',
				fromDate: new Date(olderTimestamp.getTime() - 60_000),
				toDate: new Date(newerTimestamp.getTime() + 60_000),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
		expect(payload.data.length).toBe(1);
		expect(payload.pagination.limit).toBe(1);
		expect(payload.pagination.offset).toBe(0);
		expect(payload.pagination.total).toBeGreaterThanOrEqual(2);
		expect(payload.pagination.hasMore).toBe(true);
		expect(payload.data[0]?.type).toBe('CHECK_IN');
		expect(payload.data[0]?.employeeId).toBe(activeEmployeeId);
		expect(payload.data[0]?.id).toBe(newerRecordId);
		expect(typeof payload.data[0]?.employeeCode).toBe('string');
		expect(typeof payload.data[0]?.isLate).toBe('boolean');
	});

	it('excludes checkout records from the default dashboard timeline window', async () => {
		const checkInTimestamp = new Date();
		checkInTimestamp.setMinutes(checkInTimestamp.getMinutes() - 10);
		const checkOutTimestamp = new Date();
		checkOutTimestamp.setMinutes(checkOutTimestamp.getMinutes() - 5);

		const checkInResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: checkInTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(checkInResponse.status).toBe(201);
		const checkInPayload = requireResponseData(checkInResponse);
		const checkInRecordId = checkInPayload.data?.id;
		if (!checkInRecordId) {
			throw new Error('Expected attendance record ID for default dashboard timeline test.');
		}

		const checkOutResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: checkOutTimestamp,
			type: 'CHECK_OUT',
			checkOutReason: 'REGULAR',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(checkOutResponse.status).toBe(201);
		const checkOutPayload = requireResponseData(checkOutResponse);
		const checkOutRecordId = checkOutPayload.data?.id;
		if (!checkOutRecordId) {
			throw new Error('Expected checkout record ID for default dashboard timeline test.');
		}

		const response = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 10,
				offset: 0,
				fromDate: new Date(checkInTimestamp.getTime() - 60_000),
				toDate: new Date(checkOutTimestamp.getTime() + 60_000),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data.length).toBeGreaterThan(0);
		expect(payload.data.some((row) => row.id === checkInRecordId)).toBe(true);
		expect(payload.data.some((row) => row.id === checkOutRecordId)).toBe(false);
		for (const row of payload.data) {
			expect(row.type === 'CHECK_IN' || row.type === 'WORK_OFFSITE').toBe(true);
		}
		expect(payload.summary.lateTotal).toBeGreaterThanOrEqual(0);
	});

	it('filters attendance timeline entries by offsite kind', async () => {
		const offsiteResponse = await client.attendance.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 1, offset: 0, type: 'WORK_OFFSITE' },
		});
		expect(offsiteResponse.status).toBe(200);
		const offsitePayload = requireResponseData(offsiteResponse);
		const offsiteRecord = offsitePayload.data?.[0];
		if (!offsiteRecord?.timestamp) {
			throw new Error('Expected seeded WORK_OFFSITE record for timeline filter test.');
		}
		const offsiteTimestamp = new Date(offsiteRecord.timestamp);

		const response = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 50,
				offset: 0,
				kind: 'offsite',
				fromDate: new Date(offsiteTimestamp.getTime() - 60_000),
				toDate: new Date(offsiteTimestamp.getTime() + 60_000),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data.length).toBeGreaterThan(0);
		for (const row of payload.data) {
			expect(row.type).toBe('WORK_OFFSITE');
		}
	});

	it('filters attendance timeline entries by late kind after schedule enrichment', async () => {
		const discoveryResponse = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 200,
				offset: 0,
				fromDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
				toDate: new Date(),
			},
		});

		expect(discoveryResponse.status).toBe(200);
		const discoveryPayload = requireResponseData(discoveryResponse);
		const lateSample = discoveryPayload.data.find((row) => row.isLate);
		if (!lateSample?.timestamp) {
			throw new Error('Expected at least one late attendance record for timeline late filter test.');
		}
		const lateTimestamp = new Date(lateSample.timestamp);

		const response = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 1,
				offset: 0,
				kind: 'late',
				fromDate: new Date(lateTimestamp.getTime() - 60_000),
				toDate: new Date(lateTimestamp.getTime() + 60_000),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data.length).toBeGreaterThan(0);
		expect(payload.pagination.total).toBeGreaterThanOrEqual(1);
		expect(typeof payload.pagination.hasMore).toBe('boolean');
		for (const row of payload.data) {
			expect(row.isLate).toBe(true);
			expect(row.type).toBe('CHECK_IN');
		}
	});

	it('applies pagination after filtering late timeline entries', async () => {
		const discoveryResponse = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 200,
				offset: 0,
				fromDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
				toDate: new Date(),
			},
		});

		expect(discoveryResponse.status).toBe(200);
		const discoveryPayload = requireResponseData(discoveryResponse);
		const lateSample = discoveryPayload.data.find((row) => row.isLate);
		if (!lateSample?.timestamp) {
			throw new Error('Expected at least one late attendance record for late pagination test.');
		}

		const baseLateTimestamp = new Date(lateSample.timestamp);
		const insertedLateTimestamp = new Date(baseLateTimestamp.getTime() + 60_000);
		const createResponse = await client.attendance.post({
			employeeId: lateSample.employeeId,
			deviceId: seed.deviceId,
			timestamp: insertedLateTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createdPayload = requireResponseData(createResponse);
		const createdLateRecordId = createdPayload.data?.id;
		if (!createdLateRecordId) {
			throw new Error('Expected created late attendance record id for late pagination test.');
		}

		const firstPageResponse = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 1,
				offset: 0,
				kind: 'late',
				fromDate: new Date(baseLateTimestamp.getTime() - 60_000),
				toDate: new Date(insertedLateTimestamp.getTime() + 60_000),
			},
		});
		expect(firstPageResponse.status).toBe(200);
		const firstPagePayload = requireResponseData(firstPageResponse);
		expect(firstPagePayload.data.length).toBe(1);
		expect(firstPagePayload.data[0]?.id).toBe(createdLateRecordId);
		expect(firstPagePayload.data[0]?.isLate).toBe(true);

		const secondPageResponse = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 1,
				offset: 1,
				kind: 'late',
				fromDate: new Date(baseLateTimestamp.getTime() - 60_000),
				toDate: new Date(insertedLateTimestamp.getTime() + 60_000),
			},
		});

		expect(secondPageResponse.status).toBe(200);
		const secondPagePayload = requireResponseData(secondPageResponse);
		expect(secondPagePayload.pagination.total).toBeGreaterThanOrEqual(2);
		expect(secondPagePayload.pagination.total).toBe(firstPagePayload.pagination.total);
		expect(secondPagePayload.pagination.hasMore).toBe(
			secondPagePayload.pagination.total > 2,
		);
		expect(secondPagePayload.summary.lateTotal).toBe(
			secondPagePayload.pagination.total,
		);
		expect(secondPagePayload.data.length).toBe(1);
		expect(secondPagePayload.data[0]?.id).not.toBe(createdLateRecordId);
		expect(secondPagePayload.data[0]?.id).not.toBe(firstPagePayload.data[0]?.id);
		expect(secondPagePayload.data[0]?.isLate).toBe(true);
		expect(secondPagePayload.data[0]?.type).toBe('CHECK_IN');
	});

	it('filters attendance timeline entries by explicit date range', async () => {
		const targetDateKey = addDaysToDateKey(
			new Date().toISOString().slice(0, 10),
			-6,
		);
		const targetTimestamp = getUtcDateForZonedMidnight(
			targetDateKey,
			DEFAULT_TEST_TIME_ZONE,
		);
		targetTimestamp.setUTCHours(targetTimestamp.getUTCHours() + 15);

		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: targetTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createdPayload = requireResponseData(createResponse);
		const createdRecord = createdPayload.data;
		if (!createdRecord?.id) {
			throw new Error('Expected attendance record ID for timeline date range test.');
		}

		const response = await client.attendance.timeline.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 50,
				offset: 0,
				...buildUtcRangeForDateKey(targetDateKey),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data.some((row) => row.id === createdRecord.id)).toBe(true);
	});

	it('returns attendance hourly buckets for the requested date', async () => {
		const dateKey = toDateKeyInTimeZone(new Date(), DEFAULT_TEST_TIME_ZONE);
		const eightAmTimestamp = getUtcDateForZonedMidnight(dateKey, DEFAULT_TEST_TIME_ZONE);
		eightAmTimestamp.setUTCHours(eightAmTimestamp.getUTCHours() + 8);
		const tenAmTimestamp = getUtcDateForZonedMidnight(dateKey, DEFAULT_TEST_TIME_ZONE);
		tenAmTimestamp.setUTCHours(tenAmTimestamp.getUTCHours() + 10);

		const firstResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: eightAmTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstResponse.status).toBe(201);

		const secondResponse = await client.attendance.post({
			employeeId: activeEmployeeId,
			deviceId: seed.deviceId,
			timestamp: tenAmTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondResponse.status).toBe(201);

		const response = await client.attendance.hourly.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { date: dateKey },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.date).toBe(dateKey);
		expect(payload.data).toHaveLength(24);
		const eightAmBucket = payload.data.find((row) => row.hour === 8);
		const tenAmBucket = payload.data.find((row) => row.hour === 10);
		expect(eightAmBucket?.count).toBeGreaterThanOrEqual(1);
		expect(tenAmBucket?.count).toBeGreaterThanOrEqual(1);
	});

	it('creates and fetches an attendance record', async () => {
		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_IN',
			metadata: { source: 'contract-test' },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdRecord = createPayload.data;
		if (!createdRecord) {
			throw new Error('Expected created attendance record.');
		}
		expect(createdRecord.id).toBeDefined();

		const recordId = createdRecord.id;
		if (!recordId) {
			throw new Error('Expected attendance record ID.');
		}
		const attendanceById = requireRoute(client.attendance[recordId], 'Attendance record route');
		const getResponse = await attendanceById.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(200);
		const getPayload = requireResponseData(getResponse);
		const record = getPayload.data;
		if (!record) {
			throw new Error('Expected attendance record.');
		}
		expect(record.id).toBe(recordId);
	});

	it('creates a check-out attendance record with a checkOutReason', async () => {
		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_OUT',
			checkOutReason: 'LUNCH_BREAK',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		expect(createPayload.data).toMatchObject({
			type: 'CHECK_OUT',
			checkOutReason: 'LUNCH_BREAK',
		});
	});

	it('rejects checkOutReason for check-in attendance records', async () => {
		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_IN',
			checkOutReason: 'PERSONAL',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(createResponse, 'check-in checkOutReason');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('creates a WORK_OFFSITE record and returns it in offsite today endpoint', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		expect(offsiteTodayResponse.status).toBe(200);
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		expect(todayDateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

		const createResult = await createTodayOffsiteForAnyActiveEmployee(todayDateKey);
		if (createResult.kind === 'payroll_locked') {
			return;
		}

		const getResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		expect(getResponse.status).toBe(200);
		const payload = requireResponseData(getResponse);
		const records = payload.data ?? [];
		expect(records.some((row: { id: string }) => row.id === createResult.recordId)).toBe(true);
	});

	it('updates and deletes a WORK_OFFSITE record', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const createResult = await createOffsiteWithinWindow({
			employeeId: activeEmployeeId,
			baseDateKey: todayDateKey,
			startOffsetDays: 1,
			dayKind: 'NO_LABORABLE',
			reason: 'Cobertura en sitio externo de cliente.',
		});
		if (createResult.kind === 'payroll_locked') {
			expect(createResult.attemptedDateKeys.length).toBeGreaterThan(0);
			return;
		}
		const { recordId, dateKey: editableDateKey } = createResult;

		const attendanceByIdRoute = requireRoute(
			client.attendance[recordId],
			'Attendance record route',
		);
		const updateRoute = requireRoute(attendanceByIdRoute.offsite, 'Attendance offsite route');
		const updateResponse = await updateRoute.put({
			offsiteDateKey: editableDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Cobertura en sitio externo ajustada.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);
		const updatedPayload = requireResponseData(updateResponse);
		if (!updatedPayload.data) {
			throw new Error('Expected updated WORK_OFFSITE payload.');
		}
		expect(updatedPayload.data.offsiteDayKind).toBe('LABORABLE');

		const deleteResponse = await updateRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(deleteResponse.status).toBe(200);
		const deletedPayload = requireResponseData(deleteResponse);
		expect(deletedPayload.data.deleted).toBe(true);
	});

	it('rejects WORK_OFFSITE creation for future dates', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const tomorrowDate = new Date(`${todayDateKey}T00:00:00.000Z`);
		tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
		const tomorrowDateKey = tomorrowDate.toISOString().slice(0, 10);

		const response = await client.attendance.post({
			employeeId: activeEmployeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: tomorrowDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento de registro futuro fuera de ventana.',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'future offsite date');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('rejects WORK_OFFSITE updates with invalid calendar date keys', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const createResult = await createOffsiteWithinWindow({
			employeeId: activeEmployeeId,
			baseDateKey: todayDateKey,
			startOffsetDays: 2,
			dayKind: 'LABORABLE',
			reason: 'Registro para validar update con fecha inválida.',
		});
		if (createResult.kind === 'payroll_locked') {
			expect(createResult.attemptedDateKeys.length).toBeGreaterThan(0);
			return;
		}
		const { recordId } = createResult;

		const attendanceByIdRoute = requireRoute(
			client.attendance[recordId],
			'Attendance record route',
		);
		const updateRoute = requireRoute(attendanceByIdRoute.offsite, 'Attendance offsite route');

		const updateResponse = await updateRoute.put({
			offsiteDateKey: '2025-02-31',
			offsiteDayKind: 'NO_LABORABLE',
			offsiteReason: 'Intento de actualizacion con fecha inexistente.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(
			updateResponse,
			'invalid offsite update date key',
		);
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns today attendance for an employee', async () => {
		const attendanceEmployee = requireRoute(
			client.attendance.employee,
			'Attendance employee route',
		);
		const attendanceEmployeeById = requireRoute(
			attendanceEmployee[seed.employeeId],
			'Attendance employee ID route',
		);
		const response = await attendanceEmployeeById.today.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.employeeId).toBe(seed.employeeId);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('rejects unknown attendance record IDs', async () => {
		const unknownAttendance = requireRoute(
			client.attendance[randomUUID()],
			'Attendance record route',
		);
		const response = await unknownAttendance.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown attendance record');
		expect(errorPayload.error.message).toBe('Attendance record not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
	});

	it('rejects invalid employee references on create', async () => {
		const response = await client.attendance.post({
			employeeId: randomUUID(),
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'invalid employee');
		expect(errorPayload.error.message).toBe('Employee not found');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('rejects WORK_OFFSITE creation for member role', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);

		const response = await client.attendance.post({
			employeeId: activeEmployeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento de miembro sin permisos.',
			$headers: { cookie: memberSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'member offsite forbidden');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});

	it('rejects WORK_OFFSITE creation via API key', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);

		const response = await client.attendance.post({
			employeeId: activeEmployeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento vía API key sin sesión.',
			$headers: { 'x-api-key': apiKey },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'api key offsite forbidden');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});

	it('rejects WORK_OFFSITE when check events already exist for the same day', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const targetDate = new Date(`${todayDateKey}T00:00:00.000Z`);
		targetDate.setUTCDate(targetDate.getUTCDate() - 3);
		const targetDateKey = targetDate.toISOString().slice(0, 10);

		const checkInTimestamp = new Date(`${targetDateKey}T15:00:00.000Z`);
		const checkInResponse = await client.attendance.post({
			employeeId: activeEmployeeId,
			deviceId: seed.deviceId,
			timestamp: checkInTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(checkInResponse.status).toBe(201);

		const offsiteResponse = await client.attendance.post({
			employeeId: activeEmployeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: targetDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento conflictivo con checada existente.',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(offsiteResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(offsiteResponse, 'offsite conflict check events');
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('rejects CHECK_IN when WORK_OFFSITE already exists for the same day', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const createResult = await createOffsiteWithinWindow({
			employeeId: activeEmployeeId,
			baseDateKey: todayDateKey,
			startOffsetDays: 4,
			dayKind: 'LABORABLE',
			reason: 'Registro previo para bloquear checadas en la fecha.',
		});
		if (createResult.kind === 'payroll_locked') {
			expect(createResult.attemptedDateKeys.length).toBeGreaterThan(0);
			return;
		}

		const checkInTimestamp = new Date(`${createResult.dateKey}T14:00:00.000Z`);
		const checkInResponse = await client.attendance.post({
			employeeId: activeEmployeeId,
			deviceId: seed.deviceId,
			timestamp: checkInTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(checkInResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(
			checkInResponse,
			'check-in conflict with offsite',
		);
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('rejects api key requests for other organizations', async () => {
		const response = await client.attendance.get({
			$headers: { 'x-api-key': apiKey },
			$query: {
				limit: 5,
				offset: 0,
				organizationId: randomUUID(),
			},
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'org access denial');
		expect(errorPayload.error.message).toBe('Organization is required or not permitted');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});
});
