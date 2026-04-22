// @vitest-environment jsdom

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttendancePresentRecord, Location } from '@/lib/client-functions';
import { DashboardMap } from './dashboard-map';

const fitBoundsMock = vi.fn();
const easeToMock = vi.fn();
const resizeMock = vi.fn();

vi.mock('next-intl', () => ({
	useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
		if (namespace !== 'Dashboard') {
			return key;
		}

		switch (key) {
			case 'map.tooltip':
				return `${values?.count ?? 0} presentes`;
			case 'map.popup.presentCount':
				return `Presentes: ${values?.count ?? 0}`;
			case 'map.popup.empty':
				return 'Sin personal presente en este momento.';
			case 'map.popup.fallbackInitials':
				return 'NA';
			case 'map.popup.timeAgo':
				return `hace ${values?.time ?? ''}`;
			case 'map.popup.lastCheckIn':
				return `Última checada ${values?.time ?? ''}`;
			case 'map.popup.lastCheckInEmpty':
				return 'Sin checadas hoy.';
			case 'map.popup.capacityLabel':
				return 'Capacidad asignada';
			case 'map.popup.capacity':
				return `${values?.present ?? 0}/${values?.total ?? 0} presentes`;
			case 'map.popup.capacityPresentOnly':
				return `${values?.present ?? 0} presentes`;
			default:
				return key;
		}
	},
}));

vi.mock('@/components/ui/map', () => ({
	Map: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="dashboard-map-canvas">{children}</div>
	),
	MapMarker: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="dashboard-map-marker">{children}</div>
	),
	MarkerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	MarkerLabel: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
	MarkerPopup: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
		<div data-testid="dashboard-map-popup" className={className}>
			{children}
		</div>
	),
	MarkerTooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	useMap: () => ({
		map: {
			easeTo: easeToMock,
			fitBounds: fitBoundsMock,
			resize: resizeMock,
		},
		isLoaded: true,
	}),
}));

describe('DashboardMap', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
		fitBoundsMock.mockReset();
		easeToMock.mockReset();
		resizeMock.mockReset();
	});

	it('renders enriched popup details with location code, capacity and latest check-in', () => {
		const location: Location = {
			id: 'location-1',
			name: 'Matriz',
			code: 'MTZ',
			address: null,
			latitude: 19.4326,
			longitude: -99.1332,
			organizationId: 'org-1',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		};
		const presentRecord: AttendancePresentRecord = {
			employeeId: 'employee-1',
			employeeName: 'Ada Lovelace',
			employeeCode: 'A001',
			deviceId: 'device-1',
			locationId: 'location-1',
			locationName: 'Matriz',
			checkedInAt: new Date('2026-04-21T11:55:00.000Z'),
		};
		const props = {
			locations: [location],
			focusedLocation: location,
			presentByLocationId: new Map<string, AttendancePresentRecord[]>([
				['location-1', [presentRecord]],
			]),
			employeeCountByLocation: new Map<string, number>([['location-1', 3]]),
			isMobileLayout: false,
		} as React.ComponentProps<typeof DashboardMap> & {
			employeeCountByLocation: Map<string, number>;
		};

		render(<DashboardMap {...props} />);

		const popup = screen.getByTestId('dashboard-map-popup');

		expect(within(popup).getByText('Matriz')).toBeInTheDocument();
		expect(within(popup).getByText('MTZ')).toBeInTheDocument();
		expect(within(popup).getAllByText('1/3 presentes').length).toBeGreaterThan(0);
		expect(within(popup).getByText(/Última checada/i)).toHaveTextContent('5 minutos');
		expect(
			within(popup).getByRole('progressbar', { name: 'Capacidad asignada' }),
		).toHaveAttribute('aria-valuenow', '1');
	});

	it('shows the most recent presence activity first inside the popup list', () => {
		const location: Location = {
			id: 'location-1',
			name: 'Matriz',
			code: 'MTZ',
			address: null,
			latitude: 19.4326,
			longitude: -99.1332,
			organizationId: 'org-1',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		};
		const oldestRecord: AttendancePresentRecord = {
			employeeId: 'employee-1',
			employeeName: 'Ada Lovelace',
			employeeCode: 'A001',
			deviceId: 'device-1',
			locationId: 'location-1',
			locationName: 'Matriz',
			checkedInAt: new Date('2026-04-21T11:10:00.000Z'),
		};
		const newestRecord: AttendancePresentRecord = {
			employeeId: 'employee-2',
			employeeName: 'Grace Hopper',
			employeeCode: 'G002',
			deviceId: 'device-2',
			locationId: 'location-1',
			locationName: 'Matriz',
			checkedInAt: new Date('2026-04-21T11:55:00.000Z'),
		};

		render(
			<DashboardMap
				locations={[location]}
				focusedLocation={location}
				presentByLocationId={
					new Map<string, AttendancePresentRecord[]>([
						['location-1', [oldestRecord, newestRecord]],
					])
				}
				isMobileLayout={false}
			/>,
		);

		const popup = screen.getByTestId('dashboard-map-popup');
		const employeeNames = within(popup)
			.getAllByText(/Ada Lovelace|Grace Hopper/)
			.map((element) => element.textContent);

		expect(employeeNames).toEqual(['Grace Hopper', 'Ada Lovelace']);
	});

	it('refits the map to the overview when hover focus clears', () => {
		const locations: Location[] = [
			{
				id: 'location-1',
				name: 'Matriz',
				code: 'MTZ',
				address: null,
				latitude: 19.4326,
				longitude: -99.1332,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
			{
				id: 'location-2',
				name: 'Sucursal Norte',
				code: 'NOR',
				address: null,
				latitude: 25.6866,
				longitude: -100.3161,
				organizationId: 'org-1',
				geographicZone: 'GENERAL',
				timeZone: 'America/Mexico_City',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		];

		const { rerender } = render(
			<DashboardMap
				locations={locations}
				focusedLocation={locations[1] ?? null}
				presentByLocationId={new Map<string, AttendancePresentRecord[]>()}
				isMobileLayout={false}
			/>,
		);

		expect(easeToMock).toHaveBeenCalledWith({
			center: [-100.3161, 25.6866],
			zoom: 14,
			duration: 700,
		});

		fitBoundsMock.mockClear();

		rerender(
			<DashboardMap
				locations={locations}
				focusedLocation={null}
				presentByLocationId={new Map<string, AttendancePresentRecord[]>()}
				isMobileLayout={false}
			/>,
		);

		expect(fitBoundsMock).toHaveBeenCalledTimes(1);
	});
});
