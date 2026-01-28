# Finiquitos (y Liquidación) en México — Guía LFT para implementación (2026)

Última actualización: 2026-01-21  
Propósito: documentar **reglas, entradas y fórmulas** para implementar el cálculo de **finiquito** y, cuando aplique, **liquidación/indemnización** conforme a la **Ley Federal del Trabajo (LFT)**.  
Aviso: esto **no** es asesoría legal. La liquidación real depende de: contrato (individual/colectivo), incidencias, salario variable, bonos, criterios de integración, conciliación/juicio, y actualizaciones oficiales.

---

## 0) Conceptos base (para no romper tu motor)

### 0.1 Finiquito vs Liquidación (regla práctica)

- **Finiquito** = lo que **ya se devengó** y se debe al terminar la relación laboral:  
  salarios pendientes + proporcional de **aguinaldo** + **vacaciones no gozadas** + **prima vacacional** + otras prestaciones pendientes.
- **Liquidación** (también llamada “indemnización” en lenguaje común) = finiquito **+** pagos **adicionales** que se generan **en ciertos despidos/terminaciones** (p. ej., despido injustificado):  
  **3 meses** + (según caso) **20 días por año** + **prima de antigüedad** + (eventualmente) salarios caídos/intereses si hay litigio.

> Regla de ingeniería: modela _finiquito_ como un **módulo siempre-on** y _liquidación_ como un **módulo condicional** (gobernado por `termination_reason` y `contract_type`).

### 0.2 Artículos LFT “núcleo” que tu motor debe respetar

- **Vacaciones y prima vacacional**: Arts. 76–81 LFT (mínimos y proporcionalidad si termina antes del año).
- **Aguinaldo**: Art. 87 LFT (mínimo 15 días; proporcional si no completó el año).
- **Base salarial para indemnizaciones** (y sueldo variable): Art. 89 LFT (incluye cuota diaria + proporción de prestaciones; variable = promedio de 30 días efectivamente trabajados; mensual/30; semanal/7).
- **Despido y 3 meses / salarios vencidos / intereses** (si hay juicio): Art. 48 LFT.
- **20 días por año** (ciertos casos): Art. 50 LFT.
- **Prima de antigüedad (12 días por año + condiciones)**: Art. 162 LFT.
- **Tope para prima/indemnizaciones referidas por Art. 162**: Arts. 485–486 LFT (mínimo = salario mínimo; máximo = 2× salario mínimo del área).

Referencias legales (fuente primaria):

- LFT (Cámara de Diputados): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf
- PROFEDET (guías prácticas): https://www.profedet.gob.mx/micrositio/

---

## 1) Parámetros / constantes (no hardcode)

Tu motor debe parametrizar **por empresa** y **por fecha** (porque cambia con la ley y con políticas internas).

| Parámetro                      |    Tipo | Default mínimo legal | Fuente       | Comentario                                                                        |
| ------------------------------ | ------: | -------------------: | ------------ | --------------------------------------------------------------------------------- |
| `aguinaldo_days_policy`        |     int |                   15 | LFT Art. 87  | Empresa puede dar más (p. ej. 30).                                                |
| `vacation_premium_rate_policy` | decimal |                 0.25 | LFT Art. 80  | Empresa puede dar más (p. ej. 0.30).                                              |
| `minimum_wage_daily_area`      |   money |           (variable) | CONASAMI/DOF | Se usa para topes de Art. 485–486 (prima antigüedad e indemnizaciones referidas). |
| `days_in_month_lft`            |     int |                   30 | LFT Art. 89  | Para convertir sueldo mensual a diario (LFT usa 30).                              |
| `days_in_week_lft`             |     int |                    7 | LFT Art. 89  | Para convertir sueldo semanal a diario.                                           |
| `days_in_year`                 |     int |              365/366 | criterio     | Para prorrateos (aguinaldo/vacaciones proporcionales). Usa calendario real.       |
| `rounding_currency`            |     str |        `"HALF_UP_2"` | criterio     | Define redondeo para centavos.                                                    |

### 1.1 Tabla mínima de vacaciones por antigüedad (Art. 76 LFT)

La LFT establece un mínimo anual **a partir de 1 año** de servicio y un mecanismo de incremento.

**Función recomendada** `vacation_days_entitlement(year_number:int) -> int`:

- Año 1: 12
- Año 2: 14
- Año 3: 16
- Año 4: 18
- Año 5: 20
- Del 6 en adelante: +2 días por cada bloque de 5 años.

Tabla práctica:

| Años de servicio (año “N”) | Días mínimos |
| -------------------------: | -----------: |
|                          1 |           12 |
|                          2 |           14 |
|                          3 |           16 |
|                          4 |           18 |
|                          5 |           20 |
|                       6–10 |           22 |
|                      11–15 |           24 |
|                      16–20 |           26 |
|                      21–25 |           28 |
|                      26–30 |           30 |

