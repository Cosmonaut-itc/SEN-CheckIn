'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { signOut, useSession } from '@/lib/auth-client';
import {
	Briefcase,
	Building,
	ClipboardList,
	Key,
	LayoutDashboard,
	LogOut,
	MapPin,
	CalendarCheck,
	CalendarDays,
	Clock3,
	HandCoins,
	FileText,
	Gift,
	Settings2,
	ShieldAlert,
	Smartphone,
	UserCog,
	Users,
	Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';

/**
 * Navigation item configuration interface.
 */
interface NavItem {
	/** Translation key for the navigation item title */
	titleKey: string;
	/** URL path for the navigation item */
	href: string;
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
}

/**
 * App sidebar props.
 */
interface AppSidebarProps {
	/** Whether the current user is a platform superuser */
	isSuperUser: boolean;
	/** Active organization role (if available) */
	organizationRole: 'admin' | 'owner' | 'member' | null;
	/** Whether disciplinary measures module is enabled for the active organization */
	enableDisciplinaryMeasures: boolean;
}

/**
 * Main navigation items for the dashboard.
 */
const mainNavItems: NavItem[] = [
	{
		titleKey: 'dashboard',
		href: '/dashboard',
		icon: LayoutDashboard,
	},
	{
		titleKey: 'employees',
		href: '/employees',
		icon: Users,
	},
	{
		titleKey: 'jobPositions',
		href: '/job-positions',
		icon: Briefcase,
	},
	{
		titleKey: 'devices',
		href: '/devices',
		icon: Smartphone,
	},
	{
		titleKey: 'locations',
		href: '/locations',
		icon: MapPin,
	},
	{
		titleKey: 'attendance',
		href: '/attendance',
		icon: ClipboardList,
	},
	{
		titleKey: 'schedules',
		href: '/schedules',
		icon: CalendarDays,
	},
	{
		titleKey: 'vacations',
		href: '/vacations',
		icon: CalendarCheck,
	},
	{
		titleKey: 'incapacities',
		href: '/incapacities',
		icon: FileText,
	},
	{
		titleKey: 'payroll',
		href: '/payroll',
		icon: Wallet,
	},
];

/**
 * Shared navigation items for all users that live between the main and admin sections.
 */
const sharedNavItems: NavItem[] = [
	{
		titleKey: 'mobileApp',
		href: '/app-movil',
		icon: Smartphone,
	},
];

const documentationUrl =
	'https://www.notion.so/Documentaci-n-34830502557e81bdad7fcd4fe21ddb64?source=copy_link';

/**
 * Admin navigation items.
 */
const adminNavItems: NavItem[] = [
	{
		titleKey: 'apiKeys',
		href: '/api-keys',
		icon: Key,
	},
	{
		titleKey: 'payrollSettings',
		href: '/payroll-settings',
		icon: Settings2,
	},
	{
		titleKey: 'overtimeAuthorizations',
		href: '/overtime-authorizations',
		icon: Clock3,
	},
	{
		titleKey: 'deductions',
		href: '/deductions',
		icon: HandCoins,
	},
	{
		titleKey: 'gratifications',
		href: '/gratifications',
		icon: Gift,
	},
	{
		titleKey: 'users',
		href: '/users',
		icon: UserCog,
	},
	{
		titleKey: 'organizations',
		href: '/organizations',
		icon: Building,
	},
];

/**
 * Application sidebar component.
 * Provides navigation for the admin portal with user info and sign out functionality.
 *
 * @param props - Component props
 * @returns The app sidebar JSX element
 */
export function AppSidebar({
	isSuperUser,
	organizationRole,
	enableDisciplinaryMeasures,
}: AppSidebarProps): React.ReactElement {
	const pathname = usePathname();
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const tSidebar = useTranslations('Sidebar');
	const tApp = useTranslations('App');
	const canAccessAdmin =
		isSuperUser || organizationRole === 'admin' || organizationRole === 'owner';
	const resolvedMainNavItems: NavItem[] =
		canAccessAdmin && enableDisciplinaryMeasures
			? [
					...mainNavItems,
					{
						titleKey: 'disciplinaryMeasures',
						href: '/disciplinary-measures',
						icon: ShieldAlert,
					},
				]
			: mainNavItems;

	/**
	 * Handles user sign out.
	 *
	 * @returns Promise that resolves when the sign-out flow completes
	 */
	const handleSignOut = async (): Promise<void> => {
		const result = await signOut();
		if (result?.error) {
			console.error('Failed to sign out', result.error);
			return;
		}
		router.push('/sign-in');
		router.refresh();
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
					<span className="text-lg font-semibold tracking-tight">{tApp('name')}</span>
				</Link>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{tSidebar('main')}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{resolvedMainNavItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={
											pathname === item.href ||
											pathname.startsWith(`${item.href}/`)
										}
										tooltip={tSidebar(item.titleKey)}
									>
										<Link href={item.href}>
											<item.icon className="h-4 w-4" />
											<span>{tSidebar(item.titleKey)}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarGroupLabel>{tSidebar('resources')}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{sharedNavItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={
											pathname === item.href ||
											pathname.startsWith(`${item.href}/`)
										}
										tooltip={tSidebar(item.titleKey)}
									>
										<Link href={item.href}>
											<item.icon className="h-4 w-4" />
											<span>{tSidebar(item.titleKey)}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{canAccessAdmin ? (
					<SidebarGroup data-testid="app-sidebar-admin-group">
						<SidebarGroupLabel>{tSidebar('administration')}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{adminNavItems.map((item) => (
									<SidebarMenuItem key={item.href}>
										<SidebarMenuButton
											asChild
											isActive={
												pathname === item.href ||
												pathname.startsWith(`${item.href}/`)
											}
											tooltip={tSidebar(item.titleKey)}
										>
											<Link href={item.href}>
												<item.icon className="h-4 w-4" />
												<span>{tSidebar(item.titleKey)}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				) : null}
			</SidebarContent>

			<SidebarFooter className="border-t border-sidebar-border">
				<div className="px-2 py-2">
					<Button asChild variant="ghost" className="w-full justify-start gap-2 px-3">
						<a href={documentationUrl} target="_blank" rel="noreferrer">
							<span>{tSidebar('documentation')}</span>
						</a>
					</Button>
				</div>
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
								<AvatarImage
									src={session?.user?.image ?? undefined}
									alt={
										session?.user?.name
											? tSidebar('userAvatarAlt', {
													name: session.user.name,
												})
											: tSidebar('userAvatarAltFallback')
									}
								/>
								<AvatarFallback className="bg-primary/10 text-primary text-sm">
									{getInitials(session?.user?.name)}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-1 flex-col truncate">
								<div className="flex items-center gap-2 truncate">
									<span className="min-w-0 truncate text-sm font-medium">
										{session?.user?.name ?? tSidebar('userFallback')}
									</span>
									{isSuperUser ? (
										<Badge variant="outline" className="text-[10px]">
											{tSidebar('superUserBadge')}
										</Badge>
									) : null}
								</div>
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
						aria-label={tSidebar('signOut')}
						title={tSidebar('signOut')}
					>
						<LogOut className="h-4 w-4" />
					</Button>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
