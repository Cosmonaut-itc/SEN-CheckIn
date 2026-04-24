import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeviceStatusSummaryGet = vi.fn();
const mockAttendanceTimelineGet = vi.fn();

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
		attendance: {
			timeline: {
				get: mockAttendanceTimelineGet,
			},
		},
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

import type { AttendanceType, TimelineEvent } from './client-functions';
import {
	fetchAttendanceTimelineServer,
	fetchDeviceStatusSummaryServer,
} from './server-client-functions';

/**
 * Builds a dashboard timeline event payload fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Timeline event fixture
 */
function createTimelineEventFixture(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
	return {
		id: 'attendance-1',
		employeeId: 'employee-1',
		employeeName: 'Ana Pérez',
		employeeCode: 'EMP-0001',
		locationId: 'location-1',
		locationName: 'Sucursal Centro',
		timestamp: '2026-04-21T14:05:00.000Z',
		type: 'CHECK_IN' as AttendanceType,
		isLate: false,
		...overrides,
	};
}

describe('server client functions', () => {
	beforeEach(() => {
		mockDeviceStatusSummaryGet.mockReset();
		mockAttendanceTimelineGet.mockReset();
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

	it('uses a positive server timeline page size when the requested limit is zero', async () => {
		mockAttendanceTimelineGet
			.mockResolvedValueOnce({
				data: {
					data: [createTimelineEventFixture()],
					pagination: { total: 2, offset: 0, hasMore: true },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			})
			.mockResolvedValueOnce({
				data: {
					data: [
						createTimelineEventFixture({
							id: 'attendance-2',
						}),
					],
					pagination: { total: 2, offset: 1, hasMore: false },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			});

		const response = await fetchAttendanceTimelineServer('session=mock', {
			organizationId: 'org-1',
			limit: 0,
		});

		expect(response.data).toHaveLength(2);
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(1, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 0,
			},
		});
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(2, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 1,
			},
		});
	});

	it('continues server timeline pagination past the defensive page budget when total is known', async () => {
		mockAttendanceTimelineGet.mockImplementation(() => {
			const pageIndex = mockAttendanceTimelineGet.mock.calls.length - 1;

			return Promise.resolve({
				data: {
					data: [
						createTimelineEventFixture({
							id: `attendance-${pageIndex + 1}`,
						}),
					],
					pagination: { total: 21, limit: 1, offset: pageIndex, hasMore: pageIndex < 20 },
					summary: { lateTotal: 1 },
				},
				error: null,
				status: 200,
			});
		});

		const response = await fetchAttendanceTimelineServer('session=mock', {
			organizationId: 'org-1',
			limit: 1,
		});

		expect(response.data).toHaveLength(21);
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(21);
		expect(mockAttendanceTimelineGet).toHaveBeenLastCalledWith({
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 20,
			},
		});
	});

	it('stops server timeline pagination at the known total when starting from a non-zero offset', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [
					createTimelineEventFixture({
						id: 'attendance-21',
					}),
				],
				pagination: { total: 21, limit: 1, offset: 20, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceTimelineServer('session=mock', {
			organizationId: 'org-1',
			limit: 1,
			offset: 20,
		});

		expect(response.data).toHaveLength(1);
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(1);
	});

	it('throws when server timeline pagination cannot establish a bounded total', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [createTimelineEventFixture()],
				pagination: { limit: 1, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		await expect(
			fetchAttendanceTimelineServer('session=mock', {
				organizationId: 'org-1',
				limit: 1,
			}),
		).rejects.toThrow('Failed to fetch a bounded attendance timeline');
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(20);
	});

	it('throws when a server timeline page is empty while the API still reports more data', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [],
				pagination: { total: 2, limit: 1, offset: 0, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		await expect(
			fetchAttendanceTimelineServer('session=mock', {
				organizationId: 'org-1',
				limit: 1,
			}),
		).rejects.toThrow('Failed to fetch a bounded attendance timeline');
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(1);
	});
});
