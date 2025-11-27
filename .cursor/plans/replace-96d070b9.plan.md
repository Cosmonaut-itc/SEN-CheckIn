<!-- 96d070b9-8079-424a-acc4-eb41c7eba42d e6c55fa0-febd-411e-9c8e-90fa36a0dab6 -->
# Replace legacy clients with BetterAuth organizations

### Goals

- **Remove all `client`-related methods, components, and pages** from `@api` and `@web`.
- **Refactor data model and code to use BetterAuth `organization` instead of `client`** (without using org slug in URLs, per your choice).
- **Use BetterAuth organization slug correctly on server and client** according to official docs via Context7 MCP.
- **Keep the `client` table in the DB but fully deprecated in code**, while updating `location` and `jobPosition` to reference organizations directly.
- **Run `lint`, `tsc`, and Drizzle `generate` + `migrate`** at the end.
- **Ensure any library usage (BetterAuth, Next.js, Drizzle) is backed by Context7 MCP docs** and that references are documented in this plan.

### Documentation sources (via Context7 MCP)

- **BetterAuth**: `/better-auth/better-auth` (primary library API reference and examples for auth, sessions, and organization plugin usage).
- **Next.js**: `/vercel/next.js` (App Router, server/client components, and data fetching patterns for passing org context to React components).
- **Drizzle ORM**: `/drizzle-team/drizzle-orm-docs` (schema changes, relations, and generating + applying migrations in a Bun/Node environment).

These three Context7 library IDs will be used for **all auth, routing, and DB-related decisions** instead of relying on model training data.

### High-level steps

1. **Inventory existing `client` usage**

- Scan `apps/web` for:
- `clients` pages/components (e.g. `[...]/clients-client.tsx`, any `(dashboard)/clients` routes, tables, forms, and actions in `apps/web/actions/clients.ts`).
- Any hooks, form schemas, or utilities referencing `client` (e.g. `clientId`, `clientName`, etc.).
- Scan `apps/api` for:
- API routes, services, or repositories that expose or depend on `client` (search by `client`, `clientId`, `client_id`).
- Any cross-joins or filters that go `client -> location -> employee`.

2. **Define the new organization-centric domain model**

- Using Drizzle docs from `/drizzle-team/drizzle-orm-docs`, update `apps/api/src/db/schema.ts` to:
- **Keep** the existing `organization` table from BetterAuth as the tenant entity.
- **Mark `client` as deprecated** in comments and stop adding new relations from domain tables to `client`.
- **Update `location` and `jobPosition` tables** to reference `organization.id` directly instead of `client.id`, e.g.:
- `location.organizationId` -> `references(() => organization.id, { onDelete: 'cascade' | 'set null' })`.
- `jobPosition.organizationId` similarly.
- If `clientId` columns must remain for data safety, keep them but:
- Add `// @deprecated` comments.
- Stop using them in application queries.
- Use Drizzle relations API to make sure `organization` has `locations` and `jobPositions` where needed.

3. **Model how to access the active organization and slug (BetterAuth + Next.js)**

- From BetterAuth docs (`/better-auth/better-auth`):
- Identify the **server-side method** to read the BetterAuth session (e.g. a helper like `auth()` / `getSession()` or a plugin-specific helper when using the organization plugin).
- Identify how the **active organization and its slug** are exposed in the session (e.g. `session.activeOrganization`, `session.activeOrganization.slug`, or plugin-specific fields).
- Confirm **how to change the active organization** (if needed) for future extensibility.
- From Next.js docs (`/vercel/next.js`):
- Confirm recommended patterns for **reading auth/session data in App Router server components** (e.g. in `layout.tsx` or route handlers).
- Decide a simple pattern for this app: fetch the BetterAuth session on the server for dashboard routes and pass `organizationId` + `orgSlug` down via React context or props (without encoding slug in the URL path, per your choice).
- Define a small **org context helper** in `apps/web` (e.g. in `lib/` or `hooks/`):
- Server-side: function like `getActiveOrganizationContext()` that returns `{ organizationId, slug, name }` for use in server components and server actions.
- Client-side: context/provider and hook (e.g. `<OrgProvider>` + `useOrg()`), populated from server component props.

4. **Refactor API logic from client-aware to organization-aware**

