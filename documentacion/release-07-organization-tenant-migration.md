# Release 07 - Organization tenant migration

## Resumen

- Eliminamos la superficie de "clients" en API y web; todo queda escopado por organizaciones de BetterAuth.
- `location` y `job_position` ahora guardan `organization_id` y solo mantienen `client_id` como legado.
- Las rutas API derivan `organizationId` desde la sesión de BetterAuth (plugin de organizaciones, doc `/better-auth/better-auth`).
- En el dashboard, el contexto de organización se obtiene en el server (`getActiveOrganizationContext`) y se entrega a clientes vía `<OrgProvider>` sin exponer el slug en la URL (patrón App Router de Next.js, doc `/vercel/next.js`).
- Migramos tipos compartidos para eliminar `clientId` y actualizamos el conteo del dashboard a `organizations`.

## Detalles

- Drizzle: nuevas columnas `organization_id` en `location` y `job_position` (`references(() => organization.id, { onDelete: 'cascade' })`, doc `/drizzle-team/drizzle-orm-docs`). `client_id` queda opcional y marcado `@deprecated`.
- API: rutas `clients` removidas; `locations` y `job-positions` exigen organización (de sesión o `organizationId` en API key). Respuestas preservan `organizationId` y limpian `clientId`.
- Web: carpetas `/clients` borradas, navegación y cards ajustados a "Organizations". Formularios de ubicaciones y puestos usan contexto de organización en lugar de seleccionar cliente.
- Contexto: helper server `getActiveOrganizationContext` usa `serverAuthClient.getSession` + `organization.list` (BetterAuth org plugin) y proveedor cliente `OrgProvider` expone `{ organizationId, organizationSlug, organizationName }`.
- Dashboard: los contadores ahora incluyen `organizations` (via BetterAuth) y ya no `clients`.

## Notas operativas

- Ejecutar `bunx drizzle-kit generate` + `bunx drizzle-kit migrate` con `SEN_DB_URL` para aplicar las nuevas columnas/constraints.
- Revisar datos existentes para poblar `organization_id` en `location`/`job_position`; `client_id` sigue aceptando `NULL` durante la transición.
