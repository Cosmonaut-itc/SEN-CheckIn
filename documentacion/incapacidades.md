# Guía 2026 (MX) — Motor de cálculo de incapacidades y licencias IMSS (LSS/LFT/INFONAVIT)

Última actualización: **2026-01-23**  
Propósito: documentación técnica (reglas + fórmulas) para implementar un **motor de incidencias de incapacidad/licencias** que alimente tu motor de nómina (sueldo, IMSS, INFONAVIT, CFDI Nómina).  
Aviso: esto no es asesoría legal/fiscal. La implementación correcta depende de: contrato/políticas internas, **certificados IMSS**, tablas vigentes (UMA/SM), y criterios operativos (SUA, CFDI, etc.).

---

## 0) Idea central (para no romper el neto ni “mentirle” al IMSS)

Una **incapacidad/licencia expedida o reconocida por el IMSS** provoca 3 efectos distintos (y conviene separarlos):

1. **Efecto laboral (LFT)**: se suspende la obligación de **prestar el servicio y pagar salario** en ciertos supuestos (ej. incapacidad temporal no derivada de riesgo de trabajo).
2. **Efecto de prestaciones (LSS)**: el IMSS paga un **subsidio** (60% o 100% según caso) con reglas de inicio/duración.
3. **Efecto de seguridad social (LSS/INFONAVIT)**: impacta cómo determinas **cuotas** y **aportaciones/descuentos** (IMSS/RCV/INFONAVIT).

> Regla de oro de ingeniería: modela por separado:  
> **(a)** `salary_paid_by_employer` (lo que paga el patrón),  
> **(b)** `imss_subsidy` (lo que paga IMSS o reembolsa),  
> **(c)** `social_security_contribution_effects` (días exentos/obligatorios por ramo).

---

## 1) Clasificación mínima (tipos que debes soportar)

### 1.1 Tipos IMSS (núcleo legal para subsidio)

- **Riesgo de trabajo (RT)**: accidente/enfermedad de trabajo. Subsidio **100%**.
- **Enfermedad general / accidente no laboral (EG)**: subsidio **60%**, inicia **día 4**.
- **Maternidad (MAT)**: subsidio **100%** por 84 días (42 pre + 42 post).
- **Licencia por cuidados médicos de hijos con cáncer (LSS 140 Bis)**: subsidio **60%** por licencias de 1–28 días (hasta 364 días en 3 años).

### 1.2 Códigos CFDI Nómina (si timbras)

En CFDI Nómina, el nodo `Incapacidades` se clasifica con `c_TipoIncapacidad` (SAT). En la práctica verás:

- `01` Riesgo de trabajo
- `02` Enfermedad en general
- `03` Maternidad
- `04` Licencia por cuidados médicos de hijos diagnosticados con cáncer (140 Bis LSS)

> Nota: el catálogo SAT es la fuente “real” para timbrado; tu motor debe **mapear IMSS ↔ SAT** aunque internamente uses enums.

---

## 2) Entradas mínimas (inputs) por trabajador y por incidencia

### 2.1 Datos por trabajador (vigentes en el periodo)

- `employee_id`
- `payroll_period`: `{start_date, end_date, periodicity}`
- `SD` (salario diario nominal / no integrado) — opcional si tu nómina se basa en SD.
- `SBC_daily` (salario base de cotización diario, integrado) — **obligatorio** para subsidios IMSS y cuotas.
- `SBC_daily_cap` (tope diario aplicable) — recomendable parametrizar (por LSS existe tope a SBC).
- `weeks_contributed_last_12m` (si quieres validar elegibilidad; si no, marca como “unknown”)
- `infonavit_credit` (si aplica): `{active, discount_type, discount_value, periodicity_source, notice_date}`

### 2.2 Datos por incidencia (cada certificado/licencia)

```json
{
	"case_id": "IMSS-INC-2026-000123",
	"type": "EG|RT|MAT|LIC140BIS",
	"sat_tipo_incapacidad": "01|02|03|04",
	"start_date": "YYYY-MM-DD",
	"end_date": "YYYY-MM-DD",
	"days_authorized": 10,
	"certificate_folio": "string|null",
	"issued_by": "IMSS|recognized_by_IMSS",
	"percent_override": null,
	"sequence": "inicial|subsecuente|recaida|null"
}
```

