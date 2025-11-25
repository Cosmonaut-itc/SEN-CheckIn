import { redirect } from 'next/navigation';

/**
 * Root page component for the dashboard route group.
 * Redirects to the main dashboard page at /dashboard.
 *
 * @returns Never - always redirects
 */
export default function RootPage(): never {
	redirect('/dashboard');
}
