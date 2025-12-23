<!-- e709b803-27b1-45b8-ac3c-57a96b8303a7 51781d78-e626-4e9e-ab1d-e12525eab0a4 -->

# Organization Filtering & Member Management

## Current State Analysis

### Working (Organization-scoped)

- [locations.ts](apps/api/src/routes/locations.ts): Uses `combinedAuthPlugin`, filters by `session?.activeOrganizationId`
- [job-positions.ts](apps/api/src/routes/job-positions.ts): Uses `combinedAuthPlugin`, filters by `session?.activeOrganizationId`

### Missing Organization Filtering

- [employees.ts](apps/api/src/routes/employees.ts): No auth plugin, no org filtering
- [devices.ts](apps/api/src/routes/devices.ts): No auth plugin, no org filtering
- [attendance.ts](apps/api/src/routes/attendance.ts): No org filtering

### Database Schema Gaps

- `employee` table lacks `organizationId` column (only has indirect link via `locationId`)
- `device` table lacks `organizationId` column (only has indirect link via `locationId`)

### Web App Gaps

- Users page shows ALL platform users via `admin.listUsers` instead of organization members
- No handling for users without an organization
- No member creation/invite functionality
- No owner/member role badges

---

## Architecture References

Follow these existing patterns from `documentacion/`:

- **Query architecture**: [release-04-query-fetch-architecture.md](documentacion/release-04-query-fetch-architecture.md) - query keys, prefetch helpers, server/client fetchers, cookie forwarding
- **Form architecture**: [release-06-form-architecture.md](documentacion/release-06-form-architecture.md) - use `useAppForm`, `form.AppField`, registered field components
- **Organization context**: [release-07-organization-tenant-migration.md](documentacion/release-07-organization-tenant-migration.md) - `getActiveOrganizationContext`, `OrgProvider` pattern

---

## Implementation

### Phase 1: Database Migration (API)

Add `organizationId` to `employee` and `device` tables in [schema.ts](apps/api/src/db/schema.ts):

```typescript
// In employee table
organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),

// In device table
organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
```

Run `bun run db:gen` then `bun run db:mig`.

### Phase 2: Add Username Plugin (API + Web)

**API** - Update [utils/auth.ts](apps/api/utils/auth.ts):

```typescript
import { username } from 'better-auth/plugins';
// Add to plugins array:
username();
```

**Web** - Update [lib/auth-client.ts](apps/web/lib/auth-client.ts) and [lib/server-auth-client.ts](apps/web/lib/server-auth-client.ts):

```typescript
import { usernameClient } from 'better-auth/client/plugins';
// Add to plugins array:
usernameClient();
```

This enables username-based sign-in and makes user creation simpler.

### Phase 3: API Route Updates

1. **Update [employees.ts](apps/api/src/routes/employees.ts)**:
    - Add `combinedAuthPlugin`
    - Filter GET by `session?.activeOrganizationId`
    - Set `organizationId` on POST from session
    - Verify ownership on PUT/DELETE

2. **Update [devices.ts](apps/api/src/routes/devices.ts)**:
    - Add `combinedAuthPlugin`
    - Filter by organization
    - Set `organizationId` on POST
    - Verify ownership on PUT/DELETE

3. **Update [attendance.ts](apps/api/src/routes/attendance.ts)**:
    - Add `combinedAuthPlugin`
    - Filter attendance by employees belonging to active organization

### Phase 4: No-Organization State Handling (Web)

Update [layout.tsx](<apps/web/app/\(dashboard)/layout.tsx>) to:

1. Fetch active org via `getActiveOrganizationContext()`
2. Fetch user role from session
3. If no organization:
    - **Admin user**: Show "Create an organization to get started" prompt with link to organizations page
    - **Regular user**: Show "Waiting for invitation" message explaining they need to be invited

4. Wrap children with `OrgProvider` only when org exists

Create a new component `NoOrganizationState` that renders the appropriate message based on user role.

**Critical**: Client functions must handle `organizationId: null` gracefully - return empty arrays instead of making failing API calls. Update [client-functions.ts](apps/web/lib/client-functions.ts) to check for org context before fetching.

