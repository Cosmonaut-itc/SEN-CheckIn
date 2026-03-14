import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeMobileFormWizard } from './employee-mobile-form-wizard';

describe('EmployeeMobileFormWizard', () => {
	it('moves through the five steps and shows save on the final step', () => {
		render(
			<EmployeeMobileFormWizard
				title="Editar empleado"
				closeLabel="Cerrar"
				previousLabel="Anterior"
				nextLabel="Siguiente"
				saveLabel="Guardar"
				cancelDiscardLabel="Cancelar"
				confirmDiscardLabel="Descartar"
				discardTitle="¿Descartar cambios?"
				discardDescription="Los cambios sin guardar se perderán."
				progressLabel="Paso {current} de {total}: {step}"
				dirty={false}
				errorStepIndexes={[]}
				onClose={() => undefined}
				onSubmit={() => undefined}
				steps={[
					{ id: 'personal', title: 'Personal', content: <div>Personal</div> },
					{ id: 'laboral', title: 'Laboral', content: <div>Laboral</div> },
					{ id: 'salario', title: 'Salario', content: <div>Salario</div> },
					{ id: 'ptu', title: 'PTU y Aguinaldo', content: <div>PTU</div> },
					{ id: 'horario', title: 'Horario', content: <div>Horario</div> },
				]}
			/>,
		);

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

	it('confirms before closing when the wizard has unsaved changes', () => {
		const handleClose = vi.fn();

		render(
			<EmployeeMobileFormWizard
				title="Editar empleado"
				closeLabel="Cerrar"
				previousLabel="Anterior"
				nextLabel="Siguiente"
				saveLabel="Guardar"
				cancelDiscardLabel="Cancelar"
				confirmDiscardLabel="Descartar"
				discardTitle="¿Descartar cambios?"
				discardDescription="Los cambios sin guardar se perderán."
				progressLabel="Paso {current} de {total}: {step}"
				dirty
				errorStepIndexes={[1, 4]}
				onClose={handleClose}
				onSubmit={() => undefined}
				steps={[
					{ id: 'personal', title: 'Personal', content: <div>Personal</div> },
					{ id: 'laboral', title: 'Laboral', content: <div>Laboral</div> },
					{ id: 'salario', title: 'Salario', content: <div>Salario</div> },
					{ id: 'ptu', title: 'PTU y Aguinaldo', content: <div>PTU</div> },
					{ id: 'horario', title: 'Horario', content: <div>Horario</div> },
				]}
			/>,
		);

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

		render(
			<EmployeeMobileFormWizard
				title="Editar empleado"
				closeLabel="Cerrar"
				previousLabel="Anterior"
				nextLabel="Siguiente"
				saveLabel="Guardar"
				cancelDiscardLabel="Cancelar"
				confirmDiscardLabel="Descartar"
				discardTitle="¿Descartar cambios?"
				discardDescription="Los cambios sin guardar se perderán."
				progressLabel="Paso {current} de {total}: {step}"
				dirty
				errorStepIndexes={[]}
				showDiscardFromOutside={true}
				setShowDiscardFromOutside={setShowDiscardFromOutside}
				onClose={handleClose}
				onSubmit={() => undefined}
				steps={[
					{ id: 'personal', title: 'Personal', content: <div>Personal</div> },
					{ id: 'laboral', title: 'Laboral', content: <div>Laboral</div> },
					{ id: 'salario', title: 'Salario', content: <div>Salario</div> },
					{ id: 'ptu', title: 'PTU y Aguinaldo', content: <div>PTU</div> },
					{ id: 'horario', title: 'Horario', content: <div>Horario</div> },
				]}
			/>,
		);

		expect(screen.getByText('¿Descartar cambios?')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

		expect(setShowDiscardFromOutside).toHaveBeenCalledWith(false);
		expect(handleClose).not.toHaveBeenCalled();
	});
});
