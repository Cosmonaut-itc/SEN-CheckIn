"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Building2,
	Calendar,
	Home,
	Key,
	LayoutDashboard,
	MapPin,
	Monitor,
	Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Navigation item interface for sidebar links.
 */
interface NavItem {
	/** Display title for the navigation item */
	title: string;
	/** URL path for the navigation item */
	href: string;
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
	/** Optional description for tooltips */
	description?: string;
}

/**
 * Main navigation items for the dashboard sidebar.
 */
const navItems: NavItem[] = [
	{
		title: "Dashboard",
		href: "/dashboard",
		icon: Home,
		description: "Overview and statistics",
	},
	{
		title: "Employees",
		href: "/employees",
		icon: Users,
		description: "Manage employees and face enrollment",
	},
	{
		title: "Devices",
		href: "/devices",
		icon: Monitor,
		description: "Manage kiosk devices",
	},
	{
		title: "Locations",
		href: "/locations",
		icon: MapPin,
		description: "Manage office locations",
	},
	{
		title: "Clients",
		href: "/clients",
		icon: Building2,
		description: "Manage client organizations",
	},
	{
		title: "Attendance",
		href: "/attendance",
		icon: Calendar,
		description: "View attendance records",
	},
	{
		title: "API Keys",
		href: "/api-keys",
		icon: Key,
		description: "Manage API access keys",
	},
];

/**
 * Sidebar component for dashboard navigation.
 * Displays navigation links with icons and active state highlighting.
 *
 * @returns Rendered sidebar component
 */
export function Sidebar(): React.JSX.Element {
	const pathname = usePathname();

	return (
		<TooltipProvider delayDuration={0}>
			<aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-sidebar">
				<div className="flex h-full flex-col">
					{/* Logo / Brand */}
					<div className="flex h-16 items-center gap-2 border-b px-6">
						<LayoutDashboard className="h-6 w-6 text-sidebar-primary" />
						<span className="font-semibold text-lg text-sidebar-foreground">
							Sen Checkin
						</span>
					</div>

					{/* Navigation */}
					<nav className="flex-1 space-y-1 p-4">
						{navItems.map((item) => {
							const isActive =
								pathname === item.href ||
								(item.href !== "/dashboard" && pathname.startsWith(item.href));

							return (
								<Tooltip key={item.href}>
									<TooltipTrigger asChild>
										<Link href={item.href}>
											<Button
												variant={isActive ? "secondary" : "ghost"}
												className={cn(
													"w-full justify-start gap-3",
													isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
												)}
											>
												<item.icon className="h-4 w-4" />
												{item.title}
											</Button>
										</Link>
									</TooltipTrigger>
									<TooltipContent side="right" className="max-w-[200px]">
										{item.description}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</nav>

					{/* Footer */}
					<div className="border-t p-4">
						<Separator className="mb-4" />
						<p className="text-xs text-muted-foreground text-center">
							Sen Checkin Admin v0.0.1
						</p>
					</div>
				</div>
			</aside>
		</TooltipProvider>
	);
}
