import { OrganizationsSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Organizations page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The organizations loading skeleton
 */
export default function OrganizationsLoading() {
	return <OrganizationsSkeleton />;
}
