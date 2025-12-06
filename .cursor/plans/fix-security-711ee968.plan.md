---
name: Fix Security Vulnerability - Proxy Middleware Not Executing
overview: ""
todos:
  - id: 3eaf39b5-2603-4091-8e75-472297a5ca61
    content: Test that unauthenticated users are redirected to sign-in page
    status: pending
---

# Fix Security Vulnerability - Proxy Middleware Not Executing

## Problem Analysis

The security vulnerability exists because the authentication middleware in [`apps/web/proxy.ts`](apps/web/proxy.ts) is **not being executed** by Next.js 16. This allows unauthenticated users to access protected dashboard routes.

### Root Cause

In Next.js 16, the middleware file convention changed from `middleware.ts` to `proxy.ts`. However, the function must be exported as the **default export**, not a named export:

**Current (broken):**

```typescript
export async function proxy(request: NextRequest): Promise<NextResponse> {
```

**Required:**

```typescript
export default async function proxy(request: NextRequest): Promise<NextResponse> {
```

### Impact

- Any user can navigate directly to `/dashboard`, `/employees`, `/organizations`, etc. without authentication
- The `NoOrganizationState` component renders for unauthenticated users instead of redirecting to sign-in
- Session validation only happens at the layout level, but the layout still renders (showing the sidebar and empty state)

## Solution

### 1. Fix the proxy export in [`apps/web/proxy.ts`](apps/web/proxy.ts)

Change the named export to a default export on line 44:

```typescript
export default async function proxy(request: NextRequest): Promise<NextResponse> {
```

This single change will activate the middleware and enforce authentication checks on all protected routes defined in the `matcher` config.

### 2. Verify the matcher configuration

The current matcher already covers all protected routes:

```typescript
export const config = {
  matcher: [
    '/sign-in',
    '/sign-up',
    '/dashboard/:path*',
    '/employees/:path*',
    '/devices/:path*',
    '/locations/:path*',
    '/attendance/:path*',
    '/api-keys/:path*',
    '/users/:path*',
    '/organizations/:path*',
    '/job-positions/:path*',
  ],
};
```

## Testing Plan

After applying the fix:

1. Clear browser cookies/session
2. Navigate directly to `/dashboard` - should redirect to `/sign-in`
3. Navigate directly to `/employees` - should redirect to `/sign-in`
4. Sign in with valid credentials - should redirect to `/dashboard`
5. Sign out and verify protected routes redirect again