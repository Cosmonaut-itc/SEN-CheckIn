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
		<div className="relative -m-6 h-[calc(100vh-3.5rem)] min-h-[32rem]">
			<div className="absolute inset-0">
				<Skeleton className="h-full w-full rounded-none" />
			</div>

			<div className="pointer-events-none absolute inset-0">
				<div className="pointer-events-auto absolute left-4 right-4 top-4">
					<div className="rounded-xl border bg-background/80 p-4 shadow-sm backdrop-blur">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div className="space-y-2">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-5 w-56" />
							</div>
							<div className="flex flex-wrap gap-4">
								{Array.from({ length: 5 }).map((_, index) => (
									<div key={index} className="flex items-center gap-3">
										<Skeleton className="h-9 w-9 rounded-lg" />
										<div className="space-y-1">
											<Skeleton className="h-3 w-16" />
											<Skeleton className="h-5 w-10" />
										</div>
									</div>
								))}
							</div>
							<div className="flex flex-wrap gap-2">
								<Skeleton className="h-9 w-36" />
								<Skeleton className="h-9 w-40" />
							</div>
						</div>
					</div>
				</div>

				<div className="pointer-events-auto absolute bottom-4 right-4 top-24 w-full max-w-sm">
					<div className="flex h-full flex-col rounded-xl border bg-background/90 shadow-sm backdrop-blur">
						<div className="border-b p-4 space-y-3">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-2">
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-3 w-40" />
								</div>
								<Skeleton className="h-6 w-16 rounded-full" />
							</div>
							<Skeleton className="h-10 w-full" />
						</div>
						<div className="flex-1 space-y-6 p-4">
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-6 w-8 rounded-full" />
								</div>
								<div className="space-y-2">
									{Array.from({ length: 3 }).map((_, index) => (
										<div key={index} className="rounded-lg border px-4 py-3">
											<Skeleton className="h-4 w-40" />
											<Skeleton className="mt-2 h-3 w-20" />
										</div>
									))}
								</div>
							</div>
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-6 w-8 rounded-full" />
								</div>
								<div className="space-y-2">
									{Array.from({ length: 2 }).map((_, index) => (
										<div key={index} className="rounded-lg border px-4 py-3">
											<Skeleton className="h-4 w-36" />
											<Skeleton className="mt-2 h-3 w-24" />
										</div>
									))}
								</div>
							</div>
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-6 w-10 rounded-full" />
								</div>
								<div className="rounded-lg border p-3 space-y-2">
									<Skeleton className="h-4 w-44" />
									<Skeleton className="h-4 w-40" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
