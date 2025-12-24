1. Marco legal mínimo que el sistema DEBE respetar (LFT)
   1.1 Derecho a vacaciones y tabla mínima por antigüedad

Toda persona trabajadora con más de un año de servicios tiene derecho a vacaciones pagadas; el periodo anual no puede ser inferior a 12 días laborables y aumenta conforme antigüedad.
Cámara de Diputados

Regla de incremento: +2 días por cada año subsecuente hasta llegar a 20; a partir del 6º año, aumenta +2 días por cada 5 años de servicio.
Cámara de Diputados
+1

Tabla práctica (mínimo legal típico): (coincide con criterio difundido por PROFEDET)
Profedet

Año 1: 12

Año 2: 14

Año 3: 16

Año 4: 18

Año 5: 20

Años 6–10: 22

Años 11–15: 24

Años 16–20: 26

Años 21–25: 28

Años 26–30: 30
(y continúa la lógica del Art. 76).

1.2 Continuidad mínima y posibilidad de “partir” vacaciones

Del total que corresponda, la persona trabajadora debe disfrutar al menos 12 días continuos.
Cámara de Diputados
+1

Ese periodo puede distribuirse (a potestad de la persona trabajadora).
Cámara de Diputados
+1

Implicación de diseño: el sistema debe permitir “partir” vacaciones, pero no debe permitir cerrar un año vacacional sin que exista al menos un bloque continuo que cumpla la regla (ver sección 3.4).

1.3 Trabajadores discontinuos o de temporada

Tienen derecho a vacaciones proporcionales al número de días trabajados en el año.
Cámara de Diputados

1.4 Prohibición de “cambiar vacaciones por dinero” durante la relación

Las vacaciones no pueden compensarse con remuneración (cash-out) mientras la relación siga vigente.
Cámara de Diputados

1.5 Terminación antes de cumplir el año

Si termina la relación antes de cumplir el año, se debe pagar remuneración proporcional al tiempo trabajado.
Cámara de Diputados

En práctica de finiquito/renuncia/despido también se consideran vacaciones y prima vacacional proporcionales. PROFEDET lo enuncia como parte de derechos al terminar.
Profedet

1.6 Prima vacacional

Derecho a una prima vacacional no menor al 25% sobre salarios correspondientes al periodo vacacional.
Cámara de Diputados
+1

1.7 Plazo para otorgamiento y constancia anual

Las vacaciones deben concederse dentro de los 6 meses siguientes al cumplimiento del año de servicios.
Cámara de Diputados

El patrón debe entregar anualmente una constancia con: antigüedad, periodo de vacaciones que corresponde y fecha en que deberán disfrutarlo.
Cámara de Diputados

1.8 Prescripción (para control de riesgo, no para “quitar” días automáticamente)

Regla general: acciones de trabajo prescriben en 1 año desde que la obligación sea exigible.
Cámara de Diputados

PROFEDET también comunica que existe un año para exigir vacaciones/pagos relacionados (como referencia práctica).
Profedet
+1

Recomendación de producto: no “borres” días automáticamente por prescripción; en su lugar, usa alertas y trazabilidad (sección 6).

2. Objetivo del feature (alcance funcional)
   2.1 Objetivo

Implementar un módulo de vacaciones que:

Calcule saldo disponible conforme a LFT (mínimo) y políticas superiores (si existen).

Permita autoservicio del empleado (consulta + solicitud/selección de fechas).

Permita revisión/aprobación y también asignación/programación por responsables (jefe/RH), con trazabilidad.

Integre con asistencia (incidencias) y nómina (prima vacacional, y pagos proporcionales en terminación si aplica).

2.2 No alcance (por ahora, pero recomendado después)

Integración con IMSS/IDSE u obligaciones fiscales específicas.

Optimizador automático de cobertura por turnos (se puede construir encima).

Portal externo (solo si ya existe infraestructura).

3. Reglas de negocio que debes modelar (con enfoque legal)
   3.1 Unidad de cómputo: “días laborables”

La LFT habla de días laborables.
Cámara de Diputados

Por tanto el sistema debe:

Contar consumo de vacaciones en días que el empleado debía laborar según su jornada/turno.

Mantener un calendario laboral por empleado (o por centro/rol/turno) como fuente de verdad.

Decisión conservadora (más favorable al trabajador):

No contar como “vacación consumida” los días no laborables del calendario (descanso semanal).