> Nota: si termina **antes** de cumplir el año, **no “toma vacaciones”**, pero sí tiene derecho a **remuneración proporcional** (Art. 79 LFT).

---

## 2) Entradas mínimas (modelo de datos)

### 2.1 Datos del empleado (por evento de terminación)

```json
{
	"employee_id": "E001",
	"hire_date": "2023-04-10",
	"termination_date": "2026-01-15",
	"last_day_worked": "2026-01-15",
	"termination_reason": "voluntary_resignation|justified_rescission|unjustified_dismissal|end_of_contract|mutual_agreement|death",
	"contract_type": "indefinite|fixed_term|specific_work",
	"pay_frequency": "daily|weekly|biweekly|semi_monthly|monthly",
	"work_location_area": "general|border_north|custom",
	"minimum_wage_daily_area": 0.0
}
```

### 2.2 Salarios necesarios (separa “base” vs “indemnización”)

Para finiquito y liquidación vas a necesitar **dos** conceptos de salario diario:

1. **`daily_salary_base`**: para pagar días trabajados y prestaciones “directas” (sueldo, vacaciones, aguinaldo, etc.).
2. **`daily_salary_indemnizacion_lft`**: para indemnizaciones / prima de antigüedad cuando aplique.

**Recomendación de ingeniería (evita bugs):** tu motor debe poder **derivar** `daily_salary_indemnizacion_lft` desde historial de percepciones, siguiendo Art. 89 LFT.

```json
{
	"salary": {
		"daily_salary_base": 500.0,
		"salary_is_variable": true,
		"variable_salary_reference": {
			"type": "avg_30_worked_days",
			"worked_days_counted": 30,
			"total_perceptions_in_period": 18000.0
		},
		"daily_salary_indemnizacion_lft": 600.0
	}
}
```

**Reglas clave Art. 89 LFT (implementación):**

- El salario base de indemnización incluye **cuota diaria + parte proporcional de prestaciones del Art. 84**.
- Si la retribución es variable (comisiones/obra/etc.), el salario diario es el **promedio de percepciones de 30 días efectivamente trabajados** anteriores al nacimiento del derecho.
- Si es semanal → divide entre 7.
- Si es mensual → divide entre 30.

---

## 3) Derivados obligatorios (cálculos de fechas y antigüedad)

### 3.1 Antigüedad

```text
service_days = días naturales entre hire_date y termination_date (incluyente)
service_years = service_days / days_in_year_basis
```

**`days_in_year_basis` recomendado:**

- Para prorrateos de aguinaldo/vacaciones: usa calendario real (365/366).
- Para “por año” en indemnizaciones/prima antigüedad: se usa comúnmente 365 como base, pero documenta tu decisión.

### 3.2 Días para aguinaldo proporcional (año calendario)

```text
aguinaldo_accrual_start = max(hire_date, YYYY-01-01 del año de termination_date)
aguinaldo_days_worked_in_year = días naturales entre aguinaldo_accrual_start y termination_date (incluyente)
aguinaldo_year_days = 365 o 366 (según año)
```

### 3.3 Vacaciones pendientes

Tu motor puede operar en 2 modos:

**Modo A (recomendado): “ledger” de vacaciones**

- Input: `vacation_balance_days` (saldo real de vacaciones no gozadas al corte).
- Output: pagar exactamente ese saldo.

**Modo B: cálculo por reglas**

- Necesitas por lo menos:
    - `last_vacation_anniversary_date`
    - `vacation_days_taken_in_current_cycle`
    - `vacation_days_pending_previous_cycles`
    - `vacation_entitlement_current_year` (según Art. 76 o política)

---

## 4) Cálculo del FINIQUITO (siempre aplica)

### 4.1 Tabla de conceptos “core” del finiquito

| Code               | Concepto                       |                      ¿Siempre? | Fórmula (alto nivel)                                                                                | Notas                                                            |
| ------------------ | ------------------------------ | -----------------------------: | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `salary_due`       | Salarios devengados no pagados |                             ✅ | `daily_salary_base * unpaid_days`                                                                   | Incluye días trabajados desde último pago y cualquier ajuste.    |
| `aguinaldo_prop`   | Aguinaldo proporcional         |                             ✅ | `daily_salary_base * aguinaldo_days_policy * (aguinaldo_days_worked_in_year / aguinaldo_year_days)` | Art. 87 LFT reconoce proporcional si no completó año.            |
| `vacation_pay`     | Vacaciones no gozadas (saldo)  |                             ✅ | `daily_salary_base * vacation_balance_days`                                                         | Si no hay saldo, es 0.                                           |
| `vacation_premium` | Prima vacacional               | ✅ (si hay vacaciones pagadas) | `vacation_pay * vacation_premium_rate_policy`                                                       | Mínimo 25% (Art. 80).                                            |
| `other_due`        | Otras prestaciones devengadas  |                             ⚠️ | suma de conceptos                                                                                   | Bonos, comisiones, horas extra, PTU adeudada, etc. (si existen). |

