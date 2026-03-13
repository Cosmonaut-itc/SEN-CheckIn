'use client';

import React from 'react';
import {
	type OnChangeFn,
	type RowSelectionState,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from '@tanstack/react-table';
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
	DataTable,
	type DataTableProps,
	type DataTableFacetedFilter,
} from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const DEFAULT_PAGE_SIZES = [10, 20, 50];

/**
 * Props for the responsive data view component.
 */
export interface ResponsiveDataViewProps<TData, TValue> extends DataTableProps<TData, TValue> {
	/** Function that renders the mobile card UI for each row. */
	cardRenderer: (row: TData) => React.ReactNode;
	/** Optional resolver for stable mobile card keys. */
	getCardKey?: (row: TData, index: number) => string;
	/** Optional class name for the mobile card list wrapper. */
	cardListClassName?: string;
	/** Optional class name for each mobile card wrapper. */
	cardClassName?: string;
}

type ResponsiveToolbarProps = {
	globalFilter: string;
	onGlobalFilterChange: React.Dispatch<React.SetStateAction<string>>;
	globalFilterPlaceholder?: string;
	showGlobalFilter: boolean;
	facetedFilters?: DataTableFacetedFilter[];
	columnFilters: DataTableProps<unknown, unknown>['columnFilters'];
	onColumnFiltersChange: React.Dispatch<
		React.SetStateAction<DataTableProps<unknown, unknown>['columnFilters']>
	>;
};

/**
 * Renders the responsive toolbar used above the mobile card list.
 *
 * @param props - Toolbar props
 * @returns Toolbar element
 */
