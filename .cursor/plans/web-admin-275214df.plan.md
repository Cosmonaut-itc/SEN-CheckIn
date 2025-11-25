<!-- 275214df-ba72-49ae-8ba2-9db37508f56a 7e483322-2093-42af-a743-25c5b94462cd -->
# Next.js Admin Portal Implementation

## Tech Stack

- **Framework**: Next.js 16 (App Router) - already installed
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style, zinc base color)
- **Auth**: better-auth client with Admin + Organization plugins
- **API Client**: Eden Treaty via `@sen-checkin/api-contract`
- **Package Manager**: Bun
- **Date Handling**: date-fns

## Existing Setup (apps/web)

The base Next.js app is already created with:

- Next.js 16.0.4, React 19.2.0
- Tailwind CSS v4 with `@tailwindcss/postcss`
- shadcn/ui initialized (`components.json` configured with new-york style)
- `lib/utils.ts` with `cn()` helper
- `globals.css` with CSS variables and dark mode support
- Path alias `@/*` configured in `tsconfig.json`

## API Changes Required

### Update `apps/api/utils/auth.ts`

Add Admin and Organization plugins to the server-side better-auth configuration:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey, admin, organization } from 'better-auth/plugins';
import db from '../src/db/index.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [
    apiKey(),
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
    organization({
      allowUserToCreateOrganization: false,
    }),
  ],
});
```

### Database Migration

1. Run better-auth CLI to generate the auth schema file:
```bash
cd apps/api && npx @better-auth/cli generate
```

2. This generates `auth-schema.ts` with new tables for admin and organization plugins. Copy the following tables/fields into `apps/api/src/db/schema.ts`:

**Updated existing tables:**

- `user` table: add `role`, `banned`, `banReason`, `banExpires` columns
- `session` table: add `impersonatedBy`, `activeOrganizationId` columns

**New tables to copy:**

- `organization` table
- `member` table
- `invitation` table

3. Run the Drizzle migration:
```bash
bun run db:gen
bun run db:mig
```


---

## Web Admin Portal

USE CONTEXT7 MCP WHEN NEEDING ANY DOCUMENTATION

### API Communication

All API interactions through Eden Treaty client from `@sen-checkin/api-contract`:

```typescript
// lib/api.ts
import { createApiClient } from '@sen-checkin/api-contract';
export const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000');
```

### Auth Client Configuration

```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { apiKeyClient, adminClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  plugins: [
    apiKeyClient(),
    adminClient(),
    organizationClient(),
  ],
});
```

### Project Structure

Build on existing structure in `apps/web/`:

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   ├── sign-up/page.tsx      # DEV ONLY - hidden in production
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard
│   │   ├── employees/page.tsx
│   │   ├── devices/page.tsx
│   │   ├── locations/page.tsx
│   │   ├── clients/page.tsx
│   │   ├── attendance/page.tsx
│   │   ├── api-keys/page.tsx
│   │   ├── users/page.tsx        # Admin: user management
│   │   └── organizations/page.tsx # Organization management
│   ├── favicon.ico               # (existing)
│   ├── globals.css               # (existing - configured)
│   ├── layout.tsx                # (existing - update)
│   └── page.tsx                  # (existing - redirect to dashboard)
├── components/
│   └── ui/                       # shadcn components go here
├── hooks/                        # Custom React hooks
├── lib/
│   ├── api.ts                    # Eden client (new)
│   ├── auth-client.ts            # better-auth + plugins (new)
│   └── utils.ts                  # (existing)
├── middleware.ts                 # (new)
├── components.json               # (existing - configured)
└── types/                        # (existing)
```

### shadcn Component Installation

Use the shadcn CLI with Bun to install components:

```bash
cd apps/web
bunx --bun shadcn@latest add button input label card table dialog dropdown-menu sidebar form select badge toast skeleton avatar tabs
```

### Dev-Only Sign-Up Page

Sign-up page protected by environment check:

```typescript
// app/(auth)/sign-up/page.tsx
import { redirect } from 'next/navigation';

export default function SignUpPage() {
  if (process.env.NODE_ENV === 'production') {
    redirect('/sign-in');
  }
  // ... sign-up form
}
```

### Admin Features (via `authClient.admin`)

- `listUsers()` - List all users with pagination
- `createUser()` - Create new users (admin only)
- `setRole()` - Change user roles
- `banUser()` / `unbanUser()` - User banning
- `impersonateUser()` - Session impersonation
- `removeUser()` - Delete users

### Organization Features (via `authClient.organization`)

- `create()` - Create organizations
- `listOrganizations()` - List user's organizations
- `inviteMember()` - Invite users to org
- `removeMember()` - Remove members
- `updateMemberRole()` - Change member roles

---

## Monorepo Integration

- Add `@sen-checkin/web` alias to `tsconfig.base.json`
- Add web scripts to root `package.json`: `dev:web`, `build:web`, `add:web`
- Create `packages/typescript-config/nextjs.json`
- Add Next.js ESLint config

### To-dos

- [ ] Install shadcn/ui components using bunx --bun shadcn@latest add
- [ ] Add web to monorepo (tsconfig.base.json, turbo.json, root package.json scripts)
- [ ] Create lib/api.ts using createApiClient from @sen-checkin/api-contract
- [ ] Configure better-auth client with Admin + Organization plugins in lib/auth-client.ts
- [ ] Create Next.js middleware for protected routes
- [ ] Build sign-in and sign-up pages with better-auth
- [ ] Create dashboard layout with sidebar and header
- [ ] Build dashboard with entity counts using Eden client
- [ ] Implement Employees CRUD pages using api.employees
- [ ] Implement Devices CRUD using api.devices
- [ ] Implement Locations CRUD using api.locations
- [ ] Implement Clients CRUD using api.clients
- [ ] Build Attendance Records list with date-fns filters
- [ ] Implement API Keys management via better-auth apiKeyClient
- [ ] Add release notes to documentacion/ folder