---
name: Employee details + audit (v2)
overview: Rediseñar el diálogo de empleado como vista central de Detalles con edición explícita y campos inmutables, agregar insights (vacaciones/nómina/ausencias/licencias/excepciones) y auditoría end-to-end híbrida. Incluye mostrar días de vacaciones disponibles con tooltip explicando el cálculo.
todos:
  - id: ui-details-modes
    content: Implementar modos `create|view|edit` en `apps/web/app/(dashboard)/employees/employees-client.tsx` y cambiar la acción a “Ver detalles” + botón “Editar” interno.
    status: pending
  - id: ui-vacation-balance-tooltip
    content: Agregar tarjeta “Días disponibles” y tooltip explicando cálculo (asignados/usados/pendientes/disponibles, año de servicio y corte) con `next-intl`.
    status: pending
    dependencies:
      - ui-details-modes
  - id: api-employee-insights
    content: Agregar `GET /employees/:id/insights` en `apps/api/src/routes/employees.ts` para alimentar el diálogo (vacaciones/nómina/ausencias/licencias/excepciones) con ventanas estándar.
    status: pending
  - id: immutability-code-hiredate
    content: "Bloquear `code` y `hireDate` en edición: ajustar `updateEmployeeSchema` (rechazo), route de employees, y `apps/web/actions/employees.ts` para no enviar esos campos."
    status: pending
    dependencies:
      - ui-details-modes
  - id: audit-schema-migration
    content: Crear tabla `employee_audit_event` en `apps/api/src/db/schema.ts` + migración Drizzle en `apps/api/drizzle/`.
    status: pending
  - id: audit-api-triggers
    content: Implementar auditoría híbrida (API con actor + triggers de respaldo) y exponer `GET /employees/:id/audit`.
    status: pending
    dependencies:
      - audit-schema-migration
  - id: i18n-web
    content: Agregar llaves en `apps/web/messages/es.json` para tabs, KPI, tooltip de balance de vacaciones, y auditoría (sin strings hardcodeadas).
    status: pending
    dependencies:
      - ui-vacation-balance-tooltip
  - id: run-checks
    content: "Al finalizar: correr `bun run check-types` y `bun run lint` y corregir errores."
    status: pending
    dependencies:
      - i18n-web
      - api-employee-insights
      - immutability-code-hiredate
      - audit-api-triggers
---

# Rediseño de diálogo de empleado (Detalles) + auditoría end-to-end

## Objetivos

- Cambiar la acción actual de “Editar” a **“Ver detalles”** y mover la edición a un **botón “Editar” dentro del diálogo**.
- Garantizar que **Código de empleado** y **Fecha de ingreso** sean **inmutables después del alta** (UI + server action + API).
- Hacer del diálogo el punto central de información del empleado: **Vacaciones, Nómina, Ausencias, Licencias/Permisos, Excepciones**.
- Implementar **auditoría end-to-end** (híbrido): eventos con actor desde API + triggers DB como respaldo.
- Seguir explícitamente `AGENTS.md`: TS estricto + JSDoc, strings UI solo vía `next-intl`, y al final correr `bun run check-types` + `bun run lint`.

## Definiciones y defaults (según tus respuestas)

- **Ausencias**: días laborables según calendario (horario + excepciones) sin registros de asistencia.
- **Licencias/Permisos**: `schedule_exception` tipo `DAY_OFF`.
- **Ventanas estándar**:
- Ausencias/Licencias: últimos **90 días**.
- Excepciones: próximos **90 días**.
- Nómina: últimas **6** corridas.
- Vacaciones: últimas **10** solicitudes.
- **Inmutabilidad**:
- **ALTA**: Código/Fecha ingreso se capturan (o se autogeneran si aplica).
- **EDICIÓN**: Código/Fecha ingreso siempre **read-only** y la API **rechaza** cambios.

## Cambio de UI (Web)

Archivos principales:

- `[apps/web/app/(dashboard)/employees/employees-client.tsx](apps/web/app/\\\(dashboard)/employees/employees-client.tsx)`
- [`apps/web/actions/employees.ts`](apps/web/actions/employees.ts)
- [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts)
- [`apps/web/messages/es.json`](apps/web/messages/es.json)

### 1) Diálogo con modos

- Introducir un modo de diálogo: `create | view | edit`.
- **create**: formulario existente.
- **view**: “Detalles” con tabs/secciones y botón **“Editar”**.
- **edit**: formulario existente, pero **Código** y **Fecha de ingreso** deshabilitados (y no enviados al API).

