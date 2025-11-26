import { ClientsSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Clients page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The clients loading skeleton
 */
export default function ClientsLoading() {
	return <ClientsSkeleton />;
}

