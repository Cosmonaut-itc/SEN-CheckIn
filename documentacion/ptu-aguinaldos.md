# Nómina México: Aguinaldo y PTU (LFT + LISR/RLISR) — Guía para implementar motor de cálculo (2026)

Última actualización: 2026-01-30  
Propósito: Documentar reglas, bases legales y fórmulas para implementar el cálculo de **Aguinaldo** y **PTU (Participación de los Trabajadores en las Utilidades)** en México, con un enfoque de ingeniería (inputs → reglas → outputs).  
Aviso: esto **no es asesoría legal/fiscal**. La nómina real depende de contrato/CFDI, políticas internas, incidencias, criterios de autoridad y reformas. Parametriza y versiona.

---

## 0) Fuentes legales primarias (para trazabilidad)

### Ley Federal del Trabajo (LFT)

- Aguinaldo: **Artículo 87** (mínimo 15 días; pago antes del 20 de diciembre; proporcional).
- PTU: **Capítulo VIII “Participación de los trabajadores en las utilidades de las empresas”** (Art. 117–131), con reglas clave:
    - Art. 117: derecho y porcentaje definido por Comisión Nacional.
    - Art. 120: la utilidad es la **renta gravable** conforme a **LISR**.
    - Art. 121–122: entrega de declaración/anexos, objeciones, y plazo de reparto.
    - Art. 123: regla 50/50 (días y salarios).
    - Art. 124: salario para PTU = **cuota diaria**; no gratificaciones/prestaciones ni horas extra.
    - Art. 125: comisión mixta y procedimiento interno para proyecto de reparto.
    - Art. 126: **excepciones** (quién NO reparte).
    - Art. 127: **quién participa**, topes, reglas para confianza, eventuales, hogar, plataformas, etc.
    - Art. 129: PTU **no integra salario** para indemnizaciones.

Referencia: PDF vigente LFT (Cámara de Diputados): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf

### Ley del ISR (LISR) — Exentos

- Art. 93 fracc. XIV (SAT): exención de **gratificaciones (incluye aguinaldo)** hasta **30 días de SMG**; PTU hasta **15 días de SMG**; (y también prima vacacional/prima dominical).  
  Referencia (SAT): https://wwwmatnp.sat.gob.mx/articulo/15199/articulo-93

### Reglamento LISR — Retención opcional (importante para neto)

- Art. 174 (SAT): procedimiento opcional de retención para **aguinaldo / PTU / primas**.  
  Referencia (SAT): https://wwwmat.sat.gob.mx/articulo/46306/articulo-174

### Fuentes administrativas útiles

- PROFEDET — Aguinaldo (conceptos, proporcionalidad, salario base; PDFs y micrositio):
    - Micrositio: https://www.profedet.gob.mx/micrositio/index.php/aguinaldo
    - PDF “Preguntas frecuentes Aguinaldo” (incluye criterios prácticos): https://profedet.gob.mx/profedet/archivos/Preguntas_frecuentes_AGUINALDO_2020.pdf
- PROFEDET — PTU (fechas límite y explicación general): https://www.profedet.gob.mx/micrositio/index.php/reparto-de-utilidades-o-participacion-de-los-trabajadores-en-las-utilidades

---

## 1) Distinción esencial para tu motor: **laboral** vs **fiscal** vs **seguridad social**

Tu motor (idealmente) separa 3 capas:

1. **Monto laboral bruto** (derecho del trabajador):
    - Aguinaldo bruto (mínimo por LFT o más por contrato).
    - PTU bruto (distribución por fórmula LFT + topes LFT).

2. **Tratamiento fiscal (ISR)**:
    - Separar **exento** vs **gravado** (LISR Art. 93).
    - Calcular **retención ISR** (LISR + tarifas + RLISR Art. 174 opcional).
    - Esto afecta **neto**.

3. **Tratamiento seguridad social (IMSS/SBC/SDI)**:
    - Aguinaldo se usa para **integración** del SDI (prorrateo anual), aunque el pago sea en diciembre.
    - PTU NO integra salario para indemnizaciones (LFT 129) y típicamente no integra SBC (depende de reglas IMSS y tu implementación).

