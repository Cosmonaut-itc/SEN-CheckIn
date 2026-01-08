import { redirect } from 'next/navigation';

/**
 * Login alias page.
 * Redirects users to the canonical sign-in route, preserving query parameters.
 *
 * @param props - Page props containing searchParams
 * @param props.searchParams - Promise containing URL search parameters
 * @returns Never - always redirects
 */
export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
	const params = await searchParams;

	// Build query string from search parameters
	const searchParamsObj = new URLSearchParams();
	
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			if (Array.isArray(value)) {
				// Handle array values (multiple query params with same key)
				for (const item of value) {
					searchParamsObj.append(key, item);
				}
			} else {
				searchParamsObj.set(key, value);
			}
		}
	}

	// Build the redirect URL with preserved query parameters
	const queryString = searchParamsObj.toString();
	const targetPath = queryString ? `/sign-in?${queryString}` : '/sign-in';
	
	redirect(targetPath);
}
