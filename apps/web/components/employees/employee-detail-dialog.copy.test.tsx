import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

/**
 * Renders the vacation summary labels used in the employee detail dialog.
 *
 * @returns JSX element with the relevant localized labels
 */
function VacationSummaryCopy(): React.ReactElement {
	const t = useTranslations('Employees');

	return (
		<div>
			<span>{t('summary.availableDays')}</span>
			<span>{t('summary.serviceYearShort', { number: 2 })}</span>
			<span>
				{t('vacationBalance.tooltip.serviceYear', {
					number: 2,
					start: '2026-01-10',
					end: '2027-01-09',
				})}
			</span>
			<span>{t('vacationBalance.tooltip.formula')}</span>
		</div>
	);
}

describe('Employee detail dialog vacation copy', () => {
	it('describes the balance as anniversary-based instead of calendar-based', () => {
		render(<VacationSummaryCopy />);

		expect(screen.getByText('Días disponibles del año vacacional')).toBeInTheDocument();
		expect(screen.getByText('Año vacacional 2')).toBeInTheDocument();
		expect(
			screen.getByText('Año vacacional 2: 2026-01-10 a 2027-01-09'),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				'Disponibles = Devengados (redondeo hacia abajo) - Usados - Pendientes. El saldo se calcula por aniversario, no por año calendario.',
			),
		).toBeInTheDocument();
	});
});
