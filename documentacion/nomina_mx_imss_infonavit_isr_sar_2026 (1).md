# Nómina México: IMSS, INFONAVIT, ISR, Subsidio al empleo y SAR/AFORE (2026)

Última actualización: **2026-01-13**  
Propósito: documentación de reglas y fórmulas para implementar el cálculo de **retenciones** (trabajador) y **aportaciones/costos** (patrón) de nómina en México (enfocado a **2026**).  
Aviso: esto no es asesoría legal/fiscal. La nómina real depende de incidencias, exentos, contratos, criterios internos y actualizaciones oficiales.

---

## 0) Constantes 2026 que tu motor debe parametrizar

### UMA 2026 (INEGI)

- **UMA diaria (2026):** $117.31
- **UMA mensual (2026):** $3,566.22
- **UMA anual (2026):** $42,794.64
- **Vigencia:** estos valores entran en vigor a partir del **1 de febrero** de cada año (para 2026, desde **01-feb-2026**).

> Para cualquier cálculo “en UMAs” (topes, 3 UMA, 25 UMA, etc.), usa el valor **vigente en la fecha del periodo**.
>
> - Si tu periodo “cruza” el 1 de febrero, la práctica correcta es **partir por días** y aplicar la UMA correspondiente a cada tramo.

**UMA 2025 (importante para enero 2026):**

- **UMA diaria (2025):** $113.14
- **UMA mensual (2025):** $3,439.46
- **UMA anual (2025):** $41,273.52
- **Vigencia:** 01-feb-2025 → 31-ene-2026.

### Subsidio al empleo 2026 (decreto DOF)

**Condición de ingresos (límite mensual):**

- Límite de ingresos (base mensual ISR) para aplicar: **$11,492.66**

**Monto del subsidio (porcentaje sobre UMA mensual):**

- **Feb–Dic 2026:** UMA mensual **2026** × **15.02%** → $535.65 (máximo mensual, redondeado a 2 decimales).
- **Enero 2026 (transitorio):** UMA mensual **2025** × **15.59%** → $536.21 (máximo mensual, redondeado a 2 decimales).

**Prorrateo para periodos menores a un mes (regla legal):**

- subsidio_diario = subsidio_mensual / **30.4**
- subsidio_periodo = subsidio_diario × días pagados del periodo
- **Tope:** no exceder el subsidio mensual del mes.

**Regla crítica (evita bugs):**

- Si el **ISR causado** del periodo es menor al subsidio del periodo, el subsidio solo reduce ISR hasta **cero**; **no hay remanente pagable** ni “acumulable” para periodos posteriores.

---

## 1) La distinción que evita bugs: deducción vs costo patronal vs retención

En un recibo de nómina conviven tres “familias” de números:

1. **Deducciones del trabajador (afectan el neto)**  
   Se descuentan del pago al trabajador (p. ej. ISR retenido, cuotas obreras IMSS, amortización INFONAVIT).

2. **Aportaciones/costos patronales (NO afectan el neto, sí el costo empresa)**  
   Son obligación del patrón (p. ej. IMSS patronal, INFONAVIT 5% patronal, Riesgo de trabajo, guarderías 1%, SAR 2%, etc.).

3. **Montos informativos (se reportan pero no necesariamente impactan neto)**  
   Ejemplo común: mostrar “ISR antes de subsidio” y “Subsidio acreditado” como renglones explicativos.

> Regla de oro para tu sistema: separa explícitamente `employee_withholdings` (neto) de `employer_costs` (costo).  
> Si mezclas ambos en una sola “columna de deducciones”, acabas con reportes confusos y netos incorrectos.

---

## 2) Entradas mínimas para calcular

### Por trabajador (por periodo de pago)

- `dias_cotizados`: días por los que cotiza (incluye descansos pagados; excluye ausencias sin goce según tu política).
- `SD`: salario diario **no integrado**.
- `SBC_diario`: salario base de cotización diario (**integrado**) para IMSS/INFONAVIT/SAR.
- `percepciones_gravadas_ISR`: percepciones sujetas a ISR (en el periodo).
- `percepciones_exentas_ISR`: exentas (vacaciones exentas, parte exenta de aguinaldo, etc.).
- `infonavit_credito`: si tiene crédito y el tipo de descuento (porcentaje / cuota fija / VSM u otro) + el valor vigente del aviso INFONAVIT.
- `politica_absorcion` (opcional): si el patrón absorbe cuotas obreras y/o ISR (ver sección 10).

### Por patrón / configuración global