- In `apps/api`:
- Update any **input validation and filters** to require an `organizationId` instead of `clientId`.
- For endpoints that previously took `clientId` (e.g. list locations, employees, job positions), switch to **using `organizationId` derived from BetterAuth session** (where applicable) instead of trusting arbitrary IDs from the request body/query.
- Ensure database queries **join against the `organization` table** through the updated foreign keys (`location.organizationId`, `jobPosition.organizationId`).
- Where necessary, keep `client`-backed code paths behind feature flags or internal-only tools, but:
- Do not expose them to frontend.
- Clearly mark them as deprecated in comments.

5. **Refactor web app from client pages to organization context**

- In `apps/web`:
- Remove or heavily reduce the **`clients` feature surface**:
- Delete or repurpose `clients`-specific pages and components (e.g. `app/(dashboard)/clients/*`, `clients-client.tsx`).
- Remove `apps/web/actions/clients.ts` and any client-specific server actions.
- Update remaining dashboard features that relied on clients (e.g. locations, employees, job positions) to:
- Call server actions that **implicitly use the active organization** from the BetterAuth session (using the helper from step 3).
- Replace any `clientId` props/state with `organizationId` sourced via the org context.
- Ensure **sign-in and post-auth flow** sets or relies on an active organization (per BetterAuth docs) without requiring a `client` selection step.

6. **Adjust forms, hooks, and types**

- Update shared types in `packages/api-contract` / `packages/types`:
- Remove `client`-specific DTOs and replace them with organization-based variants where needed.
- Ensure all new/updated TS types are strongly typed and fully JSDoc-commented as requested.
- In `apps/web/lib/forms.tsx` and any TanStack Form schemas:
- Remove `client` fields.
- Add `organizationId` or derive it from context instead of explicit input when possible.
- Run type-checking locally (conceptually) to identify any remaining references to `client` and adjust accordingly.

7. **Clean up deprecated `client` references and UI

- Grep for `client`, `clientId`, `client_id` in the repo and:
- Remove any lingering imports, props, and state variables.
- Replace display labels that mention "Client" with organization-friendly naming (e.g. "Organization" or a more domain-specific term you prefer).
- Keep the `client` table in `schema.ts` with clear deprecation comments, but no longer reference it in new queries.

8. **Drizzle migration generation and application**

- Using Drizzle docs from `/drizzle-team/drizzle-orm-docs` and the existing `drizzle.config.ts`:
- Update schema definitions for `location` and `jobPosition` (and any others) to match the new organization-based model.
- Run (per your existing scripts):
- `bun run drizzle:generate` to generate a migration that:
- Adds new `organization_id` columns where needed and establishes FKs.
- Optionally keeps `client_id` columns but no longer required.
- `bun run drizzle:migrate` to apply migrations to your local/dev DB.

9. **Linting, type-checking, and final verification**

- From the repo root, run:
- `bun run lint` (per workspace config).
- `bun run check-types` (or equivalent `tsc` script; if missing, use the configured type-check script).
- Fix any errors/warnings in both `apps/api` and `apps/web` introduced by the refactor.
- Re-run `bun run dev:api` and `bun run dev:web` locally (conceptually) to verify that:
- Sign-in still works.
- Dashboard screens work using the organization context.
- No UI element references `client` anymore.

10. **Document the change

- Update `documentacion/` (e.g. new release note or extend an existing one) to:
- Explain that the `client` feature is deprecated and replaced by BetterAuth organizations.
- Describe how the organization slug and ID are now accessed on server and client (including references to BetterAuth, Next.js, and Drizzle docs via Context7 IDs above).
- Note any required DB/env changes.

### Todos

- **inventory-clients**: Inventory and map all `client` usages across `apps/api`, `apps/web`, and shared packages.
- **model-org-schema**: Update `schema.ts` and relations to make `organization` the primary tenant and deprecate `client` while keeping the table.
- **auth-org-context**: Implement server-side helpers and client-side context for active organization (ID + slug) based on BetterAuth docs.
- **api-refactor-org**: Refactor API routes/services to use organization-based filtering and remove `client` dependencies.
- **web-refactor-org**: Remove `clients` feature from web app and update remaining flows to use implicit organization context.
- **types-and-forms**: Update shared types and forms (TanStack) to remove `client` fields and rely on org context.
- **migrations-and-commands**: Generate/apply Drizzle migrations and run `bun run lint`, `bun run check-types` (or tsc), and verify clean builds.
- **docs-update**: Add or update a `documentacion` entry describing the deprecation of clients and the org-based architecture, with explicit Context7 library ID references.