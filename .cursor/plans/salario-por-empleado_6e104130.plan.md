---
name: salario-por-empleado
overview: Mover la asignación de salario/frecuencia de pago desde `job_position` hacia `employee`, eliminando las columnas de salario del puesto, y actualizando la UI (web) para que el salario se capture por empleado.
todos:
    - id: db-migration
      content: Actualizar schema Drizzle, crear migración (backfill + drop columnas de job_position) y ajustar auditoría.
      status: pending
    - id: api-refactor
      content: Actualizar schemas Zod y rutas API (job-positions, employees, payroll) para usar salario por empleado.
      status: pending
    - id: web-ui-refactor
      content: Actualizar tipos/fetchers, refactor UI de job positions sin salario, y agregar salario+frecuencia al dialog de empleados adaptado al layout.
      status: pending
    - id: tests-update
      content: Actualizar contract tests y seeds para reflejar el nuevo modelo.
      status: pending
    - id: verify
      content: Correr check-types/lint/tests relevantes para asegurar que todo compila y pasa.
      status: pending
---

# Refactor: salario por empleado (no por puesto)

## Objetivo

- **Eliminar** la asignación de salario en puestos (`job_position.daily_pay`, `job_position.payment_frequency`).
- **Asignar salario por empleado** (`employee.daily_pay`, `employee.payment_frequency`).
- **Permitir edición abierta** (por el momento): el **salario del empleado** y la **fecha de ingreso** deben poder **editarse por cualquier usuario** (sin validación por rol/permiso en UI/API, más allá del acceso normal a la organización).
- **UI web**:
    - Dialog de crear/editar puesto: **solo** nombre + descripción.
    - Dialog de crear/editar empleado: agregar selector de **frecuencia de pago** + captura de **salario del periodo** (con cálculo a salario diario), adaptado al layout actual.

## Cambios de base de datos (Drizzle + migración)

- Editar schema en [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts):
    - **Agregar** a `employee`:
        - `dailyPay: numeric('daily_pay', { precision: 10, scale: 2 }).default('0').notNull()`
        - `paymentFrequency: paymentFrequency('payment_frequency').default('MONTHLY').notNull()`
    - **Quitar** de `jobPosition`:
        - `dailyPay`
        - `paymentFrequency`
- Migración SQL (nueva en `apps/api/drizzle/` vía `bun run db:gen` y luego ajustar manualmente) con este orden:

```sql
-- 1) add employee columns
ALTER TABLE "employee" ADD COLUMN "daily_pay" numeric(10,2) NOT NULL DEFAULT '0';
ALTER TABLE "employee" ADD COLUMN "payment_frequency" payment_frequency NOT NULL DEFAULT 'MONTHLY';

-- 2) backfill from job_position
UPDATE "employee" e
SET "daily_pay" = jp."daily_pay",
    "payment_frequency" = jp."payment_frequency"
FROM "job_position" jp
WHERE e."job_position_id" = jp."id";

-- 3) drop columns from job_position
ALTER TABLE "job_position" DROP COLUMN "daily_pay";
ALTER TABLE "job_position" DROP COLUMN "payment_frequency";
```

- Actualizar auditoría para incluir los nuevos campos:
    - [`apps/api/src/services/employee-audit.ts`](apps/api/src/services/employee-audit.ts) → agregar `dailyPay` y `paymentFrequency` al snapshot.

## API (Elysia)

- Actualizar validaciones Zod en [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts):
    - `createJobPositionSchema` / `updateJobPositionSchema`: **remover** `dailyPay` y `paymentFrequency`.
    - `createEmployeeSchema`: **agregar** `dailyPay` (number > 0) y `paymentFrequency` (enum WEEKLY/BIWEEKLY/MONTHLY).
    - `updateEmployeeSchema`: permitir actualizar `dailyPay` y `paymentFrequency` (opcionales) **y** `hireDate` (fecha de ingreso).
