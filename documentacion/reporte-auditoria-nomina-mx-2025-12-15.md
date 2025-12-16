# Reporte — Correcciones auditoría nómina MX (2025-12-15)

Referencia: `.cursor/todos/audit-payroll-mx-2025-121225.md` (auditoría 2025-12-12).

## Resultados (estado al 2025-12-15)

- Hallazgos resueltos: (1) reglas semanales por semana, (2) `weekStartDay`, (3) overtime semanal correcto, (4) divisor por jornada para hora normal, (5) “máximo 3 veces por semana”, (7) descanso obligatorio trabajado = pago triple, (9) cortes por día local (timezone).
- Hallazgos pendientes: (8) validar DIURNA/NOCTURNA/MIXTA contra el horario real; (10) política de salario mínimo (warning vs bloqueo/validación en captura).

## Resumen de cambios

### 1) Nómina: límites semanales aplicados por semana (no por periodo completo)

- Cambio: el cálculo de nómina ahora segmenta el periodo en semanas usando `payrollSetting.weekStartDay` y reinicia por semana:
    - el límite semanal de jornada (`SHIFT_LIMITS.*.weeklyHours`)
    - la regla de horas extra “primeras 9h dobles / excedente triple”
- Archivos:
    - `apps/api/src/routes/payroll.ts`

Por qué lo soluciona:

- Evita que un periodo BIWEEKLY/MONTHLY trate horas normales de semanas distintas como “exceso semanal” acumulado y corrige la asignación doble/triple para que se aplique por semana.

### 2) Nómina: regla “máximo 3 veces por semana” (días con horas extra)

- Cambio: se agregó el conteo de días con overtime por semana (días con horas arriba del límite diario) y se emite warning cuando excede 3.
- Archivos:
    - `apps/api/src/routes/payroll.ts`
    - `apps/api/src/schemas/payroll.ts` (nuevo tipo de warning)
    - `apps/web/lib/client-functions.ts` (tipo actualizado)

Por qué lo soluciona:

- Detecta el caso “poco overtime por muchos días” (p.ej. 1h extra × 4 días) que antes pasaba sin alertas.

### 3) Nómina: hora normal derivada por divisor de jornada (7 / 7.5 / 8)

- Cambio: la nómina ahora deriva `hourlyRate` desde `dailyPay / divisor(shiftType)` cuando existe `dailyPay` (en lugar de preferir `jobPosition.hourlyPay`).
- Archivo:
    - `apps/api/src/routes/payroll.ts`

Por qué lo soluciona:

- Alinea el cálculo con la regla “hora normal = salario diario / divisor de jornada” y evita subpago en NOCTURNA/MIXTA cuando `hourlyPay` fue normalizado con 8h.

### 4) Validación de schedules (API): overtime semanal correcto y días con overtime

- Cambio: la validación semanal de overtime ahora se calcula como suma de overtime diario (horas - límite diario), y se agregó validación de “>3 días/semana con overtime”.
- Archivo:
    - `apps/api/src/utils/schedule-validator.ts`

Por qué lo soluciona:

- Evita falsos negativos donde el total semanal está bajo el límite (p.ej. 44h), pero la suma de overtime diario excede 9h.

### 5) Validación de schedules (Web): alineación con límites de overtime

- Cambio: se añadieron warnings en UI para:
    - overtime semanal total (>9h)
    - días con overtime por semana (>3)
- Archivo:
    - `apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx`

Por qué lo soluciona:

- Alinea el feedback del editor de plantillas con las reglas y con lo que la nómina puede alertar/bloquear.

### 6) Nómina: cortes por “día local” con timezone por ubicación (domingo/diario/feriados)

- Cambio:
    - Se agregó `location.timeZone` (IANA, default `America/Mexico_City`) y se usa en nómina para cortar el día por medianoche local.
    - La nómina ahora agrupa horas por fecha local (`YYYY-MM-DD`) y divide automáticamente un intervalo CHECK_IN/CHECK_OUT si cruza medianoche (local).
- Archivos:
    - `apps/api/src/db/schema.ts`, `apps/api/drizzle/0015_young_marauders.sql`
    - `apps/api/src/utils/time-zone.ts`, `apps/api/src/utils/date-key.ts`
    - `apps/api/src/routes/payroll.ts`
    - `apps/api/src/schemas/crud.ts`, `apps/api/src/routes/locations.ts`
    - `apps/web/app/(dashboard)/locations/locations-client.tsx`, `apps/web/actions/locations.ts`

Por qué lo soluciona:

- Evita desfases cerca de medianoche (comunes en MX) que antes podían asignar horas al día incorrecto, afectando directamente:
    - horas extra diarias,
    - prima dominical,
    - y cualquier regla por “día calendario” como feriados.

### 7) Nómina: días de descanso obligatorio (LFT Art. 74) + pago triple al trabajar