### 2) Enfoque del diálogo: Detalles

- Tabs/secciones (todas con `next-intl`, sin strings hardcodeadas):
- **Resumen**: KPIs y tarjetas clave.
- **Asistencia**: ausencias últimos 90 días (lista + conteos).
- **Vacaciones**: balance + últimas 10 solicitudes.
- **Nómina**: últimas 6 corridas (del empleado).
- **Excepciones**: próximas 90 días.
- **Auditoría**: eventos recientes.

### 3) Vacaciones disponibles + tooltip de cálculo (nuevo requerimiento)

- En **Resumen** y/o tab **Vacaciones**, mostrar **“Días disponibles”**.
- Agregar tooltip en hover (con el `Tooltip` ya usado en el archivo) que explique:
- Fórmula: **Disponibles = Asignados − Usados − Pendientes**.
- Desglose numérico (entitled/used/pending).
- Contexto: año de servicio actual + rango (inicio/fin) + “al corte” (`asOfDateKey`).
- Esto requiere que el API entregue el **balance con desglose**, no solo `availableDays`.

## API: endpoints para Detalles

Archivos principales:

- [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts)
- [`apps/api/src/routes/vacations.ts`](apps/api/src/routes/vacations.ts)
- [`apps/api/src/utils/time-zone.ts`](apps/api/src/utils/time-zone.ts) y [`apps/api/src/utils/date-key.ts`](apps/api/src/utils/date-key.ts)

### 1) `GET /employees/:id/insights`

- Devuelve un payload consolidado para el diálogo:
- **Vacaciones**:
    - balance (con desglose: `entitledDays`, `usedDays`, `pendingDays`, `availableDays`, `serviceYearNumber`, `serviceYearStartDateKey`, `serviceYearEndDateKey`, `asOfDateKey`).
    - últimas 10 solicitudes.
- **Ausencias** (últimos 90 días): lista de `dateKey` ausentes + conteos.
- **Licencias/Permisos**: `schedule_exception` DAY_OFF (últimos 90 días).
- **Excepciones**: próximas 90 días.
- **Nómina**: últimas 6 corridas del empleado (join `payroll_run_employee` + `payroll_run`).
- Timezone: usar `location.timeZone` (fallback `America/Mexico_City`) y utilidades existentes (`getUtcDateForZonedMidnight`, `toDateKeyInTimeZone`).

### 2) Balance de vacaciones “para empleado”

- Factorizar/reutilizar lógica de balance de [`apps/api/src/routes/vacations.ts`](apps/api/src/routes/vacations.ts) (hoy existe `GET /vacations/me/balance`) para poder calcular balance por `employeeId` de manera segura (solo HR/admin con acceso a la organización).

## Inmutabilidad (server-side)

- En [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts):
- `updateEmployeeSchema` debe **rechazar** `code` y `hireDate`.
- En [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts):
- Remover la lógica de “code uniqueness on update” y no permitir setear `hireDate`/`code`.
- En [`apps/web/actions/employees.ts`](apps/web/actions/employees.ts):
- `UpdateEmployeeInput` deja de requerir/enviar `code` y `hireDate`.

## Auditoría end-to-end (híbrida)

### 1) Tabla de auditoría

- En [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts) agregar `employee_audit_event` con:
- `employeeId`, `organizationId`, `action`, `actorType`, `actorUserId` (nullable), timestamps.
- `before`/`after` (`jsonb`) y `changedFields` (string[] en `jsonb`).
- Crear migración en [`apps/api/drizzle/`](apps/api/drizzle/).

### 2) Auditoría por API (con actor)

- Insertar eventos desde:
- `employees` (create/update/delete + cambios de Rekognition).
- `payroll` (cuando se actualiza `employee.lastPayrollDate`).
- Usar transacciones y snapshots “before/after”.

### 3) Triggers DB (respaldo)

- Triggers en `employee` (y opcional `employee_schedule`) para registrar eventos cuando cambios ocurren fuera de la API.
- Evitar duplicados: la API puede setear un flag de sesión (p. ej. `set_config`) para que el trigger no inserte cuando ya hay evento de API.

### 4) Lectura

- `GET /employees/:id/audit` (paginado) + tab “Auditoría” en UI.

## Validación final (obligatoria)

- En la raíz:
- `bun run check-types`