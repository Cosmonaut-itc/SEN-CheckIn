import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
	}),
}));

vi.mock('@/components/ui/dialog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/components/ui/dialog')>();

	return {
		...actual,
		DialogTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<>{children}</>
		),
	};
});

vi.mock('@/components/ui/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
	}): React.ReactElement => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

describe('EmployeePageActions', () => {
	beforeEach(() => {
		mockPush.mockReset();
	});

	it('routes to the bulk import page from the split button menu', async () => {
		const { EmployeePageActions } = await import('./employee-detail-dialog');

		render(<EmployeePageActions onCreateNew={vi.fn()} />);

		expect(screen.getByTestId('employees-add-button')).toBeInTheDocument();
		expect(screen.getByTestId('employees-add-menu-button')).toBeInTheDocument();

		fireEvent.click(screen.getByText('actions.importFromDocument'));

		expect(mockPush).toHaveBeenCalledWith('/employees/import');
	});
});
