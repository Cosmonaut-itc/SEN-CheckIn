'use client';

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AlertDialog({
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>): React.ReactElement {
	return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogPortal({
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>): React.ReactElement {
	return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>): React.ReactElement {
	return (
		<AlertDialogPrimitive.Overlay
			data-slot="alert-dialog-overlay"
			className={cn(
				'fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				className,
			)}
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>): React.ReactElement {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPrimitive.Content
				data-slot="alert-dialog-content"
				className={cn(
					'fixed top-[50%] left-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-background p-4 shadow-[var(--shadow-lg)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 min-[1025px]:p-6',
					className,
				)}
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({
	className,
	...props
}: React.ComponentProps<'div'>): React.ReactElement {
	return <div data-slot="alert-dialog-header" className={cn('space-y-2', className)} {...props} />;
}

function AlertDialogFooter({
	className,
	...props
}: React.ComponentProps<'div'>): React.ReactElement {
	return (
		<div
			data-slot="alert-dialog-footer"
			className={cn('flex flex-col-reverse gap-2 min-[1025px]:flex-row min-[1025px]:justify-end', className)}
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.ReactElement {
	return (
		<AlertDialogPrimitive.Title
			data-slot="alert-dialog-title"
			className={cn('text-lg font-semibold', className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): React.ReactElement {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			className={cn('text-sm text-muted-foreground', className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>): React.ReactElement {
	return (
		<AlertDialogPrimitive.Action
			className={cn(buttonVariants(), className)}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>): React.ReactElement {
	return (
		<AlertDialogPrimitive.Cancel
			className={cn(buttonVariants({ variant: 'outline' }), className)}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
};
