import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchCalendar, prefetchScheduleTemplates } from '@/lib/server-functions';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { SchedulesPageClient } from './schedules-client';

/**
 * Force dynamic rendering to ensure cookies are forwarded for authenticated requests.
 */
export const dynamic = 'force-dynamic';

/**
 * Computes the start and end of the week for the given reference date.
 *
 * @param reference - Date to anchor the calculation
 * @param weekStartDay - Day index the week starts on (0=Sun, 1=Mon, ...)
 * @returns Object containing the start and end dates of the week
 */
function getWeekRange(reference: Date, weekStartDay: number = 1): { start: Date; end: Date } {
	const normalized = new Date(reference);
	normalized.setHours(0, 0, 0, 0);
	const dayOfWeek = normalized.getDay();
	const diff = (dayOfWeek - weekStartDay + 7) % 7;
	const start = new Date(normalized);
	start.setDate(normalized.getDate() - diff);
	const end = new Date(start);
	end.setDate(start.getDate() + 6);
	return { start, end };
}

/**
 * Schedules page server component.
 *
 * Prefetches schedule templates and the current week's calendar before
 * rendering the client-side tabbed scheduling experience.
 *
 * @returns Hydrated schedules page
 */
export default async function SchedulesPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();
	const { start, end } = getWeekRange(new Date(), 1);

	if (orgContext.organizationId) {
		prefetchScheduleTemplates(queryClient, {
			limit: 50,
			offset: 0,
			organizationId: orgContext.organizationId,
		});

		prefetchCalendar(queryClient, {
			startDate: start.toISOString(),
			endDate: end.toISOString(),
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<SchedulesPageClient
					initialStartDate={start.toISOString()}
					initialEndDate={end.toISOString()}
				/>
			</OrgProvider>
		</HydrationBoundary>
	);
}

