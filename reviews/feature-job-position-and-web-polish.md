# Review for branch feature/job-position-and-web-polish

## Findings

1. **[P1] Session org scoping can be bypassed – fixed**  
   Addressed by deriving session membership scopes from the `member` table in `combinedAuthPlugin` and threading `sessionOrganizationIds` through `resolveOrganizationId/hasOrganizationAccess`. Session callers now require membership (or an active org) for any tenant-scoped query/mutation. Relevant updates: `apps/api/src/plugins/auth.ts`, `apps/api/src/utils/organization.ts`, and guarded routes across employees/locations/devices/attendance/job-positions.

## Testing

- `bun run check-types:api`