- `UMA_diaria`, `UMA_mensual` (valores vigentes por fecha).
- `tasa_riesgo_trabajo` (prima RT del patrón según su siniestralidad/clase).
- `estado` / `isn_rate` (impuesto estatal sobre nóminas, si aplica).
- Tablas anuales versionadas:
    - Tarifa ISR (Anexo 8 / RMF 2026).
    - Tabla de Cesantía y Vejez patronal 2026 (reforma gradual 2023–2030).

---

## 3) Bases: SBC vs base ISR

### 3.1 Salario Base de Cotización (SBC)

Se usa para **IMSS + INFONAVIT + SAR/AFORE**.

- SBC_periodo = SBC_diario × dias_cotizados

**Topes (implementación):**

- La LSS establece un límite superior (históricamente “25 veces salario mínimo”).  
  En la práctica moderna, muchos sistemas lo parametrizan y operan en UMAs.

Recomendación de ingeniería (parametrizable):

- SBC_diario = min(SBC_diario, 25 × UMA_diaria)

> Nota: el tope exacto y su “unidad” pueden ser tema de interpretación/actualización; por eso conviene **parametrizarlo** y documentar tu decisión.

### 3.2 Base ISR (salario gravable)

Se usa para **ISR retenido**. No es igual al SBC.

- base_ISR_periodo = percepciones_gravadas_ISR_periodo − (deducciones aplicables en nómina, si proceden)

> Ojo: la mayoría de deducciones personales no se aplican en nómina; se aplican en la anual.

---

## 4) Tabla “qué va en deducción vs costo patronal”

| Concepto                                                    | ¿Quién lo paga?                  |        ¿Se descuenta al trabajador? | Base típica                   | Comentario de implementación                                                  |
| ----------------------------------------------------------- | -------------------------------- | ----------------------------------: | ----------------------------- | ----------------------------------------------------------------------------- |
| ISR retenido                                                | Trabajador (retenido por patrón) |                               ✅ Sí | Base ISR                      | Retención: el patrón entera al SAT.                                           |
| Subsidio al empleo (2026)                                   | Beneficio fiscal (reduce ISR)    |             ❌ No (no es deducción) | Base ISR (mensual)            | En CFDI se registra como **OtrosPagos/SubsidioAlEmpleo** (no como deducción). |
| Cuotas obreras IMSS (E&M excedente, PD, GMP, IV, CV)        | Trabajador                       |             ✅ Sí (salvo absorción) | SBC (y excedente sobre 3 UMA) | Si patrón absorbe, debes hacer “gross-up” (ver sección 10).                   |
| IMSS patronal (E&M cuota fija, PD, GMP, IV, Guarderías, RT) | Patrón                           |                               ❌ No | UMA y/o SBC                   | Es costo empresa.                                                             |
| SAR (Retiro 2%)                                             | Patrón                           |                               ❌ No | SBC                           | Costo empresa, va a la AFORE vía IMSS.                                        |
| Cesantía y Vejez                                            | Ambos                            | ✅ parte obrera / ❌ parte patronal | SBC                           | Patrón 2026: tasa variable por rango; Obrero 1.125%.                          |
| INFONAVIT 5%                                                | Patrón                           |                               ❌ No | SBC                           | Aportación patronal (no confundir con crédito).                               |
| Crédito INFONAVIT (amortización)                            | Trabajador                       |                               ✅ Sí | Según aviso INFONAVIT         | Descuento y entero **bimestral** (acumulado por nómina).                      |
| Impuesto estatal sobre nóminas (ISN)                        | Patrón                           |                               ❌ No | Base estatal                  | Tasa depende del estado (configurable).                                       |

---

## 5) IMSS: desglose útil para ingeniería

La LSS divide IMSS en ramos. Para nómina, conviene implementar un breakdown determinístico (y luego sumar).

### 5.1 Enfermedades y Maternidad (E&M)

Componentes prácticos:

**Cuota fija (patronal):**

- EM_CF_pat = UMA_diaria × dias_cotizados × **20.4%**

**Excedente sobre 3 UMA** (solo si SBC_diario > 3 × UMA_diaria):

- base_excedente = (SBC_diario − 3 × UMA_diaria) × dias_cotizados
- EM_exc_pat = base_excedente × **1.10%**
- EM_exc_obr = base_excedente × **0.40%**

**Prestaciones en dinero (PD):**

- PD_pat = SBC_periodo × **0.70%**
- PD_obr = SBC_periodo × **0.25%**

**Gastos médicos pensionados (GMP):**

- GMP_pat = SBC_periodo × **1.05%**
- GMP_obr = SBC_periodo × **0.375%**

### 5.2 Invalidez y Vida (IV)

- IV_pat = SBC_periodo × **1.75%**
- IV_obr = SBC_periodo × **0.625%**

