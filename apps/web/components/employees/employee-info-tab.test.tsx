import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';

import { EmployeeInfoTab } from './employee-info-tab';
import { createEmployeeFixture } from './employee-test-fixtures';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

vi.mock('next/link', () => ({
	default: ({
		href,
		children,
		...props
	}: {
		href: string;
		children: React.ReactNode;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

/**
 * Renders a component with the Spanish Next Intl provider.
 *
 * @param ui - React element to render
 * @returns Testing library render result
 */
function renderWithIntl(ui: React.ReactElement) {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			{ui}
		</NextIntlClientProvider>,
	);
}

describe('EmployeeInfoTab', () => {
	it('renders the 10 employee info fields', () => {
		renderWithIntl(
			<EmployeeInfoTab
				employee={createEmployeeFixture()}
				locationName="Planta Norte"
				shiftTypeLabel="Diurna"
				dateFormat="dd/MM/yyyy"
			/>,
		);

		expect(screen.getAllByTestId('employee-info-field')).toHaveLength(10);
		expect(screen.getByText(/Ubicación|fields\.location/)).toBeInTheDocument();
		expect(screen.getByText(/Puesto|fields\.jobPosition/)).toBeInTheDocument();
		expect(screen.getByText(/Fecha de ingreso|fields\.hireDate/)).toBeInTheDocument();
		expect(screen.getByText(/Tipo de turno|fields\.shiftType/)).toBeInTheDocument();
		expect(screen.getByText(/Correo electrónico|fields\.email/)).toBeInTheDocument();
		expect(screen.getByText(/Teléfono|fields\.phone/)).toBeInTheDocument();
		expect(screen.getByText(/NSS|fields\.nss/)).toBeInTheDocument();
		expect(screen.getByText(/RFC|fields\.rfc/)).toBeInTheDocument();
		expect(screen.getByText(/Departamento|fields\.department/)).toBeInTheDocument();
		expect(screen.getByText(/Usuario|fields\.user/)).toBeInTheDocument();
	});

	it('renders email and phone as clickable links', () => {
		renderWithIntl(
			<EmployeeInfoTab
				employee={createEmployeeFixture()}
				locationName="Planta Norte"
				shiftTypeLabel="Diurna"
				dateFormat="dd/MM/yyyy"
			/>,
		);

		expect(screen.getByRole('link', { name: 'ana@example.com' })).toHaveAttribute(
			'href',
			'mailto:ana@example.com',
		);
		expect(screen.getByRole('link', { name: '5512345678' })).toHaveAttribute(
			'href',
			'tel:5512345678',
		);
	});

	it('renders Sin usuario when there is no assigned user', () => {
		renderWithIntl(
			<EmployeeInfoTab
				employee={createEmployeeFixture({ userId: null })}
				locationName="Planta Norte"
				shiftTypeLabel="Diurna"
				dateFormat="dd/MM/yyyy"
			/>,
		);

		expect(screen.getByText(/Sin usuario|placeholders\.noUser/)).toBeInTheDocument();
	});

	it('renders N/D for empty fields', () => {
		renderWithIntl(
			<EmployeeInfoTab
				employee={createEmployeeFixture({
					hireDate: null,
					email: null,
					phone: null,
					nss: null,
					rfc: null,
					department: null,
					jobPositionName: null,
				})}
				locationName="N/D"
				shiftTypeLabel="N/D"
				dateFormat="dd/MM/yyyy"
			/>,
		);

		expect(
			screen.getAllByText(/N\/D|notAvailable|Common\.notAvailable/).length,
		).toBeGreaterThanOrEqual(7);
	});
});
