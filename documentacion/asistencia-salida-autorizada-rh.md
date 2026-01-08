# Asistencia: salida autorizada (RH)

## Resumen

Se agrega el tipo de asistencia `CHECK_OUT_AUTHORIZED` para registrar salidas con permiso de RH.
Este evento **no** representa fin de jornada: el tiempo entre `CHECK_OUT_AUTHORIZED` y el
siguiente `CHECK_IN` se considera **tiempo pagado** en la nomina.

## Semantica

- `CHECK_OUT_AUTHORIZED`: marca una salida autorizada por RH.
- El tramo pagado inicia en el timestamp de `CHECK_OUT_AUTHORIZED`.
- El tramo pagado termina en el siguiente `CHECK_IN` del mismo empleado.
- Si no hay un `CHECK_IN` posterior dentro del periodo, ese tramo no se cuenta.

## Ejemplo de secuencia

1. `CHECK_IN` 09:00
2. `CHECK_OUT_AUTHORIZED` 11:00
3. `CHECK_IN` 13:00
4. `CHECK_OUT` 18:00

Resultado: se pagan 9 horas (2h trabajadas + 2h autorizadas + 5h trabajadas).

## Integracion en mobile

Enviar el evento con el mismo endpoint de asistencia:

```http
POST /attendance
Content-Type: application/json

{
  "employeeId": "uuid-del-empleado",
  "deviceId": "uuid-del-dispositivo",
  "timestamp": "2025-01-02T17:00:00.000Z",
  "type": "CHECK_OUT_AUTHORIZED",
  "metadata": {
    "reason": "Permiso RH"
  }
}
```

`metadata` es opcional y puede incluir el motivo u otros campos utiles para auditoria.

## Implicaciones en presencia

El endpoint `/attendance/present` considera presente solo cuando el ultimo evento es `CHECK_IN`.
Por lo tanto, si el ultimo evento es `CHECK_OUT_AUTHORIZED`, el empleado **no** aparece como presente.