### 4.2 Fórmulas detalladas (modo “ledger”)

```text
salary_due = daily_salary_base * unpaid_days

aguinaldo_prop = daily_salary_base
               * aguinaldo_days_policy
               * (aguinaldo_days_worked_in_year / aguinaldo_year_days)

vacation_pay = daily_salary_base * vacation_balance_days
vacation_premium = vacation_pay * vacation_premium_rate_policy

finiquito_gross = salary_due + aguinaldo_prop + vacation_pay + vacation_premium + other_due
```

> Nota legal de vacaciones: si la relación termina antes del año, hay derecho a remuneración proporcional (Art. 79 LFT).  
> Nota legal de prima vacacional: mínimo 25% sobre salarios del periodo vacacional (Art. 80 LFT).  
> Nota legal de aguinaldo: mínimo 15 días; proporcional aunque ya no esté laborando al momento del cálculo (Art. 87 LFT).

---

## 5) Prima de antigüedad (condicional pero MUY común)

### 5.1 ¿Cuándo aplica? (Art. 162 LFT)

Regla resumida (para lógica de negocio):

- Si **despiden** al trabajador → **sí aplica** (independiente de si el despido es justificado o injustificado).
- Si el trabajador **se separa voluntariamente** → aplica **solo si** tiene **≥ 15 años**.
- Si el trabajador se separa por **causa justificada** (p. ej. rescisión imputable al patrón) → sí aplica.
- Si hay **fallecimiento** → se paga a beneficiarios.

### 5.2 Fórmula

La prima consiste en **12 días de salario por cada año** de servicios (Art. 162).  
El salario para calcularla se determina con Arts. **485–486** (referencia expresa del Art. 162):

```text
salary_base_for_antig = clamp(
  daily_salary_indemnizacion_lft,
  minimum_wage_daily_area,
  2 * minimum_wage_daily_area
)

prima_antiguedad = 12 * salary_base_for_antig * service_years_for_antig
```

Donde:

- `service_years_for_antig` = `service_days / 365` (recomendación común; documenta si usas 365/366).

> Importante: Art. 162 menciona “trabajadores de planta”. Si tu negocio tiene esquemas mixtos (eventual/temporada), define una política interna **documentada** o valida con jurídico/relaciones laborales.

---

## 6) Cálculo de LIQUIDACIÓN / INDEMNIZACIÓN (solo en ciertos escenarios)

### 6.1 Reglas generales más comunes (despido injustificado)

En despido donde procede indemnización, suele considerarse (alto nivel):

- **3 meses de salario** (Art. 48 LFT).
- **20 días por año** (Art. 50 LFT, para relación por tiempo indeterminado; y reglas especiales para tiempo determinado).
- **Prima de antigüedad** (Art. 162 LFT) + finiquito.

> El detalle exacto depende de `termination_reason`, `contract_type`, y si se fue a conciliación/juicio.

### 6.2 3 meses (Art. 48 LFT)

```text
indemnizacion_3_meses = daily_salary_indemnizacion_lft * (3 * days_in_month_lft)
                      = daily_salary_indemnizacion_lft * 90
```

**Nota técnica:** el Art. 48 habla de 3 meses “a razón del salario a la fecha en que se realice el pago”. Si pagas después, existe interpretación de ajustar al salario vigente al pago. Documenta tu criterio (`payment_date`).

### 6.3 20 días por año (Art. 50 LFT)

**Relación por tiempo indeterminado**:

```text
indemnizacion_20_dias = daily_salary_indemnizacion_lft * 20 * service_years_for_indemnizacion
```

**Relación por tiempo determinado** (resumen de Art. 50 fracc. I):

- Si duración < 1 año → salarios de la mitad del tiempo servido.
- Si duración > 1 año → salarios de 6 meses por el primer año + 20 días por cada año subsecuente.

En términos implementables:

```text
if contract_type == "fixed_term":
  if service_years < 1:
    indemnizacion_fixed = daily_salary_indemnizacion_lft * (service_days / 2)
  else:
    indemnizacion_fixed = daily_salary_indemnizacion_lft * (6 * 30)  # 6 meses
                        + daily_salary_indemnizacion_lft * 20 * max(0, service_years - 1)
```

> Nota: la fracción I está redactada en “salarios de la mitad del tiempo” / “seis meses” / “20 días por cada año siguiente”. Ajusta el prorrateo de fracciones de año con un criterio consistente.