Tratar los días de descanso obligatorio (festivos LFT) como no laborables para el conteo de vacaciones, si tu calendario los marca así (esto evita reducir el descanso real).

Si tu app hoy no tiene “calendario laboral”, este módulo lo va a forzar, porque sin eso el conteo por ley queda ambiguo.

3.2 Periodos por “año de servicios”

Define el “año vacacional” como ventanas:

Año 1: [fecha_ingreso, fecha_ingreso + 1 año)

Al cumplir 1 año, nace el derecho mínimo del Art. 76.

El sistema debe almacenar:

Fecha de ingreso (y si hay “antigüedad reconocida” distinta, también).

Fecha de aniversario (derivable, pero conviene materializarla para performance y auditoría).

3.3 Fecha límite de otorgamiento (6 meses)

Por Art. 81, el sistema debe calcular:

deadline_otorgamiento = aniversario + 6 meses
Cámara de Diputados

Y operar con:

Alertas al empleado/jefe/RH si se acerca la fecha sin programación.

Reportes de cumplimiento (sección 6).

3.4 Regla de 12 días continuos (cómo implementarla sin ambigüedad)

Texto legal: al menos 12 días continuos.
Cámara de Diputados
+1

Criterio implementable (recomendado):

Para cada “año vacacional”, debe existir al menos un intervalo continuo de ausencia (sin días laborables intermedios trabajados) en el que el número de días laborables marcados como vacaciones sea ≥ min(12, derecho_del_año).

Esto evita obligar a 12 cuando el derecho es proporcional menor (temporada/discontinuo).
Cámara de Diputados

Permitir que el resto de días del año se distribuya libremente por el empleado (con aprobación operacional si aplica).
Cámara de Diputados

Importante: Tu idea de que “alguien pueda asignar días” es viable, pero si lo haces “forzado” sin consentimiento puedes chocar con el espíritu del Art. 78 (potestad del trabajador para distribuir). La salida correcta es: asignación como propuesta/agenda con acuse del empleado o con mecanismo de ajuste documentado.

3.5 Prohibición de cash-out (y excepción por terminación)

Mientras el empleado esté activo: bloquear cualquier operación tipo “pagar días en lugar de otorgarlos”.
Cámara de Diputados

Si termina antes de 1 año: calcular y pagar proporcional (Art. 79).
Cámara de Diputados

En renuncia/despido: considerar vacaciones/prima proporcionales como parte del cierre (criterio PROFEDET).
Profedet

---

Documentacion extra (solamente de caracter informativo):

# Guía de implementación: Vacaciones (LFT México) — reglas y cálculos (2025)

**Fecha de actualización:** 2025-12-23  
**Objetivo:** servir como documentación clara (legal + técnica) para implementar el cálculo de **vacaciones**, **pago de vacaciones** y **prima vacacional** en un motor de nómina en México.

> ⚠️ Nota: esta guía resume reglas generales. Pueden existir condiciones superiores en contrato individual/CCT/reglamento interno.

---

## 1) Base legal (lo mínimo indispensable)

### 1.1 Derecho a vacaciones y su tabla (Art. 76 LFT)

- Después de **cumplir 1 año de servicios**, el trabajador tiene derecho a un **periodo anual de vacaciones pagadas**.
- Mínimo: **12 días laborables** el primer año de derecho.
- Incremento: +2 días por cada año subsecuente hasta llegar a 20; a partir del 6º año, +2 días por cada 5 años de servicios.

### 1.2 Servicios discontinuos/temporada (Art. 77 LFT)

- Quienes laboran **discontinuo** o por **temporada** tienen vacaciones **proporcionales** al número de días trabajados en el año.

### 1.3 Forma de disfrute (Art. 78 LFT)

- Del total que corresponda, el trabajador debe disfrutar **12 días continuos al menos**.
- El trabajador puede **distribuir** sus vacaciones como lo requiera (idealmente acordado con el patrón).

### 1.4 No se pagan “en efectivo” (salvo fin de relación) (Art. 79 LFT)

- Las vacaciones **no pueden compensarse con remuneración**.
- Si termina la relación antes de cumplir el año, se paga una **remuneración proporcional** al tiempo trabajado (vacaciones proporcionales).

### 1.5 Prima vacacional mínima (Art. 80 LFT)

- Prima vacacional **≥ 25%** sobre los salarios que correspondan durante las vacaciones.

