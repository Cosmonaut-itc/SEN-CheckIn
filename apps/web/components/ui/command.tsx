'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

/**
 * Base command container component.
 *
 * @param props - Props for the cmdk Command primitive.
 * @returns The command container element.
 */
function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>): React.ReactElement {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Dialog wrapper for command palettes.
 *
 * @param props - Props for the dialog and optional title/description.
 * @returns The dialog-wrapped command palette.
 */
function CommandDialog({
	title,
	description,
	children,
	className,
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof Dialog> & {
	title?: string;
	description?: string;
	className?: string;
	showCloseButton?: boolean;
}): React.ReactElement {
	const hasHeader = Boolean(title || description);

	return (
		<Dialog {...props}>
			{hasHeader && (
				<DialogHeader className="sr-only">
					{title && <DialogTitle>{title}</DialogTitle>}
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
			)}
			<DialogContent
				className={cn('overflow-hidden p-0', className)}
				showCloseButton={showCloseButton}
			>
				<Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Input field for command search.
 *
 * @param props - Props for the cmdk input primitive.
 * @returns The command input element.
 */
function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>): React.ReactElement {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex h-9 items-center gap-2 border-b px-3"
		>
			<SearchIcon className="size-4 shrink-0 opacity-50" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					'placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
					className,
				)}
				{...props}
			/>
		</div>
	);
}

/**
 * Scrollable list container for command items.
 *
 * @param props - Props for the cmdk list primitive.
 * @returns The command list element.
 */
function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>): React.ReactElement {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn(
				'max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Empty state for command results.
 *
 * @param props - Props for the cmdk empty primitive.
 * @returns The command empty element.
 */
function CommandEmpty({
	...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>): React.ReactElement {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className="py-6 text-center text-sm"
			{...props}
		/>
	);
}

/**
 * Group container for command items.
 *
 * @param props - Props for the cmdk group primitive.
 * @returns The command group element.
 */
function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>): React.ReactElement {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				'text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Divider between command groups.
 *
 * @param props - Props for the cmdk separator primitive.
 * @returns The command separator element.
 */
function CommandSeparator({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>): React.ReactElement {
	return (
		<CommandPrimitive.Separator
			data-slot="command-separator"
			className={cn('bg-border -mx-1 h-px', className)}
			{...props}
		/>
	);
}

/**
 * Individual command item.
 *
 * @param props - Props for the cmdk item primitive.
 * @returns The command item element.
 */
function CommandItem({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item>): React.ReactElement {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Keyboard shortcut hint for command items.
 *
 * @param props - Props for the shortcut container.
 * @returns The shortcut element.
 */
function CommandShortcut({
	className,
	...props
}: React.ComponentProps<'span'>): React.ReactElement {
	return (
		<span
			data-slot="command-shortcut"
			className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
};