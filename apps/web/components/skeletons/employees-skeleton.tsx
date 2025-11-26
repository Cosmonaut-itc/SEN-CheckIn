import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Employees page.
 * Displays placeholder content matching the employees table layout.
 *
 * @returns The employees skeleton JSX element
 */
export function EmployeesSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Employees"
			description="Manage employee records and face enrollment"
			columns={['Code', 'Name', 'Email', 'Department', 'Status', 'Created', 'Actions']}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}

