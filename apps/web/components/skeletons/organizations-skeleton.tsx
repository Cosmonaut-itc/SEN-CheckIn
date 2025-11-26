import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Organizations page.
 * Displays placeholder content matching the organizations table layout.
 *
 * @returns The organizations skeleton JSX element
 */
export function OrganizationsSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Organizations"
			description="Manage organizations and their members"
			columns={['Name', 'Slug', 'Created', 'Actions']}
			rowCount={3}
			showSearch
			showAddButton
		/>
	);
}

