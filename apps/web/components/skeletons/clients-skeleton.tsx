import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Clients page.
 * Displays placeholder content matching the clients table layout.
 *
 * @returns The clients skeleton JSX element
 */
export function ClientsSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Clients"
			description="Manage client organizations"
			columns={['Name', 'API Key', 'Created', 'Actions']}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}

