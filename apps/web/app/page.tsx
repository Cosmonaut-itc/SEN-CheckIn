import { redirect } from 'next/navigation';

/**
 * Root page component.
 * Redirects to the dashboard as the main entry point.
 *
 * @returns Never - always redirects
 */
export default function Home(): never {
	redirect('/dashboard');
}
