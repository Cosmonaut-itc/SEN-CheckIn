import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeDisciplinaryMeasuresTab } from '@/components/employee-disciplinary-measures-tab';

const disciplinaryManagerSpy = vi.fn<(props: { employeeId: string; embedded: boolean }) => void>();

vi.mock('@/components/disciplinary-measures-manager', () => ({
	DisciplinaryMeasuresManager: (props: { employeeId: string; embedded: boolean }) => {
		disciplinaryManagerSpy(props);
		return <div data-testid="disciplinary-manager-stub" />;
	},
}));

describe('EmployeeDisciplinaryMeasuresTab', () => {
	it('renders embedded disciplinary manager scoped to employee', () => {
		render(<EmployeeDisciplinaryMeasuresTab employeeId="emp-123" />);

		expect(screen.getByTestId('disciplinary-manager-stub')).toBeInTheDocument();
		expect(disciplinaryManagerSpy).toHaveBeenCalledWith({
			employeeId: 'emp-123',
			embedded: true,
		});
	});
});
