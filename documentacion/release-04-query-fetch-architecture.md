# Release 04 - Query & Fetch Architecture (commit 1a715b98)

## Summary

Commit `1a715b98` delivered the TanStack Query + React Server Components streaming refactor for the web app. The work followed plan `.cursor/plans/react-169ebc36.plan.md` but introduced a few extra caveats around cookie forwarding and runtime behaviour. This document explains the new data-fetching stack, how server/client responsibilities are split, and what to watch out for when adding features.

## Goals

- Stream initial data from Server Components using React Query dehydration.
- Centralize query keys and fetchers so cache invalidation stays consistent.
- Keep mutations on the server (server actions) while letting clients drive them via `useMutation`.
- Preserve auth context by forwarding session cookies for all server-initiated requests.

## Architecture Layers

- **Query client configuration** — `apps/web/lib/get-query-client.ts`
  - `staleTime` defaults to 60s for all queries.
  - `dehydrate.shouldDehydrateQuery` includes pending queries so streaming works.
  - `shouldRedactErrors` is disabled; Next.js error boundaries receive full errors (needed for dynamic route detection).
  - Per-request client on the server, singleton in the browser.

- **Providers** — `apps/web/app/providers.tsx`
  - Wraps the app with `QueryClientProvider`; devtools mount only in development.

- **Keys** — `apps/web/lib/query-keys.ts`
  - `queryKeyConstructor` builds stable keys; entity factories live under `queryKeys.*`.
  - `mutationKeys` mirrors entities for `useMutation` tracking.
  - Parameter shapes (`ListQueryParams`, `AttendanceQueryParams`, `UsersQueryParams`) keep filters typed.

- **Client fetchers (browser/RSC hydration)** — `apps/web/lib/client-functions.ts`
  - Use the shared Eden Treaty `api` (core entities) and `authClient` (BetterAuth).
  - Strip `undefined` fields from query params to avoid Eden sending the string "undefined".
  - Return typed payloads plus pagination metadata.

- **Server API client** — `apps/web/lib/server-api.ts`
  - Factory around `createApiClient` that injects `Cookie` and sets `credentials: 'include'` against `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

- **Server fetchers (for prefetch)** — `apps/web/lib/server-client-functions.ts`
  - Mirror of client fetchers that accept a raw cookie header (`cookieHeader`) or full `Headers` object (BetterAuth calls) so server-initiated requests stay authenticated.

- **Prefetch helpers (RSC only)** — `apps/web/lib/server-functions.ts`
  - `prefetch*` functions call `queryClient.prefetchQuery` **without await** to enable streaming.
  - Cookies are pulled from `headers().get('cookie')`; BetterAuth calls forward the entire `Headers` object.
  - Exported per-entity helpers (employees, devices, locations, clients, attendance, dashboard counts, apiKeys, organizations, users).

- **Route pattern** — e.g., `apps/web/app/(dashboard)/employees/page.tsx`
  - `export const dynamic = 'force-dynamic'` to keep cookies available.
  - Create a query client, call the matching `prefetch*`, wrap the client UI in `<HydrationBoundary state={dehydrate(queryClient)}>`.

- **Client pages** — e.g., `apps/web/app/(dashboard)/employees/employees-client.tsx`
  - `useQuery` with `queryKeys.*.list(params)` and the shared fetchers.
  - `useMutation` hooks call server actions (`apps/web/actions/*`) and invalidate with `queryKeys.*.all` to cover parameterized caches.
  - Loading states use `isFetching` + skeleton components (`apps/web/components/skeletons/*`) instead of suspense.

- **Server actions (mutations)** — `apps/web/actions/*.ts`
  - `'use server'` modules that call `createServerApiClient` with forwarded cookies, returning `{ success, data?, error? }` for toast-friendly handling.
  - Re-exported via `apps/web/actions/index.ts`; mutation keys mirror these actions.

## Data Flow Example (Employees)

1. **Server component** (`apps/web/app/(dashboard)/employees/page.tsx`)
   - Marks the route `force-dynamic`.
   - Gets a new QueryClient, calls `prefetchEmployeesList(queryClient, { limit: 100, offset: 0 })` without awaiting.
   - Sends dehydrated state to the client inside `HydrationBoundary`.

2. **Prefetch helper** (`prefetchEmployeesList` in `server-functions.ts`)
   - Reads `Cookie` from `headers().get('cookie')` and calls `fetchEmployeesListServer`.
   - Server fetcher builds an Eden client with that cookie and returns paginated data.

3. **Client component** (`employees-client.tsx`)
   - `useQuery` consumes the hydrated cache; subsequent filter changes update the key (`queryKeys.employees.list(queryParams)`).
   - Mutations (create/update/delete/enrollment cleanup) call server actions and invalidate `queryKeys.employees.all` to refresh every employees list variant.
   - UI shows skeletons while `isFetching` and toasts on mutation outcomes.

## Caveats vs Plan

- **Cookie serialization**: Rely on `headers().get('cookie')` (as in `server-functions.ts`). `cookies().toString()` produces `"[object ReadonlyRequestCookies]"` and will drop the BetterAuth session; several server actions still use `cookies().toString()` and should be updated when touching those files.
- **Auth propagation for BetterAuth**: Prefetchers for api keys/organizations/users must forward the entire `Headers` object (`fetchOptions.headers`) because BetterAuth inspects more than `Cookie`. Reusing client fetchers from the server will lose auth context.
- **Suspense vs useQuery**: The plan targeted `useSuspenseQuery`, but pages currently use `useQuery` plus manual skeletons (`loading.tsx`). Streaming still works because pending queries are dehydrated, but hydration won't block on suspense boundaries.
- **Error visibility**: `shouldRedactErrors` is disabled in the query client to let Next detect dynamic routes. API errors surface to `app/(dashboard)/error.tsx`; ensure error boundaries stay in place when adding routes.
- **Cache invalidation shape**: Query keys include the params object; invalidate with `queryKeys.<entity>.all` (current pattern) or pass the same params object shape, otherwise caches for alternate filters may stay stale.
- **Dynamic rendering required**: Forgetting `export const dynamic = 'force-dynamic'` on a new dashboard page will make Next cache the route and strip cookies, breaking authenticated prefetch.

## How to Extend

When adding a new entity:

1. Define query/mutation keys in `apps/web/lib/query-keys.ts`.
2. Add client fetcher(s) to `apps/web/lib/client-functions.ts` (strip `undefined` params).
3. Add server fetcher(s) to `apps/web/lib/server-client-functions.ts` and a prefetch helper to `apps/web/lib/server-functions.ts` (remember cookie/header forwarding).
4. Create server actions in `apps/web/actions/<entity>.ts` and export them via `apps/web/actions/index.ts`.
5. Build the route as Server Component `page.tsx` (prefetch + `HydrationBoundary`) and a client UI component with `useQuery`/`useMutation` using the shared keys.
6. Include `loading.tsx` and, if needed, tailor skeletons in `apps/web/components/skeletons/`.

## Follow-ups

- Replace remaining `cookies().toString()` usages in server actions with a serialized cookie header from `headers()` (or a shared helper) to avoid `[object ReadonlyRequestCookies]` being forwarded.
- Consider switching to `useSuspenseQuery` for pages that prefer suspense-based fallbacks once skeletons are aligned.
- Keep `prefetch*` helpers as the only place that talks to `next/headers` to avoid accidental client imports.