### 5.3 Guarderías y Prestaciones Sociales (GPS)

- GPS_pat = SBC_periodo × **1.00%**

### 5.4 Riesgos de Trabajo (RT)

- RT_pat = SBC_periodo × **prima_RT**

`prima_RT` es específica del patrón (según su clasificación y siniestralidad).

### 5.5 SAR / Retiro

- Retiro_pat = SBC_periodo × **2.00%**

### 5.6 Cesantía y Vejez (C&V)

**Obrero (constante):**

- CV_obr = SBC_periodo × **1.125%**

**Patrón (2026):** usa tabla por rango (aplicación gradual 2023–2030).

Para 2026, tasas patronales por SBC expresado en UMAs:

| SBC del trabajador   | Cuota patronal C&V 2026 |
| -------------------- | ----------------------: |
| 1.00 SM              |                  3.150% |
| 1.01 SM a 1.50 UMA   |                  3.676% |
| 1.51 a 2.00 UMA      |                  4.851% |
| 2.01 a 2.50 UMA      |                  5.556% |
| 2.51 a 3.00 UMA      |                  6.026% |
| 3.01 a 3.50 UMA      |                  6.361% |
| 3.51 a 4.00 UMA      |                  6.613% |
| 4.01 UMA en adelante |                  7.513% |

Implementación:

- Calcula multiplo_UMA = SBC_diario / UMA_diaria
- Selecciona el rango y su tasa `tasa_CV_pat_2026`
- CV_pat = SBC_periodo × `tasa_CV_pat_2026`

> Nota de ingeniería: los primeros rangos combinan “SM” y “UMA”. En la práctica, conviene parametrizar el **SM aplicable** (general vs frontera) o adoptar el criterio que uses para homologarte con SUA.

---

## 6) INFONAVIT: 2 cosas distintas (y se confunden TODO el tiempo)

### 6.1 Aportación patronal 5%

Esto **no** es un descuento al trabajador.

- INFONAVIT_pat = SBC_periodo × **5%**

### 6.2 Amortización de crédito INFONAVIT (descuento al trabajador)

Esto **sí** es deducción.

Depende del “aviso” del INFONAVIT: puede ser porcentaje, cuota fija, o modalidad ligada a VSM/UMA según el crédito.

Recomendación de ingeniería: modela el crédito como una regla externa y evita “inferir” montos sin el aviso.

Modelo recomendado:

```json
{
	"infonavit_credit": {
		"active": true,
		"discount_type": "percentage|fixed_amount|vsm",
		"discount_value": 0.2,
		"value_periodicity": "daily|weekly|biweekly|monthly|bimonthly",
		"source": "aviso_infonavit"
	}
}
```

Luego:

- Convierte el valor a tu periodicidad (semanal, quincenal, etc.).
- Aplica el descuento y acumula para entero bimestral.

---

## 7) ISR retenido (y subsidio al empleo 2026)

### 7.1 ISR del periodo

Algoritmo estándar con tarifa:

1. base_ISR = percepciones_gravadas_ISR_periodo
2. Busca el renglón (límites y cuota fija) en la tarifa correspondiente a tu periodicidad (diaria, semanal, quincenal, mensual…).
3. ISR_causado = cuota_fija + (base_ISR − limite_inferior) × tasa_marginal

> Fuente de las tarifas: SAT / RMF / **Anexo 8** (actualiza cada año).  
> Para evitar errores, trata la tarifa como **dataset versionado** (no hardcode “a mano” en lógica).

### 7.2 Subsidio al empleo (2026)

Implementación práctica:

- Determina `subsidio_periodo` (prorrateado) si el trabajador cumple condición de ingresos.
- Prorrateo sugerido (alineado con decreto):
    - subsidio_diario = subsidio_mensual / 30.4
    - subsidio_periodo = subsidio_diario × dias_pagados_del_periodo (sin exceder máximo mensual)

Luego:

- subsidio_aplicado = min(ISR_causado, subsidio_periodo)
- ISR_retenido = ISR_causado − subsidio_aplicado
- subsidio_no_aplicado = subsidio_periodo − subsidio_aplicado → **no se paga ni se acumula** (informativo).

### 7.3 CFDI (nota rápida)

- ISR retenido → **Deducciones**
- Subsidio al empleo → **OtrosPagos/SubsidioAlEmpleo**  
  (evita modelarlo como “deducción negativa”).

---

## 8) SAR/AFORE (ahorro para el retiro)

En nómina normalmente se ve como:

- Retiro 2% (patrón) → costo
- Cesantía y Vejez → patrón + obrero (ver 5.6)

El depósito final se administra en AFORE vía IMSS.

