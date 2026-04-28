import { render, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import type { JSX } from 'react';

import { DeviceProvider, useDeviceContext } from './device-context';

const mockSendDeviceHeartbeat = jest.fn();
const mockIsHeartbeatError = jest.fn();
const mockRequestReauth = jest.fn();
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
const mockFlushPendingAttendanceQueue = jest.fn();
const mockNetInfoFetch = jest.fn();
const mockNetInfoAddEventListener = jest.fn();
const mockClearSettingsAccessGrants = jest.fn();
type MockSessionState = { session: { id: string } } | null;

const mockAuthContext: {
	session: MockSessionState;
	isLoading: boolean;
	requestReauth: (...args: unknown[]) => unknown;
	authState: string;
} = {
	session: { session: { id: 'session-1' } },
	isLoading: false,
	requestReauth: (...args: unknown[]) => mockRequestReauth(...args),
	authState: 'ok',
};

jest.mock('expo-secure-store', () => ({
	getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
	setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
	deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

jest.mock('@react-native-community/netinfo', () => ({
	__esModule: true,
	default: {
		fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
		addEventListener: (...args: unknown[]) => mockNetInfoAddEventListener(...args),
	},
}));

jest.mock('./client-functions', () => ({
	fetchDeviceDetail: jest.fn(),
	isHeartbeatError: (...args: unknown[]) => mockIsHeartbeatError(...args),
	sendDeviceHeartbeat: (...args: unknown[]) => mockSendDeviceHeartbeat(...args),
	updateDeviceSettings: jest.fn(),
}));

jest.mock('./offline-attendance', () => {
	const actual =
		jest.requireActual<typeof import('./offline-attendance')>('./offline-attendance');

	return {
		...actual,
		flushPendingAttendanceQueue: (...args: unknown[]) =>
			mockFlushPendingAttendanceQueue(...args),
	};
});

jest.mock('./settings-access-guard', () => ({
	clearSettingsAccessGrants: (...args: unknown[]) => mockClearSettingsAccessGrants(...args),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => mockAuthContext,
}));

/**
 * Minimal consumer to expose current device linkage state during tests.
 *
 * @returns {JSX.Element} Rendered text with the current device ID
 */
function DeviceIdProbe(): JSX.Element {
	const { settings, isHydrated } = useDeviceContext();

	return <Text>{isHydrated ? (settings?.deviceId ?? 'no-device') : 'loading'}</Text>;
}

describe('DeviceProvider heartbeat recovery', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		Object.defineProperty(AppState, 'currentState', {
			configurable: true,
			value: 'active',
		});
		jest.spyOn(AppState, 'addEventListener').mockReturnValue({
			remove: jest.fn(),
		});
		mockSendDeviceHeartbeat.mockReset();
		mockIsHeartbeatError.mockReset();
		mockRequestReauth.mockReset();
		mockGetItemAsync.mockReset();
		mockSetItemAsync.mockReset();
		mockDeleteItemAsync.mockReset();
		mockFlushPendingAttendanceQueue.mockReset();
		mockNetInfoFetch.mockReset();
		mockNetInfoAddEventListener.mockReset();
		mockClearSettingsAccessGrants.mockReset();
		mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
		mockNetInfoAddEventListener.mockImplementation(() => jest.fn());
		mockAuthContext.session = { session: { id: 'session-1' } };
		mockAuthContext.isLoading = false;
		mockAuthContext.authState = 'ok';
		mockGetItemAsync.mockResolvedValue(
			JSON.stringify({
				deviceId: 'device-1',
				name: 'Terminal 1',
				locationId: 'location-1',
				organizationId: 'org-1',
			}),
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it('clears local device settings and locks reauthentication when heartbeat returns not found', async () => {
		mockSendDeviceHeartbeat.mockRejectedValue({
			status: 404,
			code: 'DEVICE_NOT_FOUND',
			message: 'Device not found',
		});
		mockIsHeartbeatError.mockReturnValue(true);

		const view = render(
			<DeviceProvider>
				<DeviceIdProbe />
			</DeviceProvider>,
		);

		await waitFor(() => {
			expect(mockSendDeviceHeartbeat).toHaveBeenCalledWith('device-1');
		});

		await waitFor(() => {
			expect(mockDeleteItemAsync).toHaveBeenCalledWith('sen-checkin_device_settings');
		});
		expect(mockClearSettingsAccessGrants).toHaveBeenCalledTimes(1);

		expect(mockRequestReauth).toHaveBeenCalledWith({
			forceLock: true,
			reason: 'device_missing',
		});

		await waitFor(() => {
			expect(view.getByText('no-device')).toBeTruthy();
		});

		jest.advanceTimersByTime(180_000);

		expect(mockSendDeviceHeartbeat).toHaveBeenCalledTimes(1);
	});

	it('keeps local device settings when a heartbeat 404 is not a device-missing error', async () => {
		mockSendDeviceHeartbeat.mockRejectedValue({
			status: 404,
			code: 'UNKNOWN',
			message: 'Route not ready',
		});
		mockIsHeartbeatError.mockReturnValue(true);

		const view = render(
			<DeviceProvider>
				<DeviceIdProbe />
			</DeviceProvider>,
		);

		await waitFor(() => {
			expect(mockSendDeviceHeartbeat).toHaveBeenCalledWith('device-1');
		});

		expect(mockDeleteItemAsync).not.toHaveBeenCalledWith('sen-checkin_device_settings');
		expect(mockRequestReauth).not.toHaveBeenCalledWith({
			forceLock: true,
			reason: 'device_missing',
		});

		await waitFor(() => {
			expect(view.getByText('device-1')).toBeTruthy();
		});
	});

	it('waits for an authenticated reachable session before flushing queued attendance', async () => {
		mockAuthContext.session = null;

		const view = render(
			<DeviceProvider>
				<DeviceIdProbe />
			</DeviceProvider>,
		);

		expect(mockNetInfoAddEventListener).not.toHaveBeenCalled();
		expect(mockFlushPendingAttendanceQueue).not.toHaveBeenCalled();

		mockAuthContext.session = { session: { id: 'session-1' } };

		view.rerender(
			<DeviceProvider>
				<DeviceIdProbe />
			</DeviceProvider>,
		);

		await waitFor(() => {
			expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
			expect(mockNetInfoAddEventListener).toHaveBeenCalledTimes(1);
			expect(mockFlushPendingAttendanceQueue).toHaveBeenCalledTimes(1);
		});

		const listener = mockNetInfoAddEventListener.mock.calls[0]?.[0] as
			| ((state: {
					isConnected: boolean | null;
					isInternetReachable?: boolean | null;
			  }) => void)
			| undefined;

		expect(listener).toBeDefined();

		listener?.({ isConnected: true, isInternetReachable: false });

		expect(mockFlushPendingAttendanceQueue).toHaveBeenCalledTimes(1);
	});
});
