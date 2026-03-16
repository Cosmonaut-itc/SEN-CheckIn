import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
	ColumnFiltersState,
	PaginationState,
	RowSelectionState,
	SortingState,
} from '@tanstack/react-table';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseReactTable = vi.fn();

vi.mock('@tanstack/react-table', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-table')>();

	return {
		...actual,
		useReactTable: (...args: Parameters<typeof actual.useReactTable>) => {
			mockUseReactTable(...args);
			return actual.useReactTable(...args);
		},
	};
});

import { ResponsiveDataView } from './responsive-data-view';

const mockUseIsMobile = vi.fn();

vi.mock('@/hooks/use-mobile', () => ({
	useIsMobile: () => mockUseIsMobile(),
}));

type DemoRow = {
	id: string;
	name: string;
};

const columns = [
	{
		accessorKey: 'name',
		header: 'Nombre',
		cell: ({ row }: { row: { original: DemoRow } }) => row.original.name,
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

describe('ResponsiveDataView', () => {
	const sorting = [] as SortingState;
	const pagination: PaginationState = { pageIndex: 0, pageSize: 10 };
	const columnFilters = [] as ColumnFiltersState;

	beforeEach(() => {
		mockUseIsMobile.mockReset();
		mockUseReactTable.mockClear();
	});

	it('renders the desktop table when the viewport is not mobile', () => {
		mockUseIsMobile.mockReturnValue(false);

		render(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
			/>,
		);

		expect(screen.getByRole('table')).toBeInTheDocument();
		expect(screen.queryByTestId('responsive-data-view-mobile')).toBeNull();
	});

	it('renders stacked cards when the viewport is mobile', () => {
		mockUseIsMobile.mockReturnValue(true);

		render(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
			/>,
		);

		expect(screen.getByTestId('responsive-data-view-mobile')).toBeInTheDocument();
		expect(screen.getByTestId('responsive-data-card')).toBeInTheDocument();
		expect(screen.queryByRole('table')).toBeNull();
	});

	it('renders desktop markup during server render before switching to mobile cards', () => {
		mockUseIsMobile.mockReturnValue(true);

		const markup = renderToString(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
			/>,
		);

		expect(markup).toContain('<table');
		expect(markup).not.toContain('responsive-data-view-mobile');
	});

	it('keeps rendering the desktop table after mount on desktop viewports', () => {
		mockUseIsMobile.mockReturnValue(false);

		render(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
			/>,
		);

		expect(mockUseReactTable).toHaveBeenCalledTimes(2);
		expect(screen.getByRole('table')).toBeInTheDocument();
		expect(screen.queryByTestId('responsive-data-view-mobile')).toBeNull();
	});

	it('opens row details when tapping a mobile card', () => {
		mockUseIsMobile.mockReturnValue(true);
		const handleRowClick = vi.fn();

		render(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
				onRowClick={handleRowClick}
			/>,
		);

		fireEvent.click(screen.getByTestId('responsive-data-card'));

		expect(handleRowClick).toHaveBeenCalledTimes(1);
		expect(handleRowClick).toHaveBeenCalledWith({ id: '1', name: 'Ada' });
	});

	it('renders mobile row selection controls when selection is enabled', () => {
		mockUseIsMobile.mockReturnValue(true);
		const handleRowSelectionChange = createStateSetterMock<RowSelectionState>();
		const handleRowClick = vi.fn();

		render(
			<ResponsiveDataView
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
				cardRenderer={(row) => <span>{row.name}</span>}
				rowSelection={{}}
				onRowSelectionChange={handleRowSelectionChange}
				enableRowSelection
				getRowId={(row) => row.id}
				onRowClick={handleRowClick}
			/>,
		);

		fireEvent.click(screen.getByRole('checkbox', { name: 'selection.selectRow' }));

		expect(handleRowSelectionChange).toHaveBeenCalledTimes(1);
		expect(handleRowClick).not.toHaveBeenCalled();
	});
});
