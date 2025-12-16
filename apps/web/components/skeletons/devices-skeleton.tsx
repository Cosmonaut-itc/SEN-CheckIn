import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Devices page.
 * Displays placeholder content matching the devices table layout.
 *
 * @returns The devices skeleton JSX element
 */
export async function DevicesSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Devices');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.code'),
				t('table.headers.name'),
				t('table.headers.type'),
				t('table.headers.location'),
				t('table.headers.status'),
				t('table.headers.lastHeartbeat'),
				t('table.headers.created'),
				t('table.headers.actions'),
			]}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}
