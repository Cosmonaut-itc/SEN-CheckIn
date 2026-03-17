import { readFileSync } from 'fs';
import { resolve } from 'path';
import { waitFor } from '@testing-library/react-native';

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
const mockCreateAttendanceRecord = jest.fn();
const mockNetInfoFetch = jest.fn();

jest.mock('expo-secure-store', () => ({
	getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
	setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
	deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

jest.mock('@/lib/client-functions', () => ({
	createAttendanceRecord: (...args: unknown[]) => mockCreateAttendanceRecord(...args),
}));

jest.mock('@react-native-community/netinfo', () => ({
	__esModule: true,
	default: {
		fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
	},
}));

describe('Offline attendance support', () => {
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		jest.resetModules();
		mockGetItemAsync.mockReset();
		mockSetItemAsync.mockReset();
		mockDeleteItemAsync.mockReset();
		mockCreateAttendanceRecord.mockReset();
		mockNetInfoFetch.mockReset();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('queues attendance payloads when there is no network', async () => {
		jest.resetModules();
		mockGetItemAsync.mockResolvedValue(null);
		mockNetInfoFetch.mockResolvedValue({ isConnected: false });

		const { submitAttendanceWithOfflineSupport } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		const result = await submitAttendanceWithOfflineSupport({
			employeeId: 'employee-1',
			deviceId: 'device-1',
			type: 'CHECK_IN',
		});

		expect(result.delivery).toBe('queued');
		expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
		expect(mockCreateAttendanceRecord).not.toHaveBeenCalled();
	});

	it('queues attendance when a translated API error preserves an offline network cause', async () => {
		jest.resetModules();
		mockGetItemAsync.mockResolvedValue(null);
		mockNetInfoFetch
			.mockResolvedValueOnce({ isConnected: true, isInternetReachable: true })
			.mockResolvedValueOnce({ isConnected: true, isInternetReachable: true });
		mockCreateAttendanceRecord.mockRejectedValue(
			new Error('Errors.api.createAttendanceRecord', {
				cause: new Error('socket hang up'),
			}),
		);

		const { submitAttendanceWithOfflineSupport } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		const result = await submitAttendanceWithOfflineSupport({
			employeeId: 'employee-1',
			deviceId: 'device-1',
			type: 'CHECK_IN',
		});

		expect(result.delivery).toBe('queued');
		expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
	});

	it('flushes queued attendance once connectivity returns', async () => {
		jest.resetModules();
		mockGetItemAsync.mockResolvedValue(
			JSON.stringify([
				{
					employeeId: 'employee-1',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:00:00.000Z',
				},
			]),
		);
		mockCreateAttendanceRecord.mockResolvedValue({ id: 'attendance-1' });

		const { flushPendingAttendanceQueue } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		await flushPendingAttendanceQueue();

		expect(mockCreateAttendanceRecord).toHaveBeenCalledTimes(1);
		expect(mockDeleteItemAsync).toHaveBeenCalledTimes(1);
	});

	it('serializes concurrent queue flushes so queued attendance is submitted once', async () => {
		jest.resetModules();
		mockGetItemAsync.mockResolvedValue(
			JSON.stringify([
				{
					employeeId: 'employee-1',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:00:00.000Z',
				},
			]),
		);

		let resolveCreateAttendanceRecord:
			| ((value: { id: string }) => void)
			| null = null;
		mockCreateAttendanceRecord.mockImplementation(
			() =>
				new Promise<{ id: string }>((resolve) => {
					resolveCreateAttendanceRecord = resolve;
				}),
		);

		const { flushPendingAttendanceQueue } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		const firstFlush = flushPendingAttendanceQueue();
		const secondFlush = flushPendingAttendanceQueue();

		await waitFor(() => {
			expect(mockCreateAttendanceRecord).toHaveBeenCalledTimes(1);
		});

		expect(resolveCreateAttendanceRecord).not.toBeNull();

		if (!resolveCreateAttendanceRecord) {
			throw new Error('Expected concurrent flush test to start the attendance submission');
		}

		const resolvePendingFlush: (value: { id: string }) => void = resolveCreateAttendanceRecord;
		resolvePendingFlush({ id: 'attendance-1' });

		await expect(firstFlush).resolves.toBe(1);
		await expect(secondFlush).resolves.toBe(1);
		expect(mockDeleteItemAsync).toHaveBeenCalledTimes(1);
	});

	it('preserves items enqueued while a flush is already in progress', async () => {
		jest.resetModules();
		let persistedQueue: string | null = JSON.stringify([
			{
				employeeId: 'employee-1',
				deviceId: 'device-1',
				type: 'CHECK_IN',
				timestamp: '2026-03-16T00:00:00.000Z',
			},
		]);

		mockGetItemAsync.mockImplementation(async () => persistedQueue);
		mockSetItemAsync.mockImplementation(async (_key: string, value: string) => {
			persistedQueue = value;
		});
		mockDeleteItemAsync.mockImplementation(async () => {
			persistedQueue = null;
		});

		let resolveCreateAttendanceRecord:
			| ((value: { id: string }) => void)
			| null = null;
		mockCreateAttendanceRecord.mockImplementation(
			() =>
				new Promise<{ id: string }>((resolve) => {
					resolveCreateAttendanceRecord = resolve;
				}),
		);

		const { enqueuePendingAttendance, flushPendingAttendanceQueue } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		const flushPromise = flushPendingAttendanceQueue();

		await waitFor(() => {
			expect(mockCreateAttendanceRecord).toHaveBeenCalledTimes(1);
		});

		const enqueuePromise = enqueuePendingAttendance({
			employeeId: 'employee-2',
			deviceId: 'device-1',
			type: 'CHECK_OUT',
			timestamp: new Date('2026-03-16T00:05:00.000Z'),
		});

		expect(resolveCreateAttendanceRecord).not.toBeNull();

		if (!resolveCreateAttendanceRecord) {
			throw new Error('Expected flush to start before enqueueing a new item');
		}

		const resolvePendingFlush: (value: { id: string }) => void = resolveCreateAttendanceRecord;
		resolvePendingFlush({ id: 'attendance-1' });

		await expect(flushPromise).resolves.toBe(1);
		await expect(enqueuePromise).resolves.toMatchObject({ delivery: 'queued' });

		expect(persistedQueue).toBe(
			JSON.stringify([
				{
					employeeId: 'employee-2',
					deviceId: 'device-1',
					type: 'CHECK_OUT',
					timestamp: '2026-03-16T00:05:00.000Z',
				},
			]),
		);
	});

	it('drops permanently invalid queue items so later records can still flush', async () => {
		jest.resetModules();
		mockGetItemAsync.mockResolvedValue(
			JSON.stringify([
				{
					employeeId: 'employee-1',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:00:00.000Z',
				},
				{
					employeeId: 'employee-2',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:01:00.000Z',
				},
			]),
		);

		const permanentError = Object.assign(new Error('Errors.api.createAttendanceRecord'), {
			status: 404,
		});
		mockCreateAttendanceRecord
			.mockRejectedValueOnce(permanentError)
			.mockResolvedValueOnce({ id: 'attendance-2' });

		const { flushPendingAttendanceQueue } = jest.requireActual(
			'@/lib/offline-attendance',
		) as typeof import('@/lib/offline-attendance');

		await expect(flushPendingAttendanceQueue()).resolves.toBe(1);

		expect(mockCreateAttendanceRecord).toHaveBeenCalledTimes(2);
		expect(mockDeleteItemAsync).toHaveBeenCalledTimes(1);
		expect(mockSetItemAsync).not.toHaveBeenCalled();
	});

	it.each([401, 403, 408, 429])(
		'keeps queued records when flush fails with retryable status %s',
		async (status) => {
			jest.resetModules();
			const storedQueue = JSON.stringify([
				{
					employeeId: 'employee-1',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:00:00.000Z',
				},
				{
					employeeId: 'employee-2',
					deviceId: 'device-1',
					type: 'CHECK_IN',
					timestamp: '2026-03-16T00:01:00.000Z',
				},
			]);
			mockGetItemAsync.mockResolvedValue(storedQueue);

			const retryableError = Object.assign(
				new Error('Errors.api.createAttendanceRecord'),
				{
					status,
				},
			);
			mockCreateAttendanceRecord.mockRejectedValue(retryableError);

			const { flushPendingAttendanceQueue } = jest.requireActual(
				'@/lib/offline-attendance',
			) as typeof import('@/lib/offline-attendance');

			await expect(flushPendingAttendanceQueue()).resolves.toBe(0);

			expect(mockCreateAttendanceRecord).toHaveBeenCalledTimes(1);
			expect(mockSetItemAsync).toHaveBeenCalledWith(
				'sen-checkin_pending_attendance_queue',
				storedQueue,
			);
			expect(mockDeleteItemAsync).not.toHaveBeenCalled();
		},
	);

	it('shows an offline indicator on scanner when attendance must be queued', () => {
		const scannerContent = readFileSync(
			resolve(__dirname, '../app/(main)/scanner.tsx'),
			'utf-8',
		);

		expect(scannerContent).toContain('Scanner.offline.title');
		expect(scannerContent).toContain('Scanner.offline.description');
	});
});
