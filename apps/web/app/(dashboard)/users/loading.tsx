import { UsersSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Users page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The users loading skeleton
 */
export default function UsersLoading() {
	return <UsersSkeleton />;
}

