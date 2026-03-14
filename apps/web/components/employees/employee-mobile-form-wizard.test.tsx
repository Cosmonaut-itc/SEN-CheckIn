import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
	EmployeeMobileFormWizard,
	type EmployeeMobileFormWizardProps,
} from './employee-mobile-form-wizard';

const wizardSteps: EmployeeMobileFormWizardProps['steps'] = [
	{ id: 'personal', title: 'Personal', content: <div>Personal</div> },
	{ id: 'laboral', title: 'Laboral', content: <div>Laboral</div> },
	{ id: 'salario', title: 'Salario', content: <div>Salario</div> },
	{ id: 'ptu', title: 'PTU y Aguinaldo', content: <div>PTU</div> },
	{ id: 'horario', title: 'Horario', content: <div>Horario</div> },
];

/**
 * Builds a full prop bag for the employee mobile wizard test render.
 *
 * @param overrides - Partial prop overrides for the test scenario
 * @returns Complete wizard props
 */
function buildWizardProps(
	overrides: Partial<EmployeeMobileFormWizardProps> = {},
): EmployeeMobileFormWizardProps {
	return {
		title: 'Editar empleado',
		closeLabel: 'Cerrar',
		previousLabel: 'Anterior',
		nextLabel: 'Siguiente',
		saveLabel: 'Guardar',
		cancelDiscardLabel: 'Cancelar',
		confirmDiscardLabel: 'Descartar',
		discardTitle: '¿Descartar cambios?',
		discardDescription: 'Los cambios sin guardar se perderán.',
		progressLabel: 'Paso {current} de {total}: {step}',
		dirty: false,
		errorStepIndexes: [],
		onClose: () => undefined,
		onSubmit: () => undefined,
		steps: wizardSteps,
		...overrides,
	};
}

/**
 * Renders the employee mobile wizard with shared defaults.
 *
 * @param overrides - Partial prop overrides for the test scenario
 * @returns Testing Library render result
 */
function renderWizard(overrides: Partial<EmployeeMobileFormWizardProps> = {}) {
	return render(<EmployeeMobileFormWizard {...buildWizardProps(overrides)} />);
}

describe('EmployeeMobileFormWizard', () => {
	it('moves through the five steps and shows save on the final step', () => {
		renderWizard();

		expect(screen.getByText('Paso 1 de 5: Personal')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

		expect(screen.getByText('Paso 5 de 5: Horario')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
	});

	it('uses 44px touch targets for stepper buttons', () => {
		renderWizard();

		expect(screen.getByRole('button', { name: 'Paso 1: Personal' })).toHaveClass(
			'h-11',
			'w-11',
		);
		expect(screen.getByRole('button', { name: 'Paso 2: Laboral' })).toHaveClass('h-11', 'w-11');
	});

	it('confirms before closing when the wizard has unsaved changes', () => {
		const handleClose = vi.fn();

		renderWizard({
			dirty: true,
			errorStepIndexes: [1, 4],
			onClose: handleClose,
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

		expect(screen.getByText('¿Descartar cambios?')).toBeInTheDocument();
		expect(screen.getByText('Los cambios sin guardar se perderán.')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
		expect(screen.queryByText('¿Descartar cambios?')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
		fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

		expect(handleClose).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole('button', { name: 'Paso 2: Laboral con errores' }),
		).not.toHaveAttribute('aria-current', 'step');
	});

	it('shows the discard confirmation when requested from outside the wizard', () => {
		const handleClose = vi.fn();
		const setShowDiscardFromOutside = vi.fn();

		renderWizard({
			dirty: true,
			showDiscardFromOutside: true,
			setShowDiscardFromOutside,
			onClose: handleClose,
		});

		expect(screen.getByText('¿Descartar cambios?')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

		expect(setShowDiscardFromOutside).toHaveBeenCalledWith(false);
		expect(handleClose).not.toHaveBeenCalled();
	});

	it('closes immediately without showing confirmation when the wizard is clean', () => {
		const handleClose = vi.fn();

		renderWizard({
			dirty: false,
			onClose: handleClose,
		});

		fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

		expect(handleClose).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('¿Descartar cambios?')).toBeNull();
	});

	it('submits from the fifth step when save is pressed', () => {
		const handleSubmit = vi.fn();

		renderWizard({
			onSubmit: handleSubmit,
		});

		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
		fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

		expect(handleSubmit).toHaveBeenCalledTimes(1);
	});

	it('disables the primary action while submitting', () => {
		renderWizard({
			isSubmitting: true,
		});

		expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
	});

	it('disables the save button on the last step while submitting', () => {
		renderWizard({
			activeStepIndex: 4,
			isSubmitting: true,
		});

		expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
	});

	it('renders destructive step icons for steps with validation errors', () => {
		renderWizard({
			errorStepIndexes: [0, 2],
		});

		const firstStepIcon = screen
			.getByRole('button', { name: 'Paso 1: Personal con errores' })
			.querySelector('svg');
		const thirdStepIcon = screen
			.getByRole('button', { name: 'Paso 3: Salario con errores' })
			.querySelector('svg');

		expect(firstStepIcon).not.toBeNull();
		expect(thirdStepIcon).not.toBeNull();
		expect(firstStepIcon).toHaveClass('text-destructive');
		expect(thirdStepIcon).toHaveClass('text-destructive');
	});
});
