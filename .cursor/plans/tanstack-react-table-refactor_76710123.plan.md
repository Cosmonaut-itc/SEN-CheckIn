---
name: tanstack-react-table-refactor
overview: Create a single reusable DataTable component (shadcn Table + TanStack React Table) and refactor all main list/overview tables in apps/web to use it with pagination, filtering, and sorting managed by TanStack Table. Add a detailed architecture/how-to doc with a TanStack Table references section and reminders to follow AGENTS.md + run lint/type checks.
todos:
    - id: datatable-component
      content: Implementar el componente reutilizable `DataTable` (shadcn Table + TanStack Table) con sorting/filtering/pagination (server+client modes).
      status: completed
    - id: datatable-i18n
      content: Agregar/ajustar i18n para textos genéricos del DataTable (sin strings hardcodeadas) en `apps/web/messages/es.json` o un namespace nuevo.
      status: completed
    - id: migrate-employees
      content: Migrar la tabla principal de `[apps/web/app/(dashboard)/employees/employees-client.tsx](apps/web/app/(dashboard)/employees/employees-client.tsx)` a `DataTable` con filtros + paginación + sorting.
      status: completed
    - id: migrate-attendance
      content: Migrar `[apps/web/app/(dashboard)/attendance/attendance-client.tsx](apps/web/app/(dashboard)/attendance/attendance-client.tsx)` a `DataTable` (date/type/location) con paginación + filtros + sorting.
      status: completed
    - id: migrate-vacations
      content: Migrar la tabla principal de `[apps/web/app/(dashboard)/vacations/vacations-client.tsx](apps/web/app/(dashboard)/vacations/vacations-client.tsx)` a `DataTable`.
      status: completed
    - id: migrate-payroll-history
      content: Migrar el listado principal/historial en `[apps/web/app/(dashboard)/payroll/payroll-client.tsx](apps/web/app/(dashboard)/payroll/payroll-client.tsx)` a `DataTable` (sin tocar previews).
      status: completed
    - id: migrate-users
      content: Migrar `[apps/web/app/(dashboard)/users/users-client.tsx](apps/web/app/(dashboard)/users/users-client.tsx)` a `DataTable` con búsqueda + paginación + sorting.
      status: completed
    - id: migrate-admin-crud
      content: Migrar Organizations/Locations/Devices/ApiKeys/JobPositions/Schedules tabs a `DataTable` con paginación+filtros+sorting.
      status: completed
      dependencies:
          - datatable-component
          - datatable-i18n
    - id: migrate-dashboard-presence
      content: Migrar la tabla de presencia en `[apps/web/app/(dashboard)/dashboard/dashboard-client.tsx](apps/web/app/(dashboard)/dashboard/dashboard-client.tsx)` a `DataTable` (client mode).
      status: completed
      dependencies:
          - datatable-component
          - datatable-i18n
    - id: datatable-docs
      content: Crear `apps/web/docs/data-table-architecture.md` con arquitectura, how-to, checklist, referencias TanStack (Context7) y recordatorios AGENTS.md + lint/type-check.
      status: completed
      dependencies:
          - datatable-component
---

# Refactor de tablas (apps/web) a TanStack React Table

## Objetivo

- Reemplazar **todas las tablas principales de páginas/listados** en `apps/web` por un **componente reutilizable** basado en **TanStack React Table** (headless) + **shadcn Table** (`apps/web/components/ui/table.tsx`).
- Cada tabla migrada debe ser **paginable, filtrable y ordenable** usando funcionalidades de TanStack Table.
- Crear una **documentación nueva** con la arquitectura, ejemplos de uso, y una sección de **referencias** (TanStack docs vía Context7), incluyendo recordatorios de **seguir `AGENTS.md`** y **correr lint + type-check al final**.

## Alcance (según tus respuestas)

