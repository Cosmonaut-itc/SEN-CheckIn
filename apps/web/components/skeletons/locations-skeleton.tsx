import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Locations page.
 * Displays placeholder content matching the locations table layout.
 *
 * @returns The locations skeleton JSX element
 */
export async function LocationsSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Locations');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.code'),
				t('table.headers.name'),
				t('table.headers.address'),
				t('table.headers.zone'),
				t('table.headers.timeZone'),
				t('table.headers.created'),
				t('table.headers.actions'),
			]}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}
