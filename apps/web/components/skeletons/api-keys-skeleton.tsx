import React from 'react';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the API Keys page.
 * Displays placeholder content matching the API keys table layout.
 *
 * @returns The API keys skeleton JSX element
 */
export function ApiKeysSkeleton(): React.ReactElement {
	return (
		<TablePageSkeleton
			title="API Keys"
			description="Manage API keys for authentication"
			columns={['Name', 'Key Preview', 'Status', 'Last Used', 'Created', 'Expires', 'Actions']}
			rowCount={3}
			showSearch={false}
			showAddButton
		/>
	);
}

