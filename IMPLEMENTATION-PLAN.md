# Plan de Implementación — Pendientes Post-Junta (Abril 2026)

Estos son los 5 puntos que faltan por implementar, cada uno con su spec y plan detallado.

---

## PUNTO 1: Auditoría de vacaciones registradas

### Contexto
Se necesita revisar las vacaciones registradas y la forma en que se toman en el sistema. No es un bug de código sino una tarea de verificación de datos para detectar inconsistencias.

### Spec
- Crear un endpoint de auditoría `GET /vacations/audit` (admin-only) que reporte:
  - Empleados cuyo balance de vacaciones difiere de lo esperado (días entitled - used != available)
  - Días de vacación sin `serviceYearNumber` asignado (datos legacy)
  - Solicitudes con días mal clasificados (ej. `countsAsVacationDay = true` en un `MANDATORY_REST_DAY`)
  - Empleados con más días usados que los que les corresponden por año de servicio
  - Solicitudes con overlap no detectado
- Opcionalmente, agregar un botón en el dashboard de vacaciones para que el admin ejecute esta auditoría

### Plan de Implementación

**Paso 1: Crear servicio de auditoría**
- Archivo: `apps/api/src/services/vacation-audit.ts` (nuevo)
- Función `auditVacationData(organizationId)` que:
  1. Obtenga todos los empleados activos con sus `hireDate`
  2. Para cada empleado, calcule el balance esperado vs el almacenado
  3. Busque `vacation_request_day` con `serviceYearNumber IS NULL`
  4. Busque días donde `countsAsVacationDay = true` pero `dayType` es `MANDATORY_REST_DAY` o `SCHEDULED_REST_DAY`
  5. Retorne un array de `AuditIssue[]`

**Paso 2: Crear endpoint**
- Archivo: `apps/api/src/routes/vacations.ts`
- `GET /vacations/audit` — admin-only, llama al servicio y retorna issues

**Paso 3: (Opcional) UI en frontend**
- Agregar botón "Auditar vacaciones" en la vista admin de vacaciones
- Mostrar tabla con issues encontrados

### Criterio de aceptación
- [ ] El endpoint retorna una lista de inconsistencias detectadas
- [ ] Se pueden identificar empleados con datos legacy sin serviceYearNumber
- [ ] Se detectan clasificaciones incorrectas de días

---

## PUNTO 2: Sábado no se cuenta como día pagado durante vacaciones

### Contexto
Cuando un empleado toma vacaciones del 6-11 de abril (lun-sáb) y la opción `countSaturdayAsWorkedForSeventhDay` está activada, el sábado NO se cuenta como día trabajado para el cálculo del séptimo día, y el empleado pierde ese pago.

### Root Cause
En `apps/api/src/services/payroll-calculation.ts:1340-1344`, `workedDayKeys` se construye **exclusivamente** desde `calendarDayMinutes` (registros de asistencia). Los días de vacaciones aprobadas nunca se agregan a este set. Por lo tanto, `calculateSeventhDayPay()` en línea 573 no ve el sábado como "trabajado" y retorna `0`.

### Spec
- Los días de vacaciones aprobadas donde `countsAsVacationDay = true` deben contar como "días trabajados" para el cálculo del séptimo día
- Esto incluye tanto días entre semana como sábados durante vacaciones
- El comportamiento debe respetar la configuración `countSaturdayAsWorkedForSeventhDay`

### Plan de Implementación

**Paso 1: Agregar `vacationDayDateKeys` a la interfaz de cálculo**
- Archivo: `apps/api/src/services/payroll-calculation.ts`
- Agregar campo `vacationDayDateKeys?: Record<string, string[]>` a `CalculatePayrollFromDataArgs` (línea 218)
- Este record mapea `employeeId -> dateKey[]` de días de vacación aprobados en el periodo

**Paso 2: Pasar los dateKeys desde el route**
- Archivo: `apps/api/src/routes/payroll.ts`
- En la query de vacaciones (línea 323-346), además de contar los días, recolectar los `dateKey` individuales:
  ```typescript
  // Agregar dateKey al select
  .select({
      employeeId: vacationRequestDay.employeeId,
      dateKey: vacationRequestDay.dateKey,  // NUEVO
  })
  ```
