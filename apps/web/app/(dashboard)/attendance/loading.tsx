import { AttendanceSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Attendance page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The attendance loading skeleton
 */
export default function AttendanceLoading() {
	return <AttendanceSkeleton />;
}
