# Guía de implementación: Nómina (México) — IMSS, INFONAVIT, ISR y SAR/AFORE (2026)

**Fecha de actualización:** 2026-01-08  
**Objetivo:** documentación **legal + técnica**, lista para que un agente/ingeniero implemente el cálculo de **retenciones** (trabajador) y **aportaciones** (patrón) en un motor de nómina.

> ⚠️ Nota: esto resume reglas generales. Contrato individual/CCT y políticas internas pueden dar beneficios superiores (nunca inferiores a la ley).

---

## 0) “Mapa mental” rápido (qué es deducción vs costo del patrón)

En una nómina típica existen **dos mundos**:

1) **Retenciones al trabajador (bajan el neto)**
- ISR (impuesto)
- Cuotas IMSS **obreras** (una parte de Enfermedades y Maternidad + Invalidez y Vida + Cesantía y Vejez)
- Amortización INFONAVIT (si el trabajador tiene crédito)

2) **Obligaciones del patrón (NO bajan el neto, suben el costo empresa)**
- IMSS **patronal** (RT, Guarderías, parte patronal de E&M, Invalidez y Vida, RCV, etc.)
- INFONAVIT 5% (aportación patronal a vivienda)
- Aportaciones patronales al retiro (Retiro 2% + parte patronal de Cesantía y Vejez)

Tu sistema debe poder **generar ambos**:
- **Recibo** (percepciones/deducciones del trabajador).
- **Costo patronal** (obligaciones para entero).

---

## 1) Parámetros 2026 (constantes que SÍ cambian)

> **Clave de implementación:** parametriza por **vigencia** (fecha).  
> En México, hay cambios típicos: **salario mínimo (1-ene)** y **UMA (1-feb)**.

### 1.1 UMA (para topes IMSS y varias cuotas)
| Concepto | Vigencia | Diario | Mensual | Anual |
|---|---:|---:|---:|---:|
| UMA 2025 | 01-feb-2025 → 31-ene-2026 | 113.14 | 3,439.46 | 41,273.52 |
| UMA 2026 | 01-feb-2026 → 31-ene-2027 | 117.31 | 3,566.22 | 42,794.64 |

**Implicación práctica:** para **nóminas de enero 2026** (días del 1 al 31), en IMSS/INFONAVIT se siguen usando valores UMA 2025. A partir del **1-feb-2026**, cambias a UMA 2026.

### 1.2 Salario mínimo 2026 (para referencias en algunas cuotas/umbrales)
| Zona | Salario mínimo diario 2026 |
|---|---:|
| Zona General | 315.04 |
| Zona Libre de la Frontera Norte (ZLFN) | 440.87 |

> Esto importa, por ejemplo, en la tabla transitoria de **Cesantía y Vejez patronal** que usa el umbral “1.00 SM”.

---

## 2) Periodicidad de enteros (lo que se entera y cada cuánto)

| Concepto | Se calcula en nómina | Se entera/paga a autoridad | Periodicidad típica de entero |
|---|---|---|---|
| ISR retenido (sueldos) | cada corrida | SAT (declaración de entero de retenciones) | **Mensual** (generalmente a más tardar día 17 del mes siguiente; puede haber prórroga por RFC) |
| Cuotas IMSS (COP) | puedes provisionar por corrida | IMSS (SUA / pago) | **Mensual** (mes vencido) |
| INFONAVIT 5% + amortización crédito | puedes provisionar por corrida | INFONAVIT | **Bimestral** (bimestre vencido) |
| Aportaciones RCV (Retiro/Cesantía y Vejez) | puedes provisionar por corrida | IMSS/SAR (vía SUA) | **Bimestral** (vía SUA, ligado a INFONAVIT) |

> En software, lo normal es:
> - Calcular por nómina (semanal/quincenal) para el **recibo**,  
> - y acumular/provisionar para los **enteros** mensual/bimestral.

---

## 3) IMSS: base, topes y cuotas (resumen implementable)

### 3.1 Variables que tu motor debe tener (por trabajador)
- **SD** = Salario Diario (sueldo base diario).
- **SBC** = Salario Base de Cotización (IMSS): integra prestaciones conforme LSS (p. ej., prima vacacional, aguinaldo, etc.).
- **Días cotizables** en el periodo (normalmente 7/14/15/30, etc.).
- **Clase de riesgo** / **prima de RT** (Riesgo de Trabajo) del patrón.

### 3.2 Topes IMSS 2026 (cambian por UMA)
**Tope SBC:** `SBC_topado = min(SBC, 25 * UMA_diaria_vigente)`