**Importante (bugs típicos):**

- `case_id` es clave: para **EG** el “día 4” depende de cuántos días van acumulados en **el mismo caso** (puede cruzar periodos de nómina).
- `days_authorized` son **días naturales** (incluye fines de semana) según certificado.

### 2.3 Config global / política del patrón

- `imss_subsidy_payment_mode`:
    - `"direct"` = IMSS paga al trabajador (lo normal).
    - `"indirect_reimbursement"` = patrón paga y el IMSS reembolsa (Convenio IMSS-01-036-C).
- `employer_complements` (beneficio interno, no ley):
    - `pay_first_3_days_EG`: `true|false`
    - `complement_to_full_salary`: `none|to_100_percent|to_x_percent`
- `infonavit_credit_strategy_when_no_net`:
    - `"employer_pays_and_creates_receivable"` (recomendación default para cumplir pago)
    - `"employer_absorbs_cost"`
    - `"allow_negative_net"` (normalmente NO deseable)
    - `"defer_payment"` (riesgo legal/operativo: ojo)

---

## 3) Reglas legales clave (resumen)

### 3.1 Suspensión LFT (efecto sueldo del patrón)

La LFT establece como causa de **suspensión temporal** (sin responsabilidad) la incapacidad temporal por accidente/enfermedad **que no constituya riesgo de trabajo**, suspendiendo obligaciones de **prestar el servicio y pagar salario**.  
Esto opera desde que el patrón conoce la incapacidad y hasta que termine el periodo fijado por el IMSS (con límites de LSS).

👉 Traducción a motor: por los días amparados, el **salario pagado por el patrón puede ser 0**, salvo políticas internas (complementos).

### 3.2 Subsidios IMSS (quién paga y cuánto)

### 3.2.1 Elegibilidad mínima (semanas cotizadas) — recomendado validar

En la práctica el IMSS valida esto, pero tu motor puede marcar **eligibility flags** para evitar “expectativas falsas” en reportes:

| Tipo                    | ¿Requiere semanas cotizadas previas? | Regla práctica                                                                                                                             |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| EG (enfermedad general) | ✅ Sí                                | IMSS suele requerir **≥ 4 semanas cotizadas** inmediatas previas (y **≥ 6** si es trabajador eventual).                                    |
| RT (riesgo de trabajo)  | ❌ No                                | No requiere semanas previas para subsidio por RT.                                                                                          |
| MAT (maternidad)        | ✅ Sí                                | **≥ 30 semanas** en los 12 meses anteriores al inicio de la incapacidad por maternidad.                                                    |
| LIC140BIS               | ✅ Sí                                | **≥ 30 cotizaciones semanales** en 12 meses previos al diagnóstico, o si no, **≥ 52** semanas inmediatas previas al inicio de la licencia. |

> Fuente práctica (comunicación IMSS): el Instituto resume estas reglas de elegibilidad y porcentajes en comunicados de prestaciones económicas.

- **EG**: IMSS paga **desde el día 4** y el subsidio es **60% del último SBC diario**.
- **RT**: IMSS paga **100% del salario (SBC) en que cotizaba** mientras dure la inhabilitación.
- **MAT**: IMSS paga **100% del último SBC diario** por **42 días antes + 42 días después**. Existe emisión de **certificado único por 84 días** y pago “en una sola exhibición” desde el inicio (regla añadida 2023).
- **LIC140BIS**: IMSS paga **60%** del último SBC diario, con licencias de **1 a 28 días**, hasta **364 días** en máximo **3 años**, con requisitos de semanas de cotización.

### 3.3 IMSS cuotas durante incapacidad (ojo: esto sí cambia tu cálculo)

Cuando hay **incapacidades médicas expedidas por el IMSS**, **no es obligatorio cubrir cuotas obrero‑patronales**, **excepto** el **ramo de retiro**.  
👉 Traducción a motor: por días de incapacidad **IMSS**, debes **exentar** la mayoría de ramos (E&M, IV, GPS, RT, C&V), pero **seguir pagando Retiro (2% patrón)** por esos días.

