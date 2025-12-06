---
name: Device Verification Fixes Plan
overview: ""
todos:
  - id: 6e524f07-13bc-4d52-8c35-5d74d9289b9b
    content: Update proxy.ts to preserve callbackUrl when redirecting from auth pages
    status: pending
---

# Device Verification Fixes Plan

## Problem Analysis

### Issue 2: Polling Error - Cannot Pass Login Even When Approved

**Root Cause:** In [`apps/mobile/app/(auth)/login.tsx`](apps/mobile/app/\\\(auth)/login.tsx), after receiving the access token from `/device/token`, the code calls `authClient.getSession()` without passing the access token in the Authorization header. BetterAuth requires the token to establish the session.

Current broken code (line 193-206):

```typescript
if (result.data) {
  await authClient.getSession();  // Missing token!
  router.replace('/(main)/scanner');
}
```

Per BetterAuth docs, the correct approach is:

```typescript
const { data: session } = await authClient.getSession({
  fetchOptions: {
    headers: {
      Authorization: `Bearer ${data.accescan s_token}`,
    },
  },
});
```

### Issue 3: UX - Login Redirects to Dashboard Instead of Verification Page

**Root Cause:** When an unauthenticated user clicks "Go to sign-in" from the `/device?user_code=XXXX` page, the return URL with the user_code is lost. After login, they're redirected to `/dashboard` instead of back to the device verification page.

Affected files:

- [`apps/web/app/(auth)/device/device-client.tsx`](apps/web/app/\\\(auth)/device/device-client.tsx) - Link to sign-in doesn't preserve return URL
- [`apps/web/app/(auth)/sign-in/page.tsx`](apps/web/app/\\\(auth)/sign-in/page.tsx) - Hardcoded redirect to `/dashboard`
- [`apps/web/proxy.ts`](apps/web/proxy.ts) - Redirects authenticated users from auth pages to `/dashboard`

---

## Implementation Tasks

### Task 1: Fix Mobile Polling Session Establishment

**File:** `apps/mobile/app/(auth)/login.tsx`

Changes needed:

1. Store the `access_token` from the successful token response
2. Pass the token in the Authorization header when calling `getSession()`
3. Add error handling if session establishment fails despite having a token

### Task 2: Implement Return URL Flow on Web

**Files to modify:**

1. **`apps/web/app/(auth)/device/device-client.tsx`**

   - Update the sign-in link to include a `returnUrl` or `callbackUrl` query parameter
   - Example: `/sign-in?callbackUrl=/device?user_code=XXXX`

2. **`apps/web/app/(auth)/sign-in/page.tsx`**

   - Read `callbackUrl` from URL search params
   - After successful login, redirect to `callbackUrl` if present, otherwise to `/dashboard`

3. **`apps/web/proxy.ts`**

   - Update the authenticated user redirect logic to preserve the callback URL
   - When redirecting from auth pages, check for `callbackUrl` parameter and use it instead of hardcoded `/dashboard`

---

## Files Summary

| File | Change Description |

|------|-------------------|

| `apps/mobile/app/(auth)/login.tsx` | Pass access_token to getSession(), add session validation |

| `apps/web/app/(auth)/device/device-client.tsx` | Add returnUrl param to sign-in link |

| `apps/web/app/(auth)/sign-in/page.tsx` | Read callbackUrl param and redirect accordingly |

| `apps/web/proxy.ts` | Handle callbackUrl in auth page redirects |

---

## Validation Steps

After implementation:

1. Run `bun run lint` and `bun run check-types`
2. Test mobile flow: Generate device code, approve on web, verify session is established and redirect to scanner works
3. Test web flow: Open device verification link while logged out, sign in, verify redirect back to device page with code preserved