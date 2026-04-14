# BUG-1: Sábado no cuenta como día pagado en vacaciones

**Fecha:** 2026-04-14
**Rama:** `fix/saturday-vacation-pay`
**PR destino:** `main`

## Contexto

Cuando la configuración `countSaturdayAsWorkedForSeventhDay` está habilitada, el sistema paga el séptimo día automáticamente para empleados con horario L-V sin verificar asistencia del sábado. Sin embargo, cuando un empleado toma vacaciones que abarcan un sábado (ej. lunes a sábado), ese sábado no se paga, a pesar de que la opción está activa.

## Causa raíz

El flag `countSaturdayAsWorkedForSeventhDay` solo se aplica en `calculateSeventhDayPay()` (payroll-calculation.ts:630-684), que maneja el pago del séptimo día. No se propaga al cálculo de días de vacaciones pagados.

`buildVacationDayBreakdown()` (vacations.ts:293-381) determina qué días cuentan como vacación consultando el schedule del empleado. Para un horario L-V, el sábado tiene `isWorkingDay = false`, por lo que `countsAsVacationDay = false`. El sábado se marca como `SCHEDULED_REST_DAY` y no se paga.

El payroll recibe `vacationDayCounts` (un número pre-calculado) y multiplica por `dailyPay`. Si el sábado no está contado, no se paga.

## Regla de negocio

Cuando `countSaturdayAsWorkedForSeventhDay` está activo y un empleado con horario L-V toma vacaciones que abarcan un sábado:
- El sábado se **paga** como un día adicional
- El sábado **NO consume** del saldo de vacaciones del empleado
- Es un bono de nómina, no un día de vacación

## Diseño

### Enfoque: Bonus de sábado en payroll calculation

Agregar un nuevo campo `saturdayVacationBonusDays` al flujo de cálculo de nómina.

### Flujo de datos

1. El caller que calcula `vacationDayCounts` (la ruta de payroll) también calcula `saturdayVacationBonusDays`:
   - Para cada periodo vacacional aprobado que intersecte el periodo de nómina
   - Contar cuántos sábados caen dentro del periodo vacacional
   - Solo si `countSaturdayAsWorkedForSeventhDay = true` y el empleado tiene horario L-V clásico
2. Se pasa `saturdayVacationBonusDays` junto con `vacationDayCounts` a `calculatePayrollFromData()`
3. En payroll calculation, se suma `saturdayVacationBonusDays * dailyPay` al gross pay (tanto fiscal como real)

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/services/payroll-calculation.ts` | Agregar `saturdayVacationBonusDays` al input type `CalculatePayrollFromDataArgs`. Usar para calcular bonus y sumarlo a gross pay. |
| `apps/api/src/services/vacations.ts` | Nueva función `countSaturdayBonusDaysInVacationPeriod()` que recibe periodo vacacional, schedule, y flag de sábado. |
| `apps/api/src/routes/payroll.ts` (o donde se arma `vacationDayCounts`) | Llamar la nueva función para cada empleado y pasar resultado al cálculo. |
| `apps/api/src/services/payroll-calculation.test.ts` | Tests: sábado bonus con flag activo, sin flag, horario no L-V, múltiples sábados en periodo bi-semanal. |
| `apps/api/src/services/vacations.test.ts` | Tests de la nueva función de conteo de sábados. |

### Función nueva: `countSaturdayBonusDaysInVacationPeriod()`

```typescript
function countSaturdayBonusDaysInVacationPeriod(args: {
  vacationStartDateKey: string;
  vacationEndDateKey: string;
  periodStartDateKey: string;
  periodEndDateKey: string;
  schedule: Omit<ScheduleRow, 'employeeId'>[];
  countSaturdayAsWorkedForSeventhDay: boolean;
}): number
```

Lógica:
1. Si `countSaturdayAsWorkedForSeventhDay = false`, retorna 0
2. Si el schedule no es L-V clásico (`isClassicMondayToFridaySchedule()`), retorna 0
3. Intersectar el rango de vacaciones con el periodo de nómina
4. Iterar sobre cada día en la intersección
5. Contar cuántos son sábado (dayOfWeek === 6)

### Cambio en gross pay

En `calculatePayrollFromData()`, después del cálculo de vacation pay:

```typescript
const saturdayVacationBonus = (saturdayVacationBonusDays ?? 0) > 0
  ? roundCurrency(saturdayVacationBonusDays * taxDailyPay)
  : 0;

const realSaturdayVacationBonus = (saturdayVacationBonusDays ?? 0) > 0
  ? roundCurrency(saturdayVacationBonusDays * realDailyPay)
  : 0;
```

Sumar a `fiscalGrossPay` y `realGrossPay` respectivamente.

## Edge cases

1. **Periodo bi-semanal con 2 sábados en vacación**: debe contar ambos
2. **Vacación parcial que empieza viernes y termina lunes**: el sábado entre ellos cuenta
3. **Empleado con horario L-S (no L-V)**: NO aplica el bonus (el sábado ya es laboral y se cuenta como día de vacación normal)
4. **Flag desactivado**: 0 bonus, comportamiento actual
5. **Vacación de un solo día (viernes)**: 0 sábados en rango
6. **Interacción con séptimo día**: si hay vacaciones toda la semana + sábado bonus, el séptimo día también se paga (son conceptos independientes)

## Criterios de aceptación

- [ ] Con flag activo y horario L-V, vacación L-S paga 6 días (5 de vacación + 1 bonus sábado)
- [ ] El saldo de vacaciones solo se reduce en 5 días (no 6)
- [ ] Con flag desactivo, vacación L-S paga solo 5 días
- [ ] Horarios no L-V no reciben el bonus
- [ ] El bonus aparece en el desglose de nómina como concepto separado
- [ ] Tests unitarios cubren todos los edge cases
- [ ] Tests de integración verifican el flujo completo