- Construir `vacationDayDateKeys: Record<string, string[]>` agrupando por employeeId
- Pasar ambos (`vacationDayCounts` y `vacationDayDateKeys`) a `calculatePayrollFromData()`

**Paso 3: Agregar vacation days al set `workedDayKeys`**
- Archivo: `apps/api/src/services/payroll-calculation.ts`
- Después de construir `workedDayKeys` (línea 1340-1344), agregar:
  ```typescript
  // Agregar días de vacaciones aprobadas como "días trabajados"
  const employeeVacationDateKeys = args.vacationDayDateKeys?.[emp.id] ?? [];
  for (const vKey of employeeVacationDateKeys) {
      workedDayKeys.add(vKey);
  }
  ```

**Paso 4: Tests**
- Agregar test en `payroll-calculation.test.ts`:
  - Empleado con vacaciones lun-sáb + `countSaturdayAsWorkedForSeventhDay = true` → séptimo día pagado
  - Empleado con vacaciones lun-vie (sin sábado) → séptimo día depende de asistencia sábado
  - Empleado sin vacaciones → comportamiento sin cambios

### Archivos a modificar
1. `apps/api/src/services/payroll-calculation.ts` — líneas 197-219 (interfaz), 1340-1344 (workedDayKeys)
2. `apps/api/src/routes/payroll.ts` — líneas 323-346 (query de vacaciones)
3. `apps/api/src/services/payroll-calculation.test.ts` — tests nuevos

### Criterio de aceptación
- [ ] Empleado con vacaciones lun-sáb recibe séptimo día cuando `countSaturdayAsWorkedForSeventhDay = true`
- [ ] Tests unitarios pasan
- [ ] No hay regresión en cálculo de séptimo día para empleados sin vacaciones

---

## PUNTO 3: Salario real aparece como percepciones gravadas (debe ser fiscal)

### Contexto
En la nómina con dual payroll, las "percepciones gravadas" muestran el salario real en lugar del salario fiscal. Esto afecta recibos PDF, UI y reportes.

### Root Cause
En `apps/api/src/services/payroll-calculation.ts:1397`:
```typescript
const grossPay = totalRealPay;  // BUG: siempre usa totalRealPay
```
Cuando dual payroll está activo, `totalRealPay = fiscalGrossPay + complementPay`. Este valor se almacena en `taxBreakdown.grossPay` y se muestra como "percepciones gravadas" en recibos y UI.

### Spec
- `grossPay` (percepciones gravadas) debe ser `fiscalGrossPay` cuando dual payroll está activo
- `grossPay` debe ser `totalRealPay` cuando dual payroll NO está activo (comportamiento actual correcto)
- Los recibos PDF, la UI de nómina y los CSV deben mostrar el valor correcto

### Plan de Implementación

**Paso 1: Corregir asignación de `grossPay`**
- Archivo: `apps/api/src/services/payroll-calculation.ts`
- Línea 1397, cambiar:
  ```typescript
  // ANTES:
  const grossPay = totalRealPay;

  // DESPUÉS:
  const grossPay = dualPayrollApplied ? fiscalGrossPay : totalRealPay;
  ```

**Paso 2: Verificar propagación**
- Verificar que `taxBreakdown.grossPay` (usado en recibos PDF `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts:307`) ahora muestra el valor fiscal
- Verificar que la UI en `apps/web/app/(dashboard)/payroll/payroll-client.tsx:1344` usa `fiscalGrossPay` y no `grossPay`
- Verificar el helper CSV `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts:52` — el fallback a `grossPay` ahora también es correcto

**Paso 3: Tests**
- Agregar/actualizar test en `payroll-calculation.test.ts`:
  - Dual payroll activo: `grossPay === fiscalGrossPay` (NO `totalRealPay`)
  - Dual payroll inactivo: `grossPay === totalRealPay === fiscalGrossPay` (sin cambio)

**Paso 4: Considerar migración de datos**
- Si hay nóminas ya procesadas con el valor incorrecto, evaluar si es necesario:
  - Crear script de corrección para `payroll_run_employee` existentes
  - O documentar que solo aplica a nóminas futuras

