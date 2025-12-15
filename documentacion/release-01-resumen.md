# Release 01 – Monorepo base

## Objetivo

- Crear el esqueleto del monorepo con bun + Turborepo.
- Definir las carpetas `apps/`, `packages/` y `documentacion/`.
- Introducir el paquete `@sen-checkin/api-contract` como punto futuro de contrato Elysia/Eden.

## Decisiones arquitectónicas

- Turborepo como orquestador de tareas del workspace.
- TypeScript estricto con configuraciones compartidas en `@sen-checkin/typescript-config`.
- Alias internos de TypeScript para acceder a paquetes compartidos (`@sen-checkin/*`).
- ESLint compartido en `@sen-checkin/eslint-config` para homogeneizar reglas entre apps y packages.
