import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeCodeField } from './employee-code-field';

interface MockTextFieldProps {
	label: string;
	orientation?: 'vertical' | 'horizontal';
	disabled?: boolean;
	onValueChange?: (nextValue: string) => string;
}

/**
 * Builds a lightweight field API compatible with EmployeeCodeField.
 *
 * @returns Mock field renderer
 */
function createFieldRenderer(): {
	TextField: (props: MockTextFieldProps) => React.ReactElement;
} {
	return {
		TextField: ({ label, disabled, onValueChange }: MockTextFieldProps) => (
			<label>
				<span>{label}</span>
				<input
					aria-label={label}
					disabled={disabled}
					onChange={(event) => {
						onValueChange?.(event.target.value);
					}}
				/>
			</label>
		),
	};
}

describe('EmployeeCodeField', () => {
	it('allows custom code entry in create mode and marks the code as customized', () => {
		const setHasCustomCode = vi.fn();

		render(
			<EmployeeCodeField
				field={createFieldRenderer()}
				label="Código"
				isEditMode={false}
				setHasCustomCode={setHasCustomCode}
				orientation="vertical"
			/>,
		);

		const input = screen.getByRole('textbox', { name: 'Código' });
		expect(input).not.toBeDisabled();

		fireEvent.change(input, { target: { value: 'MANUAL-001' } });

		expect(setHasCustomCode).toHaveBeenCalledWith(true);
	});

	it('keeps the code field disabled in edit mode', () => {
		render(
			<EmployeeCodeField
				field={createFieldRenderer()}
				label="Código"
				isEditMode
				setHasCustomCode={vi.fn()}
				orientation="vertical"
			/>,
		);

		expect(screen.getByRole('textbox', { name: 'Código' })).toBeDisabled();
	});
});
