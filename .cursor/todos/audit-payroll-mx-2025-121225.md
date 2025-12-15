# Auditoría de nómina (México / LFT) — salario mínimo 2025 (GENERAL vs ZLFN)

Fecha: 2025-12-12

Alcance: revisión de la lógica de nómina y validaciones relacionadas en `apps/api` y `apps/web` (sin cambios de código, solo hallazgos).

Nota: esto no es asesoría legal; es un análisis técnico contra las reglas proporcionadas.

Actualización: 2025-12-15 — se implementaron correcciones para los puntos (1)-(5), (7) y (9) (API + Web) y se ajustaron hallazgos que dependían de supuestos no presentes en la especificación actual del producto.

## Reglas base (según lo proporcionado)

### Salario mínimo 2025 (CONASAMI)

- GENERAL (resto del país): $278.80 MXN/día; mensual referencia = diario × 365 / 12.
- ZLFN: $419.88 MXN/día; mensual referencia = diario × 365 / 12.

### Fórmulas de pago

- Hora normal:
  - Diurna: salario diario / 8
  - Nocturna: salario diario / 7
  - Mixta: salario diario / 7.5
- Horas extra:
  - Máximo 3 h/día y máximo 9 h/semana (además: máximo 3 veces por semana).
  - Primeras 9 h extra de la semana: doble; excedente: triple.
- Prima dominical: 25% adicional sobre salario diario (especificación del producto/UI actual: aplica si se trabaja en domingo).
- Día de descanso obligatorio trabajado (calendario oficial): pago triple.
- Clasificación por horario:
  - Diurna: 06:00–20:00
  - Nocturna: 20:00–06:00
  - Mixta: combina ambas y < 3.5 h nocturnas; si ≥ 3.5 h nocturnas → se clasifica como nocturna.

## Implementación actual (dónde vive)

- Constantes LFT / CONASAMI:
  - `apps/api/src/utils/mexico-labor-constants.ts`
- Validación de horarios (plantillas / schedules) en API:
  - `apps/api/src/utils/schedule-validator.ts`
  - Consumida en `apps/api/src/routes/schedule-templates.ts` y `apps/api/src/routes/scheduling.ts`
- Cálculo de nómina en API:
  - `apps/api/src/routes/payroll.ts`
- Normalización dailyPay/hourlyPay en puestos (Job Positions):
  - `apps/api/src/routes/job-positions.ts`
- UI de nómina y settings (Web):
  - Periodos y frecuencia: `apps/web/app/(dashboard)/payroll/payroll-client.tsx`
  - Textos de reglas: `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx`
  - Warnings de horarios en web: `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx`

## Hallazgos / inconsistencias

### 1) (Crítico) Las reglas “semanales” se aplicaban al periodo completo (quincena/mes) — RESUELTO (2025-12-15)

En `apps/api/src/routes/payroll.ts` el cálculo de horas normales vs extra usaba un único límite semanal (`SHIFT_LIMITS.*.weeklyHours`) y un único umbral de 9h (`OVERTIME_LIMITS.MAX_WEEKLY_HOURS`) para TODO el rango `periodStart..periodEnd`, sin reinicio por semana.

Corrección aplicada:

- La nómina ahora segmenta las horas por semana dentro del periodo y aplica límites/severidades por cada semana (reinicia la regla “primeras 9h dobles / excedente triple” por semana).

Impacto:

- Se eliminan falsos positivos/negativos en BIWEEKLY/MONTHLY y se evita reclasificar horas normales de semanas distintas como “overtime” en bloque.

Ejemplo (DIURNA, 8h/día L–S, 2 semanas, sin horas extra reales):

- Semana 1: 48h normales.
- Semana 2: 48h normales.
- Esperado legal: 96h normales, 0h extra.
- Antes: `normalHours` sumaba 96h y se aplicaba `weeklyHours=48` una sola vez → 48h pasaban a “overtime”.
- Ahora: el límite semanal se aplica por cada semana → 0h extra.

### 2) (Alta) `weekStartDay` existía, pero no afectaba el cálculo legal de semanas (overtime) — RESUELTO (2025-12-15)

El setting `weekStartDay` se guarda y la web lo usa para “periodos”, pero el backend no lo usaba para cortar semanas al calcular horas extra.

Corrección aplicada:

- La nómina ahora usa `payrollSetting.weekStartDay` para definir el corte de semana al calcular límites semanales y la regla de 9h doble/triple.

Impacto:

- Ahora existe una fuente de verdad para “qué es una semana” (`weekStartDay`) en el cálculo de horas extra, alineando backend con la UI.

### 3) (Alta) Validadores (API y Web) no validaban la regla semanal de 9h de horas extra “totales” — RESUELTO (2025-12-15)

La validación de “overtime semanal” en API estaba calculada como `weeklyHours - weeklyLimit`, lo cual NO representa “horas extra totales” (horas arriba del límite diario).

Corrección aplicada:

- API: el overtime semanal ahora se calcula como suma de (horas - límite diario) por día.
- Web: se agregó validación de overtime semanal total (>9h) para alinear “schedule compliance” vs “payroll warnings”.

