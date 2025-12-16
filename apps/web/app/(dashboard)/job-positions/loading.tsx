import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';

/**
 * Loading skeleton for the job positions page.
 * Displays while the page is being loaded.
 *
 * @returns The loading skeleton JSX element
 */
export default function JobPositionsLoading(): React.ReactElement {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<Skeleton className="h-9 w-48" />
					<Skeleton className="mt-2 h-5 w-64" />
				</div>
				<Skeleton className="h-10 w-36" />
			</div>

			<div className="flex items-center gap-4">
				<Skeleton className="h-10 w-64" />
			</div>

			<div className="rounded-md border">
				<div className="p-4 space-y-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4">
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-8 w-8" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
