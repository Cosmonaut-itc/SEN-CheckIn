import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatusRecord } from '@/lib/client-functions';
import { resolveTestTranslation } from '@/lib/test-utils/next-intl';
import { DeviceStatusCard } from './device-status-card';

vi.mock('next-intl', async () => {
	return import('@/lib/test-utils/next-intl');
});

/**
 * Builds a device status fixture for tests.
 *
 * @param overrides - Partial record values to override.
 * @returns A device status record fixture.
 */
function buildDeviceStatusRecord(
	overrides: Partial<DeviceStatusRecord> = {},
): DeviceStatusRecord {
	return {
		id: 'device-1',
		code: 'DEV-001',
		name: 'Terminal principal',
		status: 'ONLINE',
		batteryLevel: 82,
		lastHeartbeat: '2026-04-21T15:55:00.000Z',
		locationId: 'location-1',
		locationName: 'Matriz',
		...overrides,
	};
}

/**
 * Renders the device status card with optional prop overrides.
 *
 * @param overrides - Partial props to override the defaults.
 * @returns The render result for the card.
 */
function renderDeviceStatusCard(
	overrides: Partial<React.ComponentProps<typeof DeviceStatusCard>> = {},
): ReturnType<typeof render> {
	return render(
		<DeviceStatusCard
			devices={overrides.devices ?? []}
			isLoading={overrides.isLoading ?? false}
			className={overrides.className}
		/>,
	);
}

describe('DeviceStatusCard', () => {
	beforeEach(() => {
		vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-21T16:00:00.000Z').getTime());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders device list', () => {
		const batteryLabel = resolveTestTranslation('Dashboard.devices.battery');

		renderDeviceStatusCard({
			devices: [
				buildDeviceStatusRecord({
					id: 'device-1',
					name: 'Terminal principal',
					batteryLevel: 82,
					lastHeartbeat: '2026-04-21T15:50:00.000Z',
				}),
				buildDeviceStatusRecord({
					id: 'device-2',
					code: 'DEV-002',
					name: null,
					batteryLevel: 37,
					lastHeartbeat: '2026-04-21T15:40:00.000Z',
				}),
			],
		});

		expect(screen.getByText('Terminal principal')).toBeInTheDocument();
		expect(screen.getByText('DEV-002')).toBeInTheDocument();
		expect(screen.getAllByText(batteryLabel)).toHaveLength(2);
	});

	it('applies battery colors by threshold', () => {
		renderDeviceStatusCard({
			devices: [
				buildDeviceStatusRecord({
					id: 'device-success',
					batteryLevel: 51,
				}),
				buildDeviceStatusRecord({
					id: 'device-warning',
					batteryLevel: 50,
				}),
				buildDeviceStatusRecord({
					id: 'device-destructive',
					batteryLevel: 19,
				}),
			],
		});

		expect(screen.getByTestId('device-status-battery-fill-device-success')).toHaveClass(
			'bg-[var(--status-success)]',
		);
		expect(screen.getByTestId('device-status-battery-fill-device-warning')).toHaveClass(
			'bg-[var(--status-warning)]',
		);
		expect(screen.getByTestId('device-status-battery-fill-device-destructive')).toHaveClass(
			'bg-[var(--status-error)]',
		);
	});

	it('shows N/D for null battery', () => {
		const notAvailableLabel = resolveTestTranslation('Common.notAvailable');

		renderDeviceStatusCard({
			devices: [
				buildDeviceStatusRecord({
					id: 'device-null-battery',
					batteryLevel: null,
				}),
			],
		});

		expect(screen.getAllByText(notAvailableLabel)).toHaveLength(2);
		expect(screen.getByTestId('device-status-battery-fill-device-null-battery')).toHaveClass(
			'bg-muted-foreground/45',
		);
	});

	it('shows relative sync time', () => {
		renderDeviceStatusCard({
			devices: [
				buildDeviceStatusRecord({
					id: 'device-sync',
					lastHeartbeat: '2026-04-21T15:55:00.000Z',
				}),
			],
		});

		expect(screen.getByText('Sincronizado hace 5 minutos')).toBeInTheDocument();
	});

	it('falls back when the heartbeat timestamp is malformed', () => {
		const notAvailableLabel = resolveTestTranslation('Common.notAvailable');

		renderDeviceStatusCard({
			devices: [
				buildDeviceStatusRecord({
					id: 'device-invalid-sync',
					lastHeartbeat: 'not-a-timestamp',
				}),
			],
		});

		expect(screen.getByText(notAvailableLabel)).toBeInTheDocument();
		expect(screen.queryByText(/Sincronizado hace/)).not.toBeInTheDocument();
	});

	it('shows loading skeleton and empty state', () => {
		const { rerender } = renderDeviceStatusCard({
			devices: [],
			isLoading: true,
		});

		expect(screen.getByTestId('device-status-card-loading')).toBeInTheDocument();
		expect(screen.getAllByTestId('device-status-card-skeleton-row')).toHaveLength(3);

		rerender(<DeviceStatusCard devices={[]} isLoading={false} />);

		expect(screen.getByTestId('device-status-card-empty')).toBeInTheDocument();
		expect(screen.getByText('No hay dispositivos registrados.')).toBeInTheDocument();
	});

	it('stretches inside constrained layouts and keeps the device list scrollable', () => {
		const { container } = renderDeviceStatusCard({
			className: 'h-full min-h-0',
			devices: Array.from({ length: 8 }).map((_, index) =>
				buildDeviceStatusRecord({
					id: `device-${index + 1}`,
					code: `DEV-${String(index + 1).padStart(3, '0')}`,
					name: `Terminal ${index + 1}`,
					lastHeartbeat: '2026-04-21T15:55:00.000Z',
				}),
			),
		});

		const card = container.querySelector('[data-slot="card"]');
		const content = container.querySelector('[data-slot="card-content"]');
		expect(card).not.toBeNull();
		expect(content).not.toBeNull();
		expect(card).toHaveClass('h-full');
		expect(card).toHaveClass('min-h-0');
		expect(card).toHaveClass('overflow-hidden');
		expect(content).toHaveClass('overflow-y-auto');
		expect(screen.getByTestId('device-status-card-scroll-region')).toHaveClass('overflow-y-auto');
		expect(screen.queryByTestId('device-status-card-loading')).not.toBeInTheDocument();
	});
});
