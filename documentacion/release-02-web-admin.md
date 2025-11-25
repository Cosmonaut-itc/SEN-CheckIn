# Release 02 - Web Admin Portal

## Summary

This release introduces a fully-featured web administration portal built with Next.js 16, shadcn/ui, and better-auth integration.

## Features

### Authentication

- Sign-in page with email/password authentication
- Sign-up page (development mode only)
- Protected routes via Next.js middleware
- Session management with better-auth client

### Dashboard

- Overview page with entity counts
- Quick navigation cards to all sections
- Real-time data fetching from API

### Entity Management (CRUD)

- **Employees**: Full CRUD with search, status management, and table view
- **Devices**: CRUD operations with device type and status tracking
- **Locations**: CRUD with client association
- **Clients**: CRUD with API key association
- **Attendance**: Read-only view with date-fns filters (today, yesterday, this week, this month, custom range)

### Administration

- **API Keys**: Create, list, and delete API keys via better-auth apiKey plugin
- **Users**: User management with role changes and ban/unban functionality via better-auth admin plugin
- **Organizations**: Organization creation and management via better-auth organization plugin

### UI/UX

- Responsive sidebar navigation with collapsible support
- Dark mode support via CSS variables
- Toast notifications for user feedback
- Loading skeletons for better perceived performance
- Consistent styling with shadcn/ui components (new-york style, zinc base color)

## Technical Stack

- **Framework**: Next.js 16.0.4 (App Router, Turbopack)
- **React**: 19.2.0
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Authentication**: better-auth with admin, organization, and apiKey plugins
- **API Client**: Eden Treaty from @sen-checkin/api-contract
- **Date Handling**: date-fns
- **Form Validation**: Zod with react-hook-form

## Project Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx (dashboard)
│   │   ├── employees/page.tsx
│   │   ├── devices/page.tsx
│   │   ├── locations/page.tsx
│   │   ├── clients/page.tsx
│   │   ├── attendance/page.tsx
│   │   ├── api-keys/page.tsx
│   │   ├── users/page.tsx
│   │   └── organizations/page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── app-sidebar.tsx
│   └── ui/ (shadcn components)
├── hooks/
│   └── use-mobile.ts
├── lib/
│   ├── api.ts
│   ├── auth-client.ts
│   └── utils.ts
└── middleware.ts
```

## Monorepo Integration

- Package name: `@sen-checkin/web`
- Root scripts added: `dev:web`, `build:web`, `lint:web`, `check-types:web`, `add:web`
- TypeScript path alias: `@sen-checkin/web` and `@sen-checkin/web/*`

## Commands

```bash
# Development
bun run dev:web

# Build
bun run build:web

# Add dependencies
bun run add:web -- <package>
```

## Environment Variables

| Variable              | Description  | Default                 |
| --------------------- | ------------ | ----------------------- |
| `NEXT_PUBLIC_API_URL` | API base URL | `http://localhost:3000` |

## Dependencies Added

### Runtime

- @sen-checkin/api-contract (workspace)
- @elysiajs/eden
- date-fns
- better-auth
- react-hook-form
- @hookform/resolvers
- zod
- sonner
- next-themes
- Various @radix-ui/\* packages (via shadcn)

### DevDependencies

- @tailwindcss/postcss
- tw-animate-css
- eslint-config-next

## shadcn Components Installed

- button, input, label, card
- table, dialog, dropdown-menu
- sidebar, form, select, badge
- skeleton, avatar, tabs
- separator, sheet, tooltip
- sonner (toast replacement)

## Notes

- Sign-up page is only accessible in development mode
- All dashboard routes are protected by middleware
- The sidebar persists its collapsed/expanded state via cookies
- Mobile-responsive with sheet-based sidebar on small screens
