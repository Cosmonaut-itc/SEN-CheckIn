# Release 06 - TanStack Form Architecture

## Overview

All dashboard and auth forms now share a single TanStack Form toolkit defined in `apps/web/lib/forms.tsx`. The toolkit exposes:

- `useAppForm`: app-scoped `useForm` wrapper with shared contexts
- Pre-bound fields: `TextField`, `TextareaField`, `SelectField`
- Pre-bound submit control: `SubmitButton`

This replaces per-page `useState` form data and ad-hoc `useForm` wiring. Every form now renders via `form.Field` + shared components, keeping validation, error display, and disabled states consistent.

## How It Works

1) **Hook** — Pages call `useAppForm({ defaultValues, onSubmit })`. On submit, mutations use `mutateAsync`, then reset/close dialogs as needed.

2) **Fields** — `form.Field` supplies state; shared components render inputs and errors. `SelectField` takes `{ value, label }[]` options; `TextField` supports `type`, `placeholder`, and optional `onValueChange` (used for slug autogeneration in organizations).

3) **Submit** — `SubmitButton` subscribes to `canSubmit`/`isSubmitting` and shows a loading label with spinner.

4) **Validation** — Field-level validators live inline on `form.Field` (`onChange` validators for required fields, etc.). Auth forms include password/email validation in `onSubmit` when cross-field checks are needed.

## Page Coverage

- Dashboard CRUD: clients, locations, devices, organizations, API keys, job positions, employees (create/edit dialog), plus associated selects (status, job position).
- Auth: sign-in and sign-up forms now run through `useAppForm` with shared fields and `SubmitButton`.

## Usage Pattern (example)

```tsx
const form = useAppForm({
  defaultValues: { name: '' },
  onSubmit: async ({ value }) => {
    await createMutation.mutateAsync(value);
  },
});

return (
  <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
    <form.Field name="name" validators={{ onChange: ({ value }) => (!value.trim() ? 'Required' : undefined) }}>
      {() => <TextField label="Name" />}
    </form.Field>
    <SubmitButton label="Save" />
  </form>
);
```

## Conventions

- Use `mutateAsync` inside `onSubmit`, then close/reset dialogs (`setIsDialogOpen(false); form.reset();`).
- Prefer `queryKeys.<entity>.all` invalidation in mutation success handlers for cache freshness.
- Keep option lists stable by deriving from React Query data (`jobPositions`, etc.).
- For derived values (e.g., slug), pass `onValueChange` to `TextField` and set other fields via `form.setFieldValue`.

## Follow-ups

- Add additional pre-bound components (checkbox, switch, date picker) as needed.
- Consider centralizing cross-field validators (e.g., password confirmation) via custom validators/helpers in `lib/forms.tsx`.
