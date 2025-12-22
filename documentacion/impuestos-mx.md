México: cálculo de cargas de nómina (IMSS, INFONAVIT, ISR y Ahorro para el Retiro) — guía práctica 2025
Última actualización: 2025-12-19  
Alcance: cálculo de cargas / deducciones de nómina para sueldos y salarios en México (IMSS, INFONAVIT, ISR y AFORE/SAR).  
Nota rápida (importante): esto es una guía técnica para implementar cálculos; en la vida real hay casos especiales (incapacidades, ausentismos, variables integrables, topes, exentos, subsidios, etc.). Valida con tu contador/nómina y con las fuentes oficiales al cierre de cada año.
\*\*\*1) Unidades y bases que se repiten en todos los cálculos
UMA 2025
La Unidad de Medida y Actualización (UMA) para 2025 es:
| Año | UMA diaria | UMA mensual (diaria × 30.4) | UMA anual (mensual × 12) |
|---:|---:|---:|---:|
| 2025 | $113.14 | $3,439.46 | $41,273.52 |

> Referencia: INEGI publica los valores oficiales de UMA.  
> Variables clave (para programar)
> | Variable | Qué significa | Comentarios / uso típico |
> |---|---|---|
> | SD | Salario diario | En pesos/día. |
> | FI | Factor de integración | Integra aguinaldo, vacaciones y prima vacacional (para SDI/SBC). |
> | SDI | Salario Diario Integrado | Base típica para IMSS/INFONAVIT (antes de topes). |
> | SBC | Salario Base de Cotización | En práctica suele ser el SDI con topes y reglas de integración. |
> | UMA_d | UMA diaria | 113.14 (2025). |
> | UMA_m | UMA mensual | 3,439.46 (2025). |
> | tope_SBC | Tope del SBC | IMSS suele topar en 25 UMA (por día). |
> | dias_cot | Días cotizados del periodo | Para cuotas IMSS (usualmente por mes; RCV e INFONAVIT se pagan bimestralmente). |
> | exced_3UMA | Excedente sobre 3 UMA | max(0, min(SBC, tope_SBC) - 3\*UMA_d) (por día). |
> | prima_RT | Prima de Riesgo de Trabajo | Porcentaje anual del patrón (depende de siniestralidad y clase). |
> | base_ISR | Ingreso gravable del periodo | No es lo mismo que SDI/SBC; sale de percepciones gravadas del CFDI. |
> | periodo_ISR | Días del periodo para tarifa ISR | 1 (diario), 7 (semanal), 10 (decenal), 15 (quincenal), 30.4 (mensual). |
> _\*\*2) IMSS: cuotas obrero–patronales (y SAR/AFORE dentro de IMSS)
> El IMSS se calcula sobre SBC (salario base de cotización) con límites y reglas específicas. En términos de implementación, el patrón calcula:
> cuotas patronales (costo empresa), y
> cuotas obreras (retención al trabajador).
> 2.1 Resumen de tasas (lo que se multiplica por base)
> En esta tabla, cuando digo “%” es porcentaje sobre la base indicada.  
> Donde aplique “por día”, en código normalmente haces: monto = base_diaria _ días * tasa.
> | Concepto IMSS | Base típica | Patrón | Trabajador | Notas prácticas |
> |---|---:|---:|---:|---|
> | Riesgos de Trabajo (RT) | SBC | Variable (prima_RT) | 0% | Solo patrón. La prima depende de tu empresa y su siniestralidad. |
> | Enfermedades y Maternidad (EM) – Cuota fija | UMA_d | 20.4% | 0% | Es “fija” porque no depende del SBC, sino de UMA. |
> | EM – Excedente > 3 UMA | exced_3UMA | 1.10% | 0.40% | Solo aplica si SBC excede 3 UMA diarias. |
> | EM – Prestaciones en dinero | SBC | 0.70% | 0.25% | Aplica a todos. |
> | EM – Gastos médicos pensionados | SBC | 1.05% | 0.375% | Aplica a todos. |
> | Invalidez y Vida (IV) | SBC | 1.75% | 0.625% | Aplica a todos. |
> | Guarderías y Prest. Sociales (GPS) | SBC | 1.00% | 0% | Solo patrón. |
> | Retiro (R) | SBC | 2.00% | 0% | AFORE/SAR. En pagos IMSS suele ser bimestral. |
> | Cesantía y Vejez (CV) | SBC | Variable por rango (ver tabla 2.2) | 1.125% | AFORE/SAR. La tasa patronal sube gradualmente 2023–2030 según rango del SBC. |
> 2.2 Cesantía y Vejez: tasa patronal 2025 por rango del SBC (reforma 2020)
> Para 2025, la aportación patronal de CV depende del rango del SBC diario (comparado contra UMA y salario mínimo). Tabla resumida (columna 2025):
> | Rango de SBC diario | Tasa patronal CV 2025 |
> |---|---:|
> | 1.0 Salario Mínimo | 3.150% |
> | 1.01 SM a 1.50 UMA | 3.544% |
> | 1.51 a 2.00 UMA | 4.426% |
> | 2.01 a 2.50 UMA | 4.954% |
> | 2.51 a 3.00 UMA | 5.307% |
> | 3.01 a 3.50 UMA | 5.559% |
> | 3.51 a 4.00 UMA | 5.747% |
> | 4.01 UMA en adelante | 6.422% |
> Cómo aplicarlo en código (idea):
> Si el SBC_d es igual al salario mínimo diario (SMG), usa 3.150%.  
> Si es mayor a SMG, calcula ratio = SBC_d / UMA_d y selecciona el rango (1.01–1.5, 1.51–2.0, …, 4.01+).
> Nota: además existe una cuota social del gobierno (no es costo del patrón), y estas tasas siguen aumentando hasta 2030.
> 2.3 Fórmulas de referencia (por periodo)
> Usando SBC_d = min(SBC, 25*UMA_d) y exced_3UMA = max(0, SBC_d - 3*UMA_d):
> IMSS_patronal =
> RT: SBC_d * dias_cot \* prima_RT

