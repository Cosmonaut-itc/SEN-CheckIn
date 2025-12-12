# Auditoría de nómina (México / LFT) — salario mínimo 2025 (GENERAL vs ZLFN)

Fecha: 2025-12-12

Alcance: revisión de la lógica de nómina y validaciones relacionadas en `apps/api` y `apps/web` (sin cambios de código, solo hallazgos).

Nota: esto no es asesoría legal; es un análisis técnico contra las reglas proporcionadas.

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
- Prima dominical: 25% adicional sobre salario diario (según tabla: aplica si se trabaja en domingo y el descanso es otro día).
- Día de descanso obligatorio trabajado (calendario oficial): pago triple.
- Clasificación por horario:
  - Diurna: 06:00–20:00
  - Nocturna: 20:00–06:00
  - Mixta: combina ambas y < 3.5 h nocturnas; si ≥ 3.5 h nocturnas → se clasifica como nocturna.

## Implementación actual (dónde vive)

- Constantes LFT / CONASAMI:
  - `apps/api/src/utils/mexico-labor-constants.ts:4`
- Validación de horarios (plantillas / schedules) en API:
  - `apps/api/src/utils/schedule-validator.ts:56`
  - Consumida en `apps/api/src/routes/schedule-templates.ts:149` y `apps/api/src/routes/scheduling.ts:408`
- Cálculo de nómina en API:
  - `apps/api/src/routes/payroll.ts:182`
- Normalización dailyPay/hourlyPay en puestos (Job Positions):
  - `apps/api/src/routes/job-positions.ts:213`
- UI de nómina y settings (Web):
  - Periodos y frecuencia: `apps/web/app/(dashboard)/payroll/payroll-client.tsx:46`
  - Textos de reglas: `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx:114`
  - Warnings de horarios en web: `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx:72`

## Hallazgos / inconsistencias

### 1) (Crítico) Las reglas “semanales” se aplican al periodo completo (quincena/mes)

En `apps/api/src/routes/payroll.ts` el cálculo de horas normales vs extra usa un único límite semanal (`SHIFT_LIMITS.*.weeklyHours`) y un único umbral de 9h (`OVERTIME_LIMITS.MAX_WEEKLY_HOURS`) para TODO el rango `periodStart..periodEnd`.

- Evidencia:
  - Cálculo de overtime con límites “semanales” sin segmentar por semana: `apps/api/src/routes/payroll.ts:315`
  - Asignación doble/triple basada en 9h para todo el periodo: `apps/api/src/routes/payroll.ts:327`
  - La UI permite BIWEEKLY/MONTHLY y calcula periodos: `apps/web/app/(dashboard)/payroll/payroll-client.tsx:53`

Impacto:

- Para BIWEEKLY (14 días) y MONTHLY, empleados con jornadas normales pueden ser tratados como si tuvieran “exceso semanal” masivo (y por ende horas extra), generando pagos incorrectos y warnings falsos.
- Además, la regla “primeras 9h dobles” se aplica solo una vez por periodo en lugar de reiniciarse cada semana.

Ejemplo (DIURNA, 8h/día L–S, 2 semanas, sin horas extra reales):

- Semana 1: 48h normales.
- Semana 2: 48h normales.
- Esperado legal: 96h normales, 0h extra.
- Actual (aprox.): `normalHours` suma 96h, luego se aplica `weeklyHours=48` una sola vez → 48h pasan a “overtime” (`apps/api/src/routes/payroll.ts:315`).

### 2) (Alta) `weekStartDay` existe, pero no afecta el cálculo legal de semanas (overtime)

El setting `weekStartDay` se guarda y la web lo usa para “periodos”, pero el backend no lo usa para cortar semanas al calcular horas extra.

- Evidencia:
  - Setting en API: `apps/api/src/routes/payroll-settings.ts:48`
  - Uso en UI para periodos: `apps/web/app/(dashboard)/payroll/payroll-client.tsx:63`
  - Ausencia de uso en cálculo de nómina: `apps/api/src/routes/payroll.ts` (no referencia `weekStartDay`)

Impacto:

- Incluso si se corrigiera el punto (1), hoy no existe una fuente de verdad para “qué es una semana” en el cálculo de horas extra.

### 3) (Alta) Validadores (API y Web) no validan la regla semanal de 9h de horas extra “totales”

La validación de “overtime semanal” en API está calculada como `weeklyHours - weeklyLimit`, lo cual NO representa “horas extra totales” (horas arriba del límite diario).

- Evidencia:
  - API calcula “weeklyOvertime” como exceso sobre el límite semanal: `apps/api/src/utils/schedule-validator.ts:140`
  - Web no tiene ninguna validación equivalente a 9h extra/semana: `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx:121`

Impacto:

- Un schedule puede pasar validación aunque tenga >9h extra/semana, siempre que el total semanal no exceda el límite semanal.
- Esto desincroniza “schedule compliance” vs “payroll warnings”.

Ejemplo (DIURNA):

- 11h/día por 4 días → 44h/semana (<=48), pero horas extra = (11-8)×4 = 12h (>9).
- API: no marca weeklyOvertime (porque 44-48=0) y tampoco marca daily overtime (porque 3h/día no es “>3”).
- Web: tampoco marca nada.
- Nómina: sí marcaría overtime semanal excedida (si el cálculo fuera por semana; hoy depende del bug del punto 1).

### 4) (Alta) Cálculo de “hora normal” puede ignorar divisor por tipo de jornada (7 / 7.5 / 8)

En `job-positions` se deriva `dailyPay` ↔ `hourlyPay` siempre con divisor 8 (diurna), y luego nómina suele preferir `hourlyPay` cuando existe.

