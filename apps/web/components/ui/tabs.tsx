'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

/**
 * Root tabs container component for organizing content into tabbed sections.
 *
 * @param props - Props from React.ComponentProps<typeof TabsPrimitive.Root>
 * @param className - Optional CSS class name string to apply additional styling
 * @returns JSX element containing the tabs root container
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn('flex flex-col gap-2', className)}
			{...props}
		/>
	);
}

/**
 * Tabs list container component that holds tab triggers.
 *
 * @param props - Props from React.ComponentProps<typeof TabsPrimitive.List>
 * @param className - Optional CSS class name string to apply additional styling
 * @returns JSX element containing the tabs list container
 */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				'bg-muted text-muted-foreground inline-flex h-10 w-fit items-center justify-center rounded-lg border border-[color:var(--border-subtle)] p-[3px]',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Tab trigger button component for switching between tab panels.
 *
 * @param props - Props from React.ComponentProps<typeof TabsPrimitive.Trigger>
 * @param className - Optional CSS class name string to apply additional styling
 * @returns JSX element containing a tab trigger button
 */
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"data-[state=active]:bg-background data-[state=active]:text-[var(--accent-primary)] data-[state=active]:border-[color:var(--border-default)] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow,background-color] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-xs [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Tab content panel component that displays content for the active tab.
 *
 * @param props - Props from React.ComponentProps<typeof TabsPrimitive.Content>
 * @param className - Optional CSS class name string to apply additional styling
 * @returns JSX element containing the tab content panel
 */
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn('flex-1 outline-none', className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
