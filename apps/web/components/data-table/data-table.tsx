'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
	type ColumnDef,
	type ColumnFiltersState,
	type OnChangeFn,
	type PaginationState,
	type RowSelectionState,
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table';
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { hasSelectedText, isInteractiveRowClickTarget } from './row-click-guards';

/**
 * Option configuration for faceted filters.
 */
export interface DataTableFacetedFilterOption {
	/** Option display label. */
	label: string;
	/** Option value. */
	value: string;
}

/**
 * Faceted filter configuration for DataTable toolbar.
 */
export interface DataTableFacetedFilter {
	/** Column id used for filtering. */
	id: string;
	/** Accessible label for the filter control. */
	label: string;
	/** Filter options for the select. */
	options: DataTableFacetedFilterOption[];
	/** Placeholder text for the select. */
	placeholder?: string;
	/** Value that represents "all" (clears the filter). */
	allValue?: string;
	/** Whether the filter control is disabled. */
	disabled?: boolean;
}

/**
 * Props for the shared DataTable component.
 */
export interface DataTableProps<TData, TValue> {
	/** Column definitions for the table. */
	columns: ColumnDef<TData, TValue>[];
	/** Row data. */
	data: TData[];
	/** Sorting state. */
	sorting: SortingState;
	/** Sorting state change handler. */
	onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
	/** Pagination state. */
	pagination: PaginationState;
	/** Pagination state change handler. */
	onPaginationChange: React.Dispatch<React.SetStateAction<PaginationState>>;
	/** Column filter state. */
	columnFilters: ColumnFiltersState;
	/** Column filter state change handler. */
	onColumnFiltersChange: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
	/** Global filter value. */
	globalFilter: string;
	/** Global filter value change handler. */
	onGlobalFilterChange: React.Dispatch<React.SetStateAction<string>>;
	/** Whether pagination is handled by the server. */
	manualPagination?: boolean;
	/** Whether filtering is handled by the server. */
	manualFiltering?: boolean;
	/** Total row count for server pagination. */
	rowCount?: number;
	/** Show toolbar with filters/search. */
	showToolbar?: boolean;
	/** Show global search input. */
	showGlobalFilter?: boolean;
	/** Placeholder for the global search input. */
	globalFilterPlaceholder?: string;
	/** Config for faceted filter selects. */
	facetedFilters?: DataTableFacetedFilter[];
	/** Optional empty state content when no rows are available. */
	emptyState?: React.ReactNode;
	/** Loading state indicator. */
	isLoading?: boolean;
	/** Custom page size options. */
	pageSizeOptions?: number[];
	/** Optional class name for the root container. */
	className?: string;
	/** Row selection state for bulk actions. */
	rowSelection?: RowSelectionState;
	/** Row selection change handler. */
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;
	/** Enable row selection checkboxes. */
	enableRowSelection?: boolean;
	/** Custom row id resolver for selection. */
	getRowId?: (originalRow: TData, index: number, parent?: unknown) => string;
	/** Optional row click handler for opening detail views. */
	onRowClick?: (row: TData) => void;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50];

type IndeterminateCheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & {
	indeterminate?: boolean;
};

/**
 * Checkbox input supporting indeterminate state for table selection.
 *
 * @param props - Checkbox props with optional indeterminate flag
 * @returns Checkbox input element
 */
function IndeterminateCheckbox({
	indeterminate,
	...props
}: IndeterminateCheckboxProps): React.ReactElement {
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (ref.current) {
			ref.current.indeterminate = Boolean(indeterminate);
		}
	}, [indeterminate]);

	return (
		<input
			ref={ref}
			type="checkbox"
			className="h-4 w-4 accent-primary"
			{...props}
		/>
	);
}

/**
 * Shared data table component using TanStack Table + shadcn/ui Table primitives.
 *
 * @param props - DataTable configuration props.
 * @returns Rendered data table.
 */
