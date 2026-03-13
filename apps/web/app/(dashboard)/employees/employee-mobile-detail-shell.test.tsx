import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeMobileDetailShell } from './employee-mobile-detail-shell';

describe('EmployeeMobileDetailShell', () => {
	it('renders the compact mobile header, info tab, and scrollable content region', () => {
		const handleEdit = vi.fn();
		const handleClose = vi.fn();

		render(
			<EmployeeMobileDetailShell
				employeeName="Ada Lovelace"
				employeeCode="EMP-0001"
				employeeStatusLabel="Activa"
				employeeStatusTone="default"
				editLabel="Editar"
				closeLabel="Cerrar"
				infoLabel="Info"
				activeTab="info"
				onActiveTabChange={() => undefined}
				onEdit={handleEdit}
				onClose={handleClose}
				panels={[
					{
						id: 'info',
						label: 'Info',
						content: <div>Panel info</div>,
					},
					{
						id: 'summary',
						label: 'Resumen',
						content: <div>Panel resumen</div>,
					},
					{
						id: 'attendance',
						label: 'Asistencia',
						content: <div>Panel asistencia</div>,
					},
				]}
			/>,
		);

		expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
		expect(screen.getByText('EMP-0001')).toBeInTheDocument();
		expect(screen.getByRole('tab', { name: 'Info' })).toBeInTheDocument();
		expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument();
		expect(screen.getByTestId('employee-mobile-detail-tabs').className).toContain(
			'overflow-x-auto',
		);
		expect(screen.getByTestId('employee-mobile-detail-panel').className).toContain(
			'overflow-y-auto',
		);

		fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

		expect(handleEdit).toHaveBeenCalledTimes(1);
		expect(handleClose).toHaveBeenCalledTimes(1);
	});

	it('centers the active tab when the selected panel changes', () => {
		const scrollIntoView = vi.fn();
		const originalScrollIntoView = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = scrollIntoView;

		const { rerender } = render(
			<EmployeeMobileDetailShell
				employeeName="Ada Lovelace"
				employeeCode="EMP-0001"
				employeeStatusLabel="Activa"
				employeeStatusTone="default"
				editLabel="Editar"
				closeLabel="Cerrar"
				infoLabel="Info"
				activeTab="info"
				onActiveTabChange={() => undefined}
				onEdit={() => undefined}
				onClose={() => undefined}
				panels={[
					{
						id: 'info',
						label: 'Info',
						content: <div>Panel info</div>,
					},
					{
						id: 'summary',
						label: 'Resumen',
						content: <div>Panel resumen</div>,
					},
				]}
			/>,
		);

		rerender(
			<EmployeeMobileDetailShell
				employeeName="Ada Lovelace"
				employeeCode="EMP-0001"
				employeeStatusLabel="Activa"
				employeeStatusTone="default"
				editLabel="Editar"
				closeLabel="Cerrar"
				infoLabel="Info"
				activeTab="summary"
				onActiveTabChange={() => undefined}
				onEdit={() => undefined}
				onClose={() => undefined}
				panels={[
					{
						id: 'info',
						label: 'Info',
						content: <div>Panel info</div>,
					},
					{
						id: 'summary',
						label: 'Resumen',
						content: <div>Panel resumen</div>,
					},
				]}
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalled();

		Element.prototype.scrollIntoView = originalScrollIntoView;
	});
});
