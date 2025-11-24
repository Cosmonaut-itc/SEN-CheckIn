import { cn } from "@/lib/utils";

/**
 * Skeleton component props interface.
 * Extends standard HTML div attributes.
 */
type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton component for loading states.
 * Displays a pulsing placeholder while content is loading.
 *
 * @param props - Skeleton component props
 * @returns Rendered skeleton element
 */
function Skeleton({ className, ...props }: SkeletonProps): React.JSX.Element {
	return (
		<div
			className={cn("animate-pulse rounded-md bg-primary/10", className)}
			{...props}
		/>
	);
}

export { Skeleton };
