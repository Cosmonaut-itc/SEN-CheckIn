'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PayrollHolidayNotice } from '@sen-checkin/types';

type PayrollHolidayNoticeProps = {
	notices?: PayrollHolidayNotice[] | null;
	compact?: boolean;
};

/**
 * Formats a numeric value as Mexican Peso currency (MXN).
 *
 * @param value - Amount in MXN
 * @returns Formatted currency string
 */
function formatCurrency(value: number): string {
	return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

/**
 * Renders payroll holiday notices for preview/history sections.
 *
 * @param props - Component properties
 * @returns Notice card list or null when no notices exist
 */
export function PayrollHolidayNoticeCard({
	notices,
	compact = false,
}: PayrollHolidayNoticeProps): React.ReactElement | null {
	const t = useTranslations('Payroll.holidayNotice');
	const rows = notices ?? [];

	if (rows.length === 0) {
		return null;
	}

	return (
		<div className={compact ? 'space-y-2' : 'space-y-3'}>
			{rows.map((notice) => (
				<Card key={`${notice.kind}-${notice.generatedAt}`} className="border-[color:var(--status-warning)]/40">
					<CardHeader className={compact ? 'pb-2' : undefined}>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className={compact ? 'text-sm' : 'text-base'}>
								{notice.title}
							</CardTitle>
							<Badge variant="outline">{notice.legalReference}</Badge>
						</div>
						<CardDescription>{notice.message}</CardDescription>
					</CardHeader>
					<CardContent className={compact ? 'pt-0' : undefined}>
						<div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
							<div>
								<p className="font-medium text-foreground">
									{t('fields.affectedEmployees')}
								</p>
								<p>{notice.affectedEmployees}</p>
							</div>
							<div>
								<p className="font-medium text-foreground">
									{t('fields.estimatedPremium')}
								</p>
								<p>{formatCurrency(notice.estimatedMandatoryPremiumTotal)}</p>
							</div>
							<div>
								<p className="font-medium text-foreground">{t('fields.dateCount')}</p>
								<p>{notice.affectedHolidayDateKeys.length}</p>
							</div>
						</div>
						<p className="mt-2 text-xs text-muted-foreground">
							{t('fields.period', {
								start: notice.periodStartDateKey,
								end: notice.periodEndDateKey,
							})}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