- **Incluido**: tablas “principales” en páginas/listados:
- `[apps/web/app/(dashboard)/employees/employees-client.tsx](apps/web/app/\\\\\(dashboard)/employees/employees-client.tsx)` (solo la tabla principal del listado)
- `[apps/web/app/(dashboard)/attendance/attendance-client.tsx](apps/web/app/\\\\\(dashboard)/attendance/attendance-client.tsx)`
- `[apps/web/app/(dashboard)/vacations/vacations-client.tsx](apps/web/app/\\\\\(dashboard)/vacations/vacations-client.tsx)` (solo tabla del listado principal)
- `[apps/web/app/(dashboard)/payroll/payroll-client.tsx](apps/web/app/\\\\\(dashboard)/payroll/payroll-client.tsx)` (solo “historial/listado” principal; no previews)
- `[apps/web/app/(dashboard)/users/users-client.tsx](apps/web/app/\\\\\(dashboard)/users/users-client.tsx)`
- `[apps/web/app/(dashboard)/job-positions/job-positions-client.tsx](apps/web/app/\\\\\(dashboard)/job-positions/job-positions-client.tsx)`
- `[apps/web/app/(dashboard)/organizations/organizations-client.tsx](apps/web/app/\\\\\(dashboard)/organizations/organizations-client.tsx)`
- `[apps/web/app/(dashboard)/locations/locations-client.tsx](apps/web/app/\\\\\(dashboard)/locations/locations-client.tsx)`
- `[apps/web/app/(dashboard)/devices/devices-client.tsx](apps/web/app/\\\\\(dashboard)/devices/devices-client.tsx)`
- `[apps/web/app/(dashboard)/api-keys/api-keys-client.tsx](apps/web/app/\\\\\(dashboard)/api-keys/api-keys-client.tsx)`
- `[apps/web/app/(dashboard)/dashboard/dashboard-client.tsx](apps/web/app/\\\\\(dashboard)/dashboard/dashboard-client.tsx)` (tabla de “presencia”)
- `[apps/web/app/(dashboard)/schedules/components/schedule-templates-tab.tsx](apps/web/app/\\\\\(dashboard)/schedules/components/schedule-templates-tab.tsx)`
- `[apps/web/app/(dashboard)/schedules/components/schedule-exceptions-tab.tsx](apps/web/app/\\\\\(dashboard)/schedules/components/schedule-exceptions-tab.tsx)`
- **Excluido por ahora**: tablas pequeñas dentro de dialogs/detalles/preview (ej. tablas internas en `employees-client.tsx`, tablas “detail/day breakdown” en `vacations-client.tsx`, tabla preview en `payroll-client.tsx`).

## Decisión clave de arquitectura (según tus respuestas)

- **Filtros**: mantenerlos “como hoy” (la fuente de datos sigue siendo el server cuando ya existe soporte; si algún filtro ya es client-only, se mantiene client-only).
- **Ordenamiento**: **client-side** (solo sobre los registros cargados).
- **Paginación**:
- Preferimos **server-side** cuando el endpoint ya devuelve `pagination.total` (ej. `fetchEmployeesList`, `fetchLocationsList`, `fetchDevicesList`, `fetchJobPositionsList`, `fetchAttendanceRecords`, `fetchVacationRequests`, `fetchOrganizationMembers`, schedule templates/exceptions).
- Donde hoy se obtiene “todo” sin metadata de paginación (ej. `fetchOrganizations`, `fetchApiKeys`) usaremos **client-side pagination**.

## Diseño del componente reutilizable

Nuevo componente: `apps/web/components/data-table/data-table.tsx`

- **Base UI**: render con shadcn `Table` primitives de [`apps/web/components/ui/table.tsx`](apps/web/components/ui/table.tsx).
- **Headless logic**: `useReactTable` + `flexRender` + row models según modo.
- **Soporte dual (server/client)**:
- **Server mode** (manual):
    - `manualPagination: true` + `rowCount` (para que TanStack calcule páginas) (TanStack docs: pagination guide).
    - `manualFiltering: true` si el filtro es server-driven.
    - `getSortedRowModel` habilitado (ordenamiento solo sobre la página actual).
