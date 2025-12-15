import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';

/**
 * Skeleton component for the Dashboard page.
 * Displays placeholder cards matching the dashboard entity cards layout.
 *
 * @returns The dashboard skeleton JSX element
 */
export function DashboardSkeleton(): React.ReactElement {
	return (
		<div className="space-y-8">
			{/* Header skeleton */}
			<div>
				<Skeleton className="h-9 w-48" />
				<Skeleton className="mt-2 h-5 w-72" />
			</div>

			{/* Entity cards grid skeleton */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 5 }).map((_, i) => (
					<Card key={i} className="h-full">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-4" />
						</CardHeader>
						<CardContent>
							<div className="flex items-baseline justify-between">
								<Skeleton className="h-8 w-16" />
								<Skeleton className="h-4 w-4" />
							</div>
							<Skeleton className="mt-2 h-4 w-full" />
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