| Vigencia | 25 UMA diario | 3 UMA diario (umbral E&M excedente) | Cuota fija E&M (20.4% UMA diaria por día) |
|---|---:|---:|---:|
| Enero 2026 (usa UMA 2025) | 2,828.50 | 339.42 | 23.0806 |
| Feb–Dic 2026 (usa UMA 2026) | 2,932.75 | 351.93 | 23.9312 |

> Si un periodo “cruza” 1-feb-2026, lo correcto es partir días y aplicar UMA según fecha.

### 3.3 Cuotas IMSS (modelo de cálculo por periodo)
En general, cada rubro se calcula así:

`cuota = base * tasa * días`  (salvo cuotas fijas)

**Rubro típico** | **Quién paga** | **Base** | **Regla**
---|---|---|---
Riesgo de trabajo (RT) | Patrón | `SBC_topado` | `RT = SBC_topado * tasa_RT * días`
Guarderías y Prestaciones Sociales | Patrón | `SBC_topado` | `1.00%`
Retiro | Patrón | `SBC_topado` | `2.00%`
Cesantía y Vejez (CV) – parte obrera | Trabajador (retención) | `SBC_topado` | `1.125%`
Cesantía y Vejez (CV) – parte patronal | Patrón | `SBC_topado` | **tasa transitoria 2026** (ver 3.4)
Invalidez y Vida | Patrón / Trabajador | `SBC_topado` | Patrón `1.75%`, Trabajador `0.625%`
Enfermedades y Maternidad – cuota fija | Patrón | `UMA_diaria` | `0.204 * UMA_diaria * días`
Enfermedades y Maternidad – excedente > 3 UMA | Patrón / Trabajador | `max(0, SBC_topado - 3*UMA_diaria)` | Patrón `1.10%`, Trabajador `0.40%`
E&M – Prestaciones en dinero | Patrón / Trabajador | `SBC_topado` | Patrón `0.70%`, Trabajador `0.25%`
E&M – Gastos médicos pensionados | Patrón / Trabajador | `SBC_topado` | Patrón `1.05%`, Trabajador `0.375%`

> **Nota de exactitud:** SUA redondea y calcula con reglas específicas; si buscas “match” 1:1 con SUA/CONTPAQi, tendrás que replicar su orden de redondeo (por trabajador, por concepto, por mes).

### 3.4 Cesantía y Vejez (CV) — tasa patronal 2026 (reforma pensiones 2020)
En 2026 la cuota patronal de CV sigue el esquema transitorio (sube cada año hasta 2030).

| Rango de SBC diario | Tasa patronal CV 2026 |
|---|---:|
| = 1.00 SM | 3.150% |
| 1.01 SM a 1.50 UMA | 3.680% |
| 1.51 a 2.00 UMA | 4.850% |
| 2.01 a 2.50 UMA | 5.560% |
| 2.51 a 3.00 UMA | 6.030% |
| 3.01 a 3.50 UMA | 6.360% |
| 3.51 a 4.00 UMA | 6.610% |
| 4.01 UMA en adelante | 7.510% |

Implementación:
- Determina el **SBC diario** (topado).
- Si `SBC == salario_minimo_diario` → tasa 3.150%.
- Si `SBC > salario_minimo_diario` → usa el rango por UMA.

> Si manejas ZLFN, “SM” cambia; por eso conviene almacenar `salario_minimo_diario` por zona.

---

## 4) INFONAVIT (aportación patronal + crédito)

### 4.1 Aportación patronal 5%
- **Quién paga:** patrón.
- **Base:** típicamente `SBC_topado`.
- **Tasa:** `5%`.
- **Entero:** bimestral.

`aport_infonavit = SBC_topado * 0.05 * días`

### 4.2 Crédito INFONAVIT (amortización)
- **Quién paga:** trabajador (retención) *y/o* patrón, según el tipo de aviso de retención.
- **Regla técnica:** **no inventes fórmulas**: el INFONAVIT notifica el tipo y factor en el **Aviso de Retención**.

Tipos comunes (depende del aviso):
| Tipo (ejemplos) | Cómo se aplica |
|---|---|
| Porcentaje | `descuento = base * %` (base según aviso) |
| Cuota fija | `descuento = cuota_diaria * días` o prorrateo |
| Veces salario mínimo / UMA | `descuento = factor * unidad * días` (según aviso) |

### 4.3 Reforma Art. 29 (atención 2026)
Hubo ajuste normativo al **Art. 29 de la Ley del INFONAVIT** con impacto en cómo/ cuándo se aplican descuentos de crédito, y el IMSS actualizó criterios en SUA para reflejarlo (en comunicaciones del IMSS/INFONAVIT se menciona el bimestre **25/06 (Nov–Dic 2025)** con presentación **17-ene-2026**).

**Recomendación de implementación:** modela la amortización como un módulo separado, controlado por:
- el **Aviso de Retención** vigente, y
- reglas de negocio por tipo de incapacidad/ausencia, conforme a la interpretación vigente de INFONAVIT.

