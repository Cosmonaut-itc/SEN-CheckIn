'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { DisciplinaryMeasuresManager } from '@/components/disciplinary-measures-manager';

/**
 * Dashboard client view for disciplinary measures.
 *
 * @returns Disciplinary dashboard UI
 */
export function DisciplinaryMeasuresPageClient(): React.ReactElement {
	const t = useTranslations('DisciplinaryMeasures');

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
				<p className="text-muted-foreground">{t('page.subtitle')}</p>
			</div>
			<DisciplinaryMeasuresManager />
		</div>
	);
}
