'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Root accordion component for collapsible sections.
 *
 * @param props - Props for AccordionPrimitive.Root.
 * @returns Accordion root element.
 */
function Accordion({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
	return (
		<AccordionPrimitive.Root
			data-slot="accordion"
			className={cn('w-full', className)}
			{...props}
		/>
	);
}

/**
 * Accordion item wrapper for an individual collapsible block.
 *
 * @param props - Props for AccordionPrimitive.Item.
 * @param ref - Forwarded ref for the item element.
 * @returns Accordion item element.
 */
const AccordionItem = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
	<AccordionPrimitive.Item
		ref={ref}
		data-slot="accordion-item"
		className={cn('border-b', className)}
		{...props}
	/>
));
AccordionItem.displayName = 'AccordionItem';

/**
 * Accordion trigger button used to toggle an item's visibility.
 *
 * @param props - Props for AccordionPrimitive.Trigger.
 * @param ref - Forwarded ref for the trigger element.
 * @returns Accordion trigger element.
 */
const AccordionTrigger = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<AccordionPrimitive.Header data-slot="accordion-header" className="flex">
		<AccordionPrimitive.Trigger
			ref={ref}
			data-slot="accordion-trigger"
			className={cn(
				'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-colors [&[data-state=open]>svg]:rotate-180',
				className,
			)}
			{...props}
		>
			{children}
			<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
		</AccordionPrimitive.Trigger>
	</AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

/**
 * Accordion content wrapper that animates open/close transitions.
 *
 * @param props - Props for AccordionPrimitive.Content.
 * @param ref - Forwarded ref for the content element.
 * @returns Accordion content element.
 */
const AccordionContent = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<AccordionPrimitive.Content
		ref={ref}
		data-slot="accordion-content"
		className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
		{...props}
	>
		<div className={cn('pb-4 pt-0', className)}>{children}</div>
	</AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
