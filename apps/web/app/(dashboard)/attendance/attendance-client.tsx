'use client';

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Calendar, RefreshCw } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';
import { fetchAttendanceRecords, type AttendanceRecord, type AttendanceType } from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';

/**
 * Date filter preset options.
 */
type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

/**
 * Type badge variant mapping.
 */
const typeVariants: Record<AttendanceType, 'default' | 'secondary'> = {
	CHECK_IN: 'default',
	CHECK_OUT: 'secondary',
};

/**
 * Attendance page client component.
 * Provides a list view with date-fns based filtering using TanStack Query.
 *
 * @returns The attendance page JSX element
 */
export function AttendancePageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const [search, setSearch] = useState<string>('');
	const [datePreset, setDatePreset] = useState<DatePreset>('today');
	const [startDate, setStartDate] = useState<string>(format(startOfDay(new Date()), 'yyyy-MM-dd'));
	const [endDate, setEndDate] = useState<string>(format(endOfDay(new Date()), 'yyyy-MM-dd'));
	const [typeFilter, setTypeFilter] = useState<AttendanceType | 'all'>('all');

	/**
	 * Computes date range based on preset selection.
	 *
	 * @param preset - The selected date preset
	 * @returns Object with start and end date
	 */
	const getDateRange = useCallback((preset: DatePreset): { start: Date; end: Date } => {
		const now = new Date();
		let start: Date;
		let end: Date;

		switch (preset) {
			case 'today':
				start = startOfDay(now);
				end = endOfDay(now);
				break;
			case 'yesterday':
				start = startOfDay(subDays(now, 1));
				end = endOfDay(subDays(now, 1));
				break;
			case 'this_week':
				start = startOfWeek(now, { weekStartsOn: 1 });
				end = endOfWeek(now, { weekStartsOn: 1 });
				break;
			case 'this_month':
				start = startOfMonth(now);
				end = endOfMonth(now);
				break;
			case 'custom':
			default:
				// Ensure we always have valid dates even if inputs are empty.
				const startValue = startDate ? new Date(startDate) : now;
				const endValue = endDate ? new Date(endDate) : now;
				start = startOfDay(startValue);
				end = endOfDay(endValue);
				break;
		}

		return { start, end };
	}, [startDate, endDate]);

	// Get the current date range for the query
	const { start, end } = getDateRange(datePreset);

	// Build query params - only include type if it's not 'all'
	const baseParams = { limit: 100, offset: 0, fromDate: start, toDate: end, organizationId };
	const queryParams =
		typeFilter !== 'all' ? { ...baseParams, type: typeFilter } : baseParams;

	// Query for attendance records
	const { data, isFetching, refetch } = useQuery({
		queryKey: queryKeys.attendance.list(queryParams),
		queryFn: () => fetchAttendanceRecords(queryParams),
		enabled: Boolean(organizationId),
	});

	const records = data?.data ?? [];

	/**
	 * Updates date preset and syncs date inputs.
	 *
	 * @param preset - The new date preset value
	 */
	const handlePresetChange = (preset: DatePreset): void => {
		setDatePreset(preset);
		if (preset !== 'custom') {
			const { start: newStart, end: newEnd } = getDateRange(preset);
			setStartDate(format(newStart, 'yyyy-MM-dd'));
			setEndDate(format(newEnd, 'yyyy-MM-dd'));
		}
	};

	/**
	 * Filters records by employee ID search.
	 */
	const filteredRecords = records.filter((record: AttendanceRecord) =>
		search ? record.employeeId.toLowerCase().includes(search.toLowerCase()) : true
	);

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
				<p className="text-muted-foreground">
					Select an active organization to view attendance records.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
					<p className="text-muted-foreground">
						View attendance check-in and check-out records
					</p>
				</div>
				<Button onClick={() => refetch()} variant="outline">
					<RefreshCw className="mr-2 h-4 w-4" />
					Refresh
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by employee ID..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<Select value={datePreset} onValueChange={handlePresetChange}>
						<SelectTrigger className="w-[150px]">
							<SelectValue placeholder="Date range" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="today">Today</SelectItem>
							<SelectItem value="yesterday">Yesterday</SelectItem>
							<SelectItem value="this_week">This Week</SelectItem>
							<SelectItem value="this_month">This Month</SelectItem>
							<SelectItem value="custom">Custom</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{datePreset === 'custom' && (
					<>
						<Input
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
							className="w-[150px]"
						/>
						<span className="text-muted-foreground">to</span>
						<Input
							type="date"
							value={endDate}
							onChange={(e) => setEndDate(e.target.value)}
							className="w-[150px]"
						/>
					</>
				)}

				<Select
					value={typeFilter}
					onValueChange={(value: AttendanceType | 'all') => setTypeFilter(value)}
				>
					<SelectTrigger className="w-[130px]">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Types</SelectItem>
						<SelectItem value="CHECK_IN">Check In</SelectItem>
						<SelectItem value="CHECK_OUT">Check Out</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Employee ID</TableHead>
							<TableHead>Device ID</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Timestamp</TableHead>
							<TableHead>Date</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 10 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 5 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : filteredRecords.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="h-24 text-center">
									No attendance records found for the selected period.
								</TableCell>
							</TableRow>
						) : (
							filteredRecords.map((record: AttendanceRecord) => (
								<TableRow key={record.id}>
									<TableCell className="font-mono text-xs">
										{record.employeeId.substring(0, 8)}...
									</TableCell>
									<TableCell className="font-mono text-xs">
										{record.deviceId.substring(0, 8)}...
									</TableCell>
									<TableCell>
										<Badge variant={typeVariants[record.type]}>
											{record.type === 'CHECK_IN' ? 'Check In' : 'Check Out'}
										</Badge>
									</TableCell>
									<TableCell>
										{format(new Date(record.timestamp), 'HH:mm:ss')}
									</TableCell>
									<TableCell>
										{format(new Date(record.timestamp), 'MMM d, yyyy')}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{!isFetching && filteredRecords.length > 0 && (
				<p className="text-sm text-muted-foreground">
					Showing {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
				</p>
			)}
		</div>
	);
}
