# Release 08 - Organization Architecture Updates

## Organization Context Flow

- Server resolves the active organization via `getActiveOrganizationContext()` (session → organization list) and passes `{ organizationId, organizationSlug, organizationName }` to the UI.
- The dashboard layout now wraps pages with `OrgProvider` when an active org exists so client components can read org context without re-fetching.
- Data fetching helpers accept `organizationId` (string | null); when `null` they short-circuit to empty results to avoid 400s from org-scoped APIs.

## No-Organization State Handling

- Dashboard layout renders a unified `NoOrganizationState`:
    - Admin users see a prompt and CTA to create an organization.
    - Regular users see a “waiting for invitation” message.
- Children are only wrapped in `OrgProvider` when an org exists, preventing org-less pages from firing API calls.

## Member Management

- Users page now surfaces organization members (`authClient.organization.listMembers`) instead of platform-wide users.
- New server action `createOrganizationUser`:
    1. `admin.createUser` with username support
    2. `organization.addMember` with role (`admin` | `member`)
- Query key: `queryKeys.organizationMembers`; mutations invalidate this scope.
- UI shows role badges (owner/admin/member), member metadata, and joined date.

## Data Scoping Pattern

- Client/server fetchers accept `organizationId`; `null` returns empty datasets.
- Query keys include org params to isolate caches per organization.
- Prefetch helpers forward org context so React Query hydration matches the active tenant.

## API Route Organization Filtering

- Employees, devices, and attendance routes now use `combinedAuthPlugin`.
- All list/detail/create/update/delete flows enforce active organization:
    - Require org (session `activeOrganizationId` or `organizationId` query/body for API keys).
    - Cross-org access returns 403.
- Attendance queries join employees to scope results; create validates employee/device ownership.

## Username Plugin Integration

- Server auth config adds `username()` plugin; web auth clients add `usernameClient()`.
- Create-user flow collects `username` to simplify sign-in and member provisioning.
