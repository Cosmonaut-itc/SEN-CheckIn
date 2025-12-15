import { DevicesSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Devices page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The devices loading skeleton
 */
export default function DevicesLoading() {
	return <DevicesSkeleton />;
}