- Evidencia:
  - API: `apps/api/src/utils/schedule-validator.ts`
  - Web: `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx`

Impacto:

- Antes: un schedule podía pasar validación aunque tuviera >9h extra/semana, siempre que el total semanal no excediera el límite semanal.
- Antes: esto desincronizaba “schedule compliance” vs “payroll warnings”.

Ejemplo (DIURNA):

- 11h/día por 4 días → 44h/semana (<=48), pero horas extra = (11-8)×4 = 12h (>9).
- Antes: API/Web no marcaban overtime semanal (porque se tomaba `weeklyHours - weeklyLimit`).
- Ahora: API/Web marcan overtime semanal excedido (12h > 9h).

### 4) (Alta) Cálculo de “hora normal” podía ignorar divisor por tipo de jornada (7 / 7.5 / 8) — RESUELTO (2025-12-15)

En `job-positions` se deriva `dailyPay` ↔ `hourlyPay` siempre con divisor 8 (diurna), y luego nómina suele preferir `hourlyPay` cuando existe.

Corrección aplicada:

- La nómina ahora deriva `hourlyRate` a partir de `dailyPay / divisor(shiftType)` cuando existe `dailyPay`, evitando depender de `jobPosition.hourlyPay` (que puede estar normalizado con 8h).

- Evidencia:
  - Derivación fija con 8h al crear: `apps/api/src/routes/job-positions.ts:213`
  - Derivación fija con 8h al actualizar: `apps/api/src/routes/job-positions.ts:325`
  - Nómina (antes) usaba `hourlyPay` si existía (antes de dividir por divisor de jornada): `apps/api/src/routes/payroll.ts`

Impacto:

- Antes: para empleados NOCTURNA/MIXTA, si el salario base capturado es “salario diario”, el “salario por hora normal” debería ser diario/7 o diario/7.5.
- Antes: al capturar solo dailyPay se generaba hourlyPay = dailyPay/8 y nómina podía terminar pagando con hourlyPay, potencialmente subpagando.
- Ahora: la nómina usa el divisor por `shiftType` para calcular la hora normal cuando existe `dailyPay`.

### 5) (Media) Faltaba la regla “máximo 3 veces por semana” (frecuencia de horas extra) — RESUELTO (2025-12-15)

Se valida “máx 3h/día” y “máx 9h/semana”, pero no se cuenta cuántos días de la semana tuvieron overtime.

Corrección aplicada:

- Nómina: se agregó conteo de “días con horas extra” por semana y warning cuando excede 3.
- Validación de schedules (API + Web): se agregó conteo equivalente para alinear el feedback en plantillas.

- Evidencia:
  - En settings se comunica la regla: `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx:114`
  - No hay conteo de “días con overtime” en nómina: `apps/api/src/routes/payroll.ts` (solo suma horas)
  - No hay conteo en validación de schedules: `apps/api/src/utils/schedule-validator.ts`

Impacto:

- Antes: casos como 1h extra durante 4 días (4h total) no se detectaban, pero violan “3 veces por semana”.
- Ahora: se detectan y se emite warning por exceder 3 días/semana con horas extra.

### 6) (Baja / Especificación) Prima dominical (+25%) aplicada si se trabaja en domingo — POR DISEÑO

La implementación actual paga prima dominical si hubo horas trabajadas en domingo. Esto coincide con la regla comunicada en la UI actual (sin condicionar explícitamente el “día de descanso”).

- Evidencia:
  - Corte por día local usando `location.timeZone`: `apps/api/src/routes/payroll.ts`
  - Utilidades de timezone/date-keys: `apps/api/src/utils/time-zone.ts`, `apps/api/src/utils/date-key.ts`
  - Cálculo prima dominical por “domingo trabajado” (por día local): `apps/api/src/routes/payroll.ts`

Impacto:

- Si en el futuro se requiere distinguir “domingo como descanso” vs “domingo como día laboral habitual”, habría que modelar explícitamente descansos y/o reglas más finas (fuera del alcance actual).

### 7) (Media) No existe pago triple para “días de descanso obligatorio” trabajados — RESUELTO (2025-12-15)

Se agregó un calendario de “días de descanso obligatorio” (LFT Art. 74) y un ajuste de pago cuando se trabajan.

Corrección aplicada:

- API:
  - Se implementó el calendario de descanso obligatorio (Art. 74 fr. I–VIII) por año:
    - 1 de enero, 1 de mayo, 16 de septiembre, 25 de diciembre
    - primer lunes de febrero
    - tercer lunes de marzo
    - tercer lunes de noviembre
    - transmisión del Ejecutivo: 1 de octubre cada seis años (desde 2024; legacy 1 de diciembre)
  - Se agregó configuración por organización para días variables (Art. 74 fr. IX “jornada electoral” y otros):
    - `payrollSetting.additionalMandatoryRestDays: string[]` (YYYY-MM-DD)
  - En la nómina se cuenta cada día de descanso obligatorio trabajado (si hubo horas > 0 ese día local) y se suma el premio:
    - `mandatoryRestDayPremiumAmount = díasTrabajados × (2 × salarioDiario)`
    - Al sumarse al pago normal del día, produce “pago triple” para un día completo (y permite prima dominical adicional si cae en domingo).

