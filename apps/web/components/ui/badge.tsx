import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
	{
		variants: {
			variant: {
				default:
					'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
				accent:
					'border-transparent bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] [a&]:hover:bg-[var(--accent-primary-bg-hover)]',
				neutral:
					'border-[color:var(--border-default)] bg-muted text-muted-foreground [a&]:hover:bg-[var(--bg-tertiary)]',
				success:
					'border-transparent bg-[var(--status-success-bg)] text-[var(--status-success)] [a&]:hover:opacity-90',
				warning:
					'border-transparent bg-[var(--status-warning-bg)] text-[var(--status-warning)] [a&]:hover:opacity-90',
				error:
					'border-transparent bg-[var(--status-error-bg)] text-[var(--status-error)] [a&]:hover:opacity-90',
				info: 'border-transparent bg-[var(--status-info-bg)] text-[var(--status-info)] [a&]:hover:opacity-90',
				secondary:
					'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
				destructive:
					'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
				outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : 'span';

	return (
		<Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
