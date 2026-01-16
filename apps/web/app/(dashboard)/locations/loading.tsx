import { LocationsSkeleton } from '@/components/skeletons/locations-skeleton';

/**
 * Loading component for the Locations page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The locations loading skeleton
 */
export default function LocationsLoading() {
	return <LocationsSkeleton />;
}