export function DataTable<TData, TValue>({
	columns,
	data,
	sorting,
	onSortingChange,
	pagination,
	onPaginationChange,
	columnFilters,
	onColumnFiltersChange,
	globalFilter,
	onGlobalFilterChange,
	manualPagination = false,
	manualFiltering = false,
	rowCount,
	showToolbar,
	showGlobalFilter = true,
	globalFilterPlaceholder,
	facetedFilters,
	emptyState,
	isLoading = false,
	pageSizeOptions,
	className,
	rowSelection,
	onRowSelectionChange,
	enableRowSelection = false,
	getRowId,
	onRowClick,
}: DataTableProps<TData, TValue>): React.ReactElement {
	const t = useTranslations('DataTable');

	const selectionColumn = useMemo<ColumnDef<TData, TValue>>(
		() => ({
			id: 'select',
			header: ({ table }) => (
				<div className="flex items-center justify-center">
					<IndeterminateCheckbox
						checked={table.getIsAllPageRowsSelected()}
						indeterminate={table.getIsSomePageRowsSelected()}
						onChange={table.getToggleAllPageRowsSelectedHandler()}
						aria-label={t('selection.selectAll')}
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex items-center justify-center">
					<IndeterminateCheckbox
						checked={row.getIsSelected()}
						indeterminate={row.getIsSomeSelected()}
						onChange={row.getToggleSelectedHandler()}
						aria-label={t('selection.selectRow')}
					/>
				</div>
			),
			enableSorting: false,
			enableHiding: false,
			size: 36,
		}),
		[t],
	);

	const resolvedColumns = useMemo(
		() => (enableRowSelection ? [selectionColumn, ...columns] : columns),
		[columns, enableRowSelection, selectionColumn],
	);

	// eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable helpers.
	const table = useReactTable({
		data,
		columns: resolvedColumns,
		state: {
			sorting,
			pagination,
			columnFilters,
			globalFilter,
			rowSelection: rowSelection ?? {},
		},
		onSortingChange,
		onPaginationChange,
		onColumnFiltersChange,
		onGlobalFilterChange,
		onRowSelectionChange,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
		getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
		manualPagination,
		manualFiltering,
		rowCount,
		enableRowSelection,
		getRowId,
	});

	const resolvedPageSizes = pageSizeOptions ?? DEFAULT_PAGE_SIZES;
	const shouldShowToolbar =
		showToolbar ?? Boolean(showGlobalFilter || (facetedFilters && facetedFilters.length > 0));
	const totalColumns = table.getVisibleLeafColumns().length || columns.length;
	const emptyContent = emptyState ?? t('empty');
	const pageCount = Math.max(table.getPageCount(), 1);
	const currentPage = pagination.pageIndex + 1;

	/**
	 * Executes the row click action unless the interaction originated from an
	 * embedded control or the user is selecting text.
	 *
	 * @param event - Table row click event
	 * @param row - Original row data
	 * @returns Nothing
	 */
	const handleRowClick = (event: React.MouseEvent<HTMLTableRowElement>, row: TData): void => {
		if (!onRowClick || isInteractiveRowClickTarget(event.target) || hasSelectedText()) {
			return;
		}

		onRowClick(row);
	};

	return (
		<div className={cn('space-y-4', className)}>
			{shouldShowToolbar ? (
				<div className="flex flex-wrap items-center gap-3">
					{showGlobalFilter ? (
						<Input
							value={globalFilter}
							onChange={(event) => table.setGlobalFilter(event.target.value)}
							placeholder={globalFilterPlaceholder ?? t('search.placeholder')}
							aria-label={globalFilterPlaceholder ?? t('search.placeholder')}
							className="max-w-sm"
						/>
					) : null}
					{facetedFilters?.map((filter) => {
						const column = table.getColumn(filter.id);
						if (!column) {
							return null;
						}
						const selectedValue =
							(column.getFilterValue() as string | undefined) ??
							filter.allValue ??
							'';
						return (
							<Select
								key={filter.id}
								value={selectedValue}
								onValueChange={(value) => {
									const resolved =
										filter.allValue !== undefined && value === filter.allValue
											? undefined
											: value;
									column.setFilterValue(resolved);
								}}
								disabled={filter.disabled}
							>
								<SelectTrigger className="w-[200px]" aria-label={filter.label}>
									<SelectValue placeholder={filter.placeholder ?? filter.label} />
								</SelectTrigger>
								<SelectContent>
									{filter.options.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						);
					})}
				</div>
			) : null}

			<div className="max-w-full overflow-x-auto rounded-md border [content-visibility:auto] [contain-intrinsic-size:0_480px]">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									if (header.isPlaceholder) {
										return <TableHead key={header.id} />;
									}
									const isSorted = header.column.getIsSorted();
									const sortLabel =
										isSorted === 'asc'
											? t('sorting.asc')
											: isSorted === 'desc'
												? t('sorting.desc')
												: t('sorting.none');
									return (
										<TableHead key={header.id}>
											{header.column.getCanSort() ? (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="-ml-2 h-8 px-2"
													onClick={header.column.getToggleSortingHandler()}
													aria-label={sortLabel}
												>
													<span className="truncate">
														{flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
													</span>
													{isSorted === 'asc' ? (
														<ArrowUp className="ml-2 h-4 w-4" />
													) : isSorted === 'desc' ? (
														<ArrowDown className="ml-2 h-4 w-4" />
													) : (
														<ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />
													)}
												</Button>
											) : (
												flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, rowIndex) => (
								<TableRow key={`loading-${rowIndex}`}>
									{Array.from({ length: totalColumns }).map((_, cellIndex) => (
										<TableCell key={`loading-cell-${rowIndex}-${cellIndex}`}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : table.getRowModel().rows.length > 0 ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									onClick={(event) => handleRowClick(event, row.original)}
									className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={totalColumns} className="h-24 text-center">
									{emptyContent}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>{t('pagination.rowsPerPage')}</span>
					<Select
						value={`${pagination.pageSize}`}
						onValueChange={(value) =>
							onPaginationChange((prev) => ({
								...prev,
								pageSize: Number(value),
								pageIndex: 0,
							}))
						}
					>
						<SelectTrigger className="h-8 w-[90px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{resolvedPageSizes.map((size) => (
								<SelectItem key={size} value={`${size}`}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">
						{t('pagination.page', { current: currentPage, total: pageCount })}
					</span>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => table.setPageIndex(0)}
						disabled={!table.getCanPreviousPage()}
						aria-label={t('pagination.first')}
					>
						<ChevronsLeft className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label={t('pagination.previous')}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						aria-label={t('pagination.next')}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => table.setPageIndex(pageCount - 1)}
						disabled={!table.getCanNextPage()}
						aria-label={t('pagination.last')}
					>
						<ChevronsRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
