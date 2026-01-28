import React from 'react';
import { getTranslations } from 'next-intl/server';

import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Incapacities page.
 *
 * @returns Incapacities skeleton JSX element
 */
export async function IncapacitiesSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Incapacities');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.employee'),
				t('table.headers.type'),
				t('table.headers.period'),
				t('table.headers.days'),
				t('table.headers.status'),
				t('table.headers.actions'),
			]}
			rowCount={5}
			showSearch={false}
			showAddButton
			filterCount={4}
		/>
	);
}
