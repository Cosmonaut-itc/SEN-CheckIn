# FEAT: Export de asistencia en PDF imprimible por empleado

**Fecha:** 2026-04-20
**Rama:** `main`
**PR destino:** `main`

## Contexto

La pantalla de asistencia en `apps/web/app/(dashboard)/attendance` hoy descarga un CSV resumido por persona y día. Ese formato sirve para análisis en hoja de cálculo, pero no resuelve el caso operativo que motivó esta solicitud: imprimir un reporte parecido al del checador anterior, agruparlo por empleado y dejar un espacio visible para firma física.

El usuario pidió reemplazar el artefacto descargado por un PDF y confirmó estas decisiones:

1. El reporte descargado debe ser un **PDF**, no CSV.
2. Debe haber **una sola fila por empleado por día**.
3. El documento debe organizarse en **bloques separados por empleado**.

## Estado actual

El flujo actual en `attendance-client.tsx`:

1. Toma los filtros activos de la pantalla.
2. Hace un fetch completo de asistencias con spillover de un día a cada lado.
3. Resume los eventos con `aggregateAttendanceByPersonDay()` de `attendance-export-helpers.ts`.
4. Construye un CSV y lo descarga en el navegador.

La agregación diaria existente ya resuelve la parte más delicada del problema:

- primera entrada del día
- última salida del día
- total trabajado neto
- registros incompletos
- `WORK_OFFSITE`
- spillover para turnos que cruzan medianoche

## Objetivo

Sustituir la descarga CSV por una descarga PDF imprimible, manteniendo intacto el fetch y la lógica de resumen diario, pero cambiando la presentación final a un formato listo para revisión y firma manual.

## Enfoque recomendado

### Opción elegida: PDF client-side con `pdf-lib`

Generar el PDF directamente en `apps/web` usando `pdf-lib`, reutilizando los helpers de agregación actuales y siguiendo el patrón de los builders PDF ya existentes en `apps/web/lib/payroll-receipts`.

### Razones

- Mantiene el cambio acotado al módulo de asistencia web.
- Reutiliza la lógica diaria ya probada.
- Evita abrir un endpoint nuevo solo para una descarga que hoy ya vive en cliente.
- Encaja con dependencias y patrones presentes en el repo (`pdf-lib` ya está instalado y en uso).

## Formato del documento

El PDF tendrá estas características:

- Título general del reporte.
- Rango de fechas exportado.
- Un bloque por empleado con:
  - nombre del empleado
  - ID del empleado
  - rango de fechas del reporte
- Una tabla por bloque con las columnas:
  - `Día`
  - `Entrada`
  - `Salida`
  - `Horas trabajadas`
  - `Firma`
- La columna `Firma` debe dejar espacio suficiente para una firma manuscrita.
- Al final de cada bloque habrá una fila de total del empleado dentro del rango.

### Forma de las filas

Cada fila representa un único resumen diario:

- `Día`: fecha local del registro agrupado en formato `dd/MM/yyyy`
- `Entrada`: primera entrada del día o etiqueta equivalente
- `Salida`: última salida del día o etiqueta equivalente
- `Horas trabajadas`: total neto del día en formato `HH:mm`, o etiqueta equivalente
- `Firma`: celda vacía, sin texto

## Reglas de negocio

### 1. Una sola fila por empleado por día

Se conserva el comportamiento actual de `aggregateAttendanceByPersonDay()`:

- el primer `CHECK_IN` del día define la entrada visible
- el último `CHECK_OUT` o `CHECK_OUT_AUTHORIZED` define la salida visible
- el total diario es la suma neta de los pares entrada-salida

### 2. Bloques separados por empleado

Las filas resumidas se agrupan por `employeeId`. Cada empleado se renderiza como una sección independiente dentro del PDF.

### 3. Total por empleado

Cada bloque incluirá un total del periodo para ese empleado:

- si todos los días tienen horas válidas, se suma el tiempo diario y se imprime un total `HH:mm`
- si existen días incompletos, esos días no inventan duración adicional
- el total del empleado será la suma solo de filas con duración real calculable

Para evitar ambigüedad, el total se calcula desde minutos acumulados y no desde reparsear cadenas de texto ya formateadas.

### 4. Registros incompletos

Se mantienen las etiquetas actuales:

- `Sin entrada`
- `Sin salida`
- `Incompleto`

Los días incompletos se muestran en la tabla, pero no aportan minutos al total del empleado.

### 5. Registros `WORK_OFFSITE`

Se mantienen con la misma semántica actual:

- `Entrada`: `Fuera de oficina`
- `Salida`: `Fuera de oficina`
- `Horas trabajadas`: `Fuera de oficina`

Estos renglones se muestran, pero no aportan minutos numéricos al total del empleado.

### 6. Rango y spillover

Se mantiene el patrón ya existente:

- fetch con un día adicional antes y después
- agregación con timezone de la organización
- filtrado final de filas al rango seleccionado localmente

Esto preserva el manejo correcto de turnos que cruzan medianoche.

## Diseño técnico

### Helper de agregación orientado a PDF

`attendance-export-helpers.ts` se ampliará para exponer una estructura agrupada por empleado apta para render PDF.

Propuesta de forma:

