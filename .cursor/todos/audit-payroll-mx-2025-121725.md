# Auditoría de nómina (México / LFT) — seguimiento

Fecha: 2025-12-17

Referencia: `.cursor/todos/audit-payroll-mx-2025-121225.md` (reporte inicial 2025-12-12; actualización indicada 2025-12-15).

Alcance: revisión técnica de la lógica de nómina y su UX relacionada en `apps/api` y `apps/web`:

- cálculo y procesamiento de nómina,
- settings de nómina (weekStartDay, enforcement, feriados configurables),
- validación/advertencias de horarios (schedule templates) que afectan límites y divisores.

Nota: esto no es asesoría legal; es un análisis técnico del comportamiento observado.

## Estado de implementación (2025-12-17)

Actualización: con la implementación actual del repo, estos puntos quedan **resueltos**:

- [x]   11. Subcálculo por cruces de `periodStart/periodEnd`: query de asistencia con rango extendido + clamp por segmento a `[periodStart..periodEnd]`.
- [x]   12. Selector de fechas en Web (UTC / `periodEnd` 00:00): contrato por `periodStartDateKey/periodEndDateKey` (YYYY-MM-DD) sin `new Date('YYYY-MM-DD')`.
- [x]   13. Overtime diario subestimado en turnos overnight: overtime diario calculado por sesión `CHECK_IN→CHECK_OUT` (no por split de medianoche).
- [x]   14. Ambigüedad `dailyPay/hourlyPay`: fuente de verdad `dailyPay`; `hourlyPay` se deriva por divisor de jornada.
- [x]   15. Clasificación MIXTA/NOCTURNA: warning de `SHIFT_TYPE_MISMATCH` + preset MIXTA que mantiene nocturnidad < 3.5h.
- [x]   16. Salario mínimo: política definida como **warning-only** (sin bloqueo).
- [x]   17. `expectedHours`: cálculo por date keys (no depende de `Date.getDay()` en zona local).
- [x]   18. Rendimiento: consulta única de asistencia (sin N+1 por empleado).

Nota de timezone: el periodo se interpreta con `payrollSetting.timeZone`; los cortes por día (domingo/feriados) y el `workdayKey` se calculan por `location.timeZone` (con fallback a `payrollSetting.timeZone`).

## Estado de hallazgos del reporte anterior (verificación rápida)

1. Regla semanal aplicada por semana dentro del periodo (quincena/mes): **Se ve resuelto** en `apps/api/src/routes/payroll.ts` con buckets por semana (`getWeekStartKey`) y reinicio de límites.
2. `weekStartDay` usado para cortar semanas en overtime: **Se ve resuelto** en `apps/api/src/routes/payroll.ts:198-213` + uso en `apps/api/src/routes/payroll.ts:358`.
3. Validación “>9h extra por semana” y conteo “máx 3 días/semana con overtime” (API + Web): **Se ve resuelto** en `apps/api/src/utils/schedule-validator.ts:124-139` y `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx:117-146`.
4. Divisor NOCTURNA/MIXTA para calcular hora normal desde salario diario: **Se ve resuelto** (fuente de verdad `dailyPay` + `hourlyPay` derivado por divisor según jornada).
5. Pago triple por descanso obligatorio trabajado + lista configurable: **Se ve resuelto** (`apps/api/src/utils/mexico-mandatory-rest-days.ts` + `apps/api/src/routes/payroll.ts:379-389` y UI de settings).
6. Timezone/day-boundaries para domingo/feriados: **Se ve resuelto** con corte por `location.timeZone` (split por medianoche en `apps/api/src/routes/payroll.ts`).
7. Clasificación DIURNA/NOCTURNA/MIXTA vs horario real: **Se ve resuelto** (warning `SHIFT_TYPE_MISMATCH`).
8. Salario mínimo: **warning únicamente** (decisión de producto/política: sin bloqueo).

## Hallazgos originales (2025-12-17) — histórico (ya resueltos)

### 11) (Crítico) Subcálculo de horas cuando un turno cruza los límites del periodo (periodStart/periodEnd)

En nómina, la consulta de asistencia filtra eventos por timestamp dentro del rango `[periodStart..periodEnd]` y después se calcula el tiempo trabajado emparejando CHECK_IN→CHECK_OUT.

- Evidencia:
    - Query limitada al periodo: `apps/api/src/routes/payroll.ts:310-323`
    - Cálculo depende de tener el CHECK_IN “abierto” en memoria: `apps/api/src/routes/payroll.ts:146-176`

Impacto:

- Turno que inicia **antes** de `periodStart` y termina **dentro** del periodo: al no traer el CHECK_IN (queda fuera del rango), el CHECK_OUT no se empareja y se pierden horas que sí caen dentro del periodo.
- Turno que inicia **dentro** del periodo y termina **después** de `periodEnd`: al no traer el CHECK_OUT (queda fuera del rango), el tramo trabajado dentro del periodo tampoco se contabiliza.
- Esto es especialmente probable en NOCTURNA/MIXTA (turnos overnight) y cerca de cortes semanales/mensuales.

Recomendación:

- Recuperar también los eventos de borde por empleado (p. ej., “último CHECK_IN antes de periodStart” y “primer CHECK_OUT después de periodEnd”) o ampliar el rango y **clamp** de cada segmento a `[periodStart..periodEnd]` antes de acumular minutos.
- Agregar pruebas unitarias/escenarios para turnos que cruzan inicio/fin de periodo.

### 12) (Alta) Selector manual de fechas en Web puede enviar fechas desplazadas (UTC) y `periodEnd` al inicio del día

En la UI de nómina, los inputs `type="date"` convierten el valor con `new Date(e.target.value)`.

- Evidencia: `apps/web/app/(dashboard)/payroll/payroll-client.tsx:250-263`

Impacto:

- `new Date('YYYY-MM-DD')` se interpreta como UTC (comportamiento común en JS), lo que puede desplazar el día al formatear/mostrar en zona local.
- Más crítico: al seleccionar manualmente `periodEnd`, se puede terminar enviando un timestamp a las **00:00** (inicio del día) en lugar de “fin del día”, provocando que el backend excluya casi todas las horas del día final al filtrar con `lte(periodEnd)` (ver hallazgo 11).

Recomendación:

- Parsear como fecha local (p. ej., `parseISO`) y normalizar límites: `periodStart` a inicio del día y `periodEnd` a fin del día (idealmente en una zona horaria explícita: org/location).
- Alternativa más robusta: cambiar el contrato API para enviar `periodStartDateKey/periodEndDateKey` (YYYY-MM-DD) y que el backend compute límites con `location.timeZone`.

### 13) (Alta) Horas extra diarias pueden subestimarse en turnos overnight (cruzan medianoche)

La nómina agrupa horas por “día calendario local” (dateKey) y aplica el límite diario sobre ese agrupamiento. Al partir un turno en medianoche, un turno largo puede quedar dividido entre dos días, reduciendo artificialmente `dayOvertime`.

- Evidencia:
    - Split por medianoche local: `apps/api/src/routes/payroll.ts:156-173`
    - `dayOvertime` por dateKey (día calendario): `apps/api/src/routes/payroll.ts:353-357`
    - En cambio, el validador de horarios trata un rango overnight como una sola jornada:
        - API: `apps/api/src/utils/schedule-validator.ts:54-58`
        - Web: `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx:86-89`

Ejemplo (NOCTURNA, límite 7h):

- Turno real: 22:00–08:00 (10h).
- Validador (jornada única): overtime = 3h.
- Nómina (por día calendario): 2h (día 1) + 8h (día 2) → overtime = 1h (solo en día 2).

Impacto:

- Subpago potencial de overtime y warnings inconsistentes entre “schedules compliance” y nómina real.

Recomendación:

- Definir explícitamente el criterio: overtime por “día calendario” vs por “jornada/sesión”.
- Si se requiere por jornada/sesión: calcular overtime diario a partir de cada par CHECK_IN→CHECK_OUT (duración total) y luego decidir cómo se asigna a semanas/días para pago y warnings. Mantener el split por día solo para primas/feriados (domingo y descanso obligatorio).

### 14) (Media) Modelo `dailyPay/hourlyPay` sigue ambiguo; la UI pide ambos y la API normaliza con divisor 8h

Hoy existen dos campos en `job_position` (`dailyPay` y `hourlyPay`), pero:

- La nómina **prioriza** `dailyPay` cuando es > 0 (`apps/api/src/routes/payroll.ts:440-446`), y deriva `hourlyRate` por divisor de `shiftType`.
- La API deriva campos faltantes asumiendo 8h (`apps/api/src/routes/job-positions.ts:219-222`).

Impacto:

- `hourlyPay` en `job_position` puede no representar la “hora normal” real para NOCTURNA/MIXTA (divisor 7/7.5).
- Si alguien captura solo `hourlyPay` pensando que es la “hora base”, el sistema podría derivar `dailyPay` usando 8h y luego recalcular hora con divisor 7/7.5, generando inconsistencias.

Recomendación:

- Definir una fuente de verdad única (p. ej., “salario diario” únicamente) o modelar explícitamente la base:
    - `payBasis: 'DAILY' | 'HOURLY'` + reglas claras de derivación, o
    - hourly por `shiftType`, o
    - eliminar `hourlyPay` de captura si no es confiable.