- EM cuota fija: UMA_d _ dias_cot _ 0.204
- EM excedente >3UMA: exced_3UMA _ dias_cot _ 0.011
- EM prest. dinero: SBC_d _ dias_cot _ 0.007
- EM pensionados: SBC_d _ dias_cot _ 0.0105
- Invalidez y vida: SBC_d _ dias_cot _ 0.0175
- Guarderías: SBC_d _ dias_cot _ 0.01
- Retiro: SBC_d _ dias_cot _ 0.02
- Cesantía y vejez: SBC_d _ dias_cot _ tasa_CV_patronal_2025(rango)
  IMSS_trabajador =
  EM excedente >3UMA: exced_3UMA _ dias_cot _ 0.004
- EM prest. dinero: SBC_d _ dias_cot _ 0.0025
- EM pensionados: SBC_d _ dias_cot _ 0.00375
- Invalidez y vida: SBC_d _ dias_cot _ 0.00625
- Cesantía y vejez: SBC_d _ dias_cot _ 0.01125
  _\*\*3) INFONAVIT (aportación patronal + posible descuento de crédito)
  3.1 Aportación patronal INFONAVIT (costo empresa)
  La aportación patronal al INFONAVIT (fondo de vivienda) es:
  5% sobre el SBC (típicamente el mismo SBC usado para IMSS), usualmente en pago bimestral.
  Fórmula por periodo (si lo quieres provisionar):
  INFONAVIT_patronal = SBC_d _ dias_cot _ 0.05
  3.2 Amortización de crédito INFONAVIT (retención al trabajador, si aplica)
  Si el trabajador tiene crédito INFONAVIT, el patrón debe retener y enterar una amortización según el “Aviso de Retención” (ahí viene el tipo de descuento y el valor):
  | Tipo de descuento (ejemplos comunes) | Cómo se calcula (idea general) |
  |---|---|
  | Porcentaje | descuento = base _ % (base según aviso y reglas) |
  | Cuota fija en pesos | descuento = cuota_diaria _ días o prorrateo por periodo |
  | Veces salario mínimo / UMA | descuento = factor _ unidad \* días (según aviso) |
    > En implementación, lo correcto es: usar exactamente el tipo y factor que INFONAVIT te notifica para ese trabajador.
    > ***4) ISR (retención de sueldos y salarios) + Subsidio para el empleo (2025)
    > 4.1 ISR: algoritmo
    > Define base_ISR del periodo: suma de percepciones gravadas (y resta exentas).  
    > Selecciona la tarifa según tu periodo de pago (diario/semanal/decenal/quincenal/mensual).  
    > Busca el renglón donde cae base_ISR:
    > lim_inf <= base_ISR <= lim_sup (o “en adelante”).  
    > Calcula:
    > excedente = base_ISR - lim_inf
    > impuesto_marginal = excedente * (tasa/100)
    > ISR_calculado = cuota_fija + impuesto_marginal
    > 4.2 Tarifas ISR 2025 (sueldos y salarios) — estructura
    > Cada tabla usa estas columnas:
    > Límite inferior
    > Límite superior
    > Cuota fija
    > % sobre excedente del límite inferior
    > Tarifa diaria (cantidad de trabajo realizado; no días laborados)
    > | Límite inferior | Límite superior | Cuota fija | % excedente |
    > |---:|---:|---:|---:|
    > | 0.01 | 24.54 | 0.00 | 1.92 |
    > | 24.55 | 208.29 | 0.47 | 6.40 |
    > | 208.30 | 366.05 | 12.23 | 10.88 |
    > | 366.06 | 425.52 | 29.40 | 16.00 |
    > | 425.53 | 509.46 | 38.91 | 17.92 |
    > | 509.47 | 1,027.52 | 53.95 | 21.36 |
    > | 1,027.53 | 1,619.51 | 164.61 | 23.52 |
    > | 1,619.52 | 3,091.90 | 303.85 | 30.00 |
    > | 3,091.91 | 4,122.54 | 745.56 | 32.00 |
    > | 4,122.55 | 12,367.62 | 1,075.37 | 34.00 |
    > | 12,367.63 | En adelante | 3,878.69 | 35.00 |
    > Tarifa semanal (7 días)
    > | Límite inferior | Límite superior | Cuota fija | % excedente |
    > |---:|---:|---:|---:|
    > | 0.01 | 171.78 | 0.00 | 1.92 |
    > | 171.79 | 1,458.03 | 3.29 | 6.40 |
    > | 1,458.04 | 2,562.35 | 85.62 | 10.88 |
    > | 2,562.36 | 2,978.64 | 205.80 | 16.00 |
    > | 2,978.65 | 3,566.22 | 272.37 | 17.92 |
    > | 3,566.23 | 7,192.64 | 377.65 | 21.36 |
    > | 7,192.65 | 11,336.57 | 1,152.27 | 23.52 |
    > | 11,336.58 | 21,643.30 | 2,126.95 | 30.00 |
    > | 21,643.31 | 28,857.78 | 5,218.92 | 32.00 |
    > | 28,857.79 | 86,573.34 | 7,527.59 | 34.00 |
    > | 86,573.35 | En adelante | 27,150.83 | 35.00 |
    > Tarifa decenal (10 días)
    > | Límite inferior | Límite superior | Cuota fija | % excedente |
    > |---:|---:|---:|---:|
    > | 0.01 | 245.40 | 0.00 | 1.92 |
    > | 245.41 | 2,082.90 | 4.70 | 6.40 |
    > | 2,082.91 | 3,660.50 | 122.30 | 10.88 |
    > | 3,660.51 | 4,255.20 | 294.00 | 16.00 |
    > | 4,255.21 | 5,094.60 | 389.10 | 17.92 |
    > | 5,094.61 | 10,275.20 | 539.50 | 21.36 |
    > | 10,275.21 | 16,195.10 | 1,646.10 | 23.52 |
    > | 16,195.11 | 30,919.00 | 3,038.50 | 30.00 |
    > | 30,919.01 | 41,225.40 | 7,455.60 | 32.00 |
    > | 41,225.41 | 123,676.20 | 10,753.70 | 34.00 |
    > | 123,676.21 | En adelante | 38,786.90 | 35.00 |
    > Tarifa quincenal (15 días)
    > | Límite inferior | Límite superior | Cuota fija | % excedente |
    > |---:|---:|---:|---:|
    > | 0.01 | 368.10 | 0.00 | 1.92 |
    > | 368.11 | 3,124.35 | 7.05 | 6.40 |
    > | 3,124.36 | 5,490.75 | 183.45 | 10.88 |
    > | 5,490.76 | 6,382.80 | 441.00 | 16.00 |
    > | 6,382.81 | 7,641.90 | 583.65 | 17.92 |
    > | 7,641.91 | 15,412.80 | 809.25 | 21.36 |
    > | 15,412.81 | 24,292.65 | 2,469.15 | 23.52 |
    > | 24,292.66 | 46,378.50 | 4,557.75 | 30.00 |
    > | 46,378.51 | 61,838.10 | 11,183.40 | 32.00 |
    > | 61,838.11 | 185,514.30 | 16,130.55 | 34.00 |
    > | 185,514.31 | En adelante | 58,180.35 | 35.00 |
    > Tarifa mensual (Art. 96 LISR / RMF 2025 Anexo 8)
    > | Límite inferior | Límite superior | Cuota fija | % excedente |
    > |---:|---:|---:|---:|
    > | 0.01 | 746.04 | 0.00 | 1.92 |
    > | 746.05 | 6,332.05 | 14.32 | 6.40 |
    > | 6,332.06 | 11,128.01 | 371.83 | 10.88 |
    > | 11,128.02 | 12,935.82 | 893.63 | 16.00 |
    > | 12,935.83 | 15,487.71 | 1,182.88 | 17.92 |
    > | 15,487.72 | 31,236.49 | 1,640.18 | 21.36 |
    > | 31,236.50 | 49,233.00 | 5,004.12 | 23.52 |
    > | 49,233.01 | 93,993.90 | 9,236.89 | 30.00 |
    > | 93,993.91 | 125,325.20 | 22,665.17 | 32.00 |
    > | 125,325.21 | 375,975.61 | 32,691.18 | 34.00 |
    > | 375,975.62 | En adelante | 117,912.32 | 35.00 |
    > 4.3 Subsidio para el empleo (2025): cómo se aplica
    > Desde mayo 2024 el subsidio dejó de ser una tabla “variable” y ahora es una cuota mensual calculada como porcentaje de la UMA mensual.
    > Reglas clave para 2025:
    > Aplica a trabajadores con ingresos mensuales base para ISR que no excedan $10,171.00.
    > Monto mensual máximo: UMA_m × 13.8%.
    > Para pagos por periodos menores a un mes:  
    >  subsidio_periodo = (UMA_m * 13.8% / 30.4) * días_del_periodo  
    >  y no puede exceder el máximo mensual.
    > Enero 2025 es especial: se usa UMA 2024 y 14.39% (por la vigencia de UMA a partir de febrero).
    > Números aproximados (con UMA oficial):
    > | Caso | Fórmula | Monto aprox. |
    > |---|---:|---:|
    > | Subsidio mensual 2025 (feb–dic) | 3,439.46 × 13.8% | ~$474.65 (≈ $475) |
    > | Subsidio mensual enero 2025 | 3,300.53 × 14.39% | ~$474.95 |
    > | Subsidio diario 2025 (prorrateo) | 474.65 / 30.4 | ~$15.61 por día |
    > Cómo impacta el ISR:
    > ISR_a_retener = max(0, ISR_calculado - subsidio_periodo)  
    > Si el subsidio es mayor que el ISR del periodo, en la práctica se maneja como subsidio entregado (depende de tu implementación/CFDI y reglas fiscales). \***5) Checklist de implementación (lo que conviene modelar en un sistema)
    > Separar bases: base_ISR ≠ SBC.
    > Topes: IMSS/INFONAVIT topados (p.ej., 25 UMA) y excedentes (p.ej., 3 UMA).
    > Tablas por año: UMA, tarifas ISR, subsidio, tasa CV patronal cambian (o tienen transitorios).
    > Periodos: IMSS (mensual), RCV/INFONAVIT (bimestral) en enteros; en nómina puedes provisionar por periodo de pago.
    > Crédito INFONAVIT: siempre se toma del Aviso de Retención y su tipo.
    > RT (prima de riesgo): es del patrón y puede cambiar cada año.
    > \*\*\*Referencias oficiales (para respaldar tablas y reglas)
    > INEGI — valores oficiales de UMA 2025:  
    >  https://www.inegi.org.mx/temas/uma/
    > SAT — Anexo 8 RMF 2025 (tarifas ISR para retenciones):  
    >  https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2025/rmf/anexos/Anexo8_RMF2025-30122024.pdf
    > DOF / SIDO F — Decreto que modifica el subsidio para el empleo (vigente 2025):  
    >  https://sidof.segob.gob.mx/notas/docFuente/5746529
    > IMSS — material técnico de cuotas y pagos (SUA/Pago global):  
    >  https://www.imss.gob.mx/sites/all/statics/pdf/manuales/Man_Pago_G/19_pago_global.pdf
    > DOF (reforma pensiones 2020, transitorios de aportación patronal CV):  
    >  https://www.diputados.gob.mx/LeyesBiblio/ref/lss/LSS_ref25_16dic20.pdf
