---
name: employee-finiquito-feature
overview: Implementar un flujo de baja de empleado que calcule finiquito (siempre) y muestre liquidación/indemnización (sección colapsable), persista un snapshot auditable del cálculo, y marque al empleado como INACTIVE guardando fecha y motivo de terminación.
todos:
  - id: db-termination-fields
    content: Agregar enums + campos de terminación en `employee` y crear tabla `employee_termination_settlement` con snapshot JSONB + totales.
    status: pending
  - id: api-finiquito-service
    content: Implementar `finiquito-calculation` reutilizando `getSbcDaily`, `resolveMinimumWageDaily`, `roundCurrency` y cálculo de vacaciones/aguinaldo por dateKey.
    status: pending
  - id: api-employee-termination-routes
    content: "Agregar `POST /employees/:id/termination/preview` y `POST /employees/:id/termination` (transacción: insert settlement + update employee INACTIVE + audit)."
    status: pending
  - id: types-shared
    content: Agregar tipos compartidos de terminación/finiquito en `packages/types` y reutilizarlos en API/Web.
    status: pending
  - id: web-ui-finiquito-tab
    content: Añadir pestaña “Finiquito” en el dialog de empleado con formulario + resultado; `Accordion` para sección de liquidación; botón “Confirmar baja”.
    status: pending
  - id: web-actions-i18n
    content: Crear server actions para preview/terminate y añadir traducciones en `apps/web/messages/es.json`.
    status: pending
  - id: tests
    content: Añadir contract tests para preview/terminate y unit tests del motor de cálculo con escenarios del doc.
    status: pending
---

# Feature: cálculo y registro de finiquito por baja

## Documentación (reglas de terminación)

- **Reglas y fórmulas fuente de verdad**: [`documentacion/finiquito-docs.md`](documentacion/finiquito-docs.md) (LFT 2026: finiquito vs liquidación, matriz de decisión, inputs mínimos, fórmulas y salida auditable).

## Decisión de arquitectura (ruta)

- **Dónde vive**: en [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts) como sub-rutas por empleado, porque el cálculo depende de datos del empleado + settings de nómina + saldo de vacaciones y ya existe el patrón de “cómputos por empleado” con `GET /employees/:id/insights`.
- **Ruta separada (futuro)**: si luego necesitas listados/reportes org-wide de bajas/finiquitos, se puede agregar un `/terminations` o `/settlements`, pero para V1 no es necesario.

## Data model (DB + auditoría)

- **Agregar campos a `employee`** en [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts):
  - `terminationDateKey` (text, `YYYY-MM-DD`) 
  - `lastDayWorkedDateKey` (text, `YYYY-MM-DD`, default = terminationDateKey)
  - `terminationReason` (pgEnum con valores del doc)
  - `contractType` (pgEnum: `indefinite | fixed_term | specific_work`)
  - (opcional) `terminationNotes` (text nullable)
- **Nueva tabla** `employee_termination_settlement` (o nombre similar) para snapshot auditable:
  - `id`, `employeeId`, `organizationId`, `createdAt`
  - `calculation` (jsonb) con el output del doc (incluye `inputs_used` + `breakdown` + `totals`)
  - `totalsGross` (numeric) y opcionalmente `finiquitoTotalGross` / `liquidacionTotalGross` para consultas rápidas
- **Auditoría**: extender [`apps/api/src/services/employee-audit.ts`](apps/api/src/services/employee-audit.ts) para que `buildEmployeeAuditSnapshot` incluya los nuevos campos de terminación, y registrar un evento `action: 'terminated'` al ejecutar la baja.

## Motor de cálculo (API service)

- Crear un servicio dedicado, p.ej. [`apps/api/src/services/finiquito-calculation.ts`](apps/api/src/services/finiquito-calculation.ts), que:
  - Use **date keys** (`YYYY-MM-DD`) como entrada principal (evita bugs por zona horaria).
  - Reuse utilidades existentes:
    - Redondeo monetario: `roundCurrency` de [`apps/api/src/utils/money.ts`](apps/api/src/utils/money.ts)
    - Mínimo salarial por zona: `resolveMinimumWageDaily` de [`apps/api/src/utils/minimum-wage.ts`](apps/api/src/utils/minimum-wage.ts)
    - Salario integrado/SBC diario: `getSbcDaily` de [`apps/api/src/services/mexico-payroll-taxes.ts`](apps/api/src/services/mexico-payroll-taxes.ts)
    - Devengo de vacaciones: `calculateVacationAccrual` / `buildEmployeeVacationBalance` de [`apps/api/src/services/vacations.ts`](apps/api/src/services/vacations.ts) y [`apps/api/src/services/vacation-balance.ts`](apps/api/src/services/vacation-balance.ts)
  - Calcule **finiquito (siempre)**:
    - `salary_due` (salarios pendientes) a partir de `unpaid_days` (input)
    - `aguinaldo_prop` prorrateado por año calendario (365/366)
    - `vacation_pay` con **saldo en días que soporte decimales** (default: `(accruedDays - usedDays)` al corte de terminación; permitir override)
    - `vacation_premium` con `vacationPremiumRate` (settings)
    - `other_due` (input)
  - Calcule **conceptos de liquidación/indemnización** cuando correspondan, pero el UI decide si los muestra/colapsa:
    - `prima_antiguedad` (Art. 162 + tope 2× mínimo) según matriz
    - `indemnizacion_3_meses` (90 días LFT)
    - `indemnizacion_20_dias` (según `contractType`, usando el criterio del doc)
  - Devuelva siempre un JSON “auditable” tipo el de tu doc (incluyendo `inputs_used`).

