<!-- 6f676c92-6d49-4f94-b000-4f606ff31088 df32ac37-5a0c-4d41-8978-e04310cea8a1 -->
# Next.js Admin Portal Implementation

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Auth**: better-auth client with Admin + Organization plugins
- **API Client**: Eden Treaty via `@sen-checkin/api-contract`
- **Package Manager**: Bun
- **Date Handling**: date-fns

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
      allowUserToCreateOrganization: false, // Only admins can create orgs
    }),
  ],
});
```

### Database Migration

Run better-auth CLI to generate schema for new tables:

```bash
cd apps/api && npx @better-auth/cli generate
bun run db:mig
```

New tables/fields added:

- `user` table: `role`, `banned`, `banReason`, `banExpires`
- `session` table: `impersonatedBy`, `activeOrganizationId`
- `organization` table (new)
- `member` table (new)
- `invitation` table (new)

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

```
apps/web/src/
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
│   └── layout.tsx
├── lib/
│   ├── api.ts                    # Eden client
│   ├── auth-client.ts            # better-auth + plugins
│   └── utils.ts
└── middleware.ts
```

### Dev-Only Sign-Up Page

Sign-up page protected by environment check:

```typescript
// app/(auth)/sign-up/page.tsx
import { redirect } from 'next/navigation';

export default function SignUpPage() {
  // Only allow sign-up in development
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
- Add web scripts: `dev:web`, `build:web`, `add:web`
- Create `packages/typescript-config/nextjs.json`
- Add Next.js ESLint config

## shadcn Components

`button`, `input`, `label`, `card`, `table`, `dialog`, `dropdown-menu`, `sidebar`, `form`, `select`, `badge`, `toast`, `skeleton`, `avatar`, `tabs`

### To-dos

- [ ] Create Next.js app in apps/web with Tailwind, TypeScript, Bun
- [ ] Add web to monorepo (tsconfig, turbo, eslint, package.json scripts)
- [ ] Initialize shadcn/ui and install required components
- [ ] Create lib/api.ts using createApiClient from @sen-checkin/api-contract
- [ ] Configure better-auth client with API baseURL and apiKey plugin
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