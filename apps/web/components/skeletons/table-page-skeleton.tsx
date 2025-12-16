import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import React from 'react';

/**
 * Props for the TablePageSkeleton component.
 */
interface TablePageSkeletonProps {
	/** Title text for the page header */
	title: string;
	/** Description text for the page header */
	description: string;
	/** Column headers for the table */
	columns: string[];
	/** Number of skeleton rows to display */
	rowCount?: number;
	/** Whether to show the search input skeleton */
	showSearch?: boolean;
	/** Whether to show the add button skeleton */
	showAddButton?: boolean;
	/** Additional filter skeletons count */
	filterCount?: number;
}

/**
 * Reusable skeleton component for table-based pages.
 * Provides a consistent loading state for CRUD list pages.
 *
 * @param props - The component props
 * @returns The table page skeleton JSX element
 */
export function TablePageSkeleton({
	title,
	description,
	columns,
	rowCount = 5,
	showSearch = true,
	showAddButton = true,
	filterCount = 0,
}: TablePageSkeletonProps): React.ReactElement {
	return (
		<div className="space-y-6">
			{/* Header with title and action button */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{title}</h1>
					<p className="text-muted-foreground">{description}</p>
				</div>
				{showAddButton && <Skeleton className="h-10 w-32" />}
			</div>

			{/* Search and filters */}
			{(showSearch || filterCount > 0) && (
				<div className="flex flex-wrap items-center gap-4">
					{showSearch && (
						<div className="relative flex-1 max-w-sm">
							<Skeleton className="h-10 w-full" />
						</div>
					)}
					{Array.from({ length: filterCount }).map((_, i) => (
						<Skeleton key={i} className="h-10 w-[150px]" />
					))}
				</div>
			)}

			{/* Table skeleton */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{columns.map((column) => (
								<TableHead key={column}>{column}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{Array.from({ length: rowCount }).map((_, i) => (
							<TableRow key={i}>
								{columns.map((_, j) => (
									<TableCell key={j}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