## API: endpoints

En [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts):

- **Preview (no persiste)**: `POST /employees/:id/termination/preview`
  - Resuelve employee + location(zone) + payrollSetting(aguinaldoDays, vacationPremiumRate) y devuelve el cálculo.
- **Confirmar baja (persiste)**: `POST /employees/:id/termination`
  - Transacción:
    - recalcular en servidor (no confiar en totales del cliente)
    - insertar `employee_termination_settlement`
    - actualizar `employee.status = INACTIVE` + campos de terminación
    - insertar `employee_audit_event` (`terminated`)
  - Responder con el settlement guardado + campos clave del empleado.
- **(Opcional V1)**: `GET /employees/:id/termination` para recuperar la baja y el último settlement (útil para re-abrir el detalle).

Validación:

- Crear schemas zod en [`apps/api/src/schemas/termination.ts`](apps/api/src/schemas/termination.ts) (dateKey, enums, números >= 0, overrides opcionales).

## Web UI (Admin)

En `[apps/web/app/(dashboard)/employees/employees-client.tsx](apps/web/app/\\(dashboard)/employees/employees-client.tsx)`:

- Agregar una pestaña nueva **“Finiquito”** dentro del dialog de detalle del empleado.
- Formulario (inputs mínimos):
  - fecha de terminación (date key)
  - motivo (`terminationReason`)
  - tipo de contrato (`contractType`)
  - días no pagados (`unpaidDays`)
  - otros adeudos (`otherDue`)
  - overrides opcionales: `vacationBalanceDays`, `dailySalaryIndemnizacion`
- Botón **“Calcular”** (preview) y render de:
  - Cards con breakdown de **Finiquito**
  - `Accordion` para sección **“Liquidación / indemnización”** (colapsable) usando [`apps/web/components/ui/accordion.tsx`](apps/web/components/ui/accordion.tsx)
- Botón **“Confirmar baja”** con confirm dialog (`Dialog`) que llama al endpoint de persistencia.
- Actualizar `auditFieldLabels` para mostrar etiquetas en auditoría de los nuevos campos.

Acciones:

- Añadir server actions en [`apps/web/actions/employees.ts`](apps/web/actions/employees.ts):
  - `previewEmployeeTermination(...)`
  - `terminateEmployee(...)`

usando `createServerApiClient` de [`apps/web/lib/server-api.ts`](apps/web/lib/server-api.ts).

i18n:

- Agregar keys en [`apps/web/messages/es.json`](apps/web/messages/es.json) bajo `Employees.*` para labels, placeholders, mensajes de validación y el enum de motivos/tipo contrato.

## Shared types

En [`packages/types/src/index.ts`](packages/types/src/index.ts):

- Añadir tipos compartidos:
  - `TerminationReason`, `EmploymentContractType`
  - `EmployeeTerminationPreviewInput`
  - `EmployeeTerminationSettlement` (shape del JSON auditable)

## Tests

- Contract tests: extender [`apps/api/src/routes/employees.contract.test.ts`](apps/api/src/routes/employees.contract.test.ts):
  - preview devuelve estructura esperada
  - terminate marca INACTIVE + guarda campos + retorna settlement
  - segunda terminación para el mismo empleado → `409` (o `400`) para evitar doble-baja
- Unit tests del motor: nuevo [`apps/api/src/services/finiquito-calculation.test.ts`](apps/api/src/services/finiquito-calculation.test.ts) con escenarios base (renuncia, despido injustificado, antigüedad >=15).

## Diagrama (flujo)

```mermaid
sequenceDiagram
participant Web as Web_Admin
participant API as API_Elysia
participant DB as Postgres

Web->>API: POST /employees/:id/termination/preview
API->>DB: load employee + location + payrollSetting + vacations
DB-->>API: data
API-->>Web: calculation JSON (finiquito + liquidacion)

Web->>API: POST /employees/:id/termination
API->>DB: BEGIN
API->>DB: insert settlement (jsonb + totals)
API->>DB: update employee (INACTIVE + termination fields)
API->>DB: insert employee_audit_event (terminated)
DB-->>API: COMMIT
API-->>Web: persisted settlement + employee summary
```