### 1.6 Plazo para otorgarlas (Art. 81 LFT)

- Deben concederse dentro de los **6 meses** siguientes al cumplimiento del año.
- El patrón debe entregar una **constancia anual** con antigüedad y periodo de vacaciones.

### 1.7 Salario variable (Art. 89 LFT) — base para pagar vacaciones/beneficios

- Si el salario es **variable**, el “salario diario” para cálculos se obtiene como el **promedio de percepciones** de los **30 días efectivamente trabajados** antes del nacimiento del derecho (con reglas si hubo aumento).

---

## 2) Tabla oficial de días mínimos (por antigüedad)

> “Días” son **días laborables** (días que normalmente trabajaría la persona según su jornada).

| Antigüedad cumplida | Días mínimos de vacaciones |
| ------------------: | -------------------------: |
|               1 año |                         12 |
|              2 años |                         14 |
|              3 años |                         16 |
|              4 años |                         18 |
|              5 años |                         20 |
|         6 a 10 años |                         22 |
|        11 a 15 años |                         24 |
|        16 a 20 años |                         26 |
|        21 a 25 años |                         28 |
|        26 a 30 años |                         30 |
|        31 a 35 años |                         32 |

---

## 3) Variables y estructuras recomendadas (para el motor)

### 3.1 Datos de entrada por empleado

| Variable               | Tipo         | Descripción                                                                                         |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `hire_date`            | date         | fecha de ingreso                                                                                    |
| `as_of_date`           | date         | fecha de cálculo                                                                                    |
| `work_schedule`        | object       | patrón de días laborables (ej. Lun–Sáb)                                                             |
| `salary_type`          | enum         | fijo / variable                                                                                     |
| `daily_salary` (`SD`)  | number       | si es fijo: salario diario                                                                          |
| `avg_daily_salary_30d` | number       | si es variable: promedio 30 días efectivamente trabajados (Art. 89)                                 |
| `vac_premium_pct`      | number       | prima vacacional (mínimo 0.25)                                                                      |
| `vac_taken_days`       | number       | días ya gozados en el “año vacacional”                                                              |
| `days_worked_in_year`  | number       | para discontinuos/temporada (Art. 77)                                                               |
| `holidays`             | set[date]    | días descanso obligatorio/feriados para reglas de cómputo                                           |
| `weekly_rest_days`     | set[weekday] | descansos semanales                                                                                 |
| `policy`               | object       | reglas empresa: redondeo, cortes, si “feriado dentro de vacaciones cuenta” (recomendado: NO cuenta) |

### 3.2 Datos derivados

| Variable              | Cálculo                                                     |
| --------------------- | ----------------------------------------------------------- |
| `anniversary_date_n`  | hire_date + n años                                          |
| `vacation_year_start` | último aniversario cumplido                                 |
| `vacation_year_end`   | siguiente aniversario                                       |
| `seniority_years`     | años completos cumplidos al `as_of_date`                    |
| `entitled_days_year`  | tabla por antigüedad (sección 2)                            |
| `accrued_days`        | modelo recomendado: proporcional dentro del año (sección 4) |
| `available_days`      | accrued_days - vac_taken_days                               |

---

## 4) Cómo calcular “días de vacaciones” (derecho, devengo y saldo)

### 4.1 Determinar antigüedad aplicable

- `seniority_years = floor((as_of_date - hire_date) / 1 año)`
- `entitled_days_year = lookup_table(seniority_years)`

> El derecho “nace” al cumplir el año correspondiente; de ahí en adelante puedes modelar devengo para proporcionales.

### 4.2 Modelo recomendado para devengo (para proporcionales y finiquito)

La LFT no impone una fórmula diaria, pero para sistemas de nómina es estándar hacer:

- **Devengo lineal** dentro del “año vacacional”:

```text
accrued_days = entitled_days_year * (days_elapsed_in_vacation_year / days_in_vacation_year)
available_days = accrued_days - vac_taken_days
```

- `days_in_vacation_year`: usa 365 (o días reales si quieres ser ultra exacto).
- Redondeo sugerido: guardar con 4–6 decimales internamente y redondear al presentar/pagar.

### 4.3 Discontinuos / temporada (Art. 77)

Una forma práctica (interpretación operativa) es prorratear por días trabajados:

```text
entitled_days_proportional = entitled_days_full_year * (days_worked_in_year / 365)
```

