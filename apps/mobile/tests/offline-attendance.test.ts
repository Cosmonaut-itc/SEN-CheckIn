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
		jest.resetModules();
		mockGetItemAsync.mockReset();
		mockSetItemAsync.mockReset();
		mockDeleteItemAsync.mockReset();
		mockCreateAttendanceRecord.mockReset();
		mockNetInfoFetch.mockReset();
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

	it('shows an offline indicator on scanner when attendance must be queued', () => {
		const scannerContent = readFileSync(
			resolve(__dirname, '../app/(main)/scanner.tsx'),
			'utf-8',
		);

		expect(scannerContent).toContain('Scanner.offline.title');
		expect(scannerContent).toContain('Scanner.offline.description');
	});
});
