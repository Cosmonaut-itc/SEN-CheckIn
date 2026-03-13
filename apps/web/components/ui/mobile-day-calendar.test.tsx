import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MobileDayCalendar } from './mobile-day-calendar';

const monday = new Date('2026-03-09T00:00:00.000Z');
const weekRange = {
	start: new Date('2026-03-09T00:00:00.000Z'),
	end: new Date('2026-03-15T00:00:00.000Z'),
};

const employees = [
	{
		employeeId: 'emp-1',
		employeeName: 'Ada Lovelace',
		shiftType: 'DIURNA',
		days: [
			{
				date: '2026-03-09',
				isWorkingDay: true,
				startTime: '09:00',
				endTime: '18:00',
				source: 'template' as const,
				reason: null,
			},
		],
	},
];

describe('MobileDayCalendar', () => {
	it('renders the selected day and employee schedule summary', () => {
		render(
			<MobileDayCalendar
				date={monday}
				employees={employees}
				onDateChange={vi.fn()}
				weekRange={weekRange}
			/>,
		);

		expect(screen.getByTestId('mobile-day-calendar')).toBeInTheDocument();
		expect(screen.getByText('Lunes 9 mar 2026')).toBeInTheDocument();
		expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
		expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument();
		expect(screen.getByTestId('mobile-day-calendar-previous')).toBeDisabled();
	});

	it('navigates within the selected week range', () => {
		const handleDateChange = vi.fn();

		render(
			<MobileDayCalendar
				date={new Date('2026-03-10T00:00:00.000Z')}
				employees={employees}
				onDateChange={handleDateChange}
				weekRange={weekRange}
			/>,
		);

		fireEvent.click(screen.getByTestId('mobile-day-calendar-next'));

		expect(handleDateChange).toHaveBeenCalledWith(new Date('2026-03-11T00:00:00.000Z'));
	});
});
