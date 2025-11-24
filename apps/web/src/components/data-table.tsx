"use client";

import * as React from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Column definition for the data table.
 */
export interface Column<T> {
	/** Unique key for the column */
	key: string;
	/** Display header for the column */
	header: string;
	/** Function to render cell content */
	cell: (item: T) => React.ReactNode;
	/** Optional class name for the column */
	className?: string;
}

/**
 * Data table component props interface.
 */
interface DataTableProps<T> {
	/** Column definitions */
	columns: Column<T>[];
	/** Data items to display */
	data: T[];
	/** Loading state */
	isLoading?: boolean;
	/** Key extractor for unique row keys */
	keyExtractor: (item: T) => string;
	/** Optional empty state message */
	emptyMessage?: string;
	/** Current page number (1-indexed) */
	page?: number;
	/** Total number of pages */
	totalPages?: number;
	/** Callback when page changes */
	onPageChange?: (page: number) => void;
	/** Optional row click handler */
	onRowClick?: (item: T) => void;
}

/**
 * Reusable data table component with pagination support.
 * Displays tabular data with customizable columns and loading states.
 *
 * @param props - Data table props
 * @returns Rendered data table component
 */
export function DataTable<T>({
	columns,
	data,
	isLoading = false,
	keyExtractor,
	emptyMessage = "No data found",
	page = 1,
	totalPages = 1,
	onPageChange,
	onRowClick,
}: DataTableProps<T>): React.JSX.Element {
	/**
	 * Renders loading skeleton rows.
	 *
	 * @returns Array of skeleton table rows
	 */
	const renderLoadingRows = (): React.JSX.Element[] => {
		return Array.from({ length: 5 }).map((_, index) => (
			<TableRow key={`skeleton-${index}`}>
				{columns.map((column) => (
					<TableCell key={column.key} className={column.className}>
						<Skeleton className="h-5 w-full" />
					</TableCell>
				))}
			</TableRow>
		));
	};

	/**
	 * Renders empty state message.
	 *
	 * @returns Empty state table row
	 */
	const renderEmptyState = (): React.JSX.Element => (
		<TableRow>
			<TableCell
				colSpan={columns.length}
				className="h-24 text-center text-muted-foreground"
			>
				{emptyMessage}
			</TableCell>
		</TableRow>
	);

	/**
	 * Renders data rows.
	 *
	 * @returns Array of data table rows
	 */
	const renderDataRows = (): React.JSX.Element[] => {
		return data.map((item) => (
			<TableRow
				key={keyExtractor(item)}
				className={onRowClick ? "cursor-pointer" : undefined}
				onClick={onRowClick ? () => onRowClick(item) : undefined}
			>
				{columns.map((column) => (
					<TableCell key={column.key} className={column.className}>
						{column.cell(item)}
					</TableCell>
				))}
			</TableRow>
		));
	};

	return (
		<div className="space-y-4">
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{columns.map((column) => (
								<TableHead key={column.key} className={column.className}>
									{column.header}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading
							? renderLoadingRows()
							: data.length === 0
								? renderEmptyState()
								: renderDataRows()}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			{totalPages > 1 && onPageChange && (
				<div className="flex items-center justify-between">
					<p className="text-sm text-muted-foreground">
						Page {page} of {totalPages}
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(page - 1)}
							disabled={page <= 1 || isLoading}
						>
							<ChevronLeft className="h-4 w-4" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(page + 1)}
							disabled={page >= totalPages || isLoading}
						>
							Next
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
