import type React from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Props for the responsive page header component.
 */
export interface ResponsivePageHeaderProps {
	/** Main page title. */
	title: string;
	/** Optional supporting description below the title. */
	description?: string;
	/** Optional action area rendered beside or below the heading copy. */
	actions?: ReactNode;
	/** Optional class name applied to the root element. */
	className?: string;
}

/**
 * Renders a page header that stacks actions below the title on mobile viewports.
 *
 * @param props - Component props
 * @returns Responsive page header element
 */
export function ResponsivePageHeader({
	title,
	description,
	actions,
	className,
}: ResponsivePageHeaderProps): React.ReactElement {
	return (
		<section
			data-testid="responsive-page-header"
			className={cn(
				'flex flex-col gap-3 min-[1025px]:flex-row min-[1025px]:items-start min-[1025px]:justify-between',
				className,
			)}
		>
			<div className="space-y-1">
				<h1 className="text-3xl font-bold tracking-tight">{title}</h1>
				{description ? <p className="text-muted-foreground">{description}</p> : null}
			</div>
			{actions ? (
				<div
					data-testid="responsive-page-header-actions"
					className={cn(
						'flex w-full flex-col gap-2',
						'[&_a]:inline-flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:justify-center',
						'[&_button]:min-h-11 [&_button]:w-full',
						'min-[1025px]:w-auto min-[1025px]:flex-row min-[1025px]:items-start min-[1025px]:justify-end',
						'min-[1025px]:[&_a]:w-auto min-[1025px]:[&_button]:w-auto',
					)}
				>
					{actions}
				</div>
			) : null}
		</section>
	);
}
