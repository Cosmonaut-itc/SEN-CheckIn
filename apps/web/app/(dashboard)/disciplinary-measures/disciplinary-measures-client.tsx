'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { DisciplinaryMeasuresManager } from '@/components/disciplinary-measures-manager';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';

/**
 * Dashboard client view for disciplinary measures.
 *
 * @returns Disciplinary dashboard UI
 */
export function DisciplinaryMeasuresPageClient(): React.ReactElement {
	const t = useTranslations('DisciplinaryMeasures');

	return (
		<div className="space-y-4">
			<ResponsivePageHeader title={t('page.title')} description={t('page.subtitle')} />
			<DisciplinaryMeasuresManager />
		</div>
	);
}
