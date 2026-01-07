import { redirect } from 'next/navigation';

/**
 * Login alias page.
 * Redirects users to the canonical sign-in route.
 *
 * @returns Never - always redirects
 */
export default function LoginPage(): never {
	redirect('/sign-in');
}
