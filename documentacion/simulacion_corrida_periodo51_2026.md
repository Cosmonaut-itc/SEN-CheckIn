# Simulación de corrida — Periodo 51 (ejemplo)

**Actualización documental:** 2026-01-08  
**Nota:** esta simulación se construyó para comparar contra un reporte histórico 2025.  
No se recalcula con UMA/ISR 2026 para no romper la comparación.

Si quieres una simulación 2026 con los mismos empleados, toma como base:
- `nomina_mx_imss_infonavit_isr_sar_2026.md`
y genera una corrida para un periodo 2026 (con UMA vigente por fecha).

---

# Corrida simulada y validación — Periodo Semanal 51 (15–21 Dic 2025)

Esta corrida intenta replicar los totales que muestra la Lista de Raya (CONTPAQi) para las obligaciones.

## Resumen por empleado

| id | nombre | SD | SBC | percepciones | ISR antes (calc) | subsidio | ISR neto (calc) | SAR 2% | INFONAVIT 5% | Guarderías 1% | RT | IMSS rubros |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 002 | GUZMAN DE HARO JOSE ALFREDO | 278.80 | 294.08 | 1951.60 | 139.31 | 109.38 | 29.93 | 41.17 | 102.93 | 20.59 | 123.51 | 391.75 |
| 003 | GUERRERO REYNALDO ANA LAURA | 278.80 | 293.31 | 1951.60 | 139.31 | 109.38 | 29.93 | 41.06 | 102.66 | 20.53 | 123.19 | 391.14 |

## Totales (simulados)

| Concepto | Total |
|---|---:|
| Percepciones | 3903.20 |
| ISN 2% | 78.06 |
| SAR 2% | 82.23 |
| INFONAVIT 5% | 205.59 |
| Guarderías 1% | 41.12 |
| Riesgo de trabajo | 246.70 |
| IMSS (rubros del reporte) | 782.89 |
| **Total obligaciones** | 1436.59 |
| **Costo total empresa** | 5339.79 |

## Detalle IMSS (rubros)

| Rubro | Total calculado | Total en reporte |
|---|---:|---:|
| Enf. Gral. (3 SMDF) | 323.12 | 323.12 |
| Enf. Gral. (Din. y Gastos) | 97.65 | 97.66 |
| Invalidez y Vida | 97.65 | 97.65 |
| Cesantía y Vejez | 264.47 | 264.47 |
