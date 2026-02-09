# Repository Guidelines

## Project Structure & Module Organization

- `apps/api`: Bun + Elysia service (`src/index.ts`). Postgres helper `docker-compose.yaml` (needs `SEN_CHECKIN_PG_PASSWORD`). Drizzle config `drizzle.config.ts`, migrations in `apps/api/drizzle/`. Builds to `dist/`.
- `apps/mobile`: Expo Router app; screens in `app/`, shared UI in `components/`, assets in `assets/`, scripts in `scripts/`; alias `@/` points to the app root.
- `apps/web`: Next.js admin portal with Tailwind CSS and Radix UI components.
- `packages/api-contract` & `packages/types`: shared contracts/domain types; add shapes here before duplicating in apps.
- `packages/eslint-config` & `packages/typescript-config`: shared lint/TS presets (`base`, `expo`, `elysia`). Workspace aliases live in `tsconfig.base.json` (`@sen-checkin/*`).
- `documentacion`: release notes; keep entries per release.

## Build, Test, and Development Commands

- Install: `bun install` (bun@1.3.3, Node ≥18).
- Dev: `bun run dev` (all) or `bun run dev:api` / `bun run dev:mobile` / `bun run dev:web`.
- Start (API only): `bun run start:api` (runs the API `start` script via Turbo).
- Build: `bun run build`, or scoped `bun run build:api` / `bun run build:mobile` / `bun run build:web`.
- Test (all): `bun run test` (Turbo).
- Test (CI bundle): `bun run test:ci` (API unit + contract, web unit + e2e, lint, check-types).
- API tests: `bun run test:api:unit` / `bun run test:api:contract`.
- Web tests: `bun run test:web:unit` / `bun run test:web:e2e` / `bun run test:web:e2e:ui`.
- Quality checks: `bun run lint` (all), `bun run check-types` (all), `bun run format` (Prettier on `ts/tsx/md`).
- Scoped quality: `bun run lint:api` / `bun run lint:mobile` / `bun run lint:web`, `bun run check-types:api` / `bun run check-types:mobile` / `bun run check-types:web`.
- **Single test commands**:
    - API: `cd apps/api && bun test path/to/test.test.ts`
    - Mobile: `cd apps/mobile && bun test path/to/test.test.ts` (when test suite added)
    - Web: `cd apps/web && bun test path/to/test.test.ts` (when test suite added)
- Drizzle: `bun run db:gen` then `bun run db:mig` (needs `SEN_DB_URL`).
- Seed/reset DB: `bun run db:seed` / `bun run db:reset`.
- Add deps: `bun run add:api -- <pkg>`, `bun run add:mobile -- <pkg>`, or `bun run add:web -- <pkg>`.
- Expo per-platform: from `apps/mobile`, `bunx expo start --android|--ios|--web`.
- Optional DB (dev): `docker compose -f apps/api/docker-compose.yaml up -d` (Postgres on 5434).
- Optional DB (tests): `docker compose -f apps/api/docker-compose.test.yaml up -d` (Postgres on 5435).

## Coding Style & Naming Conventions

- TypeScript is strict; shared configs target ES2022 with `moduleResolution NodeNext`.
- **Strict typing required**: All functions, variables, and component props must be strongly typed. Avoid `any`; use proper TypeScript types or `unknown` when necessary.
- **JSDoc documentation required**: All functions must include JSDoc comments with `@param`, `@returns`, and `@throws` (when applicable). Use standard JSDoc format for function documentation.
- **Import organization**:
    - External libraries first, then workspace packages (`@sen-checkin/*`), then local imports
    - Use absolute imports with workspace aliases: `@sen-checkin/types`, `@sen-checkin/api-contract`
    - Local relative imports for same-directory files: `./utils.js`
- **Formatting**: Prettier with tabs (4 spaces), semicolons, trailing commas, single quotes. Run `bun run format` before pushing.
- **ESLint**: API uses `@sen-checkin/eslint-config/elysia`, mobile uses `eslint-config-expo`, web uses Next.js preset. Keep generated `dist/` out of git.
- **Naming conventions**:
    - React components: `PascalCase`
    - Variables/functions: `camelCase`
    - Files/folders: `kebab-case`
    - Constants: `UPPER_SNAKE_CASE`
    - Expo route files must align with router paths
- **Error handling**:
    - Use try/catch blocks with proper error typing
    - Return standardized error responses from API
    - Log errors appropriately without exposing sensitive data

