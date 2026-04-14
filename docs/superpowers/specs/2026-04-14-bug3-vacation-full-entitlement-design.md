# BUG-3: Empleados sin días de vacaciones completos

**Fecha:** 2026-04-14
**Rama:** `fix/vacation-full-entitlement`
**PR destino:** `main`

## Contexto

Al inspeccionar los días de vacaciones de los empleados, muchos muestran menos días disponibles de los esperados. Los empleados son nuevos en el sistema, no han registrado vacaciones, por lo que deberían tener todos sus días disponibles. El sistema calcula correctamente la cantidad de días de vacaciones por año de servicio (12, 14, 16, etc. según la LFT), pero muestra "días devengados" que son una fracción del total.

## Causa raíz

El modelo de accrual actual es **lineal**. En `calculateVacationAccrual()` (vacations.ts:200-201):

```typescript
const accruedDays = (entitledDays * daysElapsed) / daysInServiceYear;
```

Si un empleado con 1 año cumplido está a mitad de su segundo año de servicio, solo tiene ~7 de 14 días disponibles, porque `daysElapsed / daysInServiceYear ≈ 0.5`.

En `buildEmployeeVacationBalance()` (vacation-balance.ts:111-115):
```typescript
const availableDays = Math.max(0, Math.floor(accruedDays) - usedDays - pending);
```

`availableDays` depende de `accruedDays` que está prorrateado linealmente.

### Por qué esto es incorrecto

La Ley Federal del Trabajo (Art. 76-78) establece que los días de vacaciones se **generan al cumplir cada año de servicio**. No hay concepto de "devengo lineal" en la ley. Al cumplir un año de antigüedad, el empleado tiene derecho a sus 12 días completos inmediatamente.

## Regla de negocio

Al inicio de cada año de servicio (fecha de aniversario), el empleado recibe el **100% de sus días de vacaciones** correspondientes a ese año. No hay prorrateo dentro del año de servicio.

- Año de servicio 1 (después del 1er aniversario): 12 días disponibles inmediatamente
- Año de servicio 2 (después del 2do aniversario): 14 días disponibles inmediatamente
- Antes del primer aniversario (`serviceYearNumber = 0`): 0 días (sin cambio)

## Diseño

### Cambio principal

En `calculateVacationAccrual()` (vacations.ts), cambiar el cálculo de accrual:

**Antes:**
```typescript
const accruedDays = (entitledDays * daysElapsed) / daysInServiceYear;
```

**Después:**
```typescript
const accruedDays = entitledDays;
```

Los días se otorgan completos al inicio del año de servicio. El campo `accruedDays` pasa a ser siempre igual a `entitledDays` para `serviceYearNumber >= 1`.

### Campos del resultado que cambian

El tipo de retorno de `calculateVacationAccrual()` no cambia, pero los valores sí:
- `accruedDays`: siempre igual a `entitledDays` (antes era un float prorrateado)
- `daysElapsed` y `daysInServiceYear`: se mantienen para referencia/auditoría

### Impacto en `buildEmployeeVacationBalance()`

No requiere cambios. La función ya hace:
```typescript
const availableDays = Math.max(0, Math.floor(accruedDays) - usedDays - pending);
```

Con `accruedDays = entitledDays = 14`, `usedDays = 0`, `pending = 0`:
- `availableDays = Math.max(0, 14 - 0 - 0) = 14`

### Impacto en validación de vacaciones

`validateVacationBalance()` en vacations.ts (aprox. línea 362) usa la misma función de accrual. Con el cambio, la validación permitirá solicitar todos los días desde el inicio del año de servicio.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/services/vacations.ts` | Cambiar una línea en `calculateVacationAccrual()`: `accruedDays = entitledDays` |
| `apps/api/src/services/vacations.test.ts` | Actualizar tests de accrual: el test de "mid-year accrual" debe esperar entitlement completo en vez de fracción. Agregar test que verifica que todos los días están disponibles desde el día 1 del año de servicio. |
| `apps/api/src/services/vacation-balance.ts` | Sin cambios (flujo ya correcto) |

### Impacto en el frontend

El campo `accruedDays` del tipo `EmployeeVacationBalance` ahora siempre será igual a `entitledDays`. Si la UI muestra "días devengados" como valor separado, ahora siempre mostrará el total. No se requieren cambios de UI.

## Edge cases

1. **Año de servicio 0 (antes del primer aniversario):** `serviceYearNumber = 0`, la función ya retorna 0 días (líneas 181-190). Sin cambio.
2. **Empleado cumple años hoy:** `daysElapsed = 0` en el nuevo año, pero `accruedDays = entitledDays` por lo que tiene todos sus días inmediatamente. Correcto.
3. **Empleado con vacaciones tomadas:** Si usó 5 de 14 días, `availableDays = 14 - 5 = 9`. Correcto.
4. **Año bisiesto:** No afecta el cálculo ya que no depende de `daysElapsed / daysInServiceYear`.
5. **Hire date 29 de febrero:** Ya manejado en `getServiceYearNumber()` que rollover a 1 de marzo.
6. **Empleado recién contratado (0 años):** 0 días disponibles. Correcto.

## Criterios de aceptación

- [ ] Empleado con 1+ años de servicio ve todos sus días disponibles desde el inicio del año
- [ ] Empleado con 0 años sigue viendo 0 días
- [ ] Balance: `availableDays = entitledDays - usedDays - pendingDays`
- [ ] La validación de solicitud de vacaciones permite pedir todos los días desde el aniversario
- [ ] Tests unitarios de accrual actualizados
- [ ] Tests de balance verifican entitlement completo
- [ ] El endpoint `/vacations/me/balance` retorna datos correctos
