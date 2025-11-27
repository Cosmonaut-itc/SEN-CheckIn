/**
 * Shared TanStack Form utilities and pre-bound components.
 *
 * This module provides a centralized form configuration using TanStack Form's
 * `createFormHook` pattern. It exports pre-bound components and hooks that
 * integrate with the shadcn UI component library.
 *
 * @module lib/forms
 */

import {
	createFormHook,
	createFormHookContexts,
} from '@tanstack/react-form';

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

// Note: Pre-bound field components will be added here as needed.
// For now, we use inline field rendering with form.Field in components.
// Future additions could include:
// - TextField - for text inputs with label and error handling
// - SelectField - for select dropdowns with label and error handling
// - TextareaField - for multiline text inputs
// - CheckboxField - for boolean inputs

// ============================================================================
// Pre-bound Form Components
// ============================================================================

// Note: Pre-bound form components will be added here as needed.
// Future additions could include:
// - SubmitButton - a submit button that shows loading state

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
		// Pre-bound field components will be registered here
	},
	formComponents: {
		// Pre-bound form components will be registered here
	},
});

// ============================================================================
// Re-exports from @tanstack/react-form
// ============================================================================

/**
 * Re-export commonly used TanStack Form utilities for convenience.
 */
export {
	useForm,
	useStore,
	formOptions,
} from '@tanstack/react-form';

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

