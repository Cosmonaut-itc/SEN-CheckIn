import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Users page.
 * Displays placeholder content matching the users table layout.
 *
 * @returns The users skeleton JSX element
 */
export function UsersSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="Users"
			description="Manage user accounts and permissions (Admin only)"
			columns={['User', 'Email', 'Role', 'Status', 'Verified', 'Joined', 'Actions']}
			rowCount={5}
			showSearch
			showAddButton={false}
		/>
	);
}

