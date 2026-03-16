import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';

import { ResponsivePageHeader } from './responsive-page-header';

describe('ResponsivePageHeader', () => {
	it('renders title, description, and action area with mobile-first layout classes', () => {
		render(
			<ResponsivePageHeader
				title="Empleados"
				description="Administra registros"
				actions={<Button type="button">Agregar empleado</Button>}
			/>,
		);

		expect(screen.getByTestId('responsive-page-header')).toHaveClass('flex-col');
		expect(screen.getByTestId('responsive-page-header')).toHaveClass('min-[1025px]:flex-row');
		expect(screen.getByRole('heading', { name: 'Empleados' })).toBeInTheDocument();
		expect(screen.getByText('Administra registros')).toBeInTheDocument();
		expect(screen.getByTestId('responsive-page-header-actions')).toHaveClass('w-full');
		expect(screen.getByRole('button', { name: 'Agregar empleado' })).toBeInTheDocument();
	});
});
