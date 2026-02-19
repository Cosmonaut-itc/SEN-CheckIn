import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
	'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm shadow-xs has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
	{
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				neutral: 'border-border bg-muted/35 text-foreground',
				accent:
					'border-[color:var(--accent-primary)]/25 bg-[var(--accent-primary-bg)] text-[var(--accent-primary)]',
				success:
					'border-[color:var(--status-success)]/35 bg-[var(--status-success-bg)] text-[var(--status-success)]',
				warning:
					'border-[color:var(--status-warning)]/35 bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
				error:
					'border-[color:var(--status-error)]/35 bg-[var(--status-error-bg)] text-[var(--status-error)]',
				info: 'border-[color:var(--status-info)]/35 bg-[var(--status-info-bg)] text-[var(--status-info)]',
				destructive:
					'border-[color:var(--status-error)]/35 bg-[var(--status-error-bg)] text-[var(--status-error)]',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			role="alert"
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="alert-title"
			className={cn('col-start-2 min-h-4 line-clamp-1 font-semibold tracking-tight', className)}
			{...props}
		/>
	);
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				'text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
				className,
			)}
			{...props}
		/>
	);
}

export { Alert, AlertTitle, AlertDescription };