```ts
interface AttendanceEmployeePdfRow {
	day: string;
	firstEntry: string;
	lastExit: string;
	totalHours: string;
	workMinutes: number | null;
}

interface AttendanceEmployeePdfGroup {
	employeeId: string;
	employeeName: string;
	rows: AttendanceEmployeePdfRow[];
	totalWorkedMinutes: number;
}
```

El helper no debe recalcular distinto a la lógica actual. Debe derivarse del mismo resumen diario ya usado para exportación.

### Builder nuevo de PDF

Se agregará un builder nuevo en `apps/web/lib`, por ejemplo:

- `apps/web/lib/attendance/build-attendance-report-pdf.ts`

Responsabilidades del builder:

- crear el documento con `pdf-lib`
- renderizar título y metadatos del rango
- renderizar bloques por empleado
- dibujar encabezados de tabla
- dibujar filas y bordes
- reservar una columna amplia para firma
- hacer salto de página cuando no quede alto suficiente
- repetir encabezado de tabla al continuar un bloque en otra página

### Cambios en `attendance-client.tsx`

Cambios esperados:

- reemplazar `handleExportCsv` por `handleExportPdf`
- mantener el mismo fetch y los mismos guards de no-data
- usar el nuevo helper agrupado para PDF
- invocar el builder PDF
- descargar un blob `application/pdf`
- actualizar nombre de archivo, por ejemplo:
  - `reporte-asistencia-20260401-20260415.pdf`

### Descarga

La descarga seguirá siendo browser-side mediante `Blob`, `URL.createObjectURL()` y un `<a download>`, igual que otros flujos existentes del repo.

## Traducciones

Se necesitarán nuevas o ajustadas etiquetas en `apps/web/messages/es.json` para:

- nombre del reporte
- encabezados de tabla del PDF
- total por empleado
- posible texto del botón de exportación si deja de decir CSV
- nombre base del archivo

Todas las cadenas visibles seguirán en español.

## Archivos previstos

| Archivo | Cambio |
|---------|--------|
| `apps/web/app/(dashboard)/attendance/attendance-client.tsx` | Cambiar flujo de descarga de CSV a PDF. |
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.ts` | Ampliar helpers para agrupación orientada a PDF y totales por empleado. |
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.test.ts` | Agregar tests de grupos por empleado y totales del periodo. |
| `apps/web/app/(dashboard)/attendance/attendance-client.test.tsx` | Ajustar tests para descarga PDF y no-descarga cuando el rango queda vacío. |
| `apps/web/lib/attendance/build-attendance-report-pdf.ts` | Nuevo builder PDF. |
| `apps/web/messages/es.json` | Ajustar traducciones del flujo de exportación. |

## Paginación y layout

El riesgo técnico principal es el alto variable del documento. El builder debe:

- iniciar una nueva página antes de cortar una fila
- repetir encabezados de tabla cuando un bloque continúe
- evitar bloques huérfanos con encabezado sin filas visibles

No es necesario replicar exactamente el diseño visual del checador anterior; el objetivo es capturar su utilidad operativa: impresión clara, agrupación por empleado y espacio de firma.

## Edge cases

1. **Sin registros en el fetch:** no se descarga archivo.
2. **Sin filas dentro del rango tras filtrar spillover:** no se descarga archivo.
3. **Empleado con días incompletos mezclados con días completos:** el bloque muestra ambos; el total suma solo los completos.
4. **Empleado con solo `WORK_OFFSITE`:** aparece su bloque con las etiquetas correspondientes y total `00:00`.
5. **Muchos empleados o muchos días:** el PDF paginará automáticamente.
6. **Turno nocturno cruzando medianoche:** la fila sigue perteneciendo al día local de entrada, como ya ocurre hoy.

## Pruebas

### Unitarias de helpers

Agregar cobertura para:

- agrupación de filas por empleado
- total acumulado por empleado
- exclusión de empleados sin filas dentro del rango
- preservación de `WORK_OFFSITE`
- preservación de días incompletos sin inflar totales

### UI/client

Actualizar pruebas para:

- descargar PDF cuando hay filas agregadas
- no descargar nada cuando el rango final queda vacío
- conservar el fetch con spillover y el filtrado local

### Calidad

Validación mínima antes de implementar o cerrar:

```bash
cd apps/web
bun test app/'(dashboard)'/attendance/attendance-export-helpers.test.ts
bun test app/'(dashboard)'/attendance/attendance-client.test.tsx
bun run check-types
bun run lint
```

## Criterios de aceptación

- [ ] La descarga de asistencia genera un PDF en vez de CSV.
- [ ] El PDF muestra un bloque separado por empleado.
- [ ] Cada bloque muestra una sola fila por día.
- [ ] Las columnas son `Día`, `Entrada`, `Salida`, `Horas trabajadas` y `Firma`.
- [ ] Existe un total por empleado al final del bloque.
- [ ] La columna `Firma` deja espacio visible para firma manual.
- [ ] El manejo de spillover y timezone conserva el comportamiento actual.
- [ ] Los días incompletos siguen visibles sin inflar el total.
- [ ] `WORK_OFFSITE` sigue visible con su etiqueta actual.
- [ ] Hay pruebas enfocadas para helpers y flujo cliente.