### 3.4 INFONAVIT (dos obligaciones distintas) y el cambio que rompe motores

**Aportación patronal 5% (vivienda)**: en incapacidades expedidas por el IMSS, **subsiste la obligación** del pago de aportaciones.  
**Descuento de crédito (amortización)**: la obligación de hacer descuentos **no se suspende** por ausencias o incapacidades (reforma 2025).  
👉 Traducción a motor: aunque el sueldo del patrón sea 0 por incapacidad, **INFONAVIT 5% sigue**, y si hay **crédito**, tu sistema debe seguir “enterando” el descuento — aun si no hay neto suficiente.

---

## 4) Cálculo determinístico del subsidio IMSS (fórmulas)

### 4.1 Definiciones comunes

- `days_overlap = count_natural_days_intersection(incidence_interval, payroll_period_interval)`
- `SBC_used = min(SBC_daily, SBC_daily_cap)` (si aplicas tope)
- `round2(x)` redondeo a 2 decimales (define regla: half-up vs bankers)

### 4.2 Enfermedad general (EG)

**Regla legal:** subsidio inicia **día 4** del caso.

- `waiting_days = 3`
- `subsidy_rate = 0.60`
- `subsidy_days_in_period = count_days_in_overlap_with_case_day_index >= 4`

**Fórmula:**

- `subsidy_amount = round2(SBC_used * subsidy_rate * subsidy_days_in_period)`

**Notas de implementación:**

- Si el caso cruza periodos, necesitas `case_day_index`:
    - `case_day_index(date) = days_between(case.start_date, date) + 1`
    - subsidio aplica si `case_day_index >= 4`

### 4.3 Riesgo de trabajo (RT)

**Regla legal:** subsidio **100%** mientras dure la inhabilitación (no hay “días de espera”).

- `subsidy_rate = 1.00`
- `subsidy_days_in_period = days_overlap`

**Fórmula:**

- `subsidy_amount = round2(SBC_used * 1.00 * subsidy_days_in_period)`

### 4.4 Maternidad (MAT)

**Regla legal:** 100% por 42 días antes + 42 días después (84 días). Certificado único 84 días (pago 1 exhibición).

- `subsidy_rate = 1.00`
- `subsidy_days_in_period = days_overlap` (normalmente cae dentro de los 84)

**Fórmula:**

- `subsidy_amount = round2(SBC_used * 1.00 * subsidy_days_in_period)`

**Nota:** si deseas simular el pago IMSS real:

- IMSS puede pagar el total del certificado (84 días) “en una sola exhibición” desde el inicio. En tu nómina, normalmente lo marcas como **informativo**, salvo convenio de pago indirecto.

### 4.5 Licencia 140 Bis (LIC140BIS)

**Regla legal:** 60% del último SBC diario. Licencias 1–28 días; hasta 364 en 3 años.

- `subsidy_rate = 0.60`
- `subsidy_days_in_period = days_overlap`

**Fórmula:**

- `subsidy_amount = round2(SBC_used * 0.60 * subsidy_days_in_period)`

---

## 5) Efecto en sueldo del patrón (qué pagas en la nómina)

### 5.1 Default legal-operativo (sin beneficios extra)

- Para días dentro de incapacidad/licencia IMSS:
    - `salary_paid_by_employer_days = 0` (si aplica suspensión o tu política es no pagar)
    - `salary_paid_by_employer_amount = SD * salary_paid_by_employer_days`

### 5.2 Políticas comunes (configurables)

- `pay_first_3_days_EG = true`: pagas SD \* min(3, days_overlap) como percepción “Apoyo por incapacidad” (ojo: puede causar ISR/IMSS si es salario).
- `complement_to_full_salary`: pagas un complemento = (sueldo “normal” del periodo) − (subsidio IMSS esperado) o mantienes 100% SD por todos los días.

**Recomendación**: implementa complementos como “reglas de empresa” separadas del núcleo legal, para que puedas apagarlas/encenderlas por cliente.

---

## 6) IMSS/RCV durante incapacidad (cómo afecta cuotas)

Tu motor puede producir **marcadores de días** para que el cálculo de cuotas sepa qué días “exentar”.

### 6.1 IMSS cuotas (por día) — regla práctica

Para cada día `d` del periodo:

- Si `d` está cubierto por incapacidad IMSS (EG/RT/MAT/LIC140BIS):
    - **Cuotas IMSS**: **NO calcular** (E&M, IV, GPS, RT, C&V)
    - **EXCEPCIÓN**: **Retiro** (2% patrón) **SÍ calcular**
- Si `d` NO está cubierto:
    - calcula cuotas normal (tu motor IMSS estándar)

### 6.2 Fórmula simple para el “retiro” en días de incapacidad

`retiro_pat_incapacity = round2(SBC_used * days_incapacity_in_period * 0.02)`

> Nota: esta guía se centra en la _incidencia_. El desglose completo de cuotas IMSS está en tu documento IMSS/INFONAVIT/ISR/SAR.

---

## 7) INFONAVIT durante incapacidad (aportación 5% y crédito)

### 7.1 Aportación patronal 5% (vivienda)

En incapacidades IMSS, **no se reduce** por el hecho de que “no hubo salario pagado”.

- `infonavit_5_pat = round2(SBC_used * days_in_period_for_infonavit * 0.05)`  
  y **`days_in_period_for_infonavit` incluye días de incapacidad**.

### 7.2 Crédito INFONAVIT (descuento / amortización)

La obligación de hacer descuentos **no se suspende** por ausencias o incapacidades.  
Esto te obliga a manejar el caso de **“no hay neto suficiente para descontar”**.

**Recomendación de motor (cumplimiento + trazabilidad):**

- Calcula el `expected_credit_payment_period` (según aviso: % / cuota fija / VSM).
- Determina cuánto puedes descontar realmente del trabajador sin hacer neto negativo (`max_withholdable = max(0, net_before_infonavit)`).
- Divide en 2:
    - `employee_withheld_infonavit = min(expected_credit_payment_period, max_withholdable)`
    - `employer_paid_infonavit_on_behalf = expected_credit_payment_period - employee_withheld_infonavit`
- Registra un `employee_receivable_balance += employer_paid_infonavit_on_behalf` para recuperar en periodos futuros (si tu política/contrato lo permite).

> Esto te permite **enterar** lo que exige INFONAVIT y al mismo tiempo mantener un neto no negativo.

---

## 8) Convenio “pago indirecto y reembolso” (IMSS-01-036-C)

Si el patrón tiene convenio (típicamente 50+ trabajadores), el flujo cambia:

- El patrón **paga** al trabajador el importe del subsidio por incapacidad (EG/MAT/RT) y el IMSS **reembolsa** posteriormente.

### Implicación de diseño

- En modo `"direct"`: el subsidio es **informativo** (no es dinero que sale de tu nómina).
- En modo `"indirect_reimbursement"`: el subsidio se vuelve una **salida de efectivo del patrón** (y luego entra un reembolso).
    - Tu motor debería emitir: `cash_out_subsidy_paid_by_employer` y `expected_imss_reimbursement`.

---

## 9) Estructura de salida recomendada (por empleado y periodo)

```json
{
	"employee_id": "003",
	"period": { "start": "2026-01-05", "end": "2026-01-11", "periodicity": "weekly" },
	"incapacity_summary": {
		"days_incapacity_total": 7,
		"by_type": {
			"EG": { "days": 7, "subsidy_days": 4, "subsidy_rate": 0.6 },
			"RT": { "days": 0 },
			"MAT": { "days": 0 },
			"LIC140BIS": { "days": 0 }
		}
	},
	"salary_effect": {
		"salary_days_paid_by_employer": 0,
		"salary_amount_paid_by_employer": 0.0,
		"employer_complements": []
	},
	"imss_subsidy": {
		"payment_mode": "direct",
		"expected_subsidy_amount": 702.0,
		"informational_only": true
	},
	"social_security_effects": {
		"imss_exempt_days_except_retiro": 7,
		"retiro_pat_incapacity": 0.0,
		"infonavit_5_includes_incapacity_days": true
	},
	"cfdi_nomina": {
		"incapacidades": [{ "dias": 7, "tipo": "02", "importe_monetario": 0.0 }]
	}
}
```

---

## 10) Casos límite (los que te rompen en producción)

