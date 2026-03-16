import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { EmployeeDualPayrollCompensationPanel } from './employee-dual-payroll-compensation-panel';

describe('EmployeeDualPayrollCompensationPanel', () => {
	it('renders theme-aware surfaces for the compensation panel', () => {
		render(
			<EmployeeDualPayrollCompensationPanel
				title="Complemento salarial"
				subtitle="Separa el salario que timbra fiscalmente del pago real del empleado."
				field={<div data-testid="field-slot">Campo</div>}
				feedback="Déjalo vacío para usar el salario real."
				feedbackTone="helper"
				previewTitle="Vista rápida"
				realDailyPayLabel="Salario diario real"
				realDailyPayValue="$380.00"
				fiscalDailyPayLabel="Salario diario fiscal"
				fiscalDailyPayValue="$320.00"
				dailyComplementLabel="Complemento diario"
				dailyComplementValue="$60.00"
			/>,
		);

		expect(screen.getByTestId('employee-dual-payroll-panel')).toHaveClass(
			'bg-[color:var(--bg-secondary)]/92',
		);
		expect(screen.getByTestId('employee-dual-payroll-panel').className).not.toContain(
			'bg-emerald-50/60',
		);
		expect(screen.getByTestId('employee-dual-payroll-preview')).toHaveClass(
			'bg-[color:var(--bg-elevated)]/95',
		);
		expect(screen.getByTestId('employee-dual-payroll-preview').className).not.toContain(
			'bg-white/85',
		);
		expect(screen.getByTestId('employee-dual-payroll-complement')).toHaveClass(
			'bg-[color:var(--accent-secondary-bg)]',
		);
		expect(screen.getByText('Déjalo vacío para usar el salario real.')).toHaveClass(
			'text-[color:var(--text-tertiary)]',
		);
	});
});
