---
name: Incapacidades IMSS tabla
overview: Hacer que la sección de la tabla en el plan de Incapacidades IMSS sea específica y alineada al patrón real del proyecto (TanStack Table + componente compartido `DataTable`, filtros/paginación server-driven, i18n).
todos:
  - id: audit-table-pattern
    content: Extraer patrón de tabla actual (DataTable + server mode) a partir de attendance/employees/vacations y documentarlo con rutas concretas en el plan.
    status: pending
  - id: update-plan-table-spec
    content: Actualizar `/.cursor/plans/incapacidades-imss_252f5aa3.plan.md` para reemplazar el bullet genérico de UX por una especificación detallada de tabla (DataTable, estado, query params, filtros, columnas, i18n).
    status: pending
---

# Tabla de Incapacidades (alineada al proyecto)

## Contexto (patrón actual en el repo)

- La UI de listados del dashboard usa el componente compartido [`apps/web/components/data-table/data-table.tsx`](apps/web/components/data-table/data-table.tsx) (TanStack Table + shadcn/ui) en **modo cliente** o **modo servidor** (manualPagination/manualFiltering).
- Ejemplo claro en Asistencia: [`apps/web/app/(dashboard)/attendance/attendance-client.tsx`](apps/web/app/\(dashboard)/attendance/attendance-client.tsx) donde la tabla corre en **server mode** con `manualPagination`, `manualFiltering`, `rowCount` y filtros externos (arriba de la tabla) con `showToolbar={false}`.
- La convención de cache/params se centraliza en [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts) y los fetchers tipados viven en [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts).

Referencia del patrón (props + server mode):

```737:754:apps/web/app/(dashboard)/attendance/attendance-client.tsx
			<DataTable
				columns={columns}
				data={records}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={handleColumnFiltersChange}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				showToolbar={false}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('table.empty')}
				isLoading={isFetching}
			/>
```

## Cambio solicitado

Actualizar el plan existente [`/.cursor/plans/incapacidades-imss_252f5aa3.plan.md`](.cursor/plans/incapacidades-imss_252f5aa3.plan.md) para que la sección **Web (Next.js) → UX → Tabla** deje de ser genérica y especifique exactamente **cómo** construir la tabla igual que el resto del dashboard.

## Qué debe decir el plan (especificación de tabla)

En `Web (Next.js)` del plan, reemplazar/expandir el bullet de “Tabla con filtros…” por una sección como:

### Tabla: listado de Incapacidades

- **Componente**: usar `DataTable` de [`apps/web/components/data-table/data-table.tsx`](apps/web/components/data-table/data-table.tsx) (no crear una tabla nueva ad-hoc).
- **Modo**: **server-driven**.
  - `manualPagination={true}`
  - `manualFiltering={true}`
  - `rowCount={response.pagination.total}`
  - `data={response.data}` (solo la página actual)
- **Estado estándar (TanStack Table)** en `incapacities-client.tsx`:
  - `sorting: SortingState`
  - `pagination: PaginationState` (inicial: `{ pageIndex: 0, pageSize: 10 }`)
  - `columnFilters: ColumnFiltersState`
  - `globalFilter: string`
- **Reset de paginación**: cuando cambie `globalFilter` o cualquier filtro, forzar `pageIndex = 0` (mismo patrón que Attendance/Employees/Vacations).
- **Query params para el backend** (limit/offset + filtros) construidos desde el estado:
  - `limit = pagination.pageSize`
  - `offset = pagination.pageIndex * pagination.pageSize`
  - `search = globalFilter.trim()` (si no está vacío)
  - `employeeId?`, `type?`, `status?`
  - `from?` / `to?` (rango de fechas en `YYYY-MM-DD`, ideal para `startDateKey/endDateKey`)
- **React Query**:
  - `useQuery({ queryKey: queryKeys.incapacities.list(queryParams), queryFn: () => fetchIncapacitiesList(queryParams) })`
  - Botón “Refrescar” debe llamar `refetch()` (como `attendance-client.tsx`).
- **i18n**:
  - Nada hardcodeado; usar `useTranslations('Incapacities')` para encabezados, filtros, empty state y acciones.
  - DataTable ya usa `useTranslations('DataTable')` para labels compartidos.

### Filtros (UI arriba de la tabla)

- Seguir el patrón de pantallas que requieren filtros complejos (`attendance-client.tsx`, `employees-client.tsx`, `vacations-client.tsx`):
  - Renderizar controles arriba de la tabla y pasar `showToolbar={false}` a `DataTable`.
- Controles mínimos (alineados al plan y al backend):
  - **Buscar** (`Input` con ícono, actualiza `globalFilter`).
  - **Empleado** (`Select` con `employeeId`, opción “Todos”).
  - **Rango de fechas** (`from`/`to` con `input[type=date] `o `Popover+Calendar`, pero el valor final debe ser `YYYY-MM-DD`).
  - **Tipo** (`Select`: `EG|RT|MAT|LIC140BIS`).
  - **Estatus** (`Select`: `ACTIVE|CANCELLED`, opción “Todos”).

### Columnas (ColumnDef<IncapacityRow>[]) — mismas convenciones del proyecto

- Definir `columns` con `useMemo<ColumnDef<IncapacityRow>[]>(...)`.
- Columnas sugeridas (todas con headers i18n `Incapacities.table.headers.*`):
  - **Empleado**: nombre (truncate + `font-medium`).
  - **Tipo**: `Badge` con label traducido (`EG/RT/MAT/LIC140BIS`).
  - **Periodo**: `startDateKey – endDateKey` formateado (usar helpers estilo vacaciones: `toUtcDate(dateKey)` + `formatDateRangeUtc(...)` para evitar desfases de zona horaria).
  - **Días autorizados**: número.
  - **Folio/Case**: `certificateFolio` y/o `caseId` (monospace + truncado).
  - **Estatus**: `Badge` (`ACTIVE/CANCELLED`).
  - **Acciones**: botón(s) en celda (como Vacaciones) para `Ver detalle` / `Editar` / `Cancelar` y acciones de documento (subir/ver/descargar).

### Estados vacíos/carga

- Pasar `emptyState={t('table.empty')}` e `isLoading={isFetching}`.
- Mantener consistencia visual con el resto de páginas (header con título/subtítulo y acciones arriba).

## Resultado esperado

- El plan quedará explícito sobre **qué componente usar**, **qué estado manejar**, **qué props/config aplicar (server mode)**, **qué filtros y columnas incluir**, y **cómo se conecta con `queryKeys`/fetchers**, siguiendo el mismo patrón que Asistencia/Empleados/Vacaciones.