### Phase 5: Organization Members Page (Web)

Transform [users-client.tsx](<apps/web/app/\(dashboard)/users/users-client.tsx>) to show organization members:

1. **Replace data source**: Use `authClient.organization.listMembers()` instead of `admin.listUsers()`
2. **Add role badges**: Display Owner/Admin/Member badges using the member's `role` field
3. **Show user details**: Display name, email, and joined date

### Phase 6: User Creation & Assignment (Web)

Add "Create User" functionality to the users page:

1. **Create User Dialog** using `useAppForm` pattern from [release-06-form-architecture.md](documentacion/release-06-form-architecture.md):
    - Fields: name, email, username (using username plugin), password, role (admin/member)

2. **Server Action** in [actions/users.ts](apps/web/actions/users.ts):
    ```typescript
    export async function createOrganizationUser(input: {
    	name: string;
    	email: string;
    	username: string;
    	password: string;
    	role: 'admin' | 'member';
    	organizationId: string;
    }): Promise<MutationResult>;
    ```

Flow:

1. Call `serverAuthClient.admin.createUser({ email, password, name, data: { username } })`
2. Call `serverAuthClient.organization.addMember({ userId, organizationId, role })`

3. **Query invalidation**: Follow pattern from release-04 - invalidate `queryKeys.organizationMembers.all` on success

### Phase 7: Documentation

Create new file `documentacion/release-08-organization-architecture.md` documenting:

1. Organization context flow (server to client)
2. No-organization state handling
3. Member management (list, create, roles)
4. Data scoping pattern (how entities are filtered by organization)
5. API route organization filtering pattern
6. Username plugin integration

---

## Key Files to Modify

| File | Changes |

|------|---------|

| `apps/api/src/db/schema.ts` | Add `organizationId` to employee, device tables |

| `apps/api/utils/auth.ts` | Add username plugin |

| `apps/api/src/routes/employees.ts` | Add auth plugin, org filtering |

| `apps/api/src/routes/devices.ts` | Add auth plugin, org filtering |

| `apps/api/src/routes/attendance.ts` | Add auth plugin, org-scoped filtering |

| `apps/web/lib/auth-client.ts` | Add usernameClient plugin |

| `apps/web/lib/server-auth-client.ts` | Add usernameClient plugin |

| `apps/web/app/(dashboard)/layout.tsx` | Add OrgProvider, no-org state handling |

| `apps/web/app/(dashboard)/users/users-client.tsx` | Replace with org members view, add create user |

| `apps/web/actions/users.ts` | Add createOrganizationUser action |

| `apps/web/lib/client-functions.ts` | Add `fetchOrganizationMembers()`, handle null org |

| `apps/web/lib/query-keys.ts` | Add organizationMembers keys |

| `documentacion/release-08-organization-architecture.md` | New documentation file |

---

## Documentation References (Use Context7 MCP)

The implementing agent MUST use Context7 MCP to look up:

- `better-auth organization plugin` - for `listMembers`, `addMember`, `getFullOrganization` methods
- `better-auth admin plugin` - for `createUser` method
- `better-auth username plugin` - for username support
- `drizzle-orm migrations` - for schema changes

---

## Final Verification

After implementation, run:

```bash
bun run lint
bun run check-types
```

Ensure no lint errors or type issues before completing.

### To-dos

- [ ] Add organizationId to employee and device tables, run drizzle migration
- [ ] Add username plugin to API auth config and web auth clients
- [ ] Update employees routes: add combinedAuthPlugin, filter by organization
- [ ] Update devices routes: add combinedAuthPlugin, filter by organization
- [ ] Update attendance routes: add auth plugin, filter by org-scoped employees
- [ ] Handle no-organization state in dashboard layout with admin/user messages
- [ ] Update client functions to handle null organizationId gracefully
- [ ] Replace users page with organization members view, add role badges
- [ ] Add create user dialog and server action with org auto-assignment
- [ ] Create release-08-organization-architecture.md explaining the org system
- [ ] Run bun run lint and bun run check-types to verify no errors