- **Client mode**:
    - `getFilteredRowModel` + `getPaginationRowModel` + `getSortedRowModel`.
- **Toolbar configurable** (sin hardcode de strings):
- Búsqueda (global filter) opcional.
- Filtros “faceted/select” opcionales (ej. status/location/jobPosition) via config.
- **Paginación UI**:
- Controles: first/prev/next/last + selector de pageSize (shadcn Button/Select).
- En server mode, pageIndex/pageSize controlados y reseteo a página 0 al cambiar filtros.
- **Sorting UI**:
- Headers clicables usando `column.getToggleSortingHandler()` (TanStack sorting API).
- **I18n obligatorio**:
- Cero strings hardcodeadas. El componente recibirá `labels`/`t` (o usará `useTranslations('DataTable')`) para textos comunes.

### Flujo de datos (server mode)

```mermaid
flowchart TD
  pageState[PageState:pagination+filters+sorting] --> queryParams[BuildQueryParams]
  queryParams --> reactQuery[useQuery]
  reactQuery --> data[rows+rowCount]
  data --> dataTable[DataTable(useReactTable)]
  dataTable --> pageState
```

## Migración de tablas por pantalla

Para cada pantalla, el patrón será:

- Definir `columns: ColumnDef<TData>[]` (tipado estricto, sin `any`).
- Mover la UI actual de `<Table>` a `<DataTable ... />`.
- Conectar:
- `pagination` (server o client)
- `filters` (global + faceted)
- `sorting` (client)
- Confirmar que cada tabla migrada cumple: **paginación + filtros + sorting** vía TanStack.

Pantallas concretas:

- **Employees**: convertir el listado principal a server pagination (usa `fetchEmployeesList` que ya devuelve `pagination`). Mantener filtros existentes pero ahora conectados a estado de TanStack Table.
- **Attendance**: integrar date range + type + location como filtros de la tabla. Donde el filtro no exista en API (ej. location), se mantiene client-side.
- **Vacations**: convertir tabla principal de solicitudes; mantener detalle fuera de alcance.
- **Payroll**: convertir tabla principal de historial/listado (no previews).
- **Users**: tabla de miembros (usa `fetchOrganizationMembers` con `total`). Búsqueda actual es client-side; se conecta a TanStack globalFilter.
- **Organizations** y **API Keys**: como hoy se trae todo, usar client pagination + client filtering + client sorting.
- **Locations / Devices / Job Positions / Schedules (tabs)**: server pagination donde ya hay `PaginatedResponse`.
- **Dashboard (presence table)**: client pagination/filter/sort (dataset de “en sitio ahora”).

## Documentación nueva

Crear: `apps/web/docs/data-table-architecture.md`

- **Arquitectura**: modos server/client, cómo se conectan filtros/paginación/sorting.
- **Cómo usar**: ejemplo mínimo (columns + DataTable) y ejemplo server-mode con `limit/offset`.
- **Checklist para migrar una tabla**.
- **Referencias (TanStack Table)** (vía Context7), con links directos a:
- Column defs: `ColumnDef`, `createColumnHelper`, `meta`
- Sorting: `SortingState`, `getSortedRowModel`, `column.getToggleSortingHandler()`
- Filtering: `globalFilter`, `columnFilters`, `manualFiltering`
- Pagination: `PaginationState`, `manualPagination`, `rowCount/pageCount`
- **Recordatorios obligatorios**:
- Seguir [`AGENTS.md`](AGENTS.md) (tipado estricto, JSDoc, i18n).
- Al final: correr `bun run lint:web` y `bun run check-types:web` (o los equivalentes en root).

## Validación de “completo”

- No queda ningún `<Table>` “principal” en las pantallas listadas arriba (solo los excluidos por alcance).
- En cada tabla migrada:
- Se puede **ordenar** por al menos 1 columna.
- Hay **paginación** visible y funcional.
