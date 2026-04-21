import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TimelineEvent } from '@/lib/client-functions';

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
					timestamp: '2026-04-21T23:45:00-06:00',
				},
				{
					...defaultEvents[1]!,
					id: 'event-cross-day-2',
					timestamp: '2026-04-22T00:15:00-06:00',
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

		expect(screen.getByText('2 entradas 1 retardo 1 en campo')).toBeInTheDocument();
	});

	it('renders a loading skeleton when isLoading is true', () => {
		renderActivityTimeline({ isLoading: true, events: [] });

		expect(screen.getAllByTestId('activity-timeline-skeleton')).toHaveLength(4);
	});

	it('renders an empty state when there are no events', () => {
		renderActivityTimeline({ events: [] });

		expect(screen.getByText('Sin actividad reciente.')).toBeInTheDocument();
	});

	it('calls onFilterChange when a filter chip is clicked', () => {
		const onFilterChange = vi.fn();
		renderActivityTimeline({ onFilterChange });

		fireEvent.click(screen.getByRole('button', { name: 'En campo' }));

		expect(onFilterChange).toHaveBeenCalledTimes(1);
		expect(onFilterChange).toHaveBeenCalledWith('offsite');
	});
});
