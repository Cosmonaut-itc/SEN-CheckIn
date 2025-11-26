<!-- 169ebc36-07e0-4338-bf53-de68efffe85d 5556a624-f4ac-4880-b5c6-9e8a96574c41 -->
# React Query SSR + Streaming Refactor Plan for @web

## References

- **TanStack Query – Advanced Server Rendering (Streaming with Server Components)**: [https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#streaming-with-server-components](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#streaming-with-server-components)
- **TanStack Query – Devtools**: [https://tanstack.com/query/latest/docs/framework/react/devtools](https://tanstack.com/query/latest/docs/framework/react/devtools)
- **TanStack Query – Mutations Guide**: [https://tanstack.com/query/latest/docs/framework/react/guides/mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- **Next.js App Router – Route Segment Config (`dynamic`)**: [https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic)

## 1. Core React Query & streaming setup

- Add a strongly-typed `get-query-client` helper in `[apps/web]/lib/get-query-client.ts `that creates a `QueryClient` configured per TanStack's **Advanced Server Rendering / Streaming with Server Components** guide, including:
- `defaultOptions.queries.staleTime = 60_000` and `dehydrate.shouldDehydrateQuery` that includes pending queries while delegating to `defaultShouldDehydrateQuery` as shown in the docs.
- A `getQueryClient()` function that returns a new client on the server and a cached singleton in the browser (matching the pattern from the TanStack docs, with full TypeScript types and JSDoc).
- Create an `app/providers.tsx` client component that:
- Calls `getQueryClient()` to obtain the shared `QueryClient` instance.
- Wraps `children` in `QueryClientProvider`.
- Mounts `ReactQueryDevtools` from `@tanstack/react-query-devtools` in development only, following the official Devtools guide.
- Update `app/layout.tsx` to wrap the app body in the new `Providers` component, ensuring `<Toaster />` continues to work and that no other behavior changes.

## 2. Shared query keys and fetch utilities

- Add `[apps/web]/lib/queryKey.ts` that exports:
- A generic, fully typed `queryKeyConstructor(qk, params?)` that returns a readonly array query key built from a base string and optional parameter object (or tuple), designed to be reused across queries and mutations.
- A `queryKeys` (and, if appropriate, `mutationKeys`) object with nested factories per domain (e.g. `employees.list(params)`, `employees.detail(id)`, `clients.list(params)`, `attendance.list(params)`, `dashboard.counts()`, `users.list()`, `organizations.list()`, `apiKeys.list()`), all strongly typed and documented.
- Add `[apps/web]/lib/client-functions.ts` that centralizes **query and mutation functions** for the web app, for example:
- `fetchEmployeesList(params)`, `fetchClientsList(params)`, `fetchDevicesList(params)`, `fetchLocationsList(params)`, `fetchAttendanceRecords(params)` using the existing typed `api` client from `lib/api.ts`.
- `fetchApiKeys()`, `fetchOrganizations()`, `fetchUsers()` using `authClient` where appropriate.
- Thin wrappers around server actions (from the next section) for create/update/delete operations, to give React Query a stable `mutationFn` surface and keep all HTTP concerns in one place.
- Add `[apps/web]/lib/server-functions.ts` that exposes **server-only helpers** used by Server Components to prefetch:
- For each entity, a `prefetchXxx(queryClient, params)` helper that calls `queryClient.prefetchQuery({ queryKey: queryKeys.xxx.list(params), queryFn: () => fetchXxxList(params) })` without `await`, matching the streaming prefetch pattern from the Advanced SSR docs.
- All functions fully typed and documented, importing the same `fetch*` functions from `client-functions.ts` to avoid any duplication.

## 3. Server actions and mutations

- Create a new `[apps/web]/actions `directory and, for each route that performs mutations (`employees`, `clients`, `devices`, `locations`, `api-keys`, `organizations`, `users`):
- Add a `*.ts` file (e.g. `employees.ts`, `clients.ts`) with `'use server';` at the top.
- Implement server actions like `createEmployee`, `updateEmployee`, `deleteEmployee`, `createClient`, `deleteClient`, `createApiKey`, `deleteApiKey`, `createOrganization`, `deleteOrganization`, `setUserRole`, `toggleUserBan`, etc., using `api` and `authClient` as they are used today.
- Ensure each action is strongly typed (input + output) and uses `date-fns` if any new date manipulation is needed.
- In the client components (see section 4), replace direct `api` / `authClient` calls with `useMutation` from TanStack Query, wired to these server actions per the **Mutations** guide:
- Provide a `mutationKey` (via `mutationKeys` from `queryKey.ts`).
- Use `onSuccess` / `onError` callbacks to:
- Show `sonner` toasts for success/failure states.
- Invalidate or refetch the appropriate list queries using `useQueryClient().invalidateQueries({ queryKey: queryKeys.xxx.list(baseParams) })` to keep lists in sync.
- Keep forms and dialogs functionally identical while delegating side effect handling to React Query.

## 4. Refactor dashboard/data routes to Server Components + streaming prefetch

For each dashboard-style page currently implemented as a client component with `useEffect` data fetching, convert it to the **Server Component + HydrationBoundary + prefetch(without await)** pattern as in the streaming docs:

- **Common structure for each route** (`(dashboard)/dashboard`, `employees`, `devices`, `locations`, `clients`, `attendance`, `api-keys`, `organizations`, `users`):
- Change `page.tsx` to a Server Component (remove `'use client';`).
- Add `export const dynamic = 'force-dynamic';` at the top to ensure dynamic rendering and proper cookie usage per Next.js route segment config guidance.
- Inside `default` export:
- Create a `queryClient` via `getQueryClient()`.
- Invoke the appropriate `prefetch*` helper(s) from `lib/server-functions.ts` for that page’s initial data (e.g. default search string, pagination, date filters like “today” for attendance), **without awaiting** the returned promises.
- Wrap the main client UI component in `<HydrationBoundary state={dehydrate(queryClient)}>` so pending queries are dehydrated and streamed as they resolve.
- **Client UI components for each route**:
- Move the existing JSX and interaction logic into new client components (e.g. `EmployeesPageClient`, `ClientsPageClient`, etc.) in the same route directory or a local `components` folder, each starting with `'use client';`.
- Replace all `useEffect` + local `isLoading`/`setXxx` data fetching with `useSuspenseQuery` (or `useQuery` with `suspense` if preferable) using the shared `queryKeys` and `fetch*` functions:
- For example, `useSuspenseQuery({ queryKey: queryKeys.employees.list(params), queryFn: () => fetchEmployeesList(params) })`.
- Preserve existing filters (`search`, date presets, type filters) by making them part of the query key and query params so that changing them triggers refetch through React Query instead of manual `useEffect` wiring.
- Wire all create/update/delete buttons and forms to `useMutation` hooks tied to the server actions from `actions/*`, with toast feedback and query invalidation as described in section 3.
- Retain the current skeleton, empty state, and table visuals, but drive them from React Query’s `status`/`isFetching` flags instead of handwritten loading flags.

## 5. Non-dashboard pieces and cleanup

- Leave `(auth)` routes (e.g. `/sign-up`, `/sign-in`) as client components for now, but:
- If any of them later starts doing data fetching via `useEffect`, route that new fetching through `client-functions.ts` and React Query as well, for consistency.
- Do **not** change `useEffect` usages that are unrelated to data fetching (e.g. media query listeners in `hooks/use-mobile.ts` or keyboard shortcuts in the sidebar), since those are UI-side effects, not server-state.
- Remove any now-unused local `useState` / `useEffect` data-loading code and dead imports from the refactored pages to keep them clean and align with ESLint best practices.

## 6. Types, docs, and quality gates

- Ensure every new function, component, and exported value in `lib/`, `actions/`, and the refactored route files is explicitly typed and documented with JSDoc, respecting your existing patterns.
- Reuse existing domain types from `@sen-checkin/api-contract` and `packages/types` wherever possible instead of redefining shapes.
- Keep all date handling (e.g. attendance date presets and any new date transformations) implemented via `date-fns`, consistent with your current usage.
- After implementation, run `bun run check-types` and `bun run lint` in `apps/web` and fix any introduced issues, including any React Query ESLint plugin rules, so that the refactor is fully type-safe and lint-clean.@