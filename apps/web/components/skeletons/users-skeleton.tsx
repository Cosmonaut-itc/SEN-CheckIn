import React from 'react';
import { getTranslations } from 'next-intl/server';
import { TablePageSkeleton } from './table-page-skeleton';

/**
 * Skeleton component for the Users page.
 * Displays placeholder content matching the users table layout.
 *
 * @returns The users skeleton JSX element
 */
export async function UsersSkeleton(): Promise<React.ReactElement> {
	const t = await getTranslations('Users');
	const organization = t('fallbackOrganization');

	return (
		<TablePageSkeleton
			title={t('title')}
			description={t('subtitle', { organization })}
			columns={[
				t('table.headers.member'),
				t('table.headers.email'),
				t('table.headers.role'),
				t('table.headers.joined'),
			]}
			rowCount={5}
			showSearch
			showAddButton={false}
		/>
	);
}
