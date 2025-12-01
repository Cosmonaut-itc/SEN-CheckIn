# Repository Guidelines

## Project Structure & Module Organization

- `apps/api`: Bun + Elysia service (`src/index.ts`). Postgres helper `docker-compose.yaml` (needs `SEN_CHECKIN_PG_PASSWORD`). Drizzle config `drizzle.config.ts`, migrations in `apps/api/drizzle/`. Builds to `dist/`.
- `apps/mobile`: Expo Router app; screens in `app/`, shared UI in `components/`, assets in `assets/`, scripts in `scripts/`; alias `@/` points to the app root.
- `packages/api-contract` & `packages/types`: shared contracts/domain types; add shapes here before duplicating in apps.
- `packages/eslint-config` & `packages/typescript-config`: shared lint/TS presets (`base`, `expo`, `elysia`). Workspace aliases live in `tsconfig.base.json` (`@sen-checkin/*`).
- `documentacion`: release notes; keep entries per release.

## Build, Test, and Development Commands

- Install: `bun install` (bun@1.3.3, Node ≥18).
- Dev: `bun run dev` (all) or `bun run dev:api` / `bun run dev:mobile` / `bun run dev:web` (Expo bundler for mobile).
- Build: `bun run build`, or scoped `bun run build:api` / `bun run build:mobile` / `bun run build:web`.
- Quality checks: `bun run lint` (all), `bun run check-types` (all), `bun run format` (Prettier on `ts/tsx/md`).
- Scoped quality: `bun run lint:api` / `bun run lint:mobile` / `bun run lint:web`, `bun run check-types:api` / `bun run check-types:mobile` / `bun run check-types:web`.
- Drizzle: `bun run db:gen` then `bun run db:mig` (needs `SEN_DB_URL`).
- Add deps: `bun run add:api -- <pkg>`, `bun run add:mobile -- <pkg>`, or `bun run add:web -- <pkg>`.
- Expo per-platform: from `apps/mobile`, `bunx expo start --android|--ios|--web`.
- Optional DB: `docker compose -f apps/api/docker-compose.yaml up -d`.

## Coding Style & Naming Conventions

- TypeScript is strict; shared configs target ES2022 with `moduleResolution NodeNext`.
- **Strict typing required**: All functions, variables, and component props must be strongly typed. Avoid `any`; use proper TypeScript types or `unknown` when necessary.
- **JSDoc documentation required**: All functions must include JSDoc comments with `@param`, `@returns`, and `@throws` (when applicable). Use standard JSDoc format for function documentation.
- Prettier controls spacing (2 spaces, semicolons). Run `bun run format` before pushing.
- ESLint: API uses `@sen-checkin/eslint-config/elysia` (with `turbo/no-undeclared-env-vars`); mobile uses `eslint-config-expo`. Keep generated `dist/` out of git.
- Naming: `PascalCase` React components, `camelCase` vars/functions, kebab-case folders; align Expo route files with router paths.

## Testing Guidelines

- Quality checks: Run `bun run lint` and `bun run check-types` before committing. These validate code quality and type safety across all workspaces.
- No test suite yet; add colocated `*.test.ts` / `*.test.tsx` with new work.
- API: use Bun-friendly runners (e.g., Vitest via `bun test`) and HTTP-style cases; prefer seeded fixtures over shared DB state.
- Mobile: use `@testing-library/react-native` for components/navigation; avoid brittle snapshots.
- Add a `test` script so Turbo can orchestrate alongside `lint` and `check-types`.

## Commit & Pull Request Guidelines

- Use conventional messages (`feat(scope): ...`, `chore: ...`, `fix: ...`; scopes like `api`, `mobile`).
- PRs: summary, commands run (`lint`, `check-types`, tests), UI screenshots when relevant, linked issue/ID, and DB/config notes.
- Keep PRs small; flag changes to shared types/contracts and downstream impact.

## Security & Configuration Notes

- Do not commit `.env*` files or secrets.
- Required env: `SEN_DB_URL` for Drizzle generate/migrate; `SEN_CHECKIN_PG_PASSWORD` for local Postgres.
- Prefer `bunx` over global installs; align with Expo SDK 54 and Bun 1.3.3.