### Archivos a modificar
1. `apps/api/src/services/payroll-calculation.ts` — línea 1397
2. `apps/api/src/services/payroll-calculation.test.ts` — tests actualizados

### Criterio de aceptación
- [ ] Con dual payroll activo, `grossPay` (percepciones gravadas) = `fiscalGrossPay`
- [ ] Sin dual payroll, comportamiento no cambia
- [ ] Recibos PDF muestran el salario fiscal como gravable
- [ ] Tests unitarios pasan

---

## PUNTO 4: Empleados sin todos sus días de vacaciones disponibles

### Contexto
Muchos empleados no tienen todos sus días de vacaciones disponibles. El sistema solo calcula el balance del año de servicio actual, sin considerar días no usados de años anteriores.

### Root Cause
En `apps/api/src/services/vacation-balance.ts:104-105`:
```typescript
const usedDays = approvedDays.get(currentServiceYear) ?? 0;
const pending = pendingDays.get(currentServiceYear) ?? 0;
```
Solo se consulta el año de servicio actual. Días no usados de años anteriores no se acumulan.

### Spec
- El balance de vacaciones debe incluir días no usados de años de servicio anteriores (carryover)
- Para cada año de servicio completado, calcular: `entitled - used = carryover`
- Los días de carryover se suman al balance disponible del año actual
- La UI debe mostrar un desglose: días del año actual + días acumulados de años anteriores
- El cálculo de carryover debe recorrer desde el año de servicio 1 hasta el actual

### Plan de Implementación

**Paso 1: Modificar `buildEmployeeVacationBalance()` para incluir carryover**
- Archivo: `apps/api/src/services/vacation-balance.ts`
- La función ya tiene acceso a `approvedDays` (Map de serviceYear -> usedDays)
- Agregar lógica:
  ```typescript
  let carryoverDays = 0;
  for (let year = 1; year < currentServiceYear; year++) {
      const yearAccrual = calculateVacationAccrual({
          hireDate: args.hireDate,
          serviceYearNumber: year,
          asOfDateKey, // usar el end del año de servicio como cutoff
      });
      const yearEntitled = yearAccrual.entitledDays; // año completo = todos los días
      const yearUsed = approvedDays.get(year) ?? 0;
      carryoverDays += Math.max(0, yearEntitled - yearUsed);
  }
  ```
- Sumar `carryoverDays` al cálculo de `availableDays`

**Paso 2: Actualizar el tipo `EmployeeVacationBalance`**
- Archivo: `packages/api-contract/src/types/vacations.ts` (o donde esté definido `EmployeeVacationBalance`)
- Agregar campo `carryoverDays: number`

**Paso 3: Actualizar la UI de balance de vacaciones**
- Archivos en: `apps/web/app/(dashboard)/vacations/`
- Mostrar desglose: "Días año actual: X | Acumulados: Y | Total disponible: Z"

**Paso 4: Actualizar validación de solicitudes**
- Archivo: `apps/api/src/routes/vacations.ts`
- La validación de balance al crear solicitudes debe considerar el carryover

**Paso 5: Tests**
- Test: empleado en año 3 con 5 días no usados de año 1 y 3 de año 2 → carryover = 8
- Test: empleado en año 1 → carryover = 0
- Test: empleado que usó todos sus días → carryover = 0

### Archivos a modificar
1. `apps/api/src/services/vacation-balance.ts` — lógica de carryover
2. `packages/api-contract/` o donde esté `EmployeeVacationBalance` — tipo actualizado
3. `apps/web/app/(dashboard)/vacations/` — UI de balance
4. `apps/api/src/routes/vacations.ts` — validación de balance
5. `apps/api/src/services/vacation-balance.test.ts` — tests nuevos

### Criterio de aceptación
- [ ] Balance incluye días no usados de años de servicio anteriores
- [ ] UI muestra desglose de carryover
- [ ] Validación de solicitudes considera carryover
- [ ] Tests unitarios pasan
- [ ] Empleados que antes no tenían días ahora ven sus días acumulados

---

