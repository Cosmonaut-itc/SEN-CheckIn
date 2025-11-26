import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Devices page.
 * Displays placeholder content matching the devices table layout.
 *
 * @returns The devices skeleton JSX element
 */
export function DevicesSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Devices"
			description="Manage check-in kiosks and devices"
			columns={['Code', 'Name', 'Type', 'Status', 'Last Heartbeat', 'Created', 'Actions']}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}

