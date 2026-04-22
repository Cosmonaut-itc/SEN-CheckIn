import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeviceStatusSummaryGet = vi.fn();

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
		devices: {
			'status-summary': {
				get: mockDeviceStatusSummaryGet,
			},
		},
	})),
}));

vi.mock('@/lib/server-auth-client', () => ({
	serverAuthClient: {
		getSession: vi.fn(),
	},
}));

vi.mock('@/lib/auth-client', () => ({
	authClient: {
		organization: {
			list: vi.fn(),
		},
	},
}));

import { fetchDeviceStatusSummaryServer } from './server-client-functions';

describe('server client functions', () => {
	beforeEach(() => {
		mockDeviceStatusSummaryGet.mockReset();
	});

	it('normalizes dashboard device battery values in the SSR summary path', async () => {
		mockDeviceStatusSummaryGet.mockResolvedValue({
			data: {
				data: [
					{
						id: 'device-1',
						code: 'DEV-001',
						name: 'Terminal 1',
						status: 'ONLINE',
						batteryLevel: '82.5',
						lastHeartbeat: '2026-04-21T15:10:00.000Z',
						locationId: 'location-1',
						locationName: 'Sucursal Centro',
					},
					{
						id: 'device-2',
						code: 'DEV-002',
						name: 'Terminal 2',
						status: 'ONLINE',
						batteryLevel: null,
						lastHeartbeat: null,
						locationId: null,
						locationName: null,
					},
					{
						id: 'device-3',
						code: 'DEV-003',
						name: 'Terminal 3',
						status: 'OFFLINE',
						batteryLevel: 'invalid',
						lastHeartbeat: '2026-04-21T15:20:00.000Z',
						locationId: null,
						locationName: null,
					},
				],
			},
			error: null,
			status: 200,
		});

		const response = await fetchDeviceStatusSummaryServer('session=mock', {
			organizationId: 'org-1',
		});

		expect(mockDeviceStatusSummaryGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
			},
		});
		expect(response).toEqual([
			expect.objectContaining({
				id: 'device-1',
				batteryLevel: 82.5,
				lastHeartbeat: '2026-04-21T15:10:00.000Z',
			}),
			expect.objectContaining({
				id: 'device-2',
				batteryLevel: null,
				lastHeartbeat: null,
			}),
			expect.objectContaining({
				id: 'device-3',
				batteryLevel: null,
				lastHeartbeat: '2026-04-21T15:20:00.000Z',
			}),
		]);
	});
});
