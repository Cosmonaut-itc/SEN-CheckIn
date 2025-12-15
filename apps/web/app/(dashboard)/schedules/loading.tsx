import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';

/**
 * Loading skeleton for the schedules dashboard page.
 *
 * @returns Skeleton placeholders while scheduling data loads
 */
export default function SchedulesLoading(): React.ReactElement {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-4 w-80" />
			</div>
			<div className="flex gap-3">
				<Skeleton className="h-10 w-28" />
				<Skeleton className="h-10 w-28" />
				<Skeleton className="h-10 w-28" />
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div key={index} className="space-y-3 rounded-lg border p-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
						<div className="grid grid-cols-3 gap-2">
							{Array.from({ length: 6 }).map((_, dayIdx) => (
								<Skeleton key={dayIdx} className="h-6 w-full" />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
