# Review for branch feature/job-position-and-web-polish

## Findings

1. **[P1] API-key auth drops tenant scoping**  
   `apps/api/src/plugins/auth.ts:111-146` returns only `apiKeyId`/`apiKeyName` for BetterAuth keys; it never resolves the owning organization. Routes such as `apps/api/src/routes/employees.ts:75-168` (and locations/job-positions/attendance) fall back to the request’s `organizationId` when `authType === 'apiKey'`, so a caller can pass any tenant ID to list or mutate another organization’s data. We need to enrich `combinedAuthPlugin` with the API key’s organization (lookup via BetterAuth metadata or DB) and reject/ignore client-supplied `organizationId` for API-key requests.

2. **[P1] Attendance “today” endpoint allows cross-tenant reads via API key**  
   `apps/api/src/routes/attendance.ts:281-329` only compares `employeeRecord.organizationId` to `session?.activeOrganizationId`; when `authType === 'apiKey'` the check is skipped. Any API key with an employee UUID can fetch that person’s attendance for the day, leaking data across tenants. Guard API-key calls by binding an organization to the key (see finding #1) and enforcing it against the employee record before returning data.

3. **[P1] Job-positions page not behind proxy**  
   `apps/web/proxy.ts:23-66` omits `/job-positions` from `protectedPaths` and `matcher`, so unauthenticated users can load the new dashboard page without being redirected to sign-in. Add `/job-positions` (and its splat) to both arrays to restore the route guard.

## Testing

- Run lint and type checks.