- Web:
  - Se expuso `additionalMandatoryRestDays` en Payroll Settings (textarea “YYYY-MM-DD, uno por línea”).
  - Se muestra el monto de “Descanso obligatorio” en el preview de nómina.

Evidencia:
  - Calendario: `apps/api/src/utils/mexico-mandatory-rest-days.ts`
  - Configuración: `apps/api/src/routes/payroll-settings.ts`, `apps/api/src/db/schema.ts`
  - Cálculo/preview: `apps/api/src/routes/payroll.ts`, `apps/web/app/(dashboard)/payroll/payroll-client.tsx`
  - Settings UI: `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx`

Impacto:

- Se cubre el caso “descanso obligatorio trabajado = pago triple” con calendario legal base + días variables configurables.

### 8) (Media) Clasificación DIURNA/NOCTURNA/MIXTA no se valida contra el horario real

El sistema depende de un `shiftType` seleccionado, pero no valida contra los rangos 06:00–20:00 / 20:00–06:00 ni la regla de 3.5h nocturnas para MIXTA.

- Evidencia:
  - Validador API solo usa `shiftType` para límites de horas, sin analizar “horas nocturnas”: `apps/api/src/utils/schedule-validator.ts:66`
  - Default MIXTA en Web cruza >3.5h nocturnas (20:00–01:30 = 5.5h): `apps/web/app/(dashboard)/schedules/components/template-form-dialog.tsx:59`

Impacto:

- Schedules pueden quedar “MIXTA” aunque legalmente correspondan a NOCTURNA, afectando límites diarios/semanales y divisor hora normal.

### 9) (Media) Cálculos “por día” y “domingo” basados en UTC (riesgo de desfase México) — RESUELTO (2025-12-15)

La nómina agrupaba y evaluaba “día calendario” con cortes por UTC, lo que podía desfasar domingos/horas extra/feriados cerca de medianoche para ubicaciones en México.

Corrección aplicada:

- Se agregó `location.timeZone` (IANA) y se usa en nómina para:
  - cortar por medianoche local (split de check-in/out a través de días),
  - asignar horas al “día local” correcto,
  - evaluar domingo y feriados con base en el día local.

Evidencia:
  - Campo y migración: `apps/api/src/db/schema.ts`, `apps/api/drizzle/0015_young_marauders.sql`
  - Utilidades: `apps/api/src/utils/time-zone.ts`
  - Agrupación por día local en nómina: `apps/api/src/routes/payroll.ts`
  - UI de Locations con timezone: `apps/web/app/(dashboard)/locations/locations-client.tsx`

Impacto:

- Se elimina el riesgo de asignación al día incorrecto cerca de medianoche en México, reduciendo errores en:
  - horas extra diarias,
  - prima dominical,
  - descanso obligatorio trabajado (feriados).

### 10) (Baja/Política) Salario mínimo solo se advierte; no bloquea ni se valida al capturar sueldos

La nómina agrega un warning si el salario diario efectivo cae debajo del mínimo por zona, pero no bloquea procesamiento. Tampoco se valida en creación/edición de job positions.

- Evidencia:
  - Warning en nómina: `apps/api/src/routes/payroll.ts`
  - Sin validación en job-positions: `apps/api/src/routes/job-positions.ts` (no usa `MINIMUM_WAGES`)

Impacto:

- Dependiendo del objetivo del producto (compliance vs “solo cálculo”), puede ser insuficiente.

## Recomendaciones (prioridad técnica)

1) Corregir nómina para segmentar por semanas dentro de `periodStart..periodEnd` y aplicar (RESUELTO 2025-12-15):
   - límites diarios + límites de overtime (3h/día),
   - “primeras 9h dobles / excedente triple” por cada semana,
   - corte de semana usando `weekStartDay`.

2) Unificar la fuente de verdad para cálculos legales (PARCIAL 2025-12-15):
   - Definir si el salario base es “diario” o “horario”.
   - Si es diario: derivar hourlyRate siempre con divisor de `shiftType` (7/7.5/8) y evitar depender de `jobPosition.hourlyPay` derivado con 8h.

3) Arreglar validadores (API y Web) para (RESUELTO 2025-12-15):
   - calcular horas extra semanales como suma de (horas - límite diario) por día,
   - contar “días con horas extra” (máx. 3 por semana),
   - opcional: validar MIXTA vs NOCTURNA con la regla ≥3.5h nocturnas.

4) Definir y modelar “días de descanso obligatorio” (feriados) y aplicar pago triple al trabajar (RESUELTO 2025-12-15):
   - Art. 74 fr. I–VIII: calendario anual base en backend
   - Art. 74 fr. IX: lista configurable por organización (`additionalMandatoryRestDays`)

5) Corregir timezone/day-boundaries (RESUELTO 2025-12-15):
   - se modela `location.timeZone` y se calcula el “día local” con esa zona horaria (para domingo/feriados)