> Guarda evidencia de `days_worked_in_year` (asistencias) para auditoría.

---

## 5) Cómo calcular el pago de vacaciones y prima vacacional

### 5.1 Determinar salario diario base a usar

| Caso                               | Salario diario a usar                                 |
| ---------------------------------- | ----------------------------------------------------- |
| Salario fijo                       | `SD` (salario diario vigente al inicio de vacaciones) |
| Salario variable                   | `avg_daily_salary_30d` (Art. 89)                      |
| Hubo aumento dentro de los 30 días | promedio desde la fecha del aumento (Art. 89)         |

### 5.2 Fórmulas (para pagar una solicitud de vacaciones)

Variables:

- `days_to_pay` = días de vacaciones gozados en esa solicitud (días laborables)
- `SD_base` = salario diario base

```text
vacation_pay = SD_base * days_to_pay
vacation_premium = SD_base * days_to_pay * vac_premium_pct   # mínimo 0.25
vacation_total = vacation_pay + vacation_premium
```

### 5.3 Vacaciones no gozadas al terminar la relación (Art. 79)

Si termina la relación laboral y hay días devengados no usados:

```text
unused_days = accrued_days - vac_taken_days
payout_vacations = SD_base * unused_days
payout_premium = SD_base * unused_days * vac_premium_pct
total_payout = payout_vacations + payout_premium
```

---

## 6) Reglas de “cómputo de días” (lo que suele causar bugs)

### 6.1 “Días laborables”

Los días de vacaciones son “laborables”: por default, **cuentas los días que el empleado normalmente trabajaría** según su calendario (ej. Lun–Sáb).

### 6.2 Descansos semanales

Los descansos semanales (ej. domingo) **no deben consumirse** del saldo de vacaciones si no son días laborables del trabajador. Manejar vía `work_schedule`.

### 6.3 Si un feriado cae dentro del periodo vacacional

Regla recomendada (y común en guías oficiales): si durante las vacaciones cae un día feriado/descanso obligatorio, **no se contabiliza** como parte de los días de vacaciones; se otorga un día adicional para mantener los “días laborables” efectivos de vacaciones.

Implementación sugerida:

```text
vac_days_consumed = count_workdays_between(start, end, work_schedule)
vac_days_consumed -= count_holidays_that_are_workdays_between(start, end, holidays, work_schedule)
```

---

## 7) Reglas operativas de cumplimiento (para el “workflow”)

- Deben concederse dentro de los **6 meses posteriores** al aniversario (Art. 81).
- Registrar:
    - constancia anual (antigüedad, días, fecha de disfrute)
    - solicitud y autorización
    - comprobantes de pago (CFDI)

---

## 8) Casos de prueba (para tu suite)

### Caso A — Fijo, año 2, toma 5 días

- `SD_base = 500`
- `entitled_days_year = 14`
- `days_to_pay = 5`
- `vac_premium_pct = 0.25`
- `vacation_pay = 500 * 5 = 2500`
- `vacation_premium = 500 * 5 * 0.25 = 625`
- `vacation_total = 3125`

### Caso B — Variable, se paga con promedio 30 días

- `avg_daily_salary_30d = 620`
- `days_to_pay = 8`
- `vacation_total = 620*8 + 620*8*0.25 = 6200`

### Caso C — Terminación antes de aniversario (proporcional Art. 79)

- `entitled_days_year = 12`
- `days_elapsed_in_year = 180`
- `accrued_days = 12*(180/365)=5.9178`
- `vac_taken_days = 2`
- `unused_days = 3.9178`
- paga vacaciones + prima sobre `unused_days` (redondeo según política)

---

## 9) Referencias (fuentes primarias y oficiales recomendadas)

- **LFT (Cámara de Diputados, PDF)** — artículos 76–81 y 89 (salario variable).
- **DOF** — Decreto de reforma “Vacaciones dignas” (publicación 27-dic-2022).
- **PROFEDET** — micrositio de vacaciones (tabla y explicación a trabajadores).
- **STPS Jalisco (PDF)** — preguntas frecuentes (incluye criterio operativo de feriados dentro de vacaciones).

---

Plan tentativo:

# Plan de implementación — Vacaciones (LFT México) en SEN-CheckIn

---

## 0) Objetivo y alcance

### Objetivo

Implementar un módulo completo de **vacaciones conforme a LFT (México)** con flujo híbrido:

