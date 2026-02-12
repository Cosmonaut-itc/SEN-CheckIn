import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { PayrollHolidayNoticeCard } from './payroll-holiday-notice';

const messages = {
	Payroll: {
		holidayNotice: {
			title: 'Aviso de feriado',
			fields: {
				affectedEmployees: 'Empleados afectados',
				estimatedPremium: 'Prima estimada',
				dateCount: 'Feriados en periodo',
				period: 'Periodo: {start} - {end}',
			},
		},
	},
};

/**
 * Renders a component with minimal i18n provider.
 *
 * @param node - React node to render
 * @returns Render result
 */
function renderWithMessages(node: React.ReactNode): ReturnType<typeof render> {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			{node}
		</NextIntlClientProvider>,
	);
}

describe('PayrollHolidayNoticeCard', () => {
	it('does not render when notice list is empty', () => {
		const { container } = renderWithMessages(<PayrollHolidayNoticeCard notices={[]} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('renders holiday notice content and totals', () => {
		renderWithMessages(
			<PayrollHolidayNoticeCard
				notices={[
					{
						kind: 'HOLIDAY_PAYROLL_IMPACT',
						title: 'Aviso de feriado',
						message: 'El periodo incluye 1 feriado aplicable.',
						legalReference: 'LFT Art. 74/75',
						periodStartDateKey: '2026-01-01',
						periodEndDateKey: '2026-01-07',
						affectedHolidayDateKeys: ['2026-01-01'],
						affectedEmployees: 3,
						estimatedMandatoryPremiumTotal: 1250.5,
						generatedAt: '2026-01-08T00:00:00.000Z',
					},
				]}
			/>,
		);

		expect(screen.getByText('Aviso de feriado')).toBeInTheDocument();
		expect(screen.getByText('LFT Art. 74/75')).toBeInTheDocument();
		expect(screen.getByText('fields.affectedEmployees')).toBeInTheDocument();
		expect(screen.getByText('3')).toBeInTheDocument();
		expect(screen.getByText('$1,250.50')).toBeInTheDocument();
		expect(screen.getByText('fields.period')).toBeInTheDocument();
	});
});
