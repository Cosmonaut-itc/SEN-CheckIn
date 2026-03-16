import NetInfo from '@react-native-community/netinfo';
import type { AttendanceRecord } from '@sen-checkin/types';
import * as SecureStore from 'expo-secure-store';

import {
	createAttendanceRecord,
	type CreateAttendanceInput,
} from '@/lib/client-functions';

const PENDING_ATTENDANCE_STORAGE_KEY = 'sen-checkin_pending_attendance_queue';

type PendingAttendanceQueueItem = Omit<CreateAttendanceInput, 'timestamp'> & {
	timestamp: string;
};

export type AttendanceSubmissionResult = {
	delivery: 'sent' | 'queued';
	record: AttendanceRecord | null;
};

/**
 * Determine whether a NetInfo state should be treated as offline.
 *
 * @param state - Connectivity payload from NetInfo
 * @returns True when network connectivity is unavailable
 */
export function isOfflineNetInfoState(state: {
	isConnected: boolean | null;
	isInternetReachable?: boolean | null;
}): boolean {
	return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * Read the persisted attendance queue from secure storage.
 *
 * @returns Stored queue items, or an empty list when none exist
 */
async function readPendingAttendanceQueue(): Promise<PendingAttendanceQueueItem[]> {
	try {
		const stored = await SecureStore.getItemAsync(PENDING_ATTENDANCE_STORAGE_KEY);
		if (!stored) {
			return [];
		}

		const parsed = JSON.parse(stored) as PendingAttendanceQueueItem[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.warn('[offline-attendance] Failed to read pending queue', error);
		return [];
	}
}

/**
 * Persist the attendance queue, deleting the key when no items remain.
 *
 * @param queue - Queue items to persist
 * @returns Promise that resolves after storage is updated
 */
async function writePendingAttendanceQueue(queue: PendingAttendanceQueueItem[]): Promise<void> {
	if (queue.length === 0) {
		await SecureStore.deleteItemAsync(PENDING_ATTENDANCE_STORAGE_KEY);
		return;
	}

	await SecureStore.setItemAsync(PENDING_ATTENDANCE_STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Add an attendance payload to the offline queue.
 *
 * @param input - Attendance payload to queue for later sync
 * @returns Result describing the queued delivery state
 */
export async function enqueuePendingAttendance(
	input: CreateAttendanceInput,
): Promise<AttendanceSubmissionResult> {
	const queue = await readPendingAttendanceQueue();
	queue.push({
		...input,
		timestamp: (input.timestamp ?? new Date()).toISOString(),
	});
	await writePendingAttendanceQueue(queue);

	return {
		delivery: 'queued',
		record: null,
	};
}

/**
 * Flush queued attendance records while connectivity is available.
 *
 * Stops on the first failure so unflushed items remain persisted in order.
 *
 * @returns Number of queued records flushed successfully
 */
export async function flushPendingAttendanceQueue(): Promise<number> {
	const queue = await readPendingAttendanceQueue();
	if (queue.length === 0) {
		return 0;
	}

	const remainingQueue: PendingAttendanceQueueItem[] = [];
	let flushedCount = 0;

	for (let index = 0; index < queue.length; index += 1) {
		const item = queue[index];
		if (!item) {
			continue;
		}

		try {
			const payload: CreateAttendanceInput = {
				employeeId: item.employeeId,
				deviceId: item.deviceId,
				type: item.type,
				metadata: item.metadata,
				checkOutReason: item.checkOutReason,
				timestamp: new Date(item.timestamp),
			};
			await createAttendanceRecord(payload);
			flushedCount += 1;
		} catch (error) {
			remainingQueue.push(...queue.slice(index));
			console.warn('[offline-attendance] Failed to flush pending queue', error);
			break;
		}
	}

	await writePendingAttendanceQueue(remainingQueue);
	return flushedCount;
}

/**
 * Submit attendance immediately when online, or queue it for later sync when offline.
 *
 * @param input - Attendance payload to submit
 * @returns Submission result indicating whether the record was sent or queued
 * @throws Re-throws non-network failures while online
 */
export async function submitAttendanceWithOfflineSupport(
	input: CreateAttendanceInput,
): Promise<AttendanceSubmissionResult> {
	const netState = await NetInfo.fetch();
	if (isOfflineNetInfoState(netState)) {
		return enqueuePendingAttendance(input);
	}

	try {
		const record = await createAttendanceRecord(input);
		return {
			delivery: 'sent',
			record,
		};
	} catch (error) {
		const latestNetState = await NetInfo.fetch().catch(() => netState);
		const isOfflineError =
			error instanceof Error && /network|internet|fetch|socket/i.test(error.message);

		if (isOfflineNetInfoState(latestNetState) || isOfflineError) {
			return enqueuePendingAttendance(input);
		}

		throw error;
	}
}