- **Empleado (self-service):** ver saldo disponible, solicitar fechas y dar seguimiento.
- **Administrador/HR:** revisar, aprobar/rechazar, asignar días manualmente y auditar el cumplimiento.

### Alcance funcional (MVP)

1. Cálculo de **derecho anual de vacaciones** por antigüedad (tabla “Vacaciones Dignas” 2023+).
2. **Prima vacacional** mínima y configurable (sin permitir bajar de 25%).
3. Flujo de **solicitud → aprobación → bloqueo del calendario** (integración con scheduling).
4. **Conteo de días** basado en calendario y horarios (con política explícita sobre días no laborables/descanso).
5. Integración con **nómina** para pagar vacaciones (y prima) en el periodo correspondiente.

### Fuera de alcance (para no reventar el primer release)

- Incapacidades IMSS, maternidad/paternidad, permisos sin goce y ausencias complejas (aunque el diseño lo deja listo para extender).
- Cálculo fiscal fino de exentos de prima vacacional ISR (si lo quieres 100% nómina-fiscal, lo tratamos como fase posterior; hoy la nómina del repo es un motor simplificado).

---

## 1) Hallazgos del repositorio (para alinear el diseño)

### 1.1 Datos existentes relevantes

- `employee.hireDate` ya existe (clave para antigüedad) :contentReference[oaicite:0]{index=0}.
- `payroll_setting.vacationPremiumRate` existe con default 0.25 :contentReference[oaicite:1]{index=1} y la creación por defecto en el endpoint de settings también fija `0.25` :contentReference[oaicite:2]{index=2}.
- En el motor fiscal ya existe la tabla de días por antigüedad vía `getVacationDaysForYears()` :contentReference[oaicite:3]{index=3}.

### 1.2 Scheduling ya implementado y reutilizable

- Existe `schedule_exception` con `exceptionType: DAY_OFF | MODIFIED | EXTRA_DAY` y un **índice único por empleado+fecha** (evita duplicados por día) :contentReference[oaicite:4]{index=4}.
- Rutas ya listas para gestionar excepciones: `apps/api/src/routes/schedule-exceptions.ts` :contentReference[oaicite:5]{index=5}.
- El calendario de scheduling ya **fusiona template/manual/exceptions** y muestra los días como no laborables cuando hay `DAY_OFF` :contentReference[oaicite:6]{index=6}.

### 1.3 Nómina: hoy NO contempla vacaciones

El cálculo actual suma normal+extras+primas y fija `grossPay = totalPay` :contentReference[oaicite:7]{index=7}.  
No hay componente de “vacation pay” ni “vacation premium”, por lo que si un empleado no tiene asistencia (porque estuvo de vacaciones), hoy su pago podría quedar incorrecto.

---

## 2) Requisitos legales (LFT) que el sistema debe cubrir

> Aquí dejo el checklist legal (sin link DOF por limitación del chat). Esto es lo que el feature debe “garantizar” o por lo menos monitorear con alertas.

1. **Derecho anual mínimo por antigüedad** (Vacaciones Dignas 2023+).  
   El repo ya codifica esta tabla en `getVacationDaysForYears()` :contentReference[oaicite:8]{index=8}.

2. **Prima vacacional mínima 25%** (no permitir configuración por debajo).  
   Hoy el schema de settings permite valores desde 0 :contentReference[oaicite:9]{index=9} → esto debe corregirse.

3. **Obligación de otorgar vacaciones dentro de un plazo** (regla de control/alerta).  
   Recomendación: generar alertas automáticas cuando un empleado esté cerca de vencer el plazo para disfrutar vacaciones del año correspondiente.

4. **Regla de “12 días continuos”** (cumplimiento).  
   El sistema debe ayudar a HR a **cumplir**: al menos un bloque continuo de 12 días “de vacaciones” (del total anual).  
   Recomendación: no bloquear agresivamente al inicio, pero sí:
    - Alertar cuando el patrón de solicitudes vaya a volver imposible cumplir (por ejemplo, si ya usaron demasiados días en bloques pequeños).
    - Permitir override explícito solo para admin/owner y registrar auditoría.

5. **Constancia/registro de vacaciones (auditoría)**:  
   Guardar evidencia de: quién solicitó, quién aprobó, qué días, fecha de aprobación, y saldo resultante. Esto es clave en inspecciones.

---

## 3) Decisiones de política (parametrizables) — defaults recomendados

