# Release 05 - TanStack Form Migration Plan

## Summary

This document outlines the phased migration plan for converting all existing forms in the SEN CheckIn web app to use TanStack Form. The migration follows the patterns established in the Job Positions and Employees pages, using the shared form helpers in `apps/web/lib/forms.ts`.

## Current Form Inventory

### Already Migrated (Phase 1 - Complete)

| Form                     | Location                                                          | Complexity                     | Status      |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------ | ----------- |
| Job Position Create/Edit | `apps/web/app/(dashboard)/job-positions/job-positions-client.tsx` | Simple (2 fields)              | ✅ Migrated |
| Employee Create/Edit     | `apps/web/app/(dashboard)/employees/employees-client.tsx`         | Complex (8 fields, validation) | ✅ Migrated |

### Dashboard CRUD Forms (Phase 2 - Pending)

| Form                     | Location                                                          | Complexity | Fields                                         | Notes                     |
| ------------------------ | ----------------------------------------------------------------- | ---------- | ---------------------------------------------- | ------------------------- |
| Client Create/Edit       | `apps/web/app/(dashboard)/clients/clients-client.tsx`             | Simple     | 1 (name)                                       | Straightforward migration |
| Location Create/Edit     | `apps/web/app/(dashboard)/locations/locations-client.tsx`         | Medium     | 4 (name, code, address, clientId)              | clientId is conditional   |
| Device Create/Edit       | `apps/web/app/(dashboard)/devices/devices-client.tsx`             | Medium     | 5 (code, name, deviceType, status, locationId) | Status is enum            |
| Organization Create/Edit | `apps/web/app/(dashboard)/organizations/organizations-client.tsx` | Simple     | 2 (name, slug)                                 | Uses BetterAuth           |
| API Key Create           | `apps/web/app/(dashboard)/api-keys/api-keys-client.tsx`           | Simple     | 1 (name)                                       | Uses BetterAuth           |

### Auth Forms (Phase 3 - Pending)

| Form    | Location                               | Complexity | Fields                     | Notes                  |
| ------- | -------------------------------------- | ---------- | -------------------------- | ---------------------- |
| Sign In | `apps/web/app/(auth)/sign-in/page.tsx` | Simple     | 2 (email, password)        | Uses BetterAuth signIn |
| Sign Up | `apps/web/app/(auth)/sign-up/page.tsx` | Medium     | 3+ (name, email, password) | Uses BetterAuth signUp |

## Migration Strategy

### Phase 2: Dashboard CRUD Forms

**Priority Order:**

1. **Clients** - Simplest form (1 field), good starting point
2. **Locations** - Medium complexity, similar to existing patterns
3. **Devices** - Medium complexity, includes enum field
4. **Organizations** - Simple but uses BetterAuth
5. **API Keys** - Simple but uses BetterAuth

**Migration Steps for Each Form:**

1. Import `useForm` from `@tanstack/react-form`
2. Replace `useState` form data with TanStack Form instance
3. Convert each field to `<form.Field>` with validators
4. Update submit handler to use `form.handleSubmit()`
5. Use `form.Subscribe` for submit button state
6. Add `useCallback` for handlers that depend on form
7. Update dialog `onOpenChange` to reset form on close

### Phase 3: Auth Forms

**Considerations:**

- Auth forms use BetterAuth's `signIn` and `signUp` methods
- May benefit from TanStack Form's server-side validation integration
- Could use `createServerValidate` for enhanced validation flow

**Migration Steps:**

1. Evaluate whether to use client-only or SSR validation
2. If SSR: implement `createServerValidate` pattern
3. If client-only: follow standard migration pattern
4. Ensure proper error handling for auth failures

## Shared Form Helpers Extension Plan

### Pre-bound Field Components (Future)

The `apps/web/lib/forms.ts` module can be extended with pre-bound components:

```tsx
// TextField - for text inputs
function TextField({ label }: { label: string }) {
	const field = useFieldContext();
	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Input
					id={field.name}
					value={field.state.value}
					onChange={(e) => field.handleChange(e.target.value)}
					onBlur={field.handleBlur}
				/>
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}

// SelectField - for select dropdowns
function SelectField<T extends string>({
	label,
	options,
	placeholder,
}: {
	label: string;
	options: { value: T; label: string }[];
	placeholder?: string;
}) {
	const field = useFieldContext();
	return (
		<div className="grid grid-cols-4 items-center gap-4">
			<Label htmlFor={field.name} className="text-right">
				{label}
			</Label>
			<div className="col-span-3">
				<Select value={field.state.value} onValueChange={field.handleChange}>
					<SelectTrigger>
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
				{field.state.meta.errors.length > 0 && (
					<p className="mt-1 text-sm text-destructive">
						{field.state.meta.errors.join(', ')}
					</p>
				)}
			</div>
		</div>
	);
}
```

### Pre-bound Form Components (Future)

```tsx
// SubmitButton - shows loading state
function SubmitButton({
	label,
	loadingLabel = 'Saving...',
}: {
	label: string;
	loadingLabel?: string;
}) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
			{([canSubmit, isSubmitting]) => (
				<Button type="submit" disabled={!canSubmit || isSubmitting}>
					{isSubmitting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							{loadingLabel}
						</>
					) : (
						label
					)}
				</Button>
			)}
		</form.Subscribe>
	);
}
```

## Testing Recommendations

1. **Unit Tests**: Add tests for form validation logic
2. **Integration Tests**: Test form submission flows with mocked mutations
3. **E2E Tests**: Test complete user flows including form interactions

## Success Criteria

- [ ] All dashboard CRUD forms migrated to TanStack Form
- [ ] All auth forms migrated to TanStack Form
- [ ] Shared pre-bound components created and documented
- [ ] No regressions in form functionality
- [ ] Consistent validation UX across all forms
- [ ] TypeScript strict mode compliance maintained

## References

- TanStack Form Documentation: https://tanstack.com/form/latest
- TanStack Form SSR Guide: https://github.com/tanstack/form/blob/main/docs/framework/react/guides/ssr.md
- TanStack Form Composition Guide: https://github.com/tanstack/form/blob/main/docs/framework/react/guides/form-composition.md
- Context7 MCP Library ID: `/tanstack/form`
