import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Employee } from '@/lib/client-functions';
import rawMessages from '@/messages/es.json';

import { EmployeeInfoTab } from './employee-info-tab';

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

/**
 * Builds an employee fixture for EmployeeInfoTab tests.
 *
 * @param overrides - Partial employee overrides
 * @returns Employee fixture
 */
function createEmployeeFixture(overrides: Partial<Employee> = {}): Employee {
	return {
		id: 'employee-1',
		code: 'EMP-0001',
		firstName: 'Ana',
		lastName: 'Pérez',
		nss: '12345678901',
		rfc: 'PEGA900101ABC',
		email: 'ana@example.com',
		phone: '5512345678',
		jobPositionId: 'job-1',
		jobPositionName: 'Supervisora',
		department: 'Operaciones',
		status: 'ACTIVE',
		hireDate: new Date('2024-01-10T00:00:00.000Z'),
		dailyPay: 500,
		paymentFrequency: 'WEEKLY',
		employmentType: 'PERMANENT',
		isTrustEmployee: false,
		isDirectorAdminGeneralManager: false,
		isDomesticWorker: false,
		isPlatformWorker: false,
		platformHoursYear: 0,
		ptuEligibilityOverride: 'DEFAULT',
		aguinaldoDaysOverride: null,
		sbcDailyOverride: null,
		locationId: 'location-1',
		organizationId: 'org-1',
		userId: 'user-1',
		rekognitionUserId: null,
		shiftType: 'DIURNA',
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		...overrides,
	};
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
