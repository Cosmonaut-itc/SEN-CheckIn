import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import React from 'react';

/**
 * Skeleton component for the Attendance page.
 * Displays placeholder content matching the attendance table layout with filters.
 *
 * @returns The attendance skeleton JSX element
 */
export function AttendanceSkeleton(): React.ReactElement {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
					<p className="text-muted-foreground">
						View attendance check-in and check-out records
					</p>
				</div>
				<Skeleton className="h-10 w-24" />
			</div>

			{/* Filters row */}
			<div className="flex flex-wrap items-center gap-4">
				{/* Search input */}
				<div className="relative flex-1 max-w-sm">
					<Skeleton className="h-10 w-full" />
				</div>
				{/* Date preset selector */}
				<Skeleton className="h-10 w-[150px]" />
				{/* Type filter */}
				<Skeleton className="h-10 w-[130px]" />
			</div>

			{/* Table skeleton */}
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
						{Array.from({ length: 10 }).map((_, i) => (
							<TableRow key={i}>
								{Array.from({ length: 5 }).map((_, j) => (
									<TableCell key={j}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{/* Results count skeleton */}
			<Skeleton className="h-4 w-32" />
		</div>
	);
}

