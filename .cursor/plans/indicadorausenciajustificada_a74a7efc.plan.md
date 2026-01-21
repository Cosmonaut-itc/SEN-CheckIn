---
name: IndicadorAusenciaJustificada
overview: Mostrar en Web un indicador claro para días con excepción DAY_OFF (aprobada) como “ausencia justificada sin goce”, sin contarlos como ausencia injustificada, tanto en el calendario de Horarios como en Detalles del empleado.
todos:
  - id: api-calendar-reason
    content: Agregar `reason` a CalendarDay cuando source=exception en `apps/api/src/routes/scheduling.ts` + actualizar `apps/api/src/routes/scheduling.contract.test.ts`.
    status: pending
  - id: web-calendar-types
    content: "Extender `CalendarDay` en `apps/web/lib/client-functions.ts` para incluir `reason?: string | null`."
    status: pending
  - id: web-schedules-indicator
    content: Renderizar excepciones DAY_OFF como “ausencia justificada (sin goce)” en `LocationScheduleCard` (week+month, con tooltip si hay reason).
    status: pending
  - id: web-employee-indicator
    content: Ajustar Detalle de empleado (`employees-client.tsx`) para mostrar `leaves.items` como “Ausencias justificadas (sin goce)” y mantener `absentDateKeys` como ausencias.
    status: pending
  - id: i18n-es
    content: Actualizar llaves en `apps/web/messages/es.json` para los nuevos labels (Schedules + Employees).
    status: pending
---

# Indicador visual: ausencia justificada (sin goce)

## Objetivo

- Tratar una excepción de horario **`DAY_OFF`** como **ausencia justificada sin goce** a nivel **visual** (y evitar que se confunda con “ausencia injustificada”) en:
- `[apps/web/app/(dashboard)/schedules/components/location-schedule-card.tsx](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/app/\\(dashboard)/schedules/components/location-schedule-card.tsx)` (calendario de Horarios)
- `[apps/web/app/(dashboard)/employees/employees-client.tsx](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/app/\\(dashboard)/employees/employees-client.tsx)` (Detalle de empleado → Asistencia)

## Estado actual (referencia)

- En insights, los `DAY_OFF` ya se exponen como **`leaves`** (pasado) y no deberían contarse como `absentDateKeys`:
- [`apps/api/src/routes/employees.ts`](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api/src/routes/employees.ts)
- `calculateEmployeeAbsences()` usa excepciones para decidir si un día cuenta como working-day antes de agregarlo a `absentDateKeys`.
- `leaves` se carga con `exceptionType: 'DAY_OFF'`.
- En calendario de Horarios, la API ya marca días con excepción (`source: 'exception'` + `exceptionType`), pero en UI los `DAY_OFF` no se muestran porque no tienen horas (`isWorkingDay=false`, `startTime/endTime=null`).

## Cambios propuestos

### 1) API: incluir `reason` de la excepción en el calendario

- Actualizar el payload de `/scheduling/calendar` para que cuando `source === 'exception'` incluya también `reason` (para tooltip/etiqueta).
- Archivo: [`apps/api/src/routes/scheduling.ts`](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api/src/routes/scheduling.ts)
- Impacto: Web podrá mostrar el motivo sin hacer un request extra.
- Ajustar test(s) de contrato:
- [`apps/api/src/routes/scheduling.contract.test.ts`](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api/src/routes/scheduling.contract.test.ts)

### 2) Web types: extender `CalendarDay`

- Extender `CalendarDay` para soportar `reason?: string | null`.
- Archivo: [`apps/web/lib/client-functions.ts`](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/lib/client-functions.ts)

### 3) Web UI: mostrar `DAY_OFF` como “ausencia justificada (sin goce)” en Horarios

- En `[apps/web/app/(dashboard)/schedules/components/location-schedule-card.tsx](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/app/\\(dashboard)/schedules/components/location-schedule-card.tsx)`:
- Derivar un `Map<dateKey, JustifiedAbsenceEntry[]>` a partir de `calendarEmployeesInLocation.days` filtrando:
- `day.source === 'exception' && day.exceptionType === 'DAY_OFF'`
- Renderizar esos entries:
- **Vista semana**: sección/lista debajo del bloque de “esperados” del día, con badge/estilo distinto.
- **Vista mes**: mostrar un contador/indicador en la celda (p. ej. “Justificada: N”) y listar detalle en tooltip.
- Usar `reason` (si existe) en tooltip.

### 4) Web UI: renombrar/etiquetar “Permisos” como ausencias justificadas (sin goce)

- En `[apps/web/app/(dashboard)/employees/employees-client.tsx](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/app/\\(dashboard)/employees/employees-client.tsx)`:
- Mantener `attendance.absentDateKeys` como **ausencias (injustificadas)**.
- Mostrar `leaves.items` como **ausencias justificadas (sin goce)** (con motivo si existe), de forma explícita.
- En resumen y pestaña Asistencia, ajustar copy/labels para que el usuario entienda la diferencia.

### 5) i18n (ES): nuevos labels

- Actualizar/añadir llaves en [`apps/web/messages/es.json`](/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web/messages/es.json):
- `Schedules.calendar.locationCard.badges.exceptionType.DAY_OFF` (o nueva llave) → “Ausencia justificada (sin goce)”
- `Employees.summary.leaves`, `Employees.attendance.leavesTitle`, `Employees.attendance.emptyLeaves` → textos alineados a “ausencia justificada (sin goce)”

## Verificación

- Flujo manual:
- Crear una excepción `DAY_OFF` para un empleado en Schedules → Excepciones.
- Confirmar que:
- En Schedules → Calendario aparece el indicador en el día correspondiente.
- En Detalles del empleado → Asistencia aparece en “Ausencias justificadas (sin goce)” (y no en “Ausencias”).
- Calidad:
- `bun run lint:web`
- `bun run check-types:web`