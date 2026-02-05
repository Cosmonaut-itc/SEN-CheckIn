# Release 12 - PTU y Aguinaldo (Cálculo Masivo + Recibos)

## Summary

- Corridas masivas de PTU y Aguinaldo con modo borrador, recálculo y procesamiento controlado.
- Recibos PDF individuales, ZIP por corrida y exportación CSV para PTU y Aguinaldo.
- Configuración en Payroll Settings para activar PTU/Aguinaldo, modo de PTU, exención y tipo de patrón.
- Nuevos campos en empleados para elegibilidad PTU (LFT + overrides), override de días de aguinaldo e historial de PTU por año.

## Details

- API:
	- Nuevos endpoints `/ptu` y `/aguinaldo` para calcular, crear borradores, actualizar, procesar, cancelar, listar y exportar CSV.
	- PTU valida exención y bloquea procesamiento cuando total es 0, renta gravable <= 0 o hay errores por empleado.
	- Aguinaldo bloquea procesamiento cuando total es 0 o hay errores por empleado.
	- Historial PTU por empleado disponible en `/employees/:id/ptu-history` (GET/POST/PUT).
- Cálculo:
	- PTU reparte 50/50 por días y salario, aplica tope 3 meses vs promedio 3 años, redistribuye excedentes, y calcula ISR RLISR 174 con exento 15 días SMG.
	- Aguinaldo prorratea por días laborados en el año, usa base diaria promedio, aplica override de días por empleado y calcula ISR RLISR 174 con exento 30 días SMG.
- Web:
	- Nuevas pestañas en Nómina: `PTU` y `Aguinaldo` con tablas editables, warnings y totales.
	- Receipts dialog por corrida con descarga ZIP y PDF individual.
	- Empleados incluyen sección “PTU y Aguinaldo” con flags LFT, overrides y captura de historial.
	- Edición masiva en tabla de empleados para flags y overrides.

## Workflow

- Activar PTU/Aguinaldo en Payroll Settings según corresponda.
- Ajustar flags/overrides en empleados y capturar historial PTU si aplica.
- Crear borrador, revisar warnings y procesar la corrida.
- Descargar CSV y recibos desde la pestaña correspondiente.

## Notes

- DB: migración `0026_ptu_aguinaldo.sql` agrega tablas de corridas, líneas y historial PTU, además de columnas en settings y empleados.
- Calidad: ejecutar `bun run lint`, `bun run check-types`, `bun run test:api:contract` y `bun run test:web:e2e` antes de liberar.
