import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Location } from '@/lib/client-functions';

import { CalendarView } from './calendar-view';

const mockUseIsMobile = vi.fn();
const mockUseQuery = vi.fn();
const fetchCalendarMock = vi.fn();

vi.mock('@/hooks/use-mobile', () => ({
	useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock('@/lib/client-functions', () => ({
	fetchCalendar: (...args: unknown[]) => fetchCalendarMock(...args),
}));

vi.mock('@/components/ui/mobile-day-calendar', () => ({
	MobileDayCalendar: ({
		date,
		weekRange,
	}: {
		date: Date;
		weekRange: { start: Date; end: Date };
	}): React.ReactElement => (
		<div data-testid="mobile-day-calendar">
			<span data-testid="mobile-selected-date">{date.toISOString()}</span>
			<span data-testid="mobile-week-start">{weekRange.start.toISOString()}</span>
			<span data-testid="mobile-week-end">{weekRange.end.toISOString()}</span>
		</div>
	),
}));

vi.mock('./location-schedule-card', () => ({
	LocationScheduleCard: (): React.ReactElement => <div data-testid="location-schedule-card" />,
}));

const defaultLocations: Location[] = [
	{
		id: 'loc-1',
		name: 'Monterrey',
		code: 'MTY',
		address: 'Av. Constitución 1000',
		latitude: null,
		longitude: null,
		organizationId: 'org-1',
		geographicZone: 'GENERAL',
		timeZone: 'America/Mexico_City',
		createdAt: new Date('2026-03-01T00:00:00.000Z'),
		updatedAt: new Date('2026-03-01T00:00:00.000Z'),
	},
];

const defaultProps = {
	initialStartDate: '2026-03-09T00:00:00.000Z',
	initialEndDate: '2026-03-15T00:00:00.000Z',
	employees: [],
	locations: defaultLocations,
	organizationId: 'org-1',
	weekStartDay: 1,
} satisfies React.ComponentProps<typeof CalendarView>;

describe('CalendarView', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockUseIsMobile.mockReset();
		mockUseQuery.mockReset();
		fetchCalendarMock.mockReset();
		mockUseQuery.mockReturnValue({
			data: [],
			isFetching: false,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('hides the week and month toggle on mobile and keeps weekly navigation', async () => {
		mockUseIsMobile.mockReturnValue(false);

		const { rerender } = render(<CalendarView {...defaultProps} />);

		fireEvent.click(screen.getByRole('button', { name: 'calendar.view.month' }));

		mockUseIsMobile.mockReturnValue(true);
		rerender(<CalendarView {...defaultProps} />);

		act(() => {
			vi.runAllTimers();
		});

		expect(screen.getByTestId('mobile-day-calendar')).toBeInTheDocument();

		expect(screen.queryByRole('button', { name: 'calendar.view.week' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'calendar.view.month' })).toBeNull();
		expect(screen.getByTestId('mobile-week-start')).toHaveTextContent(
			'2026-03-09T00:00:00.000Z',
		);

		fireEvent.click(screen.getByRole('button', { name: 'next' }));

		expect(screen.getByTestId('mobile-week-start')).toHaveTextContent(
			'2026-03-16T00:00:00.000Z',
		);
	});

	it('keeps today selected when jumping to the current week on mobile', () => {
		vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
		mockUseIsMobile.mockReturnValue(true);

		render(<CalendarView {...defaultProps} />);

		act(() => {
			vi.runAllTimers();
		});

		fireEvent.click(screen.getByRole('button', { name: 'next' }));
		fireEvent.click(screen.getByRole('button', { name: 'calendar.today' }));

		expect(screen.getByTestId('mobile-week-start')).toHaveTextContent(
			'2026-03-16T00:00:00.000Z',
		);
		expect(screen.getByTestId('mobile-selected-date')).toHaveTextContent(
			'2026-03-19T00:00:00.000Z',
		);
	});
});