### 6.4 Salarios vencidos e intereses (solo si hay juicio / no pago oportuno)

El Art. 48 LFT contempla salarios vencidos hasta 12 meses y, después, intereses (2% mensual sobre 15 meses de salario).  
**Recomendación:** modela esto como **módulo aparte** (`litigation_mode`), porque requiere fechas de demanda, sentencia y cumplimiento.

---

## 7) Matriz de decisión (escenario → qué pagar)

| `termination_reason`                |            Finiquito | 3 meses (Art. 48) | 20 días/año (Art. 50) |                    Prima antigüedad (Art. 162) |
| ----------------------------------- | -------------------: | ----------------: | --------------------: | ---------------------------------------------: |
| `voluntary_resignation`             |                   ✅ |                ❌ |                    ❌ |               ✅ solo si `service_years >= 15` |
| `end_of_contract`                   |                   ✅ |              ❌\* |                  ❌\* | depende (si fue “separado” vs término natural) |
| `mutual_agreement`                  |                   ✅ |                ❌ |                    ❌ |                depende del convenio y Art. 162 |
| `justified_rescission` (por patrón) |                   ✅ |                ❌ |                    ❌ |   ✅ (Art. 162: si es “separado de su empleo”) |
| `unjustified_dismissal`             |                   ✅ |                ✅ |   ✅ (según contrato) |                                             ✅ |
| `death`                             | ✅ (a beneficiarios) |           depende |               depende |                           ✅ (a beneficiarios) |

\* Para contratos por tiempo determinado, si hay controversia sobre terminación anticipada/injustificada, podría entrar Art. 50 fracc. I. No lo asumas: usa `termination_reason` y evidencia.

---

## 8) Salida recomendada (JSON auditable)

```json
{
	"employee_id": "E001",
	"termination": {
		"termination_date": "2026-01-15",
		"termination_reason": "unjustified_dismissal",
		"contract_type": "indefinite"
	},
	"inputs_used": {
		"daily_salary_base": 500.0,
		"daily_salary_indemnizacion_lft": 600.0,
		"minimum_wage_daily_area": 0.0,
		"aguinaldo_days_policy": 15,
		"vacation_premium_rate_policy": 0.25,
		"vacation_balance_days": 6.5,
		"unpaid_days": 3,
		"aguinaldo_days_worked_in_year": 15,
		"aguinaldo_year_days": 365
	},
	"breakdown": {
		"finiquito": {
			"salary_due": 1500.0,
			"aguinaldo_prop": 369.86,
			"vacation_pay": 3250.0,
			"vacation_premium": 812.5,
			"other_due": 0.0,
			"total_gross": 5932.36
		},
		"liquidacion": {
			"indemnizacion_3_meses": 54000.0,
			"indemnizacion_20_dias": 24000.0,
			"prima_antiguedad": 0.0,
			"total_gross": 78000.0
		}
	},
	"totals": {
		"gross_total": 83932.36
	}
}
```

> Consejo de implementación: conserva `inputs_used` para auditoría (debug/reporte).

---

## 9) Referencias rápidas (para el agente)

### LFT (fuente primaria)

- Art. 76–81 (vacaciones + prima vacacional)
- Art. 87 (aguinaldo)
- Art. 89 (base salarial para indemnización; promedio de salario variable; mensual/30; semanal/7)
- Art. 48 (3 meses; salarios vencidos e intereses)
- Art. 50 (20 días/año y reglas para tiempo determinado)
- Art. 162 + 485–486 (prima antigüedad y topes)

PDF oficial: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf

### PROFEDET (guías prácticas)

- Prima de antigüedad: https://www.profedet.gob.mx/micrositio/index.php/prima-de-atiguedad
- Prima vacacional: https://www.profedet.gob.mx/micrositio/index.php/prima-vacacional
- Micrositio general: https://www.profedet.gob.mx/micrositio/

---

## 10) Checklist de ingeniería (anti-bugs)

- [ ] Separar: `daily_salary_base` vs `daily_salary_indemnizacion_lft`.
- [ ] Implementar Art. 89: variable = promedio de **30 días efectivamente trabajados**; mensual/30; semanal/7.
- [ ] Prorratear aguinaldo por año calendario (y por fecha de ingreso).
- [ ] Pagar vacaciones no gozadas + prima vacacional sobre esas vacaciones (mínimo 25%).
- [ ] Prima de antigüedad: 12 días/año, condicional, con tope 2× salario mínimo (Arts. 162 y 486).
- [ ] Liquidación: activar solo cuando corresponda (por `termination_reason` + contrato).
- [ ] Guardar trazabilidad: entradas, parámetros, fechas, y redondeos.