Esta guía cubre (1) completo y (2) lo mínimo necesario (exento/gravado + opción RLISR 174).

---

## 2) Datos (inputs) que debes modelar

### 2.1 Inputs por empleado (mínimos)

| Campo                             | Tipo           |                                          Ejemplo | Para qué                                     |
| --------------------------------- | -------------- | -----------------------------------------------: | -------------------------------------------- |
| employee_id                       | string         |                                         "E-0003" | Identidad                                    |
| hire_date                         | date           |                                       2025-03-10 | Antigüedad y proporcionalidad                |
| termination_date                  | date?          |                                null / 2026-08-01 | Proporcionalidad y finiquito                 |
| payroll_calendar_year             | int            |                                             2025 | Aguinaldo proporcional / PTU del ejercicio   |
| daily_salary_base                 | decimal        |                                           450.00 | Aguinaldo (salario ordinario por día)        |
| daily_wage_ptu_quota              | decimal        |                                           450.00 | PTU (cuota diaria, LFT 124)                  |
| wage_scheme                       | enum           | daily / weekly / monthly / variable / commission | Cómo derivar salario diario                  |
| days_counted_for_aguinaldo        | int            |                                              365 | Días que cuentan para aguinaldo (ver reglas) |
| days_counted_for_ptu              | int            |                                              240 | Días trabajados en el año (ver reglas)       |
| annual_salary_ptu_base            | decimal        |                                        108000.00 | Salario devengado (base PTU) del año         |
| is_trust_employee                 | bool           |                                            false | Regla de confianza (LFT 127-II)              |
| is_director_admin_general_manager | bool           |                                            false | Excluido (LFT 127-I)                         |
| is_domestic_worker                | bool           |                                            false | Excluido (LFT 127-VI)                        |
| is_platform_worker                | bool           |                                            false | Regla 288 horas/año (LFT 127-IX)             |
| platform_hours_year               | decimal        |                                              310 | Umbral 288h                                  |
| ptu_paid_history                  | array[decimal] |                            [12000, 15000, 14000] | Tope “promedio 3 años” (LFT 127-VIII)        |

### 2.2 Inputs por empresa (mínimos)

| Campo                         | Tipo     |                        Ejemplo | Para qué                                        |
| ----------------------------- | -------- | -----------------------------: | ----------------------------------------------- |
| employer_type                 | enum     | persona_moral / persona_fisica | Fechas de reparto                               |
| fiscal_year                   | int      |                           2025 | PTU del ejercicio                               |
| taxable_income_renta_gravable | decimal  |                  10_000_000.00 | Base PTU (LFT 120)                              |
| ptu_percentage                | decimal  |                           0.10 | Porcentaje vigente (históricamente 10%)         |
| annual_return_filing_date     | date     |                     2026-03-31 | Reglas art. 121–122 + fechas PROFEDET           |
| is_exempt_from_ptu            | bool     |                          false | Excepciones LFT 126                             |
| trust_salary_cap_reference    | decimal? |                         500.00 | Máximo cuota diaria para confianza (LFT 127-II) |
| month_days_for_caps           | int      |                             30 | Para “3 meses” → 90 días (parametrizable)       |
| year_days                     | int      |                            365 | 365/366 (parametrizable)                        |

---

## 3) Aguinaldo (LFT Art. 87)

### 3.1 Regla legal base

- Derecho anual: **mínimo 15 días de salario**.
- Se paga **antes del 20 de diciembre**.
- Si no completó el año, paga **proporcional** al tiempo trabajado (aunque ya no esté laborando al momento del pago).

Base legal: LFT Art. 87 (ver LFT.pdf).

### 3.2 Qué “salario” usar para aguinaldo

La práctica estándar (PROFEDET) es usar el **salario base u ordinario por día laborado**.

- Si el trabajador es de ingreso variable/comisiones, PROFEDET recomienda promedio de ingresos del último año o del tiempo trabajado.

Fuente práctica: PDF PROFEDET “Preguntas frecuentes Aguinaldo 2020”.

