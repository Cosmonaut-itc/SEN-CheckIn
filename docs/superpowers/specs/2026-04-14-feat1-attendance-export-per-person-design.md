# FEAT-1: Formato de descarga del checador por persona por día

**Fecha:** 2026-04-14
**Rama:** `feat/attendance-export-per-person`
**PR destino:** `main`

## Contexto

El export CSV del checador actualmente genera una fila por cada evento de asistencia (CHECK_IN, CHECK_OUT, etc.). Cuando un usuario descarga el reporte, tiene que manualmente:
1. Agrupar registros por empleado y fecha
2. Emparejar entradas con salidas
3. Calcular las horas trabajadas

Esto es tedioso y propenso a errores.

## Formato actual

```csv
Empleado,ID,Dispositivo,Ubicación,Tipo,Clasificación,Motivo,Hora,Fecha
Juan Pérez,emp-1,dev-1,Matriz,Entrada,,,08:30:00,23/02/2026
Juan Pérez,emp-1,dev-1,Matriz,Salida,,,12:30:00,23/02/2026
Juan Pérez,emp-1,dev-1,Matriz,Entrada,,,13:30:00,23/02/2026
Juan Pérez,emp-1,dev-1,Matriz,Salida,,,17:30:00,23/02/2026
```

El usuario tiene que calcular: 4h (8:30-12:30) + 4h (13:30-17:30) = 8h trabajadas.

## Formato nuevo

```csv
Empleado,ID Empleado,Fecha,Entrada,Salida,Horas Trabajadas
Juan Pérez,emp-1,23/02/2026,08:30,17:30,08:00
María López,emp-2,23/02/2026,09:00,18:00,09:00
Juan Pérez,emp-1,24/02/2026,08:45,17:15,07:30
```

Una fila por empleado por día. La entrada es el primer CHECK_IN del día, la salida es el último CHECK_OUT del día. Las horas son el total neto trabajado (descontando breaks).

## Diseño

### Enfoque: Agregación client-side en el export handler

Modificar `handleExportCsv()` en `attendance-client.tsx` para agregar una fase de agregación entre el fetch y la generación de CSV.

### Algoritmo de agregación

```
1. Agrupar registros por (employeeId, dateKey)
   - dateKey: YYYY-MM-DD extraído de timestamp en timezone de la organización

2. Para cada grupo (empleado, día):
   a. Separar eventos por tipo:
      - entries: CHECK_IN events, ordenados por timestamp ASC
      - exits: CHECK_OUT + CHECK_OUT_AUTHORIZED events, ordenados por timestamp ASC
   
   b. Emparejar entrada-salida secuencialmente:
      - Par 1: entries[0] → exits[0]
      - Par 2: entries[1] → exits[1]
      - Si entries.length > exits.length: último par sin salida
   
   c. Calcular horas por par:
      - Si ambos existen: (exitTimestamp - entryTimestamp) en minutos
      - Si solo entry: sin salida registrada
   
   d. Sumar minutos totales de todos los pares
   
   e. Primera entrada = entries[0].timestamp (HH:mm)
      Última salida = exits[exits.length - 1].timestamp (HH:mm)
      Horas totales = totalMinutes formateado como HH:mm

3. Ordenar resultado por (employeeName ASC, dateKey ASC)

4. Generar CSV con las nuevas columnas
```

### Nuevo tipo para CSV

```typescript
type AttendanceSummaryCsvRow = {
  employeeName: string;
  employeeId: string;
  date: string;           // dd/MM/yyyy
  firstEntry: string;     // HH:mm o "Sin entrada"
  lastExit: string;       // HH:mm o "Sin salida"
  totalHours: string;     // HH:mm o "Incompleto"
};
```

### Nuevas columnas CSV

