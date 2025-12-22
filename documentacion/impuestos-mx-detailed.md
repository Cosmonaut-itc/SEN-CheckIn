Nómina México: IMSS, INFONAVIT, ISR, Subsidio al empleo y SAR/AFORE (2025)
Última actualización: 2025-12-22  
Propósito: documentación de reglas y fórmulas para implementar el cálculo de retenciones y aportaciones de nómina en México (enfocado a 2025).  
Aviso: esto no es asesoría legal/fiscal. La nómina real depende de incidencias, exentos, contratos, criterios internos y actualizaciones oficiales.
\*\*\*0) Constantes 2025 que tu motor debe parametrizar
UMA 2025
UMA diaria: $113.14
UMA mensual: $3,439.46
UMA anual: $41,273.52
Vigencia: estos valores entran en vigor a partir del 1 de febrero de cada año (en 2025, desde el 01-feb-2025).

> Para cualquier cálculo “en UMAs” (topes, 3 UMA, 25 UMA, etc.), usa el valor vigente del periodo.
> Subsidio al empleo 2025
> Límite de ingresos (base mensual ISR) para aplicar: $10,171.00
> Monto mensual máximo: $475.00
> Regla de enero 2025: durante enero se aplicó un porcentaje provisional sobre UMA 2024, pero el monto mensual resultó igualmente $475.00.  
> Regla crítica 2025: si el ISR del mes es menor al subsidio, no hay remanente pagable ni acumulable.
> \*\*\*1) La distinción que evita bugs: deducción vs costo patronal vs retención
> En un recibo de nómina conviven tres “familias” de números:

1.  Deducciones del trabajador (afectan el neto)  
    Se descuentan del pago al trabajador (p. ej. ISR retenido, cuotas obreras IMSS, amortización INFONAVIT).
2.  Aportaciones/costos patronales (NO afectan el neto, sí el costo empresa)  
    Son obligación del patrón (p. ej. IMSS patronal, INFONAVIT 5% patronal, Riesgo de trabajo, Guarderías 1%, SAR 2%, etc.).