**Decisión de ingeniería (recomendada):** define `daily_salary_base` como:

- `daily_salary_base = daily_wage` si ya lo tienes.
- Si salario semanal: `daily_salary_base = weekly_salary / 7` (regla general de conversión; LFT usa /7 o /30 para salario diario en Art. 89 para cálculos laborales).
- Si salario mensual: `daily_salary_base = monthly_salary / 30`.
- Si variable/comisiones: `daily_salary_base = avg_daily_income(reference_window)` donde `reference_window` sea **365 días** o **últimos 12 meses**; documenta y parametriza.

> Nota: LFT Art. 89 habla de indemnizaciones, pero aporta una regla útil de conversión /7 o /30 y promedio cuando sea variable.

### 3.3 Días que cuentan para proporcionalidad

La LFT no lista “qué días cuentan” para aguinaldo; pero PROFEDET ha señalado (criterio práctico) que suelen considerarse como días laborados para aguinaldo:

- periodos vacacionales,
- licencias de maternidad (pre y postnatales),
- descansos semanales,
- incapacidades por riesgo de trabajo.

(Fuente: comunicados/criterios PROFEDET).

**Implementación recomendada:**  
Define `days_counted_for_aguinaldo` como **días con relación laboral vigente** dentro del año y/o días pagados, según tu política. Parametriza incidencias.

### 3.4 Fórmulas

#### Aguinaldo completo del año (si trabajó todo el año)

```text
aguinaldo_amount = daily_salary_base * aguinaldo_days_per_year
```

#### Aguinaldo proporcional

```text
aguinaldo_proportional = daily_salary_base * aguinaldo_days_per_year * (days_counted_for_aguinaldo / year_days)
```

Donde:

- `aguinaldo_days_per_year` mínimo = 15 (o lo pactado).
- `year_days` = 365 (o 366 en año bisiesto, si decides exactitud calendario).

### 3.5 Tabla de variables de aguinaldo

| Variable                   | Descripción                             |  Unidad | Recomendación          |
| -------------------------- | --------------------------------------- | ------: | ---------------------- |
| aguinaldo_days_per_year    | Días de aguinaldo por contrato/LFT      |    días | default 15             |
| daily_salary_base          | Salario diario ordinario para aguinaldo | MXN/día | derivar según esquema  |
| year_days                  | Días del año                            |    días | 365 (param)            |
| days_counted_for_aguinaldo | Días que cuentan para proporcionalidad  |    días | por relación/paid-days |
| aguinaldo_proportional     | Resultado bruto                         |     MXN | output                 |

### 3.6 Salida sugerida (Aguinaldo)

```json
{
	"employee_id": "E-0003",
	"year": 2025,
	"concept": "aguinaldo",
	"inputs": {
		"daily_salary_base": 450.0,
		"aguinaldo_days_per_year": 15,
		"days_counted_for_aguinaldo": 297,
		"year_days": 365
	},
	"gross": {
		"amount": 5490.41
	},
	"tax": {
		"isr_exempt_cap_basis": "LISR_art_93_XIV",
		"exempt_amount": null,
		"taxable_amount": null,
		"withheld_isr": null,
		"withholding_method": "LISR_96_or_RLISR_174"
	}
}
```

---

## 4) PTU (Reparto de utilidades) — LFT Cap. VIII (Art. 117–131)

### 4.1 Regla legal base

- PTU se calcula sobre la **renta gravable** (LFT 120) y el porcentaje lo define la Comisión Nacional (LFT 117).
- El reparto se hace dentro de los **60 días siguientes** a la fecha en que deba pagarse el impuesto anual (LFT 122).
- PROFEDET (guía pública) da fechas límite típicas:
    - Persona moral: **a más tardar 30 de mayo**.
    - Persona física: **a más tardar 29 de junio**.
- El patrón debe entregar copia de la declaración anual dentro de **10 días** de haberla presentado y anexos quedan disponibles por 30 días (LFT 121).
- Si no se reclama en el año exigible, se agrega a PTU del año siguiente (LFT 122).

### 4.2 ¿Qué empresas NO reparten? (Excepciones LFT 126)

