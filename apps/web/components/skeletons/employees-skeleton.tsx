import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Employees page.
 * Displays placeholder content matching the employees table layout.
 *
 * @returns The employees skeleton JSX element
 */
export async function EmployeesSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Employees');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.code'),
				t('table.headers.name'),
				t('table.headers.jobPosition'),
				t('table.headers.location'),
				t('table.headers.email'),
				t('table.headers.department'),
				t('table.headers.shift'),
				t('table.headers.status'),
				t('table.headers.face'),
				t('table.headers.created'),
				t('table.headers.actions'),
			]}
			rowCount={5}
			showSearch
			showAddButton
		/>
	);
}
