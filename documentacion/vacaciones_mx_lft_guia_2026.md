# Guía de implementación: Vacaciones (LFT México) — reglas y cálculos (2026)

**Fecha de actualización:** 2026-01-08  
**Objetivo:** servir como documentación clara (legal + técnica) para implementar el cálculo de **vacaciones**, **pago de vacaciones** y **prima vacacional** en un motor de nómina en México.

> ⚠️ Nota: esta guía resume reglas generales. Pueden existir condiciones superiores en contrato individual/CCT/reglamento interno.

> ✅ Revisión 2026: no se detectaron cambios legales nuevos en la LFT sobre **mínimos de vacaciones** desde la reforma de “Vacaciones dignas” (publicada en DOF el 27-dic-2022). Aun así, parametriza por fecha por si hubiera reformas futuras.

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
|---:|---:|
| 1 año | 12 |
| 2 años | 14 |
| 3 años | 16 |
| 4 años | 18 |
| 5 años | 20 |
| 6 a 10 años | 22 |
| 11 a 15 años | 24 |
| 16 a 20 años | 26 |
| 21 a 25 años | 28 |
| 26 a 30 años | 30 |
| 31 a 35 años | 32 |

---

## 3) Variables y estructuras recomendadas (para el motor)

### 3.1 Datos de entrada por empleado
| Variable | Tipo | Descripción |
|---|---|---|
| `hire_date` | date | fecha de ingreso |
| `as_of_date` | date | fecha de cálculo |
| `work_schedule` | object | patrón de días laborables (ej. Lun–Sáb) |
| `salary_type` | enum | fijo / variable |
| `daily_salary` (`SD`) | number | si es fijo: salario diario |
| `avg_daily_salary_30d` | number | si es variable: promedio 30 días efectivamente trabajados (Art. 89) |
| `vac_premium_pct` | number | prima vacacional (mínimo 0.25) |
| `vac_taken_days` | number | días ya gozados en el “año vacacional” |
| `days_worked_in_year` | number | para discontinuos/temporada (Art. 77) |
| `holidays` | set[date] | días descanso obligatorio/feriados para reglas de cómputo |
| `weekly_rest_days` | set[weekday] | descansos semanales |
| `policy` | object | reglas empresa: redondeo, cortes, si “feriado dentro de vacaciones cuenta” (recomendado: NO cuenta) |

### 3.2 Datos derivados
| Variable | Cálculo |
|---|---|
| `anniversary_date_n` | hire_date + n años |
| `vacation_year_start` | último aniversario cumplido |
| `vacation_year_end` | siguiente aniversario |
| `seniority_years` | años completos cumplidos al `as_of_date` |
| `entitled_days_year` | tabla por antigüedad (sección 2) |
| `accrued_days` | modelo recomendado: proporcional dentro del año (sección 4) |
| `available_days` | accrued_days - vac_taken_days |

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
| Caso | Salario diario a usar |
|---|---|
| Salario fijo | `SD` (salario diario vigente al inicio de vacaciones) |
| Salario variable | `avg_daily_salary_30d` (Art. 89) |
| Hubo aumento dentro de los 30 días | promedio desde la fecha del aumento (Art. 89) |

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