La LFT exceptúa, entre otras:

- empresa nueva (primer año),
- empresa nueva con producto nuevo (2 años),
- industria extractiva nueva en exploración,
- instituciones de asistencia privada sin fines de lucro,
- IMSS y ciertas instituciones públicas descentralizadas culturales/asistenciales/beneficencia,
- empresas con capital menor al fijado por STPS por rama (LFT 126-VI).

**Implementación recomendada:** `is_exempt_from_ptu` + `exemption_reason_code`.

### 4.3 ¿Quiénes participan y reglas especiales? (LFT 127)

Reglas clave que tu motor debe contemplar:

1. **No participan** directores, administradores y gerentes generales (127-I).
2. **Confianza (trust)** sí participa, pero su salario base para PTU se limita:
    - si su salario > al del sindicalizado de más alto salario (o a falta, el de planta),
    - se toma ese salario “tope” + 20% como máximo (127-II).
3. Para ciertos empleadores/personas (ingresos sólo de su trabajo; cuidado de bienes que producen rentas; cobro de créditos), la PTU **no puede exceder de 1 mes de salario** (127-III).
4. Madres en pre/postnatal y trabajadores con incapacidad temporal por riesgo de trabajo se consideran **en servicio activo** (127-IV).
5. Trabajadores del hogar: **no participan** (127-VI).
6. Eventuales: participan si trabajaron **>= 60 días** en el año (127-VII).
7. **Tope individual**: máximo **3 meses de salario** o el **promedio PTU últimos 3 años**, lo que sea más favorable (127-VIII).
8. Plataformas digitales: participan si el tiempo efectivamente laborado > **288 horas anuales** (127-IX).

### 4.4 ¿Cómo se distribuye? (LFT 123)

La utilidad repartible se divide en dos mitades:

- **50% por días**: igual entre trabajadores según días trabajados.
- **50% por salarios**: proporcional a salarios devengados por trabajo durante el año.

### 4.5 Definición de “salario” para PTU (LFT 124)

- Salario para PTU = **cuota diaria en efectivo**.
- NO incluye gratificaciones, primas, prestaciones del art. 84 ni pago por horas extra.
- Si salario por unidad de obra o variable: salario diario = promedio de percepciones del año.

> Ojo: esta definición es **específica para PTU**, aunque tu nómina use otras bases para ISR/IMSS.

---

## 5) Algoritmo de cálculo PTU (implementación)

### 5.1 Paso 1 — Calcular PTU total de la empresa

```text
ptu_total = taxable_income_renta_gravable * ptu_percentage
```

- `taxable_income_renta_gravable` proviene de cálculo fiscal (fuera del motor de nómina).
- `ptu_percentage` históricamente 0.10.

### 5.2 Paso 2 — Determinar universo de trabajadores elegibles

Filtra empleados que:

- no estén excluidos por 127-I o 127-VI,
- cumplan 60 días si son eventuales (127-VII),
- cumplan 288h si son plataformas (127-IX),
- y cumplan tu regla de “relación laboral/servicio activo”.

### 5.3 Paso 3 — Preparar bases por trabajador

Para cada trabajador `i`:

#### 5.3.1 Días trabajados (para mitad “por días”)

- `days_i = days_counted_for_ptu`
- Recomendación: define **reglas parametrizables** para contabilizar:
    - días efectivamente laborados,
    - días pagados/descansos,
    - maternidad / riesgo de trabajo (LFT 127-IV dice “servicio activo” para esas ausencias).

#### 5.3.2 Salario base PTU (para mitad “por salario”)

- `daily_wage_ptu_quota_i` = cuota diaria en efectivo (LFT 124).
- Si variable: promedio anual (LFT 124).
- Si confianza y excede tope (LFT 127-II):  
  `daily_wage_ptu_quota_i = min(daily_wage_ptu_quota_i, trust_daily_wage_cap)`

Dónde:

```text
trust_daily_wage_cap = (highest_union_or_base_daily_wage) * 1.20
```

#### 5.3.3 Salario devengado base PTU del año

```text
annual_salary_ptu_base_i = daily_wage_ptu_quota_i * days_salary_earned_i
```

