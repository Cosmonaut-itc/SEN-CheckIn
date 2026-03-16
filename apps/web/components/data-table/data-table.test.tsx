import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from './data-table';

type DemoRow = {
	id: string;
	name: string;
};

const columns: ColumnDef<DemoRow>[] = [
	{
		accessorKey: 'name',
		header: 'Nombre',
		cell: ({ row }) => row.original.name,
	},
	{
		id: 'actions',
		header: 'Acciones',
		cell: () => (
			<button type="button">
				Abrir menu
			</button>
		),
	},
];

/**
 * Builds a typed state setter mock for table props.
 *
 * @returns Mock state setter
 */
function createStateSetterMock<T>(): React.Dispatch<React.SetStateAction<T>> {
	return vi.fn() as unknown as React.Dispatch<React.SetStateAction<T>>;
}

/**
 * Resolves the rendered body row for the provided employee name.
 *
 * @param name - Employee name rendered inside the row
 * @returns Matching table row element
 * @throws {Error} When the row cannot be found
 */
function getRowByEmployeeName(name: string): HTMLTableRowElement {
	const row = screen.getByText(name).closest('tr');
	if (!(row instanceof HTMLTableRowElement)) {
		throw new Error(`Expected a table row for employee "${name}".`);
	}
	return row;
}

describe('DataTable', () => {
	const sorting = [] as SortingState;
	const pagination: PaginationState = { pageIndex: 0, pageSize: 10 };
	const columnFilters = [] as ColumnFiltersState;
	const defaultSelection = window.getSelection;

	afterEach(() => {
		window.getSelection = defaultSelection;
	});

	it('opens row details when clicking a non-interactive cell', () => {
		const handleRowClick = vi.fn();

		render(
			<DataTable
				columns={columns}
				data={[{ id: '1', name: 'Ada' }]}
				sorting={sorting}
				onSortingChange={createStateSetterMock<SortingState>()}
				pagination={pagination}
				onPaginationChange={createStateSetterMock<PaginationState>()}
				columnFilters={columnFilters}
				onColumnFiltersChange={createStateSetterMock<ColumnFiltersState>()}
				globalFilter=""
				onGlobalFilterChange={createStateSetterMock<string>()}
				onRowClick={handleRowClick}
			/>,
		);

		fireEvent.click(getRowByEmployeeName('Ada'));

		expect(handleRowClick).toHaveBeenCalledTimes(1);
		expect(handleRowClick).toHaveBeenCalledWith({ id: '1', name: 'Ada' });
	});

	it('does not open row details when clicking an interactive element inside the row', () => {
		const handleRowClick = vi.fn();

		render(
			<DataTable
				columns={columns}
				data={[{ id: '1', name: 'Ada' }]}
				sorting={sorting}
				onSortingChange={createStateSetterMock<SortingState>()}
				pagination={pagination}
				onPaginationChange={createStateSetterMock<PaginationState>()}
				columnFilters={columnFilters}
				onColumnFiltersChange={createStateSetterMock<ColumnFiltersState>()}
				globalFilter=""
				onGlobalFilterChange={createStateSetterMock<string>()}
				onRowClick={handleRowClick}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));

		expect(handleRowClick).not.toHaveBeenCalled();
	});

	it('does not open row details while text is selected', () => {
		const handleRowClick = vi.fn();
		window.getSelection = vi.fn(
			() =>
				({
					toString: () => 'Ada',
				}) as unknown as Selection,
		) as unknown as typeof window.getSelection;

		render(
			<DataTable
				columns={columns}
				data={[{ id: '1', name: 'Ada' }]}
				sorting={sorting}
				onSortingChange={createStateSetterMock<SortingState>()}
				pagination={pagination}
				onPaginationChange={createStateSetterMock<PaginationState>()}
				columnFilters={columnFilters}
				onColumnFiltersChange={createStateSetterMock<ColumnFiltersState>()}
				globalFilter=""
				onGlobalFilterChange={createStateSetterMock<string>()}
				onRowClick={handleRowClick}
			/>
		);

		fireEvent.click(getRowByEmployeeName('Ada'));

		expect(handleRowClick).not.toHaveBeenCalled();
	});

	it('renders a single horizontal overflow container for the table region', () => {
		render(
			<DataTable
				columns={columns}
				data={[{ id: '1', name: 'Ada' }]}
				sorting={sorting}
				onSortingChange={createStateSetterMock<SortingState>()}
				pagination={pagination}
				onPaginationChange={createStateSetterMock<PaginationState>()}
				columnFilters={columnFilters}
				onColumnFiltersChange={createStateSetterMock<ColumnFiltersState>()}
				globalFilter=""
				onGlobalFilterChange={createStateSetterMock<string>()}
			/>,
		);

		const overflowContainers = Array.from(document.querySelectorAll('div')).filter((element) =>
			element.className.includes('overflow-x-auto'),
		);

		expect(overflowContainers).toHaveLength(1);
	});
});
