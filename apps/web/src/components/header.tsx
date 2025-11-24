"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Header component props interface.
 */
interface HeaderProps {
	/** Page title to display in the header */
	title?: string;
}

/**
 * Header component for the dashboard.
 * Displays the page title, user information, and sign-out option.
 *
 * @param props - Header component props
 * @returns Rendered header component
 */
export function Header({ title }: HeaderProps): React.JSX.Element {
	const router = useRouter();
	const { toast } = useToast();
	const { data: session, isPending } = useSession();

	/**
	 * Handles user sign-out.
	 * Clears the session and redirects to sign-in page.
	 */
	const handleSignOut = async (): Promise<void> => {
		try {
			await signOut();
			toast({
				title: "Signed out",
				description: "You have been signed out successfully.",
			});
			router.push("/sign-in");
			router.refresh();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to sign out. Please try again.",
				variant: "destructive",
			});
		}
	};

	return (
		<header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
			{/* Page Title */}
			<div>
				{title && (
					<h1 className="text-xl font-semibold text-foreground">{title}</h1>
				)}
			</div>

			{/* User Menu */}
			<div className="flex items-center gap-4">
				{isPending ? (
					<Skeleton className="h-8 w-32" />
				) : (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="gap-2">
								<User className="h-4 w-4" />
								<span className="max-w-[150px] truncate">
									{session?.user?.name ?? session?.user?.email ?? "User"}
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel>My Account</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem disabled className="text-sm text-muted-foreground">
								{session?.user?.email ?? "No email"}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={handleSignOut}
								className="text-destructive focus:text-destructive"
							>
								<LogOut className="mr-2 h-4 w-4" />
								Sign Out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
		</header>
	);
}
