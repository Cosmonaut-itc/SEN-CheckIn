'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { ArrowRight, Building2, ClipboardList, MapPin, Smartphone, Users } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

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
	key: 'employees' | 'devices' | 'locations' | 'clients' | 'attendance';
}

/**
 * Entity counts state interface.
 */
interface EntityCounts {
	employees: number | null;
	devices: number | null;
	locations: number | null;
	clients: number | null;
	attendance: number | null;
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
		title: 'Clients',
		description: 'Manage client organizations',
		href: '/clients',
		icon: Building2,
		key: 'clients',
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
 * Dashboard page component.
 * Displays entity counts and quick navigation cards.
 *
 * @returns The dashboard page JSX element
 */
export default function DashboardPage(): React.ReactElement {
	const [counts, setCounts] = useState<EntityCounts>({
		employees: null,
		devices: null,
		locations: null,
		clients: null,
		attendance: null,
	});
	const [isLoading, setIsLoading] = useState<boolean>(true);

	/**
	 * Fetches entity counts from the API on component mount.
	 */
	useEffect(() => {
		const fetchCounts = async (): Promise<void> => {
			try {
				// Fetch all counts in parallel
				const [employeesRes, devicesRes, locationsRes, clientsRes, attendanceRes] =
					await Promise.all([
						api.employees.get({ $query: { limit: 1, offset: 0 } }),
						api.devices.get({ $query: { limit: 1, offset: 0 } }),
						api.locations.get({ $query: { limit: 1, offset: 0 } }),
						api.clients.get({ $query: { limit: 1, offset: 0 } }),
						api.attendance.get({ $query: { limit: 1, offset: 0 } }),
					]);

				setCounts({
					employees: employeesRes.data?.pagination?.total ?? 0,
					devices: devicesRes.data?.pagination?.total ?? 0,
					locations: locationsRes.data?.pagination?.total ?? 0,
					clients: clientsRes.data?.pagination?.total ?? 0,
					attendance: attendanceRes.data?.pagination?.total ?? 0,
				});
			} catch (error) {
				console.error('Failed to fetch counts:', error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchCounts();
	}, []);

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
									{isLoading ? (
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