---

## 5) ISR (retención de sueldos y salarios) + Subsidio para el empleo (2026)

### 5.1 ISR: algoritmo base (por periodo)
1) Calcula `base_ISR` = suma de percepciones **gravadas** del periodo (resta exentas).  
2) Elige la **tarifa** según periodicidad (diario, semanal 7, decenal 10, quincenal 15, mensual).  
3) Ubica el renglón donde cae `base_ISR`.  
4) Calcula:

```text
isr_marginal = (base_ISR - limite_inferior) * (tasa / 100)
isr = cuota_fija + isr_marginal
```

5) Aplica **Subsidio para el empleo** (si procede) como acreditamiento contra ISR:

```text
isr_neto = max(0, isr - subsidio)
```

> Si además manejas “impuesto local sobre nómina” retenido al trabajador (raro), el Art. 96 LISR permite deducirlo del ingreso mensual para calcular ISR (si la tasa local ≤ 5%).

---

### 5.2 Subsidio para el empleo 2026 (SUE)
Desde la modificación publicada el **31-dic-2025**, el subsidio se maneja como **cuota uniforme** (no por tablas variables), y se calcula con UMA.

**Límite de ingresos (mensual) para tener derecho:** **$ 11,492.66**.

**Monto del subsidio (mes completo):**
- **Enero 2026 (transitorio):** UMA mensual 2025 × 15.59% = **$ 536.21**
- **Feb–Dic 2026:** UMA mensual 2026 × 15.02% = **$ 535.65**

Para periodos menores al mes, una forma estándar de prorrateo:
- `subsidio_diario = UMA_diaria * porcentaje`
- `subsidio_periodo = subsidio_diario * días_pagados_en_periodo`

Ejemplos (Feb–Dic 2026):
- Subsidio diario ≈ **$ 17.62**
- Subsidio semanal (7 días) ≈ **$ 123.34**
- Subsidio quincenal (15 días) ≈ **$ 264.30**

> Para el **límite de ingresos** en periodos menores, puedes convertirlo proporcionalmente:  
> `limite_periodo ≈ (11,492.66 / 30.4) * días`.  
> (Diario ≈ 378.05; semanal ≈ 2,646.34; quincenal ≈ 5,670.72)

---

### 5.3 Tarifas ISR 2026 (Anexo 8 RMF 2026)

> Estas tablas están diseñadas para **retención de sueldos** conforme a Art. 96 LISR, RLISR y RMF (Anexo 8).

#### Tarifa diaria (en días)
| Límite inferior | Límite superior | Cuota fija | % excedente |
|---:|---:|---:|---:|
| 0.01 | 27.78 | 0.00 | 1.92 |
| 27.79 | 235.81 | 0.53 | 6.40 |
| 235.82 | 414.41 | 13.85 | 10.88 |
| 414.42 | 481.73 | 33.28 | 16.00 |
| 481.74 | 576.76 | 44.05 | 17.92 |
| 576.77 | 1,163.25 | 61.08 | 21.36 |
| 1,163.26 | 1,833.44 | 186.35 | 23.52 |
| 1,833.45 | 3,500.35 | 343.98 | 30.00 |
| 3,500.36 | 4,667.13 | 844.05 | 32.00 |
| 4,667.14 | 14,001.38 | 1,217.42 | 34.00 |
| 14,001.39 | En adelante | 4,391.07 | 35.00 |

#### Tarifa semanal (7 días)
| Límite inferior | Límite superior | Cuota fija | % excedente |
|---:|---:|---:|---:|
| 0.01 | 194.46 | 0.00 | 1.92 |
| 194.47 | 1,650.67 | 3.71 | 6.40 |
| 1,650.68 | 2,900.87 | 96.95 | 10.88 |
| 2,900.88 | 3,372.11 | 232.96 | 16.00 |
| 3,372.12 | 4,037.32 | 308.35 | 17.92 |
| 4,037.33 | 8,142.75 | 427.56 | 21.36 |
| 8,142.76 | 12,834.08 | 1,304.45 | 23.52 |
| 12,834.09 | 24,502.45 | 2,407.86 | 30.00 |
| 24,502.46 | 32,669.91 | 5,908.35 | 32.00 |
| 32,669.92 | 98,009.66 | 8,521.94 | 34.00 |
| 98,009.67 | En adelante | 30,737.49 | 35.00 |