1. **EG que cruza periodos**: sin `case_id` vas a pagar mal porque no sabrás cuándo cae el “día 4”.
2. **Dos certificados pegados** (subsecuente): trata como mismo caso, días continuos.
3. **Licencias 140 Bis acumulables**: debes validar límites (364 días en 3 años) si quieres consistencia interna.
4. **Cambio de SBC en medio de un caso**: decide estrategia: usar SBC al inicio del caso vs SBC vigente por día. (IMSS normalmente toma el “último SBC diario” registrado al momento/previo; define y documenta).
5. **INFONAVIT crédito sin neto**: si no defines estrategia, o timbras negativos o incumples entero.
6. **Convenio pago indirecto**: cambia completamente la naturaleza del “importe monetario” del recibo y la contabilidad del flujo.

---

## 11) Mini batería de pruebas (para tu QA)

### Test A: EG 7 días en una semana (inicio dentro del periodo)

- SBC_daily=500
- Incapacidad EG: 2026-01-05 a 2026-01-11 (7 días)
- Subsidio aplica días 4–7 del caso => 4 días
- Subsidio = 500 _ 0.60 _ 4 = 1200

### Test B: EG cruzando periodo (día 4 cae en el siguiente)

- Caso EG: 2026-01-01 a 2026-01-07
- Periodo de nómina: 2026-01-05 a 2026-01-11
- Días en periodo: 3 (5,6,7) y son días 5,6,7 del caso => todos subsidiados
- Subsidio = 500 _ 0.60 _ 3 = 900

### Test C: RT 10 días

- Subsidio = SBC _ 1.00 _ 10

### Test D: MAT 84 días

- Subsidio = SBC _ 1.00 _ 84
- Validar `certificate_unique_84 = true`

### Test E: INFONAVIT crédito sin neto

- expected_credit_payment_period=300
- net_before_infonavit=0
- employee_withheld=0
- employer_paid_on_behalf=300
- receivable_balance += 300

---

## Referencias (texto vigente / oficiales)

### Leyes (texto vigente)

- **Ley del Seguro Social (LSS)** — PDF IMSS: https://www.imss.gob.mx/sites/all/statics/pdf/leyes/LSS.pdf
    - Art. 58 fr. I (riesgo de trabajo: 100% del salario en que cotizaba)
    - Art. 96 y 98 (enfermedad general: día 4, 60% SBC, duración)
    - Art. 101–103 y 102 Bis (maternidad 84 días y reglas)
    - Art. 31 fr. IV (incapacidad IMSS: exención de cuotas excepto retiro)
    - Art. 140 Bis (licencia por cuidados médicos de hijos con cáncer)
- **Ley Federal del Trabajo (LFT)** — PDF IMSS: https://www.imss.gob.mx/sites/all/statics/pdf/leyes/4107_LFT.pdf
    - Art. 42 y 43 (suspensión por incapacidad no RT; vigencia)
    - Art. 170 fr. V (maternidad: salario íntegro; interacción con LSS Art. 103)
- **Ley del INFONAVIT** — PDF INFONAVIT: https://portalmx.infonavit.org.mx/wps/wcm/connect/1d429641-acde-4787-acde-6109ad929ffa/LeyDelInfonavit.pdf?MOD=AJPERES&CVID=o0ex5Zz
    - Art. 29 (aportaciones subsisten en incapacidades IMSS; descuentos de crédito no se suspenden por ausencias/incapacidades)

### IMSS (operación / trámite)

- **IMSS-01-036-C** — Convenio de _pago indirecto y reembolso de subsidios_: https://www.imss.gob.mx/tramites/imss01036c
- Comunicado IMSS (resumen de reglas de subsidios): https://www.imss.gob.mx/prensa/archivo/202110/475
- IMSS “Facilita el pago de incapacidades por maternidad” (certificado único 84 días): https://www.imss.gob.mx/prensa/archivo/201808/213
- E-book IMSS incapacidad por maternidad (detalles operativos): https://www.imss.gob.mx/sites/all/statics/maternidad/pdf/e-book-incapacidad-maternidad.pdf

### CFDI Nómina (catálogos — para timbrado)

- Catálogo de Nómina (SAT) — suele contener `c_TipoIncapacidad`: https://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catNomina.xls
