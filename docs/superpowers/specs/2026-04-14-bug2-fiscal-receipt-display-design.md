# BUG-2: Recibo de nómina muestra salario real como percepciones gravadas

**Fecha:** 2026-04-14
**Rama:** `fix/fiscal-receipt-display`
**PR destino:** `main`

## Contexto

Cuando el dual payroll está habilitado, el sistema calcula correctamente tanto el salario fiscal como el real. Sin embargo, el recibo de nómina en PDF y la exportación CSV etiquetan el salario real como "percepciones gravadas" cuando deberían mostrar el salario fiscal.

## Causa raíz

### Recibo PDF

En `build-payroll-receipt-pdf.ts:306-311`:
```typescript
const grossPay = toNumber(taxBreakdown?.grossPay ?? input.employee.totalPay);
```

El recibo usa `taxBreakdown.grossPay` que es el gross pay general. Cuando dual payroll está activo, los campos `fiscalGrossPay`, `complementPay` y `totalRealPay` existen a nivel del `PayrollRunEmployee` pero el recibo no los consulta.

### CSV Export

En `payroll-client.tsx:705`, la columna `grossPay` se etiqueta como `percepciones_gravadas` (via `csv.headers.grossPay` en es.json). El CSV sí tiene columnas separadas para dual payroll (`fiscalGrossPay`, `complementPay`, `totalRealPay`) que solo aparecen cuando `showDualPayrollColumns` es true, pero la columna principal `grossPay` sigue mostrando el monto real.

## Regla de negocio

Cuando dual payroll está activo, el recibo de nómina debe mostrar:
- **Percepciones gravadas:** el salario fiscal (`fiscalGrossPay`)
- **Complemento:** la diferencia real - fiscal (`complementPay`)
- **Total percepciones:** el monto total real (`totalRealPay`)

Los tres conceptos con etiquetas claras y separadas.

## Diseño

### Cambios en el recibo PDF

En `buildPayrollReceiptPdf()`, cuando el empleado tiene datos de dual payroll:

1. Leer `fiscalGrossPay`, `complementPay`, `totalRealPay` del objeto `input.employee` (ya existen en `PayrollRunEmployee`)
2. Si `fiscalGrossPay` es distinto de null/undefined (indicador de dual payroll activo):
   - Mostrar "Percepciones gravadas" = `fiscalGrossPay`
   - Agregar fila "Complemento" = `complementPay`
   - Agregar fila "Total percepciones" = `totalRealPay`
3. Si no hay dual payroll: comportamiento actual (solo `grossPay`)

### Cambios en el CSV

En `payroll-client.tsx`, modificar la columna `grossPay`:
- Cuando `showDualPayrollColumns` es true, la columna principal `grossPay` (etiquetada "percepciones_gravadas") debe usar `fiscalGrossPay` en lugar de `grossPay`
- Las columnas adicionales (`fiscalGrossPay`, `complementPay`, `totalRealPay`) se mantienen para referencia

Las columnas adicionales de dual payroll (`fiscalGrossPay`, `complementPay`, `totalRealPay`) se mantienen como columnas separadas para detalle adicional.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts` | Leer `fiscalGrossPay`, `complementPay`, `totalRealPay` del employee. Mostrar sección dual cuando disponible. |
| `apps/web/app/(dashboard)/payroll/payroll-client.tsx` | Modificar lógica de columna `grossPay` para usar fiscal cuando dual payroll. |
| `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts` | Ajustar `buildPayrollCsvEmployeeRow` para mapear correctamente los campos en dual payroll. |
| `apps/web/messages/es.json` | Agregar/modificar etiquetas: `receiptFiscalGross`, `receiptComplement`, `receiptTotalReal`. |
| `apps/web/app/(dashboard)/payroll/payroll-client.helpers.test.ts` | Actualizar tests del CSV helper para dual payroll. |

### Detalle del cambio en PDF

Actualmente (líneas 340-370 aprox.) el resumen del recibo tiene:

| Concepto | Valor |
|----------|-------|
| Percepciones gravadas | `grossPay` (REAL - incorrecto) |
| Deducciones | `totalDeductions` |
| Neto a pagar | `netPay` |

Con dual payroll debe ser:

| Concepto | Valor |
|----------|-------|
| Percepciones gravadas | `fiscalGrossPay` |
| Complemento | `complementPay` |
| Total percepciones | `totalRealPay` |
| Deducciones | `totalDeductions` |
| Neto a pagar | `netPay` |

### Detección de dual payroll en el recibo

No se necesita leer un flag de configuración. La presencia de `fiscalGrossPay !== null` en el `PayrollRunEmployee` es suficiente para saber que dual payroll estaba activo al calcular esa nómina.

## Edge cases

1. **Dual payroll desactivado:** Comportamiento actual, solo `grossPay` como "percepciones gravadas"
2. **`fiscalGrossPay === grossPay`:** Puede pasar si ambos salarios son iguales. Aun así mostrar las 3 filas (complemento sería 0) para consistencia
3. **Recibos históricos:** Recibos ya generados no se modifican. El cambio solo afecta recibos nuevos
4. **`complementPay = 0`:** Mostrar la fila con valor 0, no ocultarla
5. **CSV con y sin dual payroll en el mismo batch:** Cada fila del CSV debe usar sus propios datos (`fiscalGrossPay` si existe, `grossPay` si no)

## Criterios de aceptación

- [ ] PDF con dual payroll muestra "Percepciones gravadas" = fiscal, "Complemento" = complement, "Total" = real
- [ ] PDF sin dual payroll muestra "Percepciones gravadas" = grossPay (sin cambios)
- [ ] CSV con dual payroll: columna principal de percepciones usa fiscal
- [ ] Las etiquetas en español son correctas y claras
- [ ] Tests unitarios del CSV helper actualizados
- [ ] Test del PDF con dual payroll activo
