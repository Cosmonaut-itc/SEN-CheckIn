'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { fetchDashboardCounts, type DashboardCounts } from '@/lib/client-functions';
import { ArrowRight, Building, ClipboardList, MapPin, Smartphone, Users } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useOrgContext } from '@/lib/org-client-context';

/**
 * Entity count card configuration interface.
 */
interface EntityCardConfig {
	/** Display title */
	title: string;
	/** Description text */
	description: string;
	/** Route path for navigation */
	href: string;
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
	/** Key for the count data */
	key: keyof DashboardCounts;
}

/**
 * Entity card configurations for the dashboard.
 */
const entityCards: EntityCardConfig[] = [
	{
		title: 'Employees',
		description: 'Manage employee records and face enrollment',
		href: '/employees',
		icon: Users,
		key: 'employees',
	},
	{
		title: 'Devices',
		description: 'Manage check-in kiosks and devices',
		href: '/devices',
		icon: Smartphone,
		key: 'devices',
	},
	{
		title: 'Locations',
		description: 'Manage branches and office locations',
		href: '/locations',
		icon: MapPin,
		key: 'locations',
	},
	{
		title: 'Organizations',
		description: 'Manage BetterAuth organizations',
		href: '/organizations',
		icon: Building,
		key: 'organizations',
	},
	{
		title: 'Attendance',
		description: 'View attendance records and reports',
		href: '/attendance',
		icon: ClipboardList,
		key: 'attendance',
	},
];

/**
 * Dashboard page client component.
 * Displays entity counts and quick navigation cards.
 *
 * Uses useSuspenseQuery to consume prefetched data from the server,
 * enabling streaming SSR with React Query.
 *
 * @returns The dashboard page JSX element
 */
export function DashboardPageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const { data: counts, isFetching } = useSuspenseQuery({
		queryKey: queryKeys.dashboard.counts(organizationId),
		queryFn: () => fetchDashboardCounts({ organizationId }),
	});

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground">Welcome to the SEN CheckIn admin portal</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{entityCards.map((card) => (
					<Link key={card.key} href={card.href} className="group">
						<Card className="h-full transition-colors hover:border-primary/50">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">{card.title}</CardTitle>
								<card.icon className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="flex items-baseline justify-between">
									{isFetching ? (
										<Skeleton className="h-8 w-16" />
									) : (
										<span className="text-3xl font-bold">
											{counts[card.key]?.toLocaleString() ?? '0'}
										</span>
									)}
									<ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
								</div>
								<CardDescription className="mt-2">
									{card.description}
								</CardDescription>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
