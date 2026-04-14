'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { DisciplinaryMeasuresManager } from '@/components/disciplinary-measures-manager';
import { TourHelpButton } from '@/components/tour-help-button';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { useTour } from '@/hooks/use-tour';

/**
 * Dashboard client view for disciplinary measures.
 *
 * @returns Disciplinary dashboard UI
 */
export function DisciplinaryMeasuresPageClient(): React.ReactElement {
	const t = useTranslations('DisciplinaryMeasures');
	useTour('disciplinary-measures');

	return (
		<div className="space-y-4">
			<ResponsivePageHeader
				title={t('page.title')}
				description={t('page.subtitle')}
				actions={<TourHelpButton tourId="disciplinary-measures" />}
			/>
			<DisciplinaryMeasuresManager />
		</div>
	);
}