3.  Montos informativos (se reportan pero no necesariamente impactan neto)  
     Ejemplo común: mostrar “ISR antes de subsidio” y “Subsidio acreditado” como renglones explicativos.
    > Regla de oro para tu sistema: separa explícitamente employee*withholdings (neto) de employer_costs (costo).  
    > Si mezclas ambos en una sola “columna de deducciones” acabarás con reportes confusos y netos incorrectos.
    > ***2) Entradas mínimas para calcular
    > Por trabajador (por periodo de pago)
    > dias_cotizados: días por los que cotiza (incluye descansos pagados; excluye ausencias sin goce según tu política).
    > SD: salario diario (no integrado).
    > SBC_diario: salario base de cotización diario (integrado) para IMSS/INFONAVIT/SAR.
    > percepciones_gravadas_ISR: percepciones sujetas a ISR (en el periodo).
    > percepciones_exentas_ISR: exentas (vacaciones exentas, parte exenta de aguinaldo, etc.).
    > infonavit_credito: si tiene crédito y el tipo de descuento (porcentaje / cuota fija / VSM u otro) + el valor vigente del aviso INFONAVIT.
    > politica_absorcion (opcional): si el patrón absorbe cuotas obreras y/o ISR (ver sección 10).
    > Por patrón / configuración global
    > UMA_diaria, UMA_mensual (valores vigentes).
    > tasa_riesgo_trabajo (prima RT del patrón según su siniestralidad/clase).
    > estado / isn_rate (impuesto estatal sobre nóminas).
    > Tablas anuales (ISR Anexo 8, CV patronal 2025, etc.).
    > ***3) Bases: SBC vs base ISR
    > 3.1 Salario Base de Cotización (SBC)
    > Se usa para IMSS + INFONAVIT + SAR/AFORE.
    > SBC_periodo = SBC_diario * dias*cotizados
    > Topes (implementación):
    > La LSS establece un límite superior (históricamente “25 veces salario mínimo”). En la práctica moderna, los sistemas lo parametrizan y operan en UMAs.  
    >  Recomendación: SBC_diario = min(SBC_diario, 25 * UMA*diaria) (si tu operación lo requiere y coincide con tu interpretación/reglas vigentes).
    > Nota: El tope exacto y su “unidad” pueden ser un tema de actualización/criterio; por eso conviene parametrizarlo y documentar la decisión.
    > 3.2 Base ISR (salario gravable)
    > Se usa para ISR retenido. No es igual al SBC.
    > base_ISR_periodo = percepciones_gravadas_ISR_periodo - (deducciones_aplicables_en_nomina si proceden)
    > Ojo: la mayoría de deducciones personales no se aplican en nómina; se aplican en anual.
    > ***4) Tabla “qué va en deducción vs costo patronal”
    > | Concepto | ¿Quién lo paga? | ¿Se descuenta al trabajador? | Base típica | Comentario de implementación |
    > |---|---|---:|---|---|
    > | ISR retenido | Trabajador (retenido por patrón) | ✅ Sí | Base ISR | Retención: el patrón entera al SAT. |
    > | Subsidio al empleo (2025) | Beneficio fiscal (reduce ISR) | ❌ No (no es deducción) | Base ISR mensual | En CFDI se registra como OtrosPagos (no como deducción). |
    > | Cuotas obreras IMSS (E&M excedente, PD, GMP, IV) | Trabajador | ✅ Sí (salvo absorción) | SBC (y excedente sobre 3 UMA) | Si patrón absorbe, debes “gross-up” (ver sección 10). |
    > | IMSS patronal (E&M cuota fija, PD, GMP, IV, Guarderías, RT) | Patrón | ❌ No | UMA y/o SBC | Es costo empresa. |
    > | SAR (Retiro 2%) | Patrón | ❌ No | SBC | Costo empresa, va a la AFORE vía IMSS. |
    > | Cesantía y Vejez | Ambos | ✅ Parte obrera / ❌ parte patronal | SBC | Patrón 2025: tasa variable por rango; Obrero 1.125%. |
    > | INFONAVIT 5% | Patrón | ❌ No | SBC | Aportación patronal (no confundir con crédito). |
    > | Crédito INFONAVIT (amortización) | Trabajador | ✅ Sí | Según aviso INFONAVIT | Descuento y entero bimestral (acumulado por nómina). |
    > | Impuesto estatal sobre nóminas (ISN) | Patrón | ❌ No | Base estatal | Tasa depende del estado (configurable). |
    > ***5) IMSS: desglose útil para ingeniería
    > La LSS divide IMSS en ramos. Para nómina, conviene implementar un breakdown determinístico (y luego sumar).
    > 5.1 Enfermedades y Maternidad (E&M)
    > Componentes prácticos:
    > Cuota fija (patronal) (ya vigente):  
    >  E&M_CF_pat = UMA_diaria * dias*cotizados * 20.4%
    > Excedente sobre 3 UMA (solo si SBC*diario > 3*UMA_diaria):  
    >  base_excedente = (SBC_diario - 3*UMA_diaria) * dias*cotizados  
    >  E&M_exc_pat = base_excedente * 1.1%  
    >  E&M*exc_obr = base_excedente * 0.4%
    > Prestaciones en dinero:  
    >  PD*pat = SBC_periodo * 0.70%  
    >  PD*obr = SBC_periodo * 0.25%
    > Gastos médicos pensionados:  
    >  GMP*pat = SBC_periodo * 1.05%  
    >  GMP*obr = SBC_periodo * 0.375%
    > 5.2 Invalidez y Vida (IV)
    > IV*pat = SBC_periodo * 1.75%
    > IV*obr = SBC_periodo * 0.625%
    > 5.3 Guarderías y Prestaciones Sociales (GPS)
    > GPS*pat = SBC_periodo * 1.00%
    > 5.4 Riesgos de Trabajo (RT)
    > RT*pat = SBC_periodo * prima*RT
    > prima_RT es específica del patrón (según su clasificación y siniestralidad).
    > 5.5 SAR / Retiro
    > Retiro_pat = SBC_periodo * 2.00%
    > 5.6 Cesantía y Vejez (C&V)
    > Obrero (constante):  
    >  CV*obr = SBC_periodo * 1.125%
    > Patrón (2025): usa tabla por rango (aplicación gradual 2023–2030).  
    >  Para 2025, tasas patronales por SBC expresado en UMAs:
    > | SBC del trabajador | Cuota patronal C&V 2025 |
    > |---|---:|
    > | 1.00 SM | 3.150% |
    > | 1.01 SM a 1.50 UMA | 3.544% |
    > | 1.51 a 2.00 UMA | 4.426% |
    > | 2.01 a 2.50 UMA | 4.954% |
    > | 2.51 a 3.00 UMA | 5.307% |
    > | 3.01 a 3.50 UMA | 5.559% |
    > | 3.51 a 4.00 UMA | 5.747% |
    > | 4.01 UMA en adelante | 6.422% |
    > Implementación:
    > Calcula multiplo*UMA = SBC_diario / UMA_diaria
    > Selecciona el rango y su tasa tasa_CV_pat_2025
    > CV_pat = SBC_periodo * tasa*CV_pat_2025
    > *\*\*6) INFONAVIT: 2 cosas distintas (y se confunden TODO el tiempo)
    > 6.1 Aportación patronal 5%
    > Esto no es un descuento al trabajador.
    > INFONAVIT*pat = SBC_periodo * 5%
    > 6.2 Amortización de crédito INFONAVIT (descuento al trabajador)
    > Esto sí es deducción.
    > Depende del “aviso” del INFONAVIT: puede ser porcentaje, cuota fija, o modalidad ligada a VSM/UMA según el crédito.
    > Recomendación de ingeniería: modela el crédito como una regla externa y evita “inferir” montos sin el aviso.
    > Modelo recomendado:
    > {
    > "infonavit_credit": {
        "active": true,
        "discount_type": "percentage|fixed_amount|vsm",
        "discount_value": 0.20,
        "value_periodicity": "daily|weekly|biweekly|monthly|bimonthly",
        "source": "aviso_infonavit"
    }
    }
    Luego:
    Convierte el valor a tu periodicidad (weekly, quincenal, etc.)
    Aplica el descuento y acumula para entero bimestral.
    \*\*\*7) ISR retenido (y subsidio al empleo 2025)
    7.1 ISR del periodo
    Algoritmo estándar con tarifa:
