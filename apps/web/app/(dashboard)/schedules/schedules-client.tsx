'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryKeys } from '@/lib/query-keys';
import {
	fetchEmployeesList,
	fetchLocationsList,
	fetchPayrollSettings,
	type Employee,
	type Location,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { CalendarView } from './components/calendar-view';
import { ScheduleTemplatesTab } from './components/schedule-templates-tab';
import { ScheduleExceptionsTab } from './components/schedule-exceptions-tab';

/**
 * Props for the schedules page client component.
 */
interface SchedulesPageClientProps {
	/** ISO string representing the initial calendar start date */
	initialStartDate: string;
	/** ISO string representing the initial calendar end date */
	initialEndDate: string;
}

/**
 * Client-side schedules experience with calendar, templates, and exceptions tabs.
 *
 * @param props - Component props including initial date range
 * @returns Tabbed scheduling experience
 */
export function SchedulesPageClient({
	initialStartDate,
	initialEndDate,
}: SchedulesPageClientProps): React.ReactElement {
	const { organizationId } = useOrgContext();
	const [activeTab, setActiveTab] = useState<'calendar' | 'templates' | 'exceptions'>('calendar');

	const employeeQueryParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			organizationId,
		}),
		[organizationId],
	);

	const locationQueryParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			organizationId,
		}),
		[organizationId],
	);

	const { data: employeesResponse } = useQuery({
		queryKey: queryKeys.employees.list(employeeQueryParams),
		queryFn: () => fetchEmployeesList(employeeQueryParams),
		enabled: Boolean(organizationId),
	});

	const { data: locationsResponse } = useQuery({
		queryKey: queryKeys.locations.list(locationQueryParams),
		queryFn: () => fetchLocationsList(locationQueryParams),
		enabled: Boolean(organizationId),
	});

	const { data: payrollSettings } = useQuery({
		queryKey: queryKeys.payrollSettings.current(organizationId),
		queryFn: () => fetchPayrollSettings(organizationId ?? undefined),
		enabled: Boolean(organizationId),
	});

	const employees: Employee[] = employeesResponse?.data ?? [];
	const locations: Location[] = locationsResponse?.data ?? [];
	const weekStartDay: number = payrollSettings?.weekStartDay ?? 1;
	const overtimeEnforcement = payrollSettings?.overtimeEnforcement ?? 'WARN';

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h1 className="text-3xl font-bold tracking-tight">Schedules</h1>
				<p className="text-muted-foreground">
					Manage schedule templates, exceptions, and calendar visibility.
				</p>
			</div>

			<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
				<TabsList>
					<TabsTrigger value="calendar">Calendar</TabsTrigger>
					<TabsTrigger value="templates">Templates</TabsTrigger>
					<TabsTrigger value="exceptions">Exceptions</TabsTrigger>
				</TabsList>

				<TabsContent value="calendar" className="space-y-4">
					<CalendarView
						initialStartDate={initialStartDate}
						initialEndDate={initialEndDate}
						employees={employees}
						locations={locations}
						organizationId={organizationId}
						weekStartDay={weekStartDay}
					/>
				</TabsContent>

				<TabsContent value="templates">
					<ScheduleTemplatesTab
						organizationId={organizationId}
						employees={employees}
						weekStartDay={weekStartDay}
						overtimeEnforcement={overtimeEnforcement}
					/>
				</TabsContent>

				<TabsContent value="exceptions">
					<ScheduleExceptionsTab
						organizationId={organizationId}
						employees={employees}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