## PUNTO 5: Formato de descarga del checador por persona con totales

### Contexto
El CSV actual del checador exporta un registro plano por evento (CHECK_IN, CHECK_OUT) sin agrupación ni cálculos. El usuario tiene que hacer cálculos manuales para determinar horas trabajadas.

### Estado actual
- Archivo: `apps/web/app/(dashboard)/attendance/attendance-client.tsx:1033-1086`
- Columnas actuales: Empleado, ID, Dispositivo, Ubicación, Tipo, Clasificación RH, Motivo, Hora, Fecha
- Sin agrupación por persona
- Sin cálculo de horas totales
- Sin pareamiento de CHECK_IN/CHECK_OUT

### Spec
- El CSV debe agruparse por empleado
- Para cada empleado, mostrar una tabla por día con:
  - Fecha
  - Hora de entrada (primer CHECK_IN del día)
  - Hora de salida (último CHECK_OUT del día)
  - Horas totales del día (diferencia entre entrada y salida, descontando breaks)
- Al final de cada empleado, una fila de resumen con:
  - Total de horas del periodo
  - Total de días trabajados
- Formato del CSV:
  ```
  Empleado: Juan Pérez (EMP-001)
  Fecha, Entrada, Salida, Horas Totales
  06/04/2026, 08:00, 17:30, 9.5
  07/04/2026, 08:15, 17:45, 9.5
  Total: 19.0 horas, 2 días
  
  Empleado: María López (EMP-002)
  ...
  ```

### Plan de Implementación

**Paso 1: Crear nueva API endpoint (o modificar el existente)**
- Opción A: Nuevo endpoint `GET /attendance/export` que retorna datos ya agrupados y calculados
- Opción B: Hacer el procesamiento en el cliente (más simple, datos ya disponibles)
- **Recomendación: Opción B** — el cliente ya fetchea todos los registros, solo falta procesarlos

**Paso 2: Crear función de procesamiento en el cliente**
- Archivo: `apps/web/app/(dashboard)/attendance/attendance-client.tsx` (o extraer a helper)
- Nueva función `buildPersonBasedCsvData(records)`:
  1. Agrupar registros por `employeeId`
  2. Dentro de cada empleado, agrupar por fecha (usando timezone de la org)
  3. Para cada día, parear CHECK_IN → CHECK_OUT y calcular duración
  4. Calcular totales por día y por empleado

**Paso 3: Crear función de pairing de registros**
- Reutilizar la lógica de `payroll-calculation.ts` (líneas 920-1000) adaptada al cliente
- O crear utility compartida en `packages/` si se prefiere
- Manejar edge cases: CHECK_IN sin CHECK_OUT, múltiples sesiones por día, breaks

**Paso 4: Generar CSV con nuevo formato**
- Modificar `handleExportCsv()` para usar el nuevo formato
- Usar separador de sección por empleado
- Incluir fila de totales por empleado

**Paso 5: Actualizar traducciones**
- Archivo: `apps/web/messages/es.json`
- Agregar keys para nuevas columnas: "Entrada", "Salida", "Horas Totales", "Total"

### Archivos a modificar
1. `apps/web/app/(dashboard)/attendance/attendance-client.tsx` — export logic
2. `apps/web/messages/es.json` — traducciones nuevas
3. Opcionalmente `apps/web/messages/en.json` — traducciones en inglés

### Criterio de aceptación
- [ ] CSV agrupado por empleado
- [ ] Cada día muestra entrada, salida y horas totales
- [ ] Fila de resumen por empleado con total de horas y días
- [ ] Handles edge cases: sin salida, múltiples sesiones, breaks
- [ ] No requiere cálculos manuales del usuario

---

## Orden de Implementación Recomendado

1. **Punto 3** (grossPay bug) — Fix de 1 línea, alto impacto, sin riesgo
2. **Punto 2** (sábado en vacaciones) — Fix quirúrgico, afecta nómina actual
3. **Punto 4** (vacation carryover) — Cambio más complejo, afecta balance de todos
4. **Punto 1** (auditoría) — Útil como herramienta post-fix para verificar datos
5. **Punto 5** (formato checador) — Feature nueva, independiente de los bugs