4.  base_ISR = percepciones_gravadas_ISR_periodo
5.  Busca el renglón (límites y cuota fija) en la tarifa correspondiente a tu periodicidad (diaria, semanal, quincenal, mensual…).
6.  ISR_causado = cuota_fija + (base_ISR - limite_inferior) \* tasa_marginal
    > Fuente de las tarifas: SAT / Resolución Miscelánea / Anexo 8 (actualiza cada año).  
    > Para evitar errores, trata la tarifa como dataset versionado (no hardcode “a mano” en lógica).
    > 7.2 Subsidio al empleo (2025)
    > Implementación práctica:
    > Determina subsidio_periodo (prorrateado) si el trabajador cumple condición.
    > Prorrateo sugerido: subsidio_diario = 475.00 / 30.4 y multiplicas por dias_pagados_del_periodo (sin exceder máximo mensual).
    > subsidio_aplicado = min(ISR_causado, subsidio_periodo)
    > ISR_retenido = ISR_causado - subsidio_aplicado
    > subsidio_no_aplicado = subsidio_periodo - subsidio_aplicado → en 2025 no se paga ni se acumula (informativo).
    > 7.3 CFDI (nota rápida)
    > ISR retenido → Deducciones
    > Subsidio al empleo → OtrosPagos/SubsidioAlEmpleo  
    >  (evita modelarlo como “deducción negativa”).
    > \*\*\*8) SAR/AFORE (ahorro para el retiro)
    > En nómina normalmente se ve como:
    > Retiro 2% (patrón) → costo
    > Cesantía y Vejez → patrón + obrero (ver 5.6)
    > El depósito final se administra en AFORE vía IMSS.
    > Modelo de configuración:
    > {
    > "sar": {
        "retiro_pat": 0.02,
        "cesantia_vejez_pat": "tabla_2025",
        "cesantia_vejez_obr": 0.01125
    }
    }
    ***9) Impuesto estatal sobre nóminas (ISN)
    No es federal y varía por entidad.
    En sistemas serios es configurable por estado y (a veces) por tipo de percepción que integra la base estatal.
    Modelo:
    {
    "state_payroll_tax": {
    "state": "JAL",
    "rate": 0.02,
    "base_rule": "percepciones_gravadas|percepciones_totales|config"
    }
    }
    ***10) “Absorber” vs “Reportar” (para que tu sistema no se mienta a sí mismo)
    10.1 Reportar
    Significa mostrar renglones (IMSS, INFONAVIT, ISR, etc.) en un reporte.
    Si es deducción real del trabajador → baja el neto.
    Si es costo patronal → NO baja el neto, pero sí suma al costo total empresa.
    10.2 Absorber
    Significa que el patrón decide pagar por cuenta del trabajador algo que normalmente se le retiene.
    Ejemplos típicos:
    “La empresa absorbe el IMSS obrero”
    “La empresa absorbe el ISR”
    Implicación técnica:  
    Absorber manteniendo el mismo neto es un gross-up: el pago “extra” puede generar ISR adicional (y potencialmente integrar a SBC), así que no es una suma simple.
    Estrategias:
    fórmula cerrada (si el ISR se mantiene en el mismo tramo y no hay otras interacciones), o
    iteración hasta converger (común en payroll engines).
    Recomendación de implementación:
    Flags:
    absorb_imss_obrero
    absorb_isr
    absorb_infonavit_credit (raro, pero posible)
    Tres vistas:
    net_pay_detail (solo lo que afecta neto)
    employer_cost_detail (costos del patrón)
    informational_lines (p. ej. ISR antes/subsidio)
    ***11) Especificación de salida recomendada (para el agente)
    Formato sugerido por empleado:
    {
    "employee_id": "003",
    "period": {"type": "weekly", "days": 7},
    "bases": {
    "sbc_daily": 293.31,
    "sbc_period": 2053.17,
    "isr_base_period": 1951.60
    },
    "employee_withholdings": {
    "imss_obrero": {
    "em_exc": 0.00,
    "pd": 5.13,
    "gmp": 7.70,
    "iv": 12.83,
    "total": 25.66
    },
    "cv_obrero": 23.10,
    "isr_withheld": 0.00,
    "infonavit_credit": 0.00
    },
    "employer_costs": {
    "imss_patronal": {
    "em_cf": 290.60,
    "em_exc": 0.00,
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
    "net_pay": 1951.60,
    "company_cost": 1951.60 + (sum employer_costs)
    }
    ***Referencias
    UMA 2025 (INEGI / DOF): https://www.inegi.org.mx/temas/uma/
    Ley del Seguro Social (IMSS): https://www.imss.gob.mx/sites/all/statics/pdf/leyes/LSS.pdf
    Manual IMSS (SUA / referencias de tasas): https://www.imss.gob.mx/sites/all/statics/sua/pdf/19_pago_oportuno.pdf
    INFONAVIT (aportaciones y descuentos): https://portalmx.infonavit.org.mx/wps/portal/infonavitmx/mx2/patrones/obligaciones/!ut/p/z1/jZBNj4IwEIB_iwevU5CkgB90SAnbpGJrrFjIVIdipVY1Vv-8zQQEkuUmvXP7MJtOHPmA5xkF5bCz2sS5a0M8dX4p3bqQqj0gGFQXg6u8CcnN7o0e5QO1JjQ0A3o2Y1IHBp4p7TtP_0y8d9c7_c6uR9xQqzZB9zB0lpb-kcmfOodC2xkJ4Qy9Y0C1g0xydZxD9o2x7XJ0bGf1wZ8x4lEm0sQ0r4oP0gYjV1nB2yL8k25hZp6y8Z6ztnM2o_4k7oO5r6GqF3s5l7fA2a1p7Q!!/
    Subsidio al empleo 2025 (resumen con links DOF): https://www.indetec.gob.mx/noticias_interes/Modificaciones_al_subsidio_al_empleo_para_2025
    Tarifa ISR 2025 (SAT / Anexo 8): https://www.sat.gob.mx/consulta/15885/anexo-8-de-la-resolucion-miscelanea-fiscal
