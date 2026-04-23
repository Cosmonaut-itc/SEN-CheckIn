import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TimelineEvent } from '@/lib/client-functions';
import * as timeZone from '@/lib/time-zone';

import { ActivityTimeline } from './activity-timeline';

vi.mock('next-intl', async () => {
	return import('@/lib/test-utils/next-intl');
});

const defaultEvents: TimelineEvent[] = [
	{
		id: 'event-1',
		employeeId: 'emp-1',
		employeeName: 'Ada Lovelace',
		employeeCode: 'A001',
		locationId: 'loc-1',
		locationName: 'Planta Norte',
		timestamp: '2026-04-21T07:00:00',
		type: 'CHECK_IN',
		isLate: false,
	},
	{
		id: 'event-2',
		employeeId: 'emp-2',
		employeeName: 'Grace Hopper',
		employeeCode: 'G002',
		locationId: 'loc-2',
		locationName: 'Campo',
		timestamp: '2026-04-21T08:30:00',
		type: 'CHECK_IN',
		isLate: true,
	},
	{
		id: 'event-3',
		employeeId: 'emp-3',
		employeeName: 'Linus Torvalds',
		employeeCode: 'L003',
		locationId: 'loc-3',
		locationName: 'Sitio remoto',
		timestamp: '2026-04-21T10:00:00',
		type: 'WORK_OFFSITE',
		isLate: false,
	},
];

/**
 * Renders the activity timeline with the provided overrides.
 *
 * @param overrides - Partial component props.
 * @returns Rendered component utilities.
 */
function renderActivityTimeline(
	overrides: Partial<React.ComponentProps<typeof ActivityTimeline>> = {},
) {
	return render(
		<ActivityTimeline
			events={overrides.events ?? defaultEvents}
			isLoading={overrides.isLoading ?? false}
			filter={overrides.filter ?? 'all'}
			timeZone={overrides.timeZone ?? 'America/Mexico_City'}
			onFilterChange={overrides.onFilterChange ?? vi.fn()}
		/>,
	);
}

