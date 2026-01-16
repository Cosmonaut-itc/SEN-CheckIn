# Sen CheckIn

Monorepo for Sen CheckIn: a Bun + Elysia API, an Expo Router mobile app, and a Next.js admin portal.

## Repo layout

- `apps/api`: Bun + Elysia service (`src/index.ts`). Drizzle config in `drizzle.config.ts`, migrations in `apps/api/drizzle/`.
- `apps/mobile`: Expo Router app. Screens in `app/`, shared UI in `components/`, assets in `assets/`.
- `apps/web`: Next.js admin portal with Tailwind CSS and Radix UI.
- `packages/api-contract`: Shared Eden Treaty client/contract setup.
- `packages/types`: Shared domain types.
- `packages/eslint-config`, `packages/typescript-config`: Shared lint/TS presets.
- `documentacion`: Release notes.

## Requirements

- Bun `1.3.3`
- Node `>= 18`
- Docker (optional, for local Postgres)

## Quick start

```sh
bun install
bun run dev
```

Or run a single workspace:

```sh
bun run dev:api
bun run dev:web
bun run dev:mobile
```

## Environment variables

Never commit `.env*` files. Common variables:

API:

```
SEN_DB_URL=postgresql://...
BETTER_AUTH_SECRET=...
AWS_REGION=...
AWS_REKOGNITION_COLLECTION_ID=...
# Optional overrides:
CORS_ORIGIN=http://localhost:3001
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=3000
```

Local Postgres (Docker):

```
SEN_CHECKIN_PG_PASSWORD=...
```

Web:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WEB_URL=http://localhost:3001
PLAYWRIGHT_BASE_URL=http://localhost:3001
```

Mobile:

```
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
# Optional (device authorization verification):
EXPO_PUBLIC_WEB_VERIFY_URL=http://localhost:3001/device
EXPO_PUBLIC_VERIFY_URL=http://localhost:3001/device
VERIFY_URL=http://localhost:3001/device
```

## Database

Dev database (port 5434):

```sh
docker compose -f apps/api/docker-compose.yaml up -d
```

Test database (port 5435):

```sh
docker compose -f apps/api/docker-compose.test.yaml up -d
```

Migrations:

```sh
bun run db:gen
bun run db:mig
```

Seed/reset:

```sh
bun run db:seed
bun run db:reset
```

## Tests

```sh
bun run test
bun run test:ci

# API
bun run test:api:unit
bun run test:api:contract

# Web
bun run test:web:unit
bun run test:web:e2e
bun run test:web:e2e:ui
```

## Other commands

```sh
bun run lint
bun run check-types
bun run format

# API start (production-like)
bun run start:api
```

## Notes

- Workspace aliases live in `tsconfig.base.json` (`@sen-checkin/*`).
- UI strings must be in Spanish using the existing i18n systems.