- Alinear UI, API y validaciones con esa decisión.

### 15) (Media) Clasificación MIXTA/NOCTURNA no validada y preset MIXTA viola la regla de ≥ 3.5h nocturnas

No existe validación que compare `shiftType` vs el horario real (nocturnidad). Además, el preset MIXTA default cruza un tramo nocturno ≥ 3.5h.

- Evidencia:
    - Preset MIXTA 18:00–01:30: `apps/web/app/(dashboard)/schedules/components/template-form-dialog.tsx:66-78`
    - Sin validación de nocturnidad en el validador: `apps/api/src/utils/schedule-validator.ts`

Impacto:

- Un schedule puede quedar marcado como MIXTA aunque legalmente corresponda a NOCTURNA, afectando:
    - límites diarios/semanales,
    - divisor (7.5 vs 7) y, por ende, cálculo de “hora normal” y overtime.

Recomendación:

- Implementar validación (o al menos warning) de clasificación:
    - contabilizar horas dentro del rango 20:00–06:00 y aplicar regla de 3.5h para MIXTA.
- Ajustar el preset MIXTA a un rango que cumpla la regla (si el objetivo es “ejemplo legal”).

### 16) (Baja / Política) Salario mínimo sigue siendo warning; no se valida al capturar sueldos

- Evidencia:
    - Warning en nómina: `apps/api/src/routes/payroll.ts:467-477`
    - No hay validación en creación/edición de job positions (no se usa `MINIMUM_WAGES` en `apps/api/src/routes/job-positions.ts`).

Impacto:

- Si el producto pretende “compliance”, un warning puede ser insuficiente (p. ej., debería bloquear o evitar guardar valores bajo mínimo).

Recomendación:

- Definir política: warning vs bloqueo (y si se alinea con `overtimeEnforcement` o se agrega un enforcement específico).
- Si se decide bloquear: validar en `job-positions` y/o bloquear `payroll/process` cuando aplique.

### 17) (Baja) `expectedHours` puede ser inconsistente con zonas horarias / timestamps

El cálculo de `expectedHours` itera días con `Date.getDay()` sin usar la `location.timeZone` del empleado.

- Evidencia: `apps/api/src/routes/payroll.ts:101-127`

Impacto:

- Puede haber desfasajes de día de semana alrededor de medianoche dependiendo de cómo se envíen `periodStart/periodEnd`. Hoy no afecta el pago, pero sí puede afectar comparativos vs horas trabajadas si se muestran/usan.

Recomendación:

- Si se usa como métrica/comparativo: calcular expected hours en base a dateKeys locales del empleado (misma zona que `calculateDailyWorkedHours`).

### 18) (Baja) Rendimiento: N+1 queries de asistencia (una por empleado)

La nómina ejecuta una consulta de asistencia por empleado dentro del loop.

- Evidencia: `apps/api/src/routes/payroll.ts:310-323`

Impacto:

- Latencia y carga DB en organizaciones con muchos empleados.

Recomendación:

- Consultar asistencia en una sola query por `employeeIds` + rango (posiblemente extendido por hallazgo 11) y agrupar en memoria.

## Recomendaciones (prioridad técnica)

1. Corregir manejo de límites de periodo para asistencia (eventos de borde + clamp de segmentos).
2. Corregir parsing/normalización de fechas en Web (`type="date"`) y/o cambiar contrato a date keys.
3. Definir y alinear la regla de overtime en turnos overnight (día calendario vs jornada/sesión); ajustar nómina para evitar subpago.
4. Resolver el modelo `dailyPay/hourlyPay` (fuente de verdad + UX + validaciones).
5. Implementar validación/warning de clasificación MIXTA/NOCTURNA y corregir preset MIXTA.
6. (Producto/política) Definir enforcement para salario mínimo (warning vs bloqueo).

## Casos de prueba sugeridos (no hay suite aún)

- Nómina: turno 22:00–06:00 que cruza `periodStart` (CHECK_IN antes, CHECK_OUT dentro).
- Nómina: turno 22:00–06:00 que cruza `periodEnd` (CHECK_IN dentro, CHECK_OUT después).
- Nómina: turno 22:00–08:00 en NOCTURNA (overtime 3h) y validar que no se subestime al cruzar medianoche.
- Web: seleccionar manualmente `periodEnd` con input date y verificar que el backend reciba “fin del día” (no 00:00).
- Semanas dentro de quincena: `weekStartDay` distinto de lunes y ver que overtime reinicia por semana.
- Descanso obligatorio: prima aplicada cuando hay horas > 0 en un feriado (incluyendo si cae en domingo).