## Language & Localization

- **All UI strings must be in Spanish** (Latin American, Mexican Spanish preferred).
- Use the existing i18n infrastructure: `next-intl` for web, `expo-localization` + `i18n-js` for mobile.
- Never hardcode user-facing strings; always use translation keys.
- Translation files: `apps/web/messages/es.json` and `apps/mobile/lib/translations/es.json`.

## Testing Guidelines

- **Quality checks**: Always run `bun run lint` and `bun run check-types` before committing. These validate code quality and type safety across all workspaces.
- **Test patterns**: Add colocated `*.test.ts` / `*.test.tsx` files alongside source code.
- **API testing**: Use Bun test runner with `describe`, `it`, `expect` from `bun:test`. Focus on business logic, HTTP endpoints, and data transformations. Prefer seeded fixtures over shared DB state. Contract tests use the test DB on port 5435 (see `docker-compose.test.yaml`).
- **Mobile testing**: Use `@testing-library/react-native` for components/navigation. Avoid brittle snapshots; test user interactions and state changes.
- **Web testing**: Unit tests use Vitest; e2e uses Playwright with `apps/web/e2e` and `bun run test:web:e2e` (spins up API + web via `test:e2e:servers`).
- **Test structure**: Group tests by feature/functionality using `describe` blocks. Use clear, descriptive test names that explain the behavior being tested.

## Database & Migration Guidelines

- **Drizzle ORM**: All database operations use Drizzle with PostgreSQL.
- **Migration workflow**:
    1. Make schema changes in `apps/api/src/db/schema.ts`
    2. Run `bun run db:gen` to generate migration
    3. Run `bun run db:mig` to apply migration
    4. Test with `bun run db:seed` for sample data
- **Environment**: Requires `SEN_DB_URL` for migrations. Use `SEN_CHECKIN_PG_PASSWORD` for local Postgres via Docker.

## Security & Configuration Notes

- **Never commit** `.env*` files, secrets, or sensitive configuration.
- **Required environment variables**:
    - API: `SEN_DB_URL`, `BETTER_AUTH_SECRET`, `AWS_REGION`, `AWS_REKOGNITION_COLLECTION_ID`.
    - Local DBs: `SEN_CHECKIN_PG_PASSWORD` (Docker dev/test databases).
    - API config: `CORS_ORIGIN`, `LOG_LEVEL`, `HOST`, `PORT` (optional overrides).
    - Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL` (defaults 3000/3001), `PLAYWRIGHT_BASE_URL` (e2e base URL).
    - Mobile: `EXPO_PUBLIC_API_URL` (required), optional `EXPO_PUBLIC_WEB_VERIFY_URL` / `EXPO_PUBLIC_VERIFY_URL` / `VERIFY_URL`.
- **AWS integration**: Uses AWS Rekognition for facial recognition; requires proper IAM roles/credentials plus `AWS_REGION` and `AWS_REKOGNITION_COLLECTION_ID`.
- **Dependencies**: Prefer `bunx` over global installs. Align with Expo SDK 54, React 19, and Bun 1.3.3.

## Commit & Pull Request Guidelines

- **Conventional commits**: Use `feat(scope): ...`, `fix(scope): ...`, `chore: ...`, `docs: ...` format. Scopes: `api`, `mobile`, `web`, `types`, `infra`.
- **PR requirements**:
    - Clear summary of changes
    - Commands run (`lint`, `check-types`, tests)
    - UI screenshots for frontend changes
    - Linked issue/ID when applicable
    - Database migration notes if applicable
- **Keep PRs small** and focused. Flag changes to shared types/contracts and downstream impact.

## Documentation Reference Guidelines

- **Do not use training data for documentation references**: Agents must not rely on training data when referencing library or framework documentation.
- **Use search or web fetch tools**: Always use web search tools to retrieve up-to-date documentation and code examples.
- **Version-specific information**: This ensures accuracy and access to the latest API changes, best practices, and version-specific information.

## Release 13 Compliance (Actas Administrativas)

- For Release 13 frontend and data-flow tasks, the following skills are **mandatory**:
  - `next-best-practices`
  - `nextjs-data-fetching`
  - `vercel-react-best-practices`
  - `frontend-design`
  - `ui-ux-pro-max`
- When external framework/library references are needed, agents must use **Context7 MCP** (`resolve-library-id` + `query-docs`) before responding.
- Do not cite framework behavior for Release 13 from memory alone; document lookups must be explicit and reproducible.
