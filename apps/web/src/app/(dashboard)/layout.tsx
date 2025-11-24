import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";

/**
 * Dashboard layout props interface.
 */
interface DashboardLayoutProps {
	children: ReactNode;
}

/**
 * Dashboard layout component.
 * Provides the sidebar navigation and main content area.
 *
 * @param props - Layout props containing children
 * @returns Rendered dashboard layout
 */
export default function DashboardLayout({
	children,
}: DashboardLayoutProps): React.JSX.Element {
	return (
		<div className="min-h-screen bg-background">
			<Sidebar />
			<main className="ml-64">
				{children}
			</main>
		</div>
	);
}