- Actualizar routes:
    - [`apps/api/src/routes/job-positions.ts`](apps/api/src/routes/job-positions.ts):
        - Crear/editar puesto solo name/description/orgId.
        - Ajustar list/get para no seleccionar/retornar salario.
    - [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts):
        - Persistir `dailyPay` y `paymentFrequency` en create/update.
        - Permitir actualizar `hireDate` en update (sin restricción por rol).
        - Incluir estos campos en list/get responses.
    - [`apps/api/src/routes/payroll.ts`](apps/api/src/routes/payroll.ts):
        - Cambiar el SELECT para tomar `dailyPay` y `paymentFrequency` desde `employee` (ya no desde `job_position`).
- Actualizar seeds:
    - [`apps/api/scripts/seed.ts`](apps/api/scripts/seed.ts):
        - Después de seedear empleados (o en la seed), setear `employee.dailyPay/paymentFrequency` a partir del puesto asignado.
        - Ajustar `insertPayrollRuns` para usar `employee.dailyPay` (ya no `job_position.dailyPay`).

## Web (Next.js)

- Types y fetchers:
    - [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts):
        - `JobPosition`: remover `dailyPay` y `paymentFrequency`.
        - `Employee`: agregar `dailyPay` y `paymentFrequency`.
        - Normalizar `dailyPay` (y opcionalmente `sbcDailyOverride`) cuando venga como string desde el API.
    - [`apps/web/lib/server-client-functions.ts`](apps/web/lib/server-client-functions.ts):
        - Ajustar `fetchJobPositionsListServer` para ya no mapear `dailyPay`.
        - Ajustar `fetchEmployeesListServer` para incluir/normalizar `dailyPay`.
- UI de puestos:
    - `[apps/web/app/(dashboard)/job-positions/job-positions-client.tsx](apps/web/app/\\\\(dashboard)/job-positions/job-positions-client.tsx)`:
        - Quitar `paymentFrequency`, `periodPay`, cálculo de diario y columnas de tabla relacionadas.
        - Form/dialog: solo `name` y `description`.
    - [`apps/web/actions/job-positions.ts`](apps/web/actions/job-positions.ts):
        - Remover `dailyPay`/`paymentFrequency` de inputs y payload.
- UI de empleados:
    - `[apps/web/app/(dashboard)/employees/employees-client.tsx](apps/web/app/\\\\(dashboard)/employees/employees-client.tsx)`:
        - Agregar al form:
            - `paymentFrequency` (select)
            - `periodPay` (input numérico) + cálculo a `dailyPay` (read-only)
            - Hacer `hireDate` **editable también en modo editar** (quitar `disabled={isEditMode}`) y enviar el valor en update.
        - En submit create/update, enviar `dailyPay` + `paymentFrequency`.
        - Adaptar al grid existente `sm:grid-cols-2` (p. ej. frecuencia + salario del periodo en la misma fila, y “salario diario calculado” a `col-span-2`).
    - [`apps/web/actions/employees.ts`](apps/web/actions/employees.ts):
        - Extender `CreateEmployeeInput` / `UpdateEmployeeInput` con `dailyPay` y `paymentFrequency`.
        - Permitir enviar `hireDate` en update.
- i18n:
    - [`apps/web/messages/es.json`](apps/web/messages/es.json):
        - `JobPositions`: limpiar strings de salario si quedan sin uso.
        - `Employees`: agregar labels/placeholders/validaciones para salario y frecuencia.
        - `Payroll.subtitle`: cambiar “salarios por puesto” → **“salarios por empleado”**.

## Tests

- API contract tests:
    - [`apps/api/src/routes/job-positions.contract.test.ts`](apps/api/src/routes/job-positions.contract.test.ts):
        - Ajustar create/update para ya no enviar/esperar salario/warnings.
    - [`apps/api/src/routes/employees.contract.test.ts`](apps/api/src/routes/employees.contract.test.ts):
        - Incluir `dailyPay` y `paymentFrequency` en create.
- Validar payroll contract test con seed actualizado:
    - [`apps/api/src/routes/payroll.contract.test.ts`](apps/api/src/routes/payroll.contract.test.ts) (debería seguir pasando).

## Verificación (comandos)

- `bun run check-types:api && bun run test:api:contract`
- `bun run check-types:web && bun run lint:web`
- (Opcional) `bun run test:ci`