describe('ActivityTimeline', () => {
	it('renders filter chips and the active filter has a distinct style', () => {
		renderActivityTimeline({ filter: 'late' });

		const activeChip = screen.getByRole('button', { name: 'Retardos' });
		const inactiveChip = screen.getByRole('button', { name: 'Entradas' });

		expect(activeChip).toHaveAttribute('data-slot', 'badge');
		expect(activeChip).toHaveAttribute('aria-pressed', 'true');
		expect(activeChip.className).not.toBe(inactiveChip.className);
	});

	it('renders pills positioned horizontally by timestamp', () => {
		renderActivityTimeline();

		const pills = screen.getAllByTestId('activity-timeline-pill');

		expect(pills[0]).toHaveStyle({ left: '0%' });
		expect(pills[1]).toHaveStyle({ left: '50%' });
		expect(pills[2]).toHaveStyle({ left: '100%' });
	});

	it('keeps cross-day timestamps ordered and preserves encoded clock labels', () => {
		renderActivityTimeline({
			events: [
				{
					...defaultEvents[0]!,
					id: 'event-cross-day-1',
					timestamp: '2026-04-22T05:45:00.000Z',
				},
				{
					...defaultEvents[1]!,
					id: 'event-cross-day-2',
					timestamp: '2026-04-22T06:15:00.000Z',
				},
			],
		});

		const [firstPill, secondPill] = screen.getAllByTestId('activity-timeline-pill');

		expect(within(firstPill as HTMLElement).getByText('23:45')).toBeInTheDocument();
		expect(within(secondPill as HTMLElement).getByText('00:15')).toBeInTheDocument();
		expect(Number.parseFloat((firstPill as HTMLElement).style.left)).toBeLessThan(
			Number.parseFloat((secondPill as HTMLElement).style.left),
		);
	});

	it('formats UTC timestamps in the provided organization timezone', () => {
		renderActivityTimeline({
			timeZone: 'America/Mexico_City',
			events: [
				{
					...defaultEvents[0]!,
					id: 'event-utc-1',
					timestamp: '2026-04-21T14:00:00.000Z',
				},
				{
					...defaultEvents[1]!,
					id: 'event-utc-2',
					timestamp: '2026-04-21T16:00:00.000Z',
					isLate: false,
				},
			],
		});

		const [firstPill, secondPill] = screen.getAllByTestId('activity-timeline-pill');

		expect(within(firstPill as HTMLElement).getByText('08:00')).toBeInTheDocument();
		expect(within(secondPill as HTMLElement).getByText('10:00')).toBeInTheDocument();
		expect(Number.parseFloat((firstPill as HTMLElement).style.left)).toBeLessThan(
			Number.parseFloat((secondPill as HTMLElement).style.left),
		);
	});

	it('shows initials, a compact marker, abbreviated name, and time on each pill', () => {
		renderActivityTimeline();

		const firstPill = screen.getAllByTestId('activity-timeline-pill')[0];

		expect(firstPill.querySelector('.size-4')).toBeTruthy();
		expect(firstPill.querySelector('.size-10')).toBeNull();
		expect(within(firstPill as HTMLElement).getByText('AL')).toBeInTheDocument();
		expect(within(firstPill as HTMLElement).getByText('Ada Lov.')).toBeInTheDocument();
		expect(within(firstPill as HTMLElement).getByText('07:00')).toBeInTheDocument();
	});

	it('renders the summary footer with correct counts', () => {
		renderActivityTimeline();

		expect(
			screen.getByText('2 entradas 0 salidas 0 salidas autorizadas 1 retardo 1 en campo'),
		).toBeInTheDocument();
	});

	it('renders checkout and authorized checkout events under the all filter with distinct audit styles', () => {
		renderActivityTimeline({
			events: [
				...defaultEvents,
				{
					...defaultEvents[0]!,
					id: 'event-checkout',
					employeeName: 'Katherine Johnson',
					timestamp: '2026-04-21T11:15:00.000Z',
					type: 'CHECK_OUT',
				},
				{
					...defaultEvents[0]!,
					id: 'event-authorized-checkout',
					employeeName: 'Dorothy Vaughan',
					timestamp: '2026-04-21T11:45:00.000Z',
					type: 'CHECK_OUT_AUTHORIZED',
				},
			],
		});

		const pills = screen.getAllByTestId('activity-timeline-pill');
		const regularCheckoutPill = screen
			.getByText('Katherine Joh.')
			.closest<HTMLElement>('[data-testid="activity-timeline-pill"]');
		const authorizedCheckoutPill = screen
			.getByText('Dorothy Vau.')
			.closest<HTMLElement>('[data-testid="activity-timeline-pill"]');
		if (!regularCheckoutPill || !authorizedCheckoutPill) {
			throw new Error('Expected checkout pills to render.');
		}

		expect(pills).toHaveLength(5);
		expect(within(regularCheckoutPill).getByText('Salida')).toBeInTheDocument();
		expect(within(authorizedCheckoutPill).getByText('Salida autorizada')).toBeInTheDocument();
		expect(regularCheckoutPill.className).not.toBe(authorizedCheckoutPill.className);
		expect(
			screen.getByText('2 entradas 1 salida 1 salida autorizada 1 retardo 1 en campo'),
		).toBeInTheDocument();
	});

	it('excludes checkout events from entry counts while keeping all check-ins under the entry filter', () => {
		renderActivityTimeline({
			filter: 'in',
			events: [
				...defaultEvents,
				{
					...defaultEvents[0]!,
					id: 'event-checkout',
					timestamp: '2026-04-21T15:15:00.000Z',
					type: 'CHECK_OUT',
				},
			],
		});

		expect(screen.getAllByTestId('activity-timeline-pill')).toHaveLength(2);
		expect(
			screen.getByText('2 entradas 0 salidas 0 salidas autorizadas 1 retardo 0 en campo'),
		).toBeInTheDocument();
	});

	it('filters checkout and authorized checkout events under the salida filter', () => {
		const onFilterChange = vi.fn();
		renderActivityTimeline({
			filter: 'out',
			onFilterChange,
			events: [
				...defaultEvents,
				{
					...defaultEvents[0]!,
					id: 'event-checkout',
					employeeName: 'Katherine Johnson',
					timestamp: '2026-04-21T11:15:00.000Z',
					type: 'CHECK_OUT',
				},
				{
					...defaultEvents[0]!,
					id: 'event-authorized-checkout',
					employeeName: 'Dorothy Vaughan',
					timestamp: '2026-04-21T11:45:00.000Z',
					type: 'CHECK_OUT_AUTHORIZED',
				},
			],
		});

		expect(screen.getAllByTestId('activity-timeline-pill')).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Salidas' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(
			screen.getByText('0 entradas 1 salida 1 salida autorizada 0 retardos 0 en campo'),
		).toBeInTheDocument();
	});

	it('renders a loading skeleton when isLoading is true', () => {
		renderActivityTimeline({ isLoading: true, events: [] });

		expect(screen.getAllByTestId('activity-timeline-skeleton')).toHaveLength(4);
	});

	it('renders an empty state when there are no events', () => {
		renderActivityTimeline({ events: [] });

		expect(screen.getByText('Sin actividad reciente.')).toBeInTheDocument();
	});

	it('uses the organization timezone when it builds the empty-state axis window', () => {
		const timeZoneSpy = vi.spyOn(timeZone, 'toDateKeyInTimeZone');

		renderActivityTimeline({
			events: [],
			timeZone: 'Asia/Tokyo',
		});

		expect(timeZoneSpy).toHaveBeenCalledTimes(1);
		expect(timeZoneSpy).toHaveBeenCalledWith(expect.any(Date), 'Asia/Tokyo');

		timeZoneSpy.mockRestore();
	});

	it('calls onFilterChange when a filter chip is clicked', () => {
		const onFilterChange = vi.fn();
		renderActivityTimeline({ onFilterChange });

		fireEvent.click(screen.getByRole('button', { name: 'En campo' }));

		expect(onFilterChange).toHaveBeenCalledTimes(1);
		expect(onFilterChange).toHaveBeenCalledWith('offsite');
	});

	it('calls onFilterChange when the checkout filter chip is clicked', () => {
		const onFilterChange = vi.fn();
		renderActivityTimeline({ onFilterChange });

		fireEvent.click(screen.getByRole('button', { name: 'Salidas' }));

		expect(onFilterChange).toHaveBeenCalledTimes(1);
		expect(onFilterChange).toHaveBeenCalledWith('out');
	});
});
