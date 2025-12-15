---
name: Fix Organization Creation Flow for Users Without Organizations
overview: ''
todos:
    - id: 34fc42ed-c1fb-404f-9551-aac65c717671
      content: Modify dashboard layout to allow /organizations route when no active organization exists
      status: pending
---

# Fix Organization Creation Flow for Users Without Organizations

## Problem Summary

When an admin user without an organization tries to create one, they encounter two issues:

1. **Wrong redirect URL**: The button in `NoOrganizationState` links to `/dashboard/organizations`, but since `(dashboard)` is a Next.js route group (not part of the URL), the correct path is `/organizations`
2. **Page blocked by layout**: The dashboard layout replaces all children with `NoOrganizationState` when no organization is active, preventing access to the organizations page where users can create one

## Files to Modify

### 1. [apps/web/components/no-organization-state.tsx](apps/web/components/no-organization-state.tsx)

Change line 58 from:

```tsx
<Link href="/dashboard/organizations">Go to organizations</Link>
```

to:

```tsx
<Link href="/organizations">Go to organizations</Link>
```

### 2. [apps/web/app/(dashboard)/layout.tsx](apps/web/app/(dashboard)/layout.tsx)

Modify the content rendering logic (lines 34-39) to allow the organizations page to render even when no organization is active. Add pathname detection and conditionally bypass the `NoOrganizationState` for the `/organizations` route:

- Import `headers` from `next/headers` to access the current pathname
- Check if the current path is `/organizations`
- If on `/organizations`, render children regardless of organization state
- Otherwise, keep the existing behavior (show `NoOrganizationState` when no org)

## Verification

After the fix:

- Admin users without an organization can click "Go to organizations" and be taken to `/organizations`
- The organizations page will render properly, showing the table (empty) with the "Create Organization" button
- Users can create their first organization