Estas decisiones cambian el conteo y el compliance. Propongo defaults “seguros” (pro-empleado):

1. **Unidad de conteo**: “días de vacaciones” se descuentan como días **laborables programados** del empleado dentro del rango solicitado.
    - Justificación: el sistema ya tiene horarios y excepciones; es lo más consistente.
2. **Días de descanso obligatorio (LFT Art. 74)** dentro del rango:
    - Default recomendado: **NO descuentan** del saldo de vacaciones (pero se muestran en el calendario dentro del periodo).
3. **Días de descanso semanal** (según horario) dentro del rango:
    - Default: **NO descuentan** del saldo.
4. **Permitir “anticipo” de vacaciones** (tomar de años futuros):
    - Default: **NO** (solo con override admin/owner si lo necesitas).

Estas reglas se convierten en settings por organización en una fase posterior; en MVP pueden ser constantes documentadas.

---

## 4) Diseño de datos (DB) propuesto

### 4.1 Nuevo módulo de “Vacaciones” (tablas)

**A) `vacation_request` (cabecera)**

- `id`
- `organizationId`
- `employeeId`
- `requestedByUserId` (quién creó la solicitud: empleado o HR)
- `status`: DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED
- `startDateKey` (YYYY-MM-DD)
- `endDateKey` (YYYY-MM-DD)
- `requestedNotes` (opcional)
- `decisionNotes` (opcional)
- `approvedByUserId`, `approvedAt` (nullable)
- `rejectedByUserId`, `rejectedAt` (nullable)
- timestamps

**B) `vacation_request_day` (detalle por día)**

- `id`
- `requestId`
- `employeeId`
- `dateKey` (YYYY-MM-DD)
- `countsAsVacationDay` (boolean)
- `dayType`: WORKDAY | WEEKLY_REST | MANDATORY_REST | OTHER_NONWORK
- `serviceYearNumber` (año de antigüedad al que se carga el día)
- `createdAt`

> Importante: el detalle por día es lo que hace el sistema auditable, evita ambigüedades y facilita nómina.

### 4.2 Enlace con scheduling (para bloquear calendario sin duplicar lógica)

Para reflejar vacaciones en el calendario existente (y evitar que alguien programe al empleado esos días), al **aprobar**:

- Crear `schedule_exception` de tipo `DAY_OFF` para cada día del rango aprobado (o al menos para los días WORKDAY).  
  Esto aprovecha:
    - La infraestructura existente de excepciones :contentReference[oaicite:10]{index=10}
    - La forma en que el calendario ya marca `DAY_OFF` :contentReference[oaicite:11]{index=11}

**Cambio recomendado en `schedule_exception`:**

- Agregar `vacationRequestId` (nullable) para rastrear qué excepciones fueron creadas por una aprobación de vacaciones (para poder “revertir” al cancelar).

### 4.3 Self-service requiere vínculo User ↔ Employee

Hoy `employee` no está ligado a `user`. Para permitir que un empleado vea “sus” vacaciones sin seleccionar manualmente:

- Agregar `employee.userId` (nullable) → referencia a `user.id`.
- UI: en “Empleados”, permitir asociar un usuario del sistema a un empleado.

---

## 5) Servicios y reglas de cálculo

### 5.1 Antigüedad y derecho anual

- Fuente interna: `getVacationDaysForYears()` ya define la tabla de derecho por años :contentReference[oaicite:12]{index=12}.
- Regla: si `hireDate` está vacío, el sistema no puede calcular; en ese caso:
    - Bloquear solicitudes self-service.
    - Permitir solicitud HR solo con “override” y dejar un warning de datos incompletos.

### 5.2 Cálculo de “días a descontar” en un rango

Entrada: `employeeId`, `startDateKey`, `endDateKey`.  
Proceso:

1. Construir el calendario efectivo del empleado (puedes reutilizar la lógica del scheduling calendar que ya fusiona base+excepciones :contentReference[oaicite:13]{index=13}).
2. Por cada día del rango:
    - Si es día laborable según horario y no es descanso obligatorio → `countsAsVacationDay = true`.
    - Si es descanso semanal/obligatorio → `countsAsVacationDay = false` (pero se registra en detalle para transparencia).
3. Asignar `serviceYearNumber` por día con base en `hireDate` (si el rango cruza aniversario, se reparte automáticamente).