Modelo de configuración:

```json
{
	"sar": {
		"retiro_pat": 0.02,
		"cesantia_vejez_pat": "tabla_2026",
		"cesantia_vejez_obr": 0.01125
	}
}
```

---

## 9) Impuesto estatal sobre nóminas (ISN)

No es federal y varía por entidad.

En sistemas serios es configurable por estado y (a veces) por tipo de percepción que integra la base estatal.

Modelo:

```json
{
	"state_payroll_tax": {
		"state": "JAL",
		"rate": 0.02,
		"base_rule": "percepciones_gravadas|percepciones_totales|config"
	}
}
```

---

## 10) “Absorber” vs “Reportar” (para que tu sistema no se mienta a sí mismo)

### 10.1 Reportar

Significa mostrar renglones (IMSS, INFONAVIT, ISR, etc.) en un reporte.

- Si es deducción real del trabajador → baja el neto.
- Si es costo patronal → **NO** baja el neto, pero sí suma al costo total empresa.

### 10.2 Absorber

Significa que el patrón decide pagar por cuenta del trabajador algo que normalmente se le retiene.

Ejemplos típicos:

- “La empresa absorbe el IMSS obrero”
- “La empresa absorbe el ISR”

Implicación técnica:  
Absorber manteniendo el mismo neto suele ser un **gross-up**: el pago “extra” puede generar ISR adicional (y potencialmente integrar a SBC), así que no es una suma simple.

Estrategias:

- fórmula cerrada (si el ISR se mantiene en el mismo tramo y no hay otras interacciones), o
- iteración hasta converger (común en payroll engines).

Recomendación de implementación (flags):

- `absorb_imss_obrero`
- `absorb_isr`
- `absorb_infonavit_credit` (raro, pero posible)

Tres vistas:

- `net_pay_detail` (solo lo que afecta neto)
- `employer_cost_detail` (costos del patrón)
- `informational_lines` (p. ej. ISR antes/subsidio)

---

## 11) Especificación de salida recomendada (para el agente)

Formato sugerido por empleado (estructura recomendada; números ilustrativos):

```json
{
	"employee_id": "003",
	"period": { "type": "weekly", "days": 7 },
	"bases": {
		"sbc_daily": 293.31,
		"sbc_period": 2053.17,
		"isr_base_period": 1951.6
	},
	"employee_withholdings": {
		"imss_obrero": {
			"em_exc": 0.0,
			"pd": 5.13,
			"gmp": 7.7,
			"iv": 12.83,
			"total": 25.66
		},
		"cv_obrero": 23.1,
		"isr_withheld": 0.0,
		"infonavit_credit": 0.0
	},
	"employer_costs": {
		"imss_patronal": {
			"em_cf": 290.6,
			"em_exc": 0.0,
			"pd": 14.37,
			"gmp": 21.56,
			"iv": 35.93,
			"gps": 20.53,
			"rt": 123.19,
			"total": 506.18
		},
		"retiro_2": 41.06,
		"cv_patronal": 108.86,
		"infonavit_5": 102.66,
		"isn": 39.03
	},
	"net_pay": 1951.6,
	"company_cost": "net_pay + sum(employer_costs)"
}
```

---

## Referencias (fuentes base)

- UMA 2026 (INEGI): https://www.inegi.org.mx/temas/uma/
- Decreto Subsidio al empleo (modificación 2026, DOF 31-dic-2025, vía SIDOF): http://sidofqa.segob.gob.mx/notas/5777649
- Tarifa ISR 2026 (SAT / Anexo 8 RMF 2026, DOF 28-dic-2025): https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf
- Reforma pensiones (tabla cuotas patronales C&V 2023–2030):
    - PWC (tabla transitoria): https://www.pwc.com/mx/es/impuestos/archivo/novedades-fiscales/2022/27-11-2022-incremento-de-cuotas-patronales-de-rama-de-cesantia-en-edad-avanzada.pdf
    - BDO (tabla transitoria + notas): https://www.bdomexico.com/getattachment/a4c6042c-54af-42e5-8039-61ae38b3bf1e/BDO-Articulo-AUMENTO-DE-LAS-APORTACIONES-PATRONALES-DE-CESANTIA-EN-EDAD-AVANZADA-Y-VEJEZ.pdf.aspx?ext=.pdf&lang=es-MX
- Ley del Seguro Social (IMSS): https://www.imss.gob.mx/sites/all/statics/pdf/leyes/LSS.pdf
- INFONAVIT (obligaciones patronales / aportaciones y descuentos): https://portalmx.infonavit.org.mx/wps/portal/infonavitmx/mx2/patrones/obligaciones/