- `days_salary_earned_i` suele aproximarse a `days_i` pero tu política puede diferir (p. ej. si algunos días cuentan como “trabajados” aunque el salario lo pague IMSS).

### 5.4 Paso 4 — Reparto preliminar sin topes

```text
ptu_half = ptu_total / 2

factor_day = ptu_half / sum(days_i)
ptu_by_days_i = factor_day * days_i

factor_salary = ptu_half / sum(annual_salary_ptu_base_i)
ptu_by_salary_i = factor_salary * annual_salary_ptu_base_i

ptu_pre_cap_i = ptu_by_days_i + ptu_by_salary_i
```

### 5.5 Paso 5 — Aplicar tope individual (LFT 127-VIII)

#### 5.5.1 Calcular tope por “3 meses”

```text
cap_3_months_i = monthly_salary_i * 3
```

**Implementación recomendada:**

- Si tu sistema maneja salario mensual contractual, úsalo.
- Si no, aproxima: `monthly_salary_i = daily_wage_ptu_quota_i * month_days_for_caps` (default 30).  
  Entonces: `cap_3_months_i = daily_wage_ptu_quota_i * (month_days_for_caps * 3)`.

#### 5.5.2 Calcular tope por “promedio 3 años”

```text
cap_avg_3y_i = avg(ptu_paid_history_last_3_years_i)
```

- Si no hay 3 años, usa promedio de los años disponibles (documenta).

#### 5.5.3 Tope final

```text
cap_final_i = max(cap_3_months_i, cap_avg_3y_i)
ptu_capped_i = min(ptu_pre_cap_i, cap_final_i)
excess_i = max(0, ptu_pre_cap_i - cap_final_i)
```

### 5.6 ¿Qué hacer con el “exceso” por topes?

La LFT fija el tope individual pero **no describe** el algoritmo de redistribución del excedente en el texto base.

**Recomendación práctica para motor (documenta como criterio de implementación):**  
Redistribución iterativa del excedente entre empleados que aún no alcanzan su tope, manteniendo la regla 50/50 (días/salarios) dentro del subconjunto “no topado”.

Pseudo-algoritmo:

1. Calcula reparto preliminar.
2. Aplica topes → determina `excess_pool = sum(excess_i)`.
3. Si `excess_pool > 0`, vuelve a repartir `excess_pool` entre los no topados usando el mismo esquema (por días/salarios) **pero con bases recalculadas** sólo del conjunto elegible.
4. Repite hasta que `excess_pool` sea ~0 o todos estén topados.

Guarda trazabilidad de iteraciones para auditoría.

---

## 6) Tabla de variables PTU (para el agente)

| Variable                      | Descripción                       |  Unidad | Base legal / nota  |
| ----------------------------- | --------------------------------- | ------: | ------------------ |
| taxable_income_renta_gravable | Renta gravable del ejercicio      |     MXN | LFT 120 (LISR)     |
| ptu_percentage                | % de reparto                      |       % | LFT 117 (Comisión) |
| ptu_total                     | Monto total a repartir            |     MXN | cálculo            |
| days_i                        | Días trabajados en el año         |    días | LFT 123, 127-IV    |
| annual_salary_ptu_base_i      | Salario devengado base PTU        |     MXN | LFT 123–124        |
| trust_daily_wage_cap          | Tope cuota diaria para confianza  | MXN/día | LFT 127-II         |
| cap_3_months_i                | Tope 3 meses de salario           |     MXN | LFT 127-VIII       |
| cap_avg_3y_i                  | Promedio PTU últimos 3 años       |     MXN | LFT 127-VIII       |
| cap_final_i                   | max(cap_3_months_i, cap_avg_3y_i) |     MXN | LFT 127-VIII       |
| ptu_capped_i                  | PTU final bruto por trabajador    |     MXN | output             |

---

## 7) ISR: exento vs gravado y retención (mínimo necesario)

### 7.1 Exentos (LISR Art. 93 fracc. XIV)

Para efectos de ISR, el SAT indica exenciones por año calendario (si se otorgan en forma general):