### 5.3 Validaciones de negocio (antes de aprobar)

- No permitir traslape con:
    - Otra solicitud APPROVED (mismo empleado y fecha).
    - Excepciones de scheduling existentes (si ya hay `schedule_exception` en esa fecha, debe resolverse).
- Saldo suficiente (sin anticipo, por default).
- Cumplimiento “12 días continuos”:
    - No necesariamente bloquear la primera iteración, pero sí calcular:
        - Bloque continuo máximo de días “countsAsVacationDay” dentro de solicitudes aprobadas del serviceYear.
        - Si se vuelve imposible llegar a 12, bloquear nuevas aprobaciones salvo override admin/owner.

---

## 6) API (endpoints) y permisos

> Patrón de auth/tenant: usar `combinedAuthPlugin` + `resolveOrganizationId()` como el resto del API :contentReference[oaicite:14]{index=14}.

### 6.1 Endpoints propuestos

**Empleado**

- `GET /vacations/me/balance`
    - Requiere `employee.userId = session.userId`
- `GET /vacations/me/requests?from&to&status`
- `POST /vacations/me/requests` (crear solicitud)
- `POST /vacations/me/requests/:id/cancel` (si está SUBMITTED y aún no aprobada, o si tu política permite cancelar futuras aprobadas)

**HR/Admin**

- `GET /vacations/requests?employeeId&status&from&to`
- `POST /vacations/requests` (crear para un empleado)
- `POST /vacations/requests/:id/approve`
- `POST /vacations/requests/:id/reject`
- `POST /vacations/requests/:id/cancel` (con auditoría)

### 6.2 Modelo de permisos

- **Empleado:** solo puede ver/crear/cancelar solicitudes de su propio `employeeId` (vía `employee.userId`).
- **Admin/Owner (org):** puede ver y operar sobre cualquier empleado de la organización.  
  Patrón existente para validar rol org: ver cómo `/organization/add-member-direct` valida `member.role` admin/owner :contentReference[oaicite:15]{index=15}.
- **API Keys:** por ahora solo lectura (o deshabilitar) para evitar abuso; si se habilita escritura, restringir a org scoping ya existente.

---

## 7) UI Web (apps/web) — pantallas y componentes

### 7.1 Navegación

Agregar “Vacaciones” al sidebar (similar a “Horarios”, “Nómina”, etc. ya traducidos en `apps/web/messages/es.json` :contentReference[oaicite:16]{index=16}).

### 7.2 Página “Vacaciones” con 2 modos

**A) Modo empleado (self-service)**

- Tarjeta de saldo:
    - “Disponibles (año actual)”, “por vencer”, “bloque continuo máximo logrado”, “recomendación”.
- Selector de fechas (rango) + vista previa:
    - Días que cuentan vs no cuentan, con explicación (rest day/holiday).
- Lista de solicitudes (estado, fechas, días descontados, aprobador).

**B) Modo HR/Admin**

- Bandeja de solicitudes:
    - filtros por estatus, empleado, rango.
    - panel lateral con detalle por día y validaciones (saldo, traslape, 12 continuos, plazo).
- Acciones:
    - aprobar / rechazar / cancelar.
- “Asignar vacaciones”:
    - crear solicitud directamente en APPROVED (o crear+aprobar en un clic) con auditoría de “asignado por HR”.

### 7.3 i18n

Asegurar nuevas keys en `apps/web/messages/es.json` (el repo ya está en español) :contentReference[oaicite:17]{index=17}.

---

## 8) Integración con Nómina (apps/api + apps/web)

### 8.1 Ajuste mínimo obligatorio: pagar vacaciones y prima

Hoy `totalPay` no incluye vacaciones :contentReference[oaicite:18]{index=18}. Para cumplir LFT:

- En cálculo de nómina, añadir:
    - `vacationDaysPaid`
    - `vacationPayAmount`
    - `vacationPremiumAmount` (usando `payroll_setting.vacationPremiumRate`, que existe :contentReference[oaicite:19]{index=19})
- Sumar estos importes a `totalPay` y por ende a `grossPay`.

### 8.2 Corregir validación legal del % de prima

En settings hoy se permite `vacationPremiumRate` mínimo 0 :contentReference[oaicite:20]{index=20}.  
Acción: cambiar a mínimo 0.25 (y mostrar helper legal en UI).

### 8.3 UI Nómina

