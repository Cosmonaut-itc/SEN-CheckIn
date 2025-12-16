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
import { useTranslations } from 'next-intl';

/**
 * Entity count card configuration interface.
 */
interface EntityCardConfig {
	/** Translation key for the display title */
	titleKey: string;
	/** Translation key for the description text */
	descriptionKey: string;
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
		titleKey: 'cards.employees.title',
		descriptionKey: 'cards.employees.description',
		href: '/employees',
		icon: Users,
		key: 'employees',
	},
	{
		titleKey: 'cards.devices.title',
		descriptionKey: 'cards.devices.description',
		href: '/devices',
		icon: Smartphone,
		key: 'devices',
	},
	{
		titleKey: 'cards.locations.title',
		descriptionKey: 'cards.locations.description',
		href: '/locations',
		icon: MapPin,
		key: 'locations',
	},
	{
		titleKey: 'cards.organizations.title',
		descriptionKey: 'cards.organizations.description',
		href: '/organizations',
		icon: Building,
		key: 'organizations',
	},
	{
		titleKey: 'cards.attendance.title',
		descriptionKey: 'cards.attendance.description',
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
	const t = useTranslations('Dashboard');
	const { data: counts, isFetching } = useSuspenseQuery({
		queryKey: queryKeys.dashboard.counts(organizationId),
		queryFn: () => fetchDashboardCounts({ organizationId }),
	});

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('subtitle')}</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{entityCards.map((card) => (
					<Link key={card.key} href={card.href} className="group">
						<Card className="h-full transition-colors hover:border-primary/50">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">
									{t(card.titleKey)}
								</CardTitle>
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
									{t(card.descriptionKey)}
								</CardDescription>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
