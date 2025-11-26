import { EmployeesSkeleton } from '@/components/skeletons';

/**
 * Loading component for the Employees page.
 * Displayed automatically by Next.js while the page content is loading.
 *
 * @returns The employees loading skeleton
 */
export default function EmployeesLoading() {
	return <EmployeesSkeleton />;
}