- En la tabla y CSV, mostrar columnas nuevas (vacaciones/prima).
- En “detalle fiscal”, incluir esos conceptos como parte del bruto.

> Nota fiscal: el motor actual toma `grossPay` como base ISR de forma simplificada. Si quieres tratamiento correcto de exentos (p. ej. prima vacacional con exención), eso es una fase fiscal posterior; el repo ya advierte que hay casos especiales/exentos :contentReference[oaicite:21]{index=21}.

---

## 9) Migración y backfill

1. Migración DB:
    - crear tablas `vacation_request`, `vacation_request_day`
    - agregar `employee.userId` (nullable)
    - agregar `schedule_exception.vacationRequestId` (nullable)
2. Backfill opcional:
    - Si ya registraban vacaciones en “Excepciones” como `DAY_OFF`, se puede migrar con un script manual (solo si hay patrón claro en `reason`).

---

## 10) Checklist de pruebas (QA)

### 10.1 Unit tests (API/services)

- Tabla de derecho anual:
    - validar que coincide con `getVacationDaysForYears()` :contentReference[oaicite:22]{index=22}.
- Rango con fines de semana:
    - descontar solo días laborables (según horario).
- Cruce de aniversario:
    - asignación correcta de `serviceYearNumber`.
- Traslapes:
    - no permitir dos aprobadas que cubran la misma fecha.
- Prima vacacional:
    - no permitir rate < 0.25 (API + UI).

### 10.2 Integración (Scheduling + Vacaciones)

- Al aprobar:
    - se reflejan días `DAY_OFF` en calendario (ya soportado por scheduling) :contentReference[oaicite:23]{index=23}.
- Al cancelar aprobada:
    - se eliminan excepciones ligadas a la solicitud (por `vacationRequestId`).

### 10.3 Integración (Nómina)

- Caso: empleado con 0 asistencia por vacaciones en el periodo → nómina debe pagar vacaciones + prima.
- Caso mixto: algunos días trabajados + algunos de vacaciones → suma correcta en `totalPay/grossPay`.

---

## 11) Riesgos y puntos a confirmar (sin bloquear el inicio)

1. **Regla exacta de conteo** (laborables vs calendario) y tratamiento de descansos obligatorios dentro del periodo de vacaciones.
2. **Política de cancelación**:
    - ¿Se puede cancelar una vacación ya iniciada? (normalmente solo futuras).
3. **Aprobación por roles**:
    - ¿Quieres además un rol “manager” por departamento? Hoy solo existe `member.role` admin/owner/member :contentReference[oaicite:24]{index=24}.
4. **Self-service real**:
    - Requiere asociar user↔employee (campo `employee.userId`). Si no quieres eso, el “empleado” tendría que pedir a HR siempre.

---

## 12) Entregables por fases (recomendación)

### Fase 1 (MVP legal + workflow)

- DB + API de solicitudes + aprobación/rechazo/cancelación
- Cálculo de saldo
- UI HR + UI empleado (mínima)
- Creación automática de `schedule_exception` DAY_OFF al aprobar

### Fase 2 (Nómina)

- Incluir `vacationPay` y `vacationPremium` en cálculo y UI nómina
- Bloquear configuración de prima < 25%

### Fase 3 (Compliance & Auditoría avanzada)

- Alertas por plazo de disfrute
- Reporte/constancia anual por empleado (export)
- Métrica de “12 días continuos” y bloqueos inteligentes (con override auditado)

---

## Apéndice A — Tabla de derecho anual (fuente interna del repo)

El repo ya codifica los días por año (LFT 2023+) en `getVacationDaysForYears()` :contentReference[oaicite:25]{index=25}:

- 1 año: 12
- 2 años: 14
- 3 años: 16
- 4 años: 18
- 5 años: 20
- 6–10: 22
- 11–15: 24
- 16–20: 26
- 21–25: 28
- 26–30: 30
- 31+: +2 cada bloque adicional de 5 años (según implementación actual del repo)

---

## Apéndice B — Cambios mínimos obligatorios por compliance interno del repo

- Ajustar validación de `vacationPremiumRate` para que no acepte < 0.25. Actualmente permite min 0 :contentReference[oaicite:26]{index=26} y la base de datos trae default 0.25 :contentReference[oaicite:27]{index=27}.
- Integrar vacaciones en nómina: hoy `grossPay = totalPay` sin vacaciones :contentReference[oaicite:28]{index=28}.

---
