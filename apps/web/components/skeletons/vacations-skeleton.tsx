import React from 'react';
import { getTranslations } from 'next-intl/server';

import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Vacations page.
 *
 * @returns Vacations skeleton JSX element
 */
export async function VacationsSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Vacations');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.employee'),
				t('table.headers.period'),
				t('table.headers.days'),
				t('table.headers.status'),
				t('table.headers.actions'),
			]}
			rowCount={5}
			showSearch={false}
			showAddButton
			filterCount={2}
		/>
	);
}
