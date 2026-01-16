import { DashboardSkeleton } from '@/components/skeletons/dashboard-skeleton';

/**
 * Loading component for the Dashboard page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The dashboard loading skeleton
 */
export default function DashboardLoading() {
	return <DashboardSkeleton />;
}