```typescript
const summaryColumns: CsvColumn[] = [
  { key: 'employeeName', label: t('csv.headers.employeeName') },
  { key: 'employeeId', label: t('csv.headers.employeeId') },
  { key: 'date', label: t('csv.headers.date') },
  { key: 'firstEntry', label: t('csv.headers.firstEntry') },     // NUEVO
  { key: 'lastExit', label: t('csv.headers.lastExit') },         // NUEVO
  { key: 'totalHours', label: t('csv.headers.totalHours') },     // NUEVO
];
```

### Manejo de WORK_OFFSITE

Los registros de tipo `WORK_OFFSITE` se incluyen como filas con:
- `firstEntry`: "Fuera de oficina"
- `lastExit`: "Fuera de oficina"
- `totalHours`: "Fuera de oficina"

No se calculan horas para registros offsite ya que no tienen timestamps de entrada/salida reales. El schedule del empleado no está disponible en el contexto del export y agregarlo sería desproporcionado.

### Función de agregación

```typescript
function aggregateAttendanceByPersonDay(
  records: AttendanceRecord[],
  timeZone: string,
): AttendanceSummaryCsvRow[]
```

Esta función se extrae como helper puro (testeable) separado de la lógica de UI.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/web/app/(dashboard)/attendance/attendance-client.tsx` | Modificar `handleExportCsv()` para agregar fase de agregación. Cambiar tipo y columnas del CSV. |
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.ts` | **NUEVO.** Extraer función `aggregateAttendanceByPersonDay()` como helper testeable. |
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.test.ts` | **NUEVO.** Tests unitarios de la función de agregación. |
| `apps/web/messages/es.json` | Agregar traducciones: `csv.headers.firstEntry`, `csv.headers.lastExit`, `csv.headers.totalHours`. |

### Formato de horas

- Horas totales en formato `HH:mm` (ej. "08:30" = 8 horas 30 minutos)
- Si el total es 0 minutos pero hay registros: "00:00"
- Si no hay salida para calcular: "Incompleto"

### Timezone

- Los timestamps de asistencia están en UTC en la base de datos
- La conversión a hora local usa el timezone de la organización
- `dateKey` se determina convirtiendo el timestamp UTC al timezone de la organización para agrupar correctamente (un check-in a las 23:00 UTC puede ser del día siguiente en México)

## Edge cases

1. **CHECK_IN sin CHECK_OUT:** Fila muestra entrada, "Sin salida", "Incompleto"
2. **CHECK_OUT sin CHECK_IN (solo):** Fila muestra "Sin entrada", salida, "Incompleto"
3. **Múltiples entradas/salidas (lunch break):** Se emparejan secuencialmente. Total = suma de todos los pares
4. **CHECK_OUT_AUTHORIZED:** Se trata igual que CHECK_OUT para cálculos
5. **WORK_OFFSITE:** Fila con "Fuera de oficina" en entrada/salida
6. **Mismo empleado, CHECK_IN a las 23:50 y CHECK_OUT a las 00:10:** Pertenecen a días distintos. El CHECK_IN es del día 1 sin salida. El CHECK_OUT es del día 2 sin entrada. Ambos marcan "Incompleto".
7. **Sin registros en el rango:** No se genera CSV, botón deshabilitado (ya funciona así)
8. **Lunch break registrado como CHECK_OUT(LUNCH_BREAK):** Se empareja con el siguiente CHECK_IN. Las horas de lunch se descuentan automáticamente del total.

## Criterios de aceptación

- [ ] CSV tiene una fila por empleado por día
- [ ] Primera entrada y última salida se muestran correctamente
- [ ] Horas totales calculadas automáticamente (descontando breaks)
- [ ] CHECK_IN sin CHECK_OUT muestra "Incompleto"
- [ ] WORK_OFFSITE aparece como "Fuera de oficina"
- [ ] Ordenado por nombre de empleado, luego por fecha
- [ ] Timezone correcto (hora local, no UTC)
- [ ] Tests unitarios de la función de agregación
- [ ] Traducciones en español correctas
