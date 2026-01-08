import { AccessRestrictedActions } from '@/components/access-restricted-actions';
import { getTranslations } from 'next-intl/server';
import type React from 'react';

/**
 * Access restricted page shown when the user lacks admin permissions.
 *
 * @returns The access restricted page JSX element
 */
export default async function AccessRestrictedPage(): Promise<React.ReactElement> {
	const t = await getTranslations('AccessRestricted');

	return (
		<div className="flex min-h-[70vh] items-center justify-center px-6">
			<div className="max-w-lg space-y-4 text-center">
				<h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('description')}</p>
				<div className="flex justify-center">
					<AccessRestrictedActions
						signOutLabel={t('actions.signOut')}
						backHomeLabel={t('actions.backHome')}
					/>
				</div>
			</div>
		</div>
	);
}
