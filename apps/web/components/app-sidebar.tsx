'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	Users,
	Smartphone,
	MapPin,
	Building2,
	ClipboardList,
	Key,
	UserCog,
	Building,
	LayoutDashboard,
	LogOut,
	Briefcase,
} from 'lucide-react';
import { signOut, useSession } from '@/lib/auth-client';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Navigation item configuration interface.
 */
interface NavItem {
	/** Display title for the navigation item */
	title: string;
	/** URL path for the navigation item */
	href: string;
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
}

/**
 * Main navigation items for the dashboard.
 */
const mainNavItems: NavItem[] = [
	{
		title: 'Dashboard',
		href: '/dashboard',
		icon: LayoutDashboard,
	},
	{
		title: 'Employees',
		href: '/employees',
		icon: Users,
	},
	{
		title: 'Job Positions',
		href: '/job-positions',
		icon: Briefcase,
	},
	{
		title: 'Devices',
		href: '/devices',
		icon: Smartphone,
	},
	{
		title: 'Locations',
		href: '/locations',
		icon: MapPin,
	},
	{
		title: 'Clients',
		href: '/clients',
		icon: Building2,
	},
	{
		title: 'Attendance',
		href: '/attendance',
		icon: ClipboardList,
	},
];

/**
 * Admin navigation items.
 */
const adminNavItems: NavItem[] = [
	{
		title: 'API Keys',
		href: '/api-keys',
		icon: Key,
	},
	{
		title: 'Users',
		href: '/users',
		icon: UserCog,
	},
	{
		title: 'Organizations',
		href: '/organizations',
		icon: Building,
	},
];

/**
 * Application sidebar component.
 * Provides navigation for the admin portal with user info and sign out functionality.
 *
 * @returns The app sidebar JSX element
 */
export function AppSidebar(): React.ReactElement {
	const pathname = usePathname();
	const { data: session, isPending } = useSession();

	/**
	 * Handles user sign out.
	 */
	const handleSignOut = async (): Promise<void> => {
		await signOut();
	};

	/**
	 * Gets user initials from name for avatar fallback.
	 *
	 * @param name - User's full name
	 * @returns Two-letter initials
	 */
	const getInitials = (name: string | undefined): string => {
		if (!name) return 'U';
		const parts = name.split(' ');
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}
		return name.substring(0, 2).toUpperCase();
	};

	return (
		<Sidebar>
			<SidebarHeader className="border-b border-sidebar-border px-4 py-3">
				<Link href="/dashboard" className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<ClipboardList className="h-4 w-4" />
					</div>
					<span className="text-lg font-semibold tracking-tight">
						SEN CheckIn
					</span>
				</Link>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Main</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{mainNavItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
										tooltip={item.title}
									>
										<Link href={item.href}>
											<item.icon className="h-4 w-4" />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarGroupLabel>Administration</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{adminNavItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
										tooltip={item.title}
									>
										<Link href={item.href}>
											<item.icon className="h-4 w-4" />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="border-t border-sidebar-border">
				<div className="flex items-center gap-3 px-2 py-2">
					{isPending ? (
						<>
							<Skeleton className="h-9 w-9 rounded-full" />
							<div className="flex flex-1 flex-col gap-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-32" />
							</div>
						</>
					) : (
						<>
							<Avatar className="h-9 w-9">
								<AvatarImage src={session?.user?.image ?? undefined} />
								<AvatarFallback className="bg-primary/10 text-primary text-sm">
									{getInitials(session?.user?.name)}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-1 flex-col truncate">
								<span className="truncate text-sm font-medium">
									{session?.user?.name ?? 'User'}
								</span>
								<span className="truncate text-xs text-muted-foreground">
									{session?.user?.email ?? ''}
								</span>
							</div>
						</>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={handleSignOut}
						className="h-8 w-8 shrink-0"
						title="Sign out"
					>
						<LogOut className="h-4 w-4" />
					</Button>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