Regla legal (según LFT Art. 74, incluyendo reforma 2024):

| Tipo                       | Fecha / Regla                                                      | Descripción                                        | Base legal (LFT) |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------------- |
| Año Nuevo                  | 1 de enero                                                         | Inicio de año calendario                           | Art. 74 fr. I    |
| Día de la Constitución     | Primer lunes de febrero (en conmemoración del 5 de febrero)        | Promulgación de la Constitución de 1917            | Art. 74 fr. II   |
| Natalicio de Benito Juárez | Tercer lunes de marzo (en conmemoración del 21 de marzo)           | Natalicio de Benito Juárez                         | Art. 74 fr. III  |
| Día del Trabajo            | 1 de mayo                                                          | Día Internacional del Trabajo                      | Art. 74 fr. IV   |
| Independencia de México    | 16 de septiembre                                                   | Aniversario de la Independencia                    | Art. 74 fr. V    |
| Revolución Mexicana        | Tercer lunes de noviembre (en conmemoración del 20 de noviembre)   | Aniversario de la Revolución Mexicana              | Art. 74 fr. VI   |
| Transmisión del Ejecutivo  | 1 de octubre **cada seis años**                                    | Cambio de Presidencia de la República              | Art. 74 fr. VII  |
| Navidad                    | 25 de diciembre                                                    | Navidad                                            | Art. 74 fr. VIII |
| Jornada electoral          | El que determinen leyes federales/locales en elecciones ordinarias | Día de la elección (federal o local, cuando toque) | Art. 74 fr. IX   |

Notas de nómina (según especificación de producto):

- Si se labora un día de descanso obligatorio: pago triple (salario diario normal + doble adicional).
- Si además cae en domingo: aplica también prima dominical (25% sobre el salario diario ordinario del día).

Implementación:

- Cambio:
    - Se implementó el calendario base (Art. 74 fr. I–VIII) en backend.
    - Para el caso variable “jornada electoral” (Art. 74 fr. IX) y otros descansos locales, se agregó configuración por organización:
        - `payrollSetting.additionalMandatoryRestDays: string[]` (YYYY-MM-DD).
    - La nómina cuenta días de descanso obligatorio trabajados (si hubo horas > 0 en el día local) y suma:
        - `mandatoryRestDayPremiumAmount = díasTrabajados × (2 × salarioDiario)`.
    - Se persiste `mandatoryRestDayPremiumAmount` en `payroll_run_employee` y se muestra en el preview en Web.
- Archivos:
    - `apps/api/src/utils/mexico-mandatory-rest-days.ts`
    - `apps/api/src/db/schema.ts`, `apps/api/drizzle/0015_young_marauders.sql`
    - `apps/api/src/routes/payroll.ts`
    - `apps/api/src/routes/payroll-settings.ts`, `apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx`
    - `apps/web/app/(dashboard)/payroll/payroll-client.tsx`

Por qué lo soluciona:

- Cubre el caso faltante de “descanso obligatorio trabajado = pago triple” con:
    - un calendario legal base (reglas de lunes conmemorativos + transición presidencial),
    - y una extensión configurable para jornadas electorales/descansos locales,
    - calculado por día local (timezone de la ubicación) para evitar errores por desfase.

## Cambios de datos (DB)

- Se agregó `location.timeZone` (IANA, default `America/Mexico_City`) para definir el huso horario de cálculo.
- Se agregó `payrollSetting.additionalMandatoryRestDays` (`string[]` con formato `YYYY-MM-DD`) para feriados variables como “jornada electoral” (Art. 74 fr. IX) y descansos locales.
- Se agregó `payrollRunEmployee.mandatoryRestDayPremiumAmount` para persistir el monto del pago adicional por descansos obligatorios trabajados.
- Migración: `apps/api/drizzle/0015_young_marauders.sql` (incluye un `DROP NOT NULL` en `device.location_id`; verificar si esto es deseado para el producto).

## Configuración requerida (para que el resultado sea correcto)

- Revisar y ajustar el `timeZone` por ubicación (Locations) para reflejar el centro de trabajo real; de esto dependen:
    - el corte diario,
    - domingos,
    - y feriados.
- Configurar `additionalMandatoryRestDays` en Payroll Settings cuando aplique (p.ej. jornada electoral), usando `YYYY-MM-DD` (uno por línea).

## Verificación

- Se ejecutaron:
    - `bun run lint`
    - `bun run check-types`

## Hallazgos ajustados / alcance

- Prima dominical: se mantiene como “+25% si se trabaja en domingo” (por especificación actual del producto). Ahora se evalúa por día local (timezone de la ubicación).
- Pendiente (no implementado en este cambio):
    - Validación automática de DIURNA/NOCTURNA/MIXTA contra horarios reales.
    - Política de “salario mínimo” (warnings vs bloqueo/validación en captura).
