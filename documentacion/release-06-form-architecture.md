# Release 06 - TanStack Form Architecture

## Overview

All dashboard and auth forms now share a single TanStack Form toolkit defined in `apps/web/lib/forms.tsx`. The toolkit uses TanStack Form's `createFormHook` pattern with pre-bound field and form components.

### Exports from `lib/forms.tsx`

- `useAppForm`: app-scoped form hook created via `createFormHook` with shared contexts
- Pre-bound field components (registered in `fieldComponents`): `TextField`, `TextareaField`, `SelectField`
- Pre-bound form components (registered in `formComponents`): `SubmitButton`
- Context utilities: `fieldContext`, `formContext`, `useFieldContext`, `useFormContext`

This replaces per-page `useState` form data and ad-hoc `useForm` wiring. Every form now renders via `form.AppField` + field-scoped components, keeping validation, error display, and disabled states consistent.

## How It Works

1. **Hook** — Pages import only `useAppForm` from `@/lib/forms`. Call `useAppForm({ defaultValues, onSubmit })`. On submit, mutations use `mutateAsync`, then reset/close dialogs as needed.

2. **Fields** — Use `form.AppField` (not `form.Field`) to provide the necessary context for registered field components. Access components via the field parameter: `{(field) => <field.TextField ... />}`. `SelectField` takes `{ value, label }[]` options; `TextField` supports `type`, `placeholder`, and optional `onValueChange` (used for slug autogeneration in organizations).

3. **Submit** — Wrap `form.SubmitButton` inside `form.AppForm` to provide form context. The button subscribes to `canSubmit`/`isSubmitting` and shows a loading label with spinner.

4. **Validation** — Field-level validators live inline on `form.AppField` (`onChange` validators for required fields, etc.). Auth forms include password/email validation in `onSubmit` when cross-field checks are needed.

## Important: AppField vs Field

When using `createFormHook`, you **must** use `form.AppField` instead of `form.Field`:

- `form.AppField` — Provides the `fieldContext` required by registered field components (TextField, etc.)
- `form.Field` — Standard TanStack Form field without the custom context (will cause runtime errors with registered components)

Similarly, form components like `SubmitButton` must be accessed via `form.SubmitButton` and wrapped in `form.AppForm`.

## Page Coverage

- Dashboard CRUD: locations, devices, organizations, API keys, job positions, employees (create/edit dialog), plus associated selects (status, job position).
- Auth: sign-in and sign-up forms now run through `useAppForm` with shared fields and `SubmitButton`.

## Usage Pattern (example)

```tsx
import { useAppForm } from '@/lib/forms';

const form = useAppForm({
	defaultValues: { name: '' },
	onSubmit: async ({ value }) => {
		await createMutation.mutateAsync(value);
	},
});

return (
	<form
		onSubmit={(e) => {
			e.preventDefault();
			form.handleSubmit();
		}}
	>
		<form.AppField
			name="name"
			validators={{ onChange: ({ value }) => (!value.trim() ? 'Required' : undefined) }}
		>
			{(field) => <field.TextField label="Name" />}
		</form.AppField>
		<form.AppForm>
			<form.SubmitButton label="Save" />
		</form.AppForm>
	</form>
);
```

### With SelectField

```tsx
<form.AppField name="status">
	{(field) => (
		<field.SelectField
			label="Status"
			options={[
				{ value: 'ACTIVE', label: 'Active' },
				{ value: 'INACTIVE', label: 'Inactive' },
			]}
			placeholder="Select status"
		/>
	)}
</form.AppField>
```

### With onValueChange (derived fields)

```tsx
<form.AppField name="name">
	{(field) => (
		<field.TextField
			label="Name"
			onValueChange={(val) => {
				form.setFieldValue('slug', generateSlug(val));
				return val;
			}}
		/>
	)}
</form.AppField>
```

## Conventions

- Import only `useAppForm` from `@/lib/forms` — field/form components are accessed via the form instance.
- Use `form.AppField` with `{(field) => <field.ComponentName ... />}` pattern.
- Use `mutateAsync` inside `onSubmit`, then close/reset dialogs (`setIsDialogOpen(false); form.reset();`).
- Prefer `queryKeys.<entity>.all` invalidation in mutation success handlers for cache freshness.
- Keep option lists stable by deriving from React Query data (`jobPositions`, etc.).
- For derived values (e.g., slug), pass `onValueChange` to `TextField` and set other fields via `form.setFieldValue`.

## Follow-ups

- Add additional pre-bound components (checkbox, switch, date picker) as needed.
- Consider centralizing cross-field validators (e.g., password confirmation) via custom validators/helpers in `lib/forms.tsx`.
