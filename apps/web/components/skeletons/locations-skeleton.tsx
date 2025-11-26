import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Locations page.
 * Displays placeholder content matching the locations table layout.
 *
 * @returns The locations skeleton JSX element
 */
export function LocationsSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Locations"
			description="Manage branches and office locations"
			columns={['Code', 'Name', 'Address', 'Created', 'Actions']}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}

