import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Organizations page.
 * Displays placeholder content matching the organizations table layout.
 *
 * @returns The organizations skeleton JSX element
 */
export async function OrganizationsSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Organizations');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.name'),
				t('table.headers.slug'),
				t('table.headers.created'),
				t('table.headers.actions'),
			]}
			rowCount={3}
			showSearch
			showAddButton
		/>
	);
}
