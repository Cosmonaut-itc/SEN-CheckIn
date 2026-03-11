'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

interface PayrollOvertimeAlertProps {
	unauthorizedHours: number;
	affectedEmployeesCount: number;
}

/**
 * Summarizes unauthorized overtime detected in a payroll preview.
 *
 * @param props - Unauthorized overtime totals for the current calculation
 * @returns Summary badge for overtime authorization compliance
 */
export function PayrollOvertimeAlert({
	unauthorizedHours,
	affectedEmployeesCount,
}: PayrollOvertimeAlertProps): React.ReactElement {
	const t = useTranslations('Payroll');

	if (unauthorizedHours <= 0 || affectedEmployeesCount <= 0) {
		return (
			<Badge data-testid="payroll-overtime-alert-clear" variant="success">
				{t('overtimeAuthorization.clear')}
			</Badge>
		);
	}

	return (
		<Badge data-testid="payroll-overtime-alert-warning" variant="warning">
			{t('overtimeAuthorization.warning', {
				employees: affectedEmployeesCount,
				hours: unauthorizedHours.toFixed(2),
			})}
		</Badge>
	);
}