- Gratificaciones (aguinaldo): exento hasta **30 días de salario mínimo general** (SMG) del área.
- PTU: exento hasta **15 días de SMG**.

Implementación recomendada:

- Parametriza `smg_daily` (y su área/geografía).
- Mantén acumulados anuales por concepto:
    - `ytd_gratificaciones` (para exención de 30 días SMG),
    - `ytd_ptu` (para exención de 15 días SMG).
- Si tu operación usa UMA por criterio interno, **documenta la decisión** y valida con asesor fiscal (la fuente SAT textual habla de SMG).

### 7.2 Retención ISR opcional (RLISR Art. 174)

El RLISR permite **optar** por un procedimiento específico para retener ISR en:

- aguinaldo,
- PTU,
- primas dominicales y vacacionales.

Resumen del procedimiento (texto SAT):

1. Divide la remuneración entre 365 y multiplica por 30.4.
2. Súmalo al ingreso ordinario mensual y calcula ISR por Art. 96 LISR.
3. Resta ISR de ingreso ordinario sin esa remuneración.
4. Calcula tasa efectiva y aplícala a la remuneración.

**Implementación recomendada:**

- Expón un flag de configuración: `withholding_method_extra_payments = "standard" | "rlisr_174"`.
- Versiona el método (por año) y guarda la tasa aplicada por auditoría.

> Nota: el cálculo exacto requiere tarifas ISR vigentes y tu módulo de subsidio al empleo (si aplica).

---

## 8) Especificación de salida recomendada (PTU)

```json
{
	"employee_id": "E-0007",
	"year": 2025,
	"concept": "ptu",
	"eligibility": {
		"is_eligible": true,
		"reasons": []
	},
	"bases": {
		"days_counted_for_ptu": 240,
		"daily_wage_ptu_quota": 500.0,
		"annual_salary_ptu_base": 120000.0,
		"trust_daily_wage_cap_applied": false
	},
	"gross": {
		"ptu_pre_cap": 18250.13,
		"cap_3_months": 45000.0,
		"cap_avg_3y": 16000.0,
		"cap_final": 45000.0,
		"ptu_final": 18250.13
	},
	"tax": {
		"exempt_cap_basis": "LISR_art_93_XIV",
		"exempt_amount": null,
		"taxable_amount": null,
		"withheld_isr": null,
		"withholding_method": "LISR_96_or_RLISR_174"
	}
}
```

---

## 9) Casos de prueba (mínimos) para tu suite

### Aguinaldo

1. Trabajador todo el año, salario diario fijo, 15 días.
2. Trabajador entró a mitad de año → proporcional (valida días).
3. Trabajador con salario mensual → división /30.
4. Comisionista/variable: promedio anual (según tu decisión) y valida against PROFEDET PDF.
5. Baja antes de diciembre → aguinaldo se paga en terminación (si tu motor hace finiquito, comparte regla).

### PTU

1. Empresa con renta gravable > 0 y 3 empleados, sueldos/días diferentes → valida 50/50.
2. Eventual con 59 días (no elegible) vs 60 días (sí elegible).
3. Confianza con sueldo alto → aplica tope 20% sobre el de mayor sindicalizado/base.
4. Tope 3 meses vs promedio 3 años: escenario donde promedio 3 años es mayor.
5. Varios topados → redistribución iterativa del excedente.
6. Trabajador plataforma: 287h no participa; 289h sí participa.

---

## 10) Checklist de implementación para evitar bugs de nómina

- [ ] Parametrizar año, SMG, tablas ISR y método RLISR 174.
- [ ] Modelar elegibilidad PTU por tipo de trabajador (LFT 127) y por tipo de patrón (LFT 126).
- [ ] Calcular bases PTU sin mezclar “cuota diaria” con prestaciones (LFT 124).
- [ ] Implementar topes: confianza (20%) y tope global (3 meses/promedio 3 años).
- [ ] Guardar trazabilidad: días, salarios base, factores, topes, iteraciones de redistribución.
- [ ] Separar en recibo: bruto → exento/gravado → ISR retenido → neto.

---

Fin del documento.
