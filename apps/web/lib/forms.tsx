/**
 * Shared TanStack Form utilities and pre-bound components.
 *
 * This module provides a centralized form configuration using TanStack Form's
 * `createFormHook` pattern. It exports pre-bound components and hooks that
 * integrate with the shadcn UI component library.
 *
 * @module lib/forms
 */

'use client';

import React from 'react';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Form Contexts
// ============================================================================

/**
 * Create form and field contexts for the custom form hook.
 * These contexts enable tree-shaking and lazy loading of components.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
	createFormHookContexts();

// ============================================================================
// Pre-bound Field Components
// ============================================================================

type CommonFieldProps = {
	label: string;
	placeholder?: string;
	description?: string;
	disabled?: boolean;
	orientation?: 'horizontal' | 'vertical';
	startIcon?: React.ComponentType<{ className?: string }>;
};

/**
 * Text input field with label and error display.
 */
export function TextField({
	label,
	placeholder,
	description,
	disabled,
	type = 'text',
	onValueChange,
	orientation = 'horizontal',
	startIcon: StartIcon,
}: CommonFieldProps & {
	type?: string;
	onValueChange?: (value: string) => string;
}): React.ReactElement {
	const field = useFieldContext();

	if (orientation === 'vertical') {
		return (
			<div className="grid gap-2">
				<Label htmlFor={field.name}>{label}</Label>
				<div className="relative">
					{StartIcon && (
						<div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
							<StartIcon className="h-4 w-4" />
						</div>
					)}
					<Input
						id={field.name}
						name={field.name}
						type={type}
						value={field.state.value as string}
						onChange={(e) => {
							const next = onValueChange
								? onValueChange(e.target.value)
								: e.target.value;
							field.handleChange(next);
						}}
						onBlur={field.handleBlur}
						placeholder={placeholder}
						disabled={disabled}
						className={cn(StartIcon && 'pl-10')}
					/>
				</div>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Input
					id={field.name}
					name={field.name}
					type={type}
					value={field.state.value as string}
					onChange={(e) => {
						const next = onValueChange ? onValueChange(e.target.value) : e.target.value;
						field.handleChange(next);
					}}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Textarea field with label and error display.
 */
export function TextareaField({
	label,
	placeholder,
	description,
	disabled,
	rows = 3,
}: CommonFieldProps & { rows?: number }): React.ReactElement {
	const field = useFieldContext();

	return (
		<div className="grid grid-cols-4 items-start gap-4">
			<Label htmlFor={field.name} className="text-right pt-2">
				{label}
			</Label>
			<div className="col-span-3">
				<Textarea
					id={field.name}
					name={field.name}
					value={field.state.value as string}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
					rows={rows}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Select field with label and error display.
 */
export function SelectField<TValue extends string>({
	label,
	placeholder,
	options,
	description,
	disabled,
	orientation = 'horizontal',
	onValueChange,
}: CommonFieldProps & {
	options: { value: TValue; label: string }[];
	placeholder?: string;
	onValueChange?: (value: TValue) => void;
}): React.ReactElement {
	const field = useFieldContext();

	if (orientation === 'vertical') {
		return (
			<div className="grid gap-2">
				<Label htmlFor={field.name}>{label}</Label>
				<Select
					value={(field.state.value as TValue) ?? ''}
					onValueChange={(value: TValue) => {
						field.handleChange(value);
						onValueChange?.(value);
					}}
					disabled={disabled}
				>
					<SelectTrigger id={field.name}>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						{options.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Select
					value={(field.state.value as TValue) ?? ''}
					onValueChange={(value: TValue) => {
						field.handleChange(value);
						onValueChange?.(value);
					}}
					disabled={disabled}
				>
					<SelectTrigger id={field.name}>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						{options.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Time input field with label and error display.
 *
 * @param props - Component props including label and optional description
 * @returns A rendered time input field
 */
export function TimeField({
	label,
	placeholder,
	description,
	disabled,
	orientation = 'horizontal',
}: CommonFieldProps & { orientation?: 'horizontal' | 'vertical' }): React.ReactElement {
	const field = useFieldContext();

	if (orientation === 'vertical') {
		return (
			<div className="grid gap-2">
				<Label htmlFor={field.name}>{label}</Label>
				<Input
					id={field.name}
					name={field.name}
					type="time"
					value={(field.state.value as string) ?? ''}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Input
					id={field.name}
					name={field.name}
					type="time"
					value={(field.state.value as string) ?? ''}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Date input field with label and error display.
 *
 * @param props - Component props including label and optional description
 * @returns A rendered date input field
 */
export function DateField({
	label,
	placeholder,
	description,
	disabled,
	orientation = 'horizontal',
}: CommonFieldProps & { orientation?: 'horizontal' | 'vertical' }): React.ReactElement {
	const field = useFieldContext();

	if (orientation === 'vertical') {
		return (
			<div className="grid gap-2">
				<Label htmlFor={field.name}>{label}</Label>
				<Input
					id={field.name}
					name={field.name}
					type="date"
					value={(field.state.value as string) ?? ''}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Input
					id={field.name}
					name={field.name}
					type="date"
					value={(field.state.value as string) ?? ''}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
					placeholder={placeholder}
					disabled={disabled}
				/>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Toggle (checkbox) field with label and error display.
 *
 * @param props - Component props including label and optional description
 * @returns A rendered toggle input field
 */
export function ToggleField({
	label,
	description,
	disabled,
	orientation = 'horizontal',
}: CommonFieldProps & { orientation?: 'horizontal' | 'vertical' }): React.ReactElement {
	const field = useFieldContext();
	const checked = Boolean(field.state.value);

	if (orientation === 'vertical') {
		return (
			<div className="grid gap-2">
				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id={field.name}
						checked={checked}
						onChange={(e) => field.handleChange(e.target.checked)}
						onBlur={field.handleBlur}
						disabled={disabled}
						className="h-4 w-4 accent-primary"
					/>
					<Label htmlFor={field.name}>{label}</Label>
				</div>
				{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3 flex items-center gap-2">
				<input
					type="checkbox"
					id={field.name}
					checked={checked}
					onChange={(e) => field.handleChange(e.target.checked)}
					onBlur={field.handleBlur}
					disabled={disabled}
					className="h-4 w-4 accent-primary"
				/>
				{description && <p className="text-xs text-muted-foreground">{description}</p>}
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Pre-bound Form Components
// ============================================================================

/**
 * Submit button that tracks form submission state.
 */
export function SubmitButton({
	label,
	loadingLabel,
	className,
}: {
	label: string;
	loadingLabel?: string;
	className?: string;
}): React.ReactElement {
	const form = useFormContext();
	const t = useTranslations('Common');
	const resolvedLoadingLabel = loadingLabel ?? t('saving');

	return (
		<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
			{([canSubmit, isSubmitting]) => (
				<Button type="submit" disabled={!canSubmit || isSubmitting} className={className}>
					{isSubmitting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							{resolvedLoadingLabel}
						</>
					) : (
						label
					)}
				</Button>
			)}
		</form.Subscribe>
	);
}

// ============================================================================
// Custom Form Hook
// ============================================================================

/**
 * Custom form hook with pre-bound components for the SEN CheckIn app.
 *
 * This hook wraps TanStack Form's `useForm` with app-specific defaults
 * and pre-bound components that integrate with shadcn UI.
 *
 * @example
 * ```tsx
 * const form = useAppForm({
 *   defaultValues: {
 *     name: '',
 *     email: '',
 *   },
 *   onSubmit: async ({ value }) => {
 *     await saveData(value);
 *   },
 * });
 *
 * return (
 *   <form.AppForm>
 *     <form.AppField name="name" children={(field) => (
 *       <field.TextField label="Name" />
 *     )} />
 *     <form.SubmitButton label="Save" />
 *   </form.AppForm>
 * );
 * ```
 */
export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField,
		TextareaField,
		SelectField,
		TimeField,
		DateField,
		ToggleField,
	},
	formComponents: {
		SubmitButton,
	},
});

// ============================================================================
// Re-exports from @tanstack/react-form
// ============================================================================

/**
 * Re-export commonly used TanStack Form utilities for convenience.
 */
export { useForm, useStore, formOptions } from '@tanstack/react-form';

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export useful types from TanStack Form.
 */
export type {
	FormApi,
	FieldApi,
	FormOptions,
	FieldOptions,
	FormState,
	FieldState,
	FieldMeta,
} from '@tanstack/react-form';