function ResponsiveToolbar({
	globalFilter,
	onGlobalFilterChange,
	globalFilterPlaceholder,
	showGlobalFilter,
	facetedFilters,
	columnFilters,
	onColumnFiltersChange,
}: ResponsiveToolbarProps): React.ReactElement | null {
	const t = useTranslations('DataTable');

	/**
	 * Resolves the current filter value for a column id.
	 *
	 * @param id - Column filter id
	 * @returns Current filter value as string
	 */
	const getFilterValue = (id: string): string => {
		const filter = columnFilters.find((entry) => entry.id === id);
		return typeof filter?.value === 'string' ? filter.value : '';
	};

	/**
	 * Updates or removes a column filter entry.
	 *
	 * @param id - Column filter id
	 * @param value - Next filter value, or undefined to clear it
	 * @returns Nothing
	 */
	const updateFilterValue = (id: string, value: string | undefined): void => {
		onColumnFiltersChange((current) => {
			const nextFilters = current.filter((entry) => entry.id !== id);
			if (!value) {
				return nextFilters;
			}
			return [...nextFilters, { id, value }];
		});
	};

	const shouldShowFacetedFilters = Boolean(facetedFilters && facetedFilters.length > 0);

	if (!showGlobalFilter && !shouldShowFacetedFilters) {
		return null;
	}

	return (
		<div className="grid gap-3">
			{showGlobalFilter ? (
				<Input
					value={globalFilter}
					onChange={(event) => onGlobalFilterChange(event.target.value)}
					placeholder={globalFilterPlaceholder ?? t('search.placeholder')}
					aria-label={globalFilterPlaceholder ?? t('search.placeholder')}
					className="min-h-11"
				/>
			) : null}
			{facetedFilters?.map((filter) => {
				const selectedValue = getFilterValue(filter.id) || filter.allValue || '';
				return (
					<Select
						key={filter.id}
						value={selectedValue}
						onValueChange={(value) => {
							const resolved =
								filter.allValue !== undefined && value === filter.allValue
									? undefined
									: value;
							updateFilterValue(filter.id, resolved);
						}}
						disabled={filter.disabled}
					>
						<SelectTrigger className="min-h-11 w-full" aria-label={filter.label}>
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
	);
}

/**
 * Renders a shared table on desktop and stacked cards on mobile viewports.
 *
 * @param props - Component props
 * @returns Responsive data view element
 */
export function ResponsiveDataView<TData, TValue>({
	cardRenderer,
	getCardKey,
	cardListClassName,
	cardClassName,
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
}: ResponsiveDataViewProps<TData, TValue>): React.ReactElement {
	const isMobile = useIsMobile();
	const t = useTranslations('DataTable');
	const shouldShowToolbar =
		showToolbar ?? Boolean(showGlobalFilter || (facetedFilters && facetedFilters.length > 0));
	const resolvedPageSizes = pageSizeOptions ?? DEFAULT_PAGE_SIZES;

	// eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable helpers.
	const table = useReactTable({
		data,
		columns,
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
		onRowSelectionChange: onRowSelectionChange as OnChangeFn<RowSelectionState> | undefined,
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

	const pageCount = Math.max(table.getPageCount(), 1);
	const currentPage = pagination.pageIndex + 1;
	const mobileRows = table.getRowModel().rows;

	if (!isMobile) {
		return (
			<DataTable
				columns={columns}
				data={data}
				sorting={sorting}
				onSortingChange={onSortingChange}
				pagination={pagination}
				onPaginationChange={onPaginationChange}
				columnFilters={columnFilters}
				onColumnFiltersChange={onColumnFiltersChange}
				globalFilter={globalFilter}
				onGlobalFilterChange={onGlobalFilterChange}
				manualPagination={manualPagination}
				manualFiltering={manualFiltering}
				rowCount={rowCount}
				showToolbar={showToolbar}
				showGlobalFilter={showGlobalFilter}
				globalFilterPlaceholder={globalFilterPlaceholder}
				facetedFilters={facetedFilters}
				emptyState={emptyState}
				isLoading={isLoading}
				pageSizeOptions={pageSizeOptions}
				className={className}
				rowSelection={rowSelection}
				onRowSelectionChange={onRowSelectionChange}
				enableRowSelection={enableRowSelection}
				getRowId={getRowId}
			/>
		);
	}

	return (
		<div
			data-testid="responsive-data-view-mobile"
			className={cn('space-y-4', className)}
		>
			{shouldShowToolbar ? (
				<ResponsiveToolbar
					globalFilter={globalFilter}
					onGlobalFilterChange={onGlobalFilterChange}
					globalFilterPlaceholder={globalFilterPlaceholder}
					showGlobalFilter={showGlobalFilter}
					facetedFilters={facetedFilters}
					columnFilters={columnFilters}
					onColumnFiltersChange={
						onColumnFiltersChange as React.Dispatch<
							React.SetStateAction<DataTableProps<unknown, unknown>['columnFilters']>
						>
					}
				/>
			) : null}

			<div className={cn('grid gap-3', cardListClassName)}>
				{isLoading
					? Array.from({ length: Math.max(1, pagination.pageSize) }).map((_, index) => (
							<Card
								key={`loading-card-${index}`}
								className="overflow-hidden border-border/70 shadow-[var(--shadow-lg)]"
							>
								<CardContent className="space-y-3 p-4">
									<Skeleton className="h-5 w-32" />
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-11 w-full" />
								</CardContent>
							</Card>
						))
					: mobileRows.length > 0
						? mobileRows.map((row, index) => (
								<Card
									key={getCardKey?.(row.original, index) ?? row.id}
									data-testid="responsive-data-card"
									className={cn(
										'overflow-hidden border-border/80 bg-card shadow-[var(--shadow-lg)]',
										cardClassName,
									)}
								>
									<CardContent className="p-4">
										{cardRenderer(row.original)}
									</CardContent>
								</Card>
							))
						: (
							<Card className="border-dashed border-border/70 bg-card/70">
								<CardContent className="py-8 text-center text-sm text-muted-foreground">
									{emptyState ?? t('empty')}
								</CardContent>
							</Card>
						)}
			</div>

			<div className="grid gap-3 rounded-3xl border border-border/70 bg-muted/30 p-4">
				<div className="flex items-center justify-between gap-3">
					<span className="text-sm text-muted-foreground">
						{t('pagination.rowsPerPage')}
					</span>
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
						<SelectTrigger className="min-h-11 w-[108px]">
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

				<div className="flex flex-col gap-3">
					<span className="text-sm text-muted-foreground">
						{t('pagination.page', { current: currentPage, total: pageCount })}
					</span>
					<div className="grid grid-cols-4 gap-2">
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => table.setPageIndex(0)}
							disabled={!table.getCanPreviousPage()}
							aria-label={t('pagination.first')}
						>
							<ChevronsLeft className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
							aria-label={t('pagination.previous')}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
							aria-label={t('pagination.next')}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => table.setPageIndex(pageCount - 1)}
							disabled={!table.getCanNextPage()}
							aria-label={t('pagination.last')}
						>
							<ChevronsRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
