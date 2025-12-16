import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the API Keys page.
 * Displays placeholder content matching the API keys table layout.
 *
 * @returns The API keys skeleton JSX element
 */
export async function ApiKeysSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('ApiKeys');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle')}
			columns={[
				t('table.headers.name'),
				t('table.headers.keyPreview'),
				t('table.headers.status'),
				t('table.headers.lastUsed'),
				t('table.headers.created'),
				t('table.headers.expires'),
				t('table.headers.actions'),
			]}
			rowCount={3}
			showSearch={false}
			showAddButton
		/>
	);
}
