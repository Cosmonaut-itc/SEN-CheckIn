import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { PayrollOvertimeAlert } from './payroll-overtime-alert';

const messages = {
	Payroll: {
		overtimeAuthorization: {
			clear: 'Sin horas extra pendientes de autorización.',
			warning: '{employees} empleados con {hours} h no autorizadas',
		},
	},
};

/**
 * Renders payroll overtime alert with i18n context.
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

describe('PayrollOvertimeAlert', () => {
	it('renders a success state when no unauthorized overtime exists', () => {
		renderWithMessages(
			<PayrollOvertimeAlert unauthorizedHours={0} affectedEmployeesCount={0} />,
		);

		expect(screen.getByTestId('payroll-overtime-alert-clear')).toBeInTheDocument();
	});

	it('renders a warning badge when unauthorized overtime exists', () => {
		renderWithMessages(
			<PayrollOvertimeAlert unauthorizedHours={4.5} affectedEmployeesCount={2} />,
		);

		expect(screen.getByTestId('payroll-overtime-alert-warning')).toBeInTheDocument();
	});
});
