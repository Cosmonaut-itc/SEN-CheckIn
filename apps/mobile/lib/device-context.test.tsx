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

jest.mock('expo-secure-store', () => ({
	getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
	setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
	deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

jest.mock('./client-functions', () => ({
	fetchDeviceDetail: jest.fn(),
	isHeartbeatError: (...args: unknown[]) => mockIsHeartbeatError(...args),
	sendDeviceHeartbeat: (...args: unknown[]) => mockSendDeviceHeartbeat(...args),
	updateDeviceSettings: jest.fn(),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		session: { session: { id: 'session-1' } },
		isLoading: false,
		requestReauth: (...args: unknown[]) => mockRequestReauth(...args),
		authState: 'ok',
	}),
}));

/**
 * Minimal consumer to expose current device linkage state during tests.
 *
 * @returns {JSX.Element} Rendered text with the current device ID
 */
function DeviceIdProbe(): JSX.Element {
	const { settings, isHydrated } = useDeviceContext();

	return <Text>{isHydrated ? settings?.deviceId ?? 'no-device' : 'loading'}</Text>;
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
});