- Evidencia:
  - Derivación fija con 8h al crear: `apps/api/src/routes/job-positions.ts:213`
  - Derivación fija con 8h al actualizar: `apps/api/src/routes/job-positions.ts:325`
  - Nómina usa `hourlyPay` si existe (antes de dividir por divisor de jornada): `apps/api/src/routes/payroll.ts:335`

Impacto:

- Para empleados NOCTURNA/MIXTA, si el salario base capturado es “salario diario”, el “salario por hora normal” debería ser diario/7 o diario/7.5.
- Con la normalización actual, al capturar solo dailyPay se genera hourlyPay = dailyPay/8, y nómina termina pagando con hourlyPay, potencialmente subpagando.

### 5) (Media) Falta la regla “máximo 3 veces por semana” (frecuencia de horas extra)

Se valida “máx 3h/día” y “máx 9h/semana”, pero no se cuenta cuántos días de la semana tuvieron overtime.

- Evidencia:
  - En settings se comunica la regla: `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx:114`
  - No hay conteo de “días con overtime” en nómina: `apps/api/src/routes/payroll.ts` (solo suma horas)
  - No hay conteo en validación de schedules: `apps/api/src/utils/schedule-validator.ts`

Impacto:

- Casos como 1h extra durante 4 días (4h total) no se detectan, pero violan “3 veces por semana”.

### 6) (Media) Prima dominical aplicada sin verificar condición de “descanso es otro día”

La implementación actual paga prima dominical si hubo horas trabajadas en domingo, sin revisar si el descanso semanal es domingo u otro día.

- Evidencia:
  - Conteo de domingos vía UTC day-of-week: `apps/api/src/routes/payroll.ts:298`
  - Cálculo prima dominical por “domingo trabajado”: `apps/api/src/routes/payroll.ts:347`

Impacto:

- Según la regla proporcionada, esto puede pagar prima cuando no corresponde (si el descanso semanal sí es domingo).
- No hay soporte para reglas más finas (p.ej., si el domingo fue descanso vs día laboral habitual).

### 7) (Media) No existe pago triple para “días de descanso obligatorio” trabajados

No hay concepto de calendario de feriados obligatorios, ni ajuste de pago triple cuando se trabajan.

- Evidencia:
  - No hay referencias a feriados/festivos/pago triple en `apps/api`/`apps/web` (búsqueda por “holiday/feriado/festivo”)

Impacto:

- Incumplimiento directo del caso “descanso obligatorio trabajado = pago triple”, si el producto pretende cubrirlo.

### 8) (Media) Clasificación DIURNA/NOCTURNA/MIXTA no se valida contra el horario real

El sistema depende de un `shiftType` seleccionado, pero no valida contra los rangos 06:00–20:00 / 20:00–06:00 ni la regla de 3.5h nocturnas para MIXTA.

- Evidencia:
  - Validador API solo usa `shiftType` para límites de horas, sin analizar “horas nocturnas”: `apps/api/src/utils/schedule-validator.ts:66`
  - Default MIXTA en Web cruza >3.5h nocturnas (20:00–01:30 = 5.5h): `apps/web/app/(dashboard)/schedules/components/template-form-dialog.tsx:59`

Impacto:

- Schedules pueden quedar “MIXTA” aunque legalmente correspondan a NOCTURNA, afectando límites diarios/semanales y divisor hora normal.

### 9) (Media) Cálculos “por día” y “domingo” basados en UTC (riesgo de desfase México)

La nómina agrupa registros por fecha usando `toISOString()` (UTC) y evalúa domingo con `getUTCDay()`.

- Evidencia:
  - Agrupación por día en UTC: `apps/api/src/routes/payroll.ts:146`
  - Determinación de domingo en UTC: `apps/api/src/routes/payroll.ts:298`

Impacto:

- Para organizaciones en husos horarios de México, un check-in/out cerca de medianoche puede asignarse al día incorrecto.
- Afecta directamente: cálculo de horas extra diarias, prima dominical, y cualquier futura regla por “día calendario” (feriados).

### 10) (Baja/Política) Salario mínimo solo se advierte; no bloquea ni se valida al capturar sueldos

La nómina agrega un warning si el salario diario efectivo cae debajo del mínimo por zona, pero no bloquea procesamiento. Tampoco se valida en creación/edición de job positions.

- Evidencia:
  - Warning en nómina: `apps/api/src/routes/payroll.ts:354`
  - Sin validación en job-positions: `apps/api/src/routes/job-positions.ts` (no usa `MINIMUM_WAGES`)

Impacto:

- Dependiendo del objetivo del producto (compliance vs “solo cálculo”), puede ser insuficiente.

## Recomendaciones (prioridad técnica)

1) Corregir nómina para segmentar por semanas dentro de `periodStart..periodEnd` y aplicar:
   - límites diarios + límites de overtime (3h/día),
   - “primeras 9h dobles / excedente triple” por cada semana,
   - corte de semana usando `weekStartDay`.

2) Unificar la fuente de verdad para cálculos legales:
   - Definir si el salario base es “diario” o “horario”.
   - Si es diario: derivar hourlyRate siempre con divisor de `shiftType` (7/7.5/8) y evitar depender de `jobPosition.hourlyPay` derivado con 8h.

3) Arreglar validadores (API y Web) para:
   - calcular horas extra semanales como suma de (horas - límite diario) por día,
   - contar “días con horas extra” (máx. 3 por semana),
   - opcional: validar MIXTA vs NOCTURNA con la regla ≥3.5h nocturnas.

4) Definir y modelar “días de descanso obligatorio” (feriados) y aplicar pago triple al trabajar.

5) Corregir timezone/day-boundaries:
   - almacenar timestamps como `timestamptz` UTC + timezone por ubicación/organización, o
   - calcular “día local” con la zona horaria del centro de trabajo (para domingo/feriados).

