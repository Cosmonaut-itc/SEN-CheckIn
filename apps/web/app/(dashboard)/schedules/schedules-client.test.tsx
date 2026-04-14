import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTour = vi.fn();
const mockUseOrgContext = vi.fn();
const mockUseQuery = vi.fn();

vi.mock('next-intl', () => ({
	useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/use-tour', () => ({
	useTour: (...args: unknown[]) => mockUseTour(...args),
}));

vi.mock('@/lib/org-client-context', () => ({
	useOrgContext: (...args: unknown[]) => mockUseOrgContext(...args),
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/components/tour-help-button', () => ({
	TourHelpButton: () => <button type="button">tour</button>,
}));

vi.mock('@/components/ui/responsive-page-header', () => ({
	ResponsivePageHeader: ({
		actions,
	}: {
		actions?: React.ReactNode;
	}): React.ReactElement => <div>{actions}</div>,
}));

vi.mock('./components/calendar-view', () => ({
	CalendarView: () => <div>calendar</div>,
}));

vi.mock('./components/schedule-templates-tab', () => ({
	ScheduleTemplatesTab: () => <div>templates</div>,
}));

vi.mock('./components/schedule-exceptions-tab', () => ({
	ScheduleExceptionsTab: () => <div>exceptions</div>,
}));

import { SchedulesPageClient } from './schedules-client';

describe('SchedulesPageClient', () => {
	beforeEach(() => {
		mockUseTour.mockReset();
		mockUseOrgContext.mockReset();
		mockUseQuery.mockReset();

		mockUseOrgContext.mockReturnValue({
			organizationId: 'org-1',
		});
		mockUseQuery.mockReturnValue({
			data: undefined,
		});
	});

	it('renders a visible target for the templates step on the default tab', () => {
		render(
			<SchedulesPageClient
				initialStartDate="2026-04-14T00:00:00.000Z"
				initialEndDate="2026-04-20T00:00:00.000Z"
			/>,
		);

		expect(mockUseTour).toHaveBeenCalledWith('schedules');
		expect(screen.getByRole('tab', { name: 'tabs.templates' })).toHaveAttribute(
			'data-tour',
			'schedules-templates-tab',
		);
	});
});
