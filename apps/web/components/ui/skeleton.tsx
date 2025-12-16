import { cn } from '@/lib/utils';

/**
 * Skeleton loading component for displaying placeholder content during data fetching.
 *
 * @param className - Optional CSS class name string to apply additional styling
 * @param props - Additional div element props from React.ComponentProps<'div'>
 * @returns JSX element containing a skeleton placeholder div
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			className={cn('bg-accent animate-pulse rounded-md', className)}
			{...props}
		/>
	);
}

export { Skeleton };