#### Tarifa decenal (10 días)
| Límite inferior | Límite superior | Cuota fija | % excedente |
|---:|---:|---:|---:|
| 0.01 | 277.80 | 0.00 | 1.92 |
| 277.81 | 2,358.10 | 5.30 | 6.40 |
| 2,358.11 | 4,144.10 | 138.50 | 10.88 |
| 4,144.11 | 4,817.30 | 332.80 | 16.00 |
| 4,817.31 | 5,767.60 | 440.50 | 17.92 |
| 5,767.61 | 11,632.50 | 610.80 | 21.36 |
| 11,632.51 | 18,334.40 | 1,863.50 | 23.52 |
| 18,334.41 | 35,003.50 | 3,439.80 | 30.00 |
| 35,003.51 | 46,671.30 | 8,440.50 | 32.00 |
| 46,671.31 | 140,013.80 | 12,174.20 | 34.00 |
| 140,013.81 | En adelante | 43,910.70 | 35.00 |

#### Tarifa quincenal (15 días)
| Límite inferior | Límite superior | Cuota fija | % excedente |
|---:|---:|---:|---:|
| 0.01 | 416.70 | 0.00 | 1.92 |
| 416.71 | 3,537.15 | 7.95 | 6.40 |
| 3,537.16 | 6,216.15 | 207.75 | 10.88 |
| 6,216.16 | 7,225.95 | 499.20 | 16.00 |
| 7,225.96 | 8,651.40 | 660.75 | 17.92 |
| 8,651.41 | 17,448.75 | 916.20 | 21.36 |
| 17,448.76 | 27,501.60 | 2,795.25 | 23.52 |
| 27,501.61 | 52,505.25 | 5,159.70 | 30.00 |
| 52,505.26 | 70,006.95 | 12,660.75 | 32.00 |
| 70,006.96 | 210,020.70 | 18,261.30 | 34.00 |
| 210,020.71 | En adelante | 65,866.05 | 35.00 |

#### Tarifa mensual
| Límite inferior | Límite superior | Cuota fija | % excedente |
|---:|---:|---:|---:|
| 0.01 | 844.59 | 0.00 | 1.92 |
| 844.60 | 7,168.51 | 16.22 | 6.40 |
| 7,168.52 | 12,598.02 | 420.95 | 10.88 |
| 12,598.03 | 14,644.64 | 1,011.68 | 16.00 |
| 14,644.65 | 17,533.64 | 1,339.14 | 17.92 |
| 17,533.65 | 35,362.83 | 1,856.84 | 21.36 |
| 35,362.84 | 55,736.68 | 5,665.16 | 23.52 |
| 55,736.69 | 106,410.50 | 10,457.09 | 30.00 |
| 106,410.51 | 141,880.66 | 25,659.23 | 32.00 |
| 141,880.67 | 425,641.99 | 37,009.69 | 34.00 |
| 425,642.00 | En adelante | 133,488.54 | 35.00 |

---

## 6) Checklist técnico (para implementarlo sin “sorpresas”)

1) **Separar bases:** `base_ISR` ≠ `SBC`.
2) **Vigencias por fecha:** salario mínimo (1-ene) y UMA (1-feb).  
3) **Topes IMSS:** 25 UMA y el excedente > 3 UMA afectan fórmulas.
4) **Orden de redondeo:** define si redondeas por concepto/empleado/periodo.
5) **Acumulación vs entero:** calcula por corrida, pero entera mensual/bimestral.
6) **INFONAVIT crédito:** se rige por Aviso de Retención + reglas vigentes (ojo Art. 29).
7) **Tablas ISR:** selecciona tabla correcta por periodicidad (7/10/15/30).
8) **Subsidio 2026:** cuota uniforme, con regla transitoria en enero 2026.

---

## Referencias (para respaldar números 2026)
- INEGI — UMA 2026 (vigente desde 1-feb-2026):  
  https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/uma/uma2026.pdf
- INEGI — UMA 2025 (vigente 1-feb-2025 a 31-ene-2026):  
  https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/uma/uma2025.pdf
- SAT — Anexo 8 RMF 2026 (tarifas ISR de retención):  
  https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf
- DOF (SIDOF) — Decreto que modifica el subsidio para el empleo (publicado 31-dic-2025):  
  https://sidofqa.segob.gob.mx/notas/5777649
- IMSS — SUA (avisos / actualizaciones):  
  https://www.imss.gob.mx/servicios/sua
- LSS (Cámara de Diputados) — referencia legal de cuotas y transitorios (incluye tabla base CV):  
  https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf
- CONASAMI / notas periodísticas con base en DOF — salario mínimo 2026 (general y ZLFN):  
  https://www.eleconomista.com.mx/politica/salario-minimo-mexico-2026-aumento-conasami-20251224-740275.html
- INFONAVIT — comunicado de ampliación de plazo (Art. 29):  
  https://portal.infonavit.org.mx/wps/wcm/connect/4b7e824d-86fb-4eaa-ab4f-acde0f9a2de3/AMPLIACION_PLAZO_CUMPLIMIENTO_ART_29.pdf?MOD=AJPERES
