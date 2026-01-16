import { ApiKeysSkeleton } from '@/components/skeletons/api-keys-skeleton';

/**
 * Loading component for the API Keys page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The API keys loading skeleton
 */
export default function ApiKeysLoading() {
	return <ApiKeysSkeleton />;
}
