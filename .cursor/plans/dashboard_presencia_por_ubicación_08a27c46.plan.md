---
name: Dashboard presencia por ubicación
overview: Agregar una sección “En sitio ahora” al dashboard web que muestre empleados con CHECK_IN hoy (según zona horaria del navegador), agrupados por ubicación, usando componentes shadcn y un endpoint dedicado en la API para evitar paginación.
todos:
  - id: api-present-endpoint
    content: Implementar `GET /attendance/present` (sin paginación) que, dado `fromDate/toDate`, compute el último evento por empleado y devuelva solo los que terminen en `CHECK_IN`, incluyendo `locationId/name`, `employeeCode`, `checkedInAt`, `deviceId`.
    status: pending
  - id: api-schema-present
    content: Agregar `attendancePresentQuerySchema` en `apps/api/src/schemas/crud.ts` (fromDate/toDate requeridos + organizationId opcional) y exportar tipos inferidos.
    status: pending
  - id: web-shadcn-accordion
    content: Agregar componente shadcn `Accordion` en `apps/web` (CLI `shadcn add accordion`) y confirmar que compile con aliases `@/components/ui`.
    status: pending
  - id: web-fetch-present
    content: Agregar query key `queryKeys.attendance.present` y fetcher `fetchAttendancePresent` en `apps/web/lib/client-functions.ts` (tipos + JSDoc).
    status: pending
    dependencies:
      - api-present-endpoint
      - api-schema-present
  - id: dashboard-ui-presence-section
    content: Implementar la sección “En sitio ahora” en `apps/web/app/(dashboard)/dashboard/dashboard-client.tsx` usando Accordion + Card/Table/Avatar/Badge/Skeleton, con búsqueda y resumen.
    status: pending
    dependencies:
      - web-shadcn-accordion
      - web-fetch-present
  - id: i18n-es-dashboard-presence
    content: Agregar traducciones en `apps/web/messages/es.json` para la nueva sección (títulos, placeholders, headers, empty states, acciones).
    status: pending
    dependencies:
      - dashboard-ui-presence-section
  - id: quality-checks
    content: Correr `bun run check-types` y `bun run lint` y corregir cualquier error relacionado con los cambios.
    status: pending
    dependencies:
      - i18n-es-dashboard-presence
      - api-present-endpoint
---

# Dashboard: empleados en sitio por ubicación

## Objetivo

Mostrar en `apps/web` (dashboard) **qué empleados están actualmente “en sitio” hoy**, agrupados por **cada ubicación registrada**, manteniendo el diseño actual de tarjetas y usando shadcn.

- **Definición acordada**: “En sitio” = el **último evento del día de hoy** (en la **zona horaria del navegador**) para el empleado es `CHECK_IN`.
- **Layout acordado**: mantener las tarjetas actuales y **agregar una sección nueva** debajo.

## Enfoque de datos

Como el endpoint actual `GET /attendance` es paginado, agregaremos un endpoint dedicado que devuelva el “estado actual” por empleado dentro de un rango (hoy) sin requerir paginar.

- **API**: nuevo `GET /attendance/present` con query `{ fromDate, toDate, organizationId? }`.
- **Web**: la sección del dashboard calcula `fromDate/toDate` con `date-fns` en el cliente (zona horaria del navegador) y consulta ese endpoint.

## UI/UX (shadcn)

Sección nueva “En sitio ahora” en `apps/web/app/(dashboard)/dashboard/dashboard-client.tsx`:

- **Header**: título + botón “Actualizar” + resumen (total en sitio, ubicaciones con actividad).
- **Búsqueda**: input para filtrar por nombre/código.
- **Listado por ubicación**: **Accordion** (1 item por ubicación) con:
- Trigger: nombre de ubicación + badge con conteo.
- Content: tabla/lista con empleados “en sitio” (avatar/initials, nombre, código, hora de entrada, “hace X”, dispositivo).
- Estado vacío por ubicación: mensaje traducido.

> `Accordion` no existe hoy en `apps/web/components/ui`, así que se agregará con shadcn CLI.

## Archivos a cambiar

- API:
- [`apps/api/src/routes/attendance.ts`](apps/api/src/routes/attendance.ts): agregar `GET /attendance/present`.
- [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts): agregar `attendancePresentQuerySchema` (+ types exportados).
- Web:
- [`apps/web/components/ui/accordion.tsx`](apps/web/components/ui/accordion.tsx): nuevo componente (shadcn).
- [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts): agregar `queryKeys.attendance.present(...)`.
- [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts): agregar `fetchAttendancePresent(...)` + tipos.
- [`apps/web/app/(dashboard)/dashboard/dashboard-client.tsx`](apps/web/app/\\(dashboard)/dashboard/dashboard-client.tsx): render de la nueva sección.
- [`apps/web/messages/es.json`](apps/web/messages/es.json): nuevas keys para Dashboard/presencia.

## Comandos (al final)

- `bun run check-types`
- `bun run lint`

(Se recomienda correr ambos porque tocaríamos `apps/api` y `apps/web`.)

## Notas de implementación

- La sección de presencia se carga **client-side** (no se prefetch en el server) porque “hoy” depende de la zona horaria del navegador.