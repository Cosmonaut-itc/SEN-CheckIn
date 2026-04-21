import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Editorial loading shell for the redesigned dashboard.
 *
 * @returns The dashboard v2 skeleton layout
 */
export function DashboardSkeleton(): React.ReactElement {
	return (
		<div className="space-y-5 overflow-y-auto px-6 pb-8 pt-6">
			<header
				className="grid gap-5 border-b border-[color:var(--border-subtle)] pb-5 lg:grid-cols-[minmax(0,1fr)_auto]"
				data-testid="dashboard-skeleton-hero"
			>
				<div className="space-y-3">
					<Skeleton className="h-3 w-40" />
					<Skeleton className="h-16 w-full max-w-2xl" />
					<Skeleton className="h-4 w-full max-w-xl" />
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
					<div className="rounded-2xl border border-[color:var(--border-subtle)] bg-foreground p-5 shadow-[var(--shadow-lg)]">
						<div className="space-y-4">
							<Skeleton className="h-4 w-24 bg-background/15" />
							<Skeleton className="h-14 w-40 bg-background/15" />
							<div className="flex gap-2">
								<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
								<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
								<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
							</div>
						</div>
					</div>
					<Skeleton className="h-10 w-10 rounded-full" />
				</div>
			</header>

			<div
				className="grid gap-4 lg:grid-cols-[minmax(0,2.25fr)_minmax(320px,1fr)]"
				data-testid="dashboard-skeleton-grid"
			>
				<section
					className="overflow-hidden rounded-[1.25rem] border border-[color:var(--border-subtle)]"
					data-testid="dashboard-skeleton-map"
				>
					<div className="space-y-3 border-b border-[color:var(--border-subtle)] p-5">
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-6 w-48" />
						<div className="flex gap-2">
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="h-6 w-24 rounded-full" />
							<Skeleton className="h-6 w-32 rounded-full" />
						</div>
					</div>
					<div className="relative h-[32rem]">
						<Skeleton className="h-full w-full rounded-none" />
						<div className="absolute inset-x-4 bottom-4 rounded-2xl border border-[color:var(--border-subtle)] bg-background/90 p-4 backdrop-blur">
							<Skeleton className="h-4 w-32" />
							<div className="mt-4 grid grid-cols-5 gap-2">
								{Array.from({ length: 15 }).map((_, index) => (
									<Skeleton key={index} className="h-14 w-full" />
								))}
							</div>
						</div>
					</div>
				</section>

				<section
					className="rounded-[1.25rem] border border-[color:var(--border-subtle)] p-5"
					data-testid="dashboard-skeleton-location-rail"
				>
					<div className="space-y-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-6 w-36" />
						<Skeleton className="h-10 w-full" />
					</div>
					<div className="mt-4 space-y-3">
						{Array.from({ length: 4 }).map((_, index) => (
							<div
								key={index}
								className="rounded-2xl border border-[color:var(--border-subtle)] p-4"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-2">
										<Skeleton className="h-8 w-16" />
										<Skeleton className="h-4 w-28" />
										<Skeleton className="h-3 w-20" />
									</div>
									<Skeleton className="h-6 w-16 rounded-full" />
								</div>
							</div>
						))}
					</div>
				</section>

				<section
					className="rounded-[1.25rem] border border-[color:var(--border-subtle)] p-5"
					data-testid="dashboard-skeleton-timeline"
				>
					<div className="space-y-3">
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-6 w-40" />
						<div className="flex gap-2">
							<Skeleton className="h-8 w-20 rounded-full" />
							<Skeleton className="h-8 w-20 rounded-full" />
							<Skeleton className="h-8 w-24 rounded-full" />
						</div>
					</div>
					<div className="mt-5 space-y-4">
						<Skeleton className="h-4 w-full" />
						<div className="space-y-3">
							{Array.from({ length: 4 }).map((_, index) => (
								<div key={index} className="flex items-center gap-3">
									<Skeleton className="h-10 w-10 rounded-full" />
									<Skeleton className="h-10 flex-1" />
								</div>
							))}
						</div>
						<Skeleton className="h-4 w-44" />
					</div>
				</section>

				<div className="grid gap-4" data-testid="dashboard-skeleton-aux">
					<section className="rounded-[1.25rem] border border-[color:var(--border-subtle)] p-5">
						<div className="space-y-3">
							<Skeleton className="h-3 w-28" />
							<Skeleton className="h-6 w-40" />
						</div>
						<div className="mt-4 space-y-3">
							{Array.from({ length: 3 }).map((_, index) => (
								<div key={index} className="rounded-2xl border border-[color:var(--border-subtle)] p-4">
									<div className="flex items-center justify-between gap-3">
										<div className="space-y-2">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-3 w-24" />
										</div>
										<Skeleton className="h-8 w-20" />
									</div>
								</div>
							))}
						</div>
					</section>

					<section className="rounded-[1.25rem] border border-[color:var(--border-subtle)] p-5">
						<div className="space-y-3">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-6 w-32" />
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
							{Array.from({ length: 3 }).map((_, index) => (
								<div key={index} className="rounded-2xl border border-[color:var(--border-subtle)] p-4">
									<div className="flex items-center gap-3">
										<Skeleton className="h-10 w-10 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-28" />
											<Skeleton className="h-3 w-20" />
										</div>
										<Skeleton className="h-5 w-12" />
									</div>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
