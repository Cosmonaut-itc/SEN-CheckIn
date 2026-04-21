# FEAT: Mostrar reloj en vivo en la tarjeta del scanner

**Fecha:** 2026-04-21
**Rama:** `feat/scanner-time-display`
**PR destino:** `main`

## Contexto

La pantalla del scanner en `apps/mobile/app/(main)/scanner.tsx` tiene una tarjeta inferior ("Bottom Status Card") que contiene el estado del dispositivo y el boton para escanear. Actualmente **no hay ningun indicador de hora visible** en la pantalla. Cuando un empleado se acerca al dispositivo para registrar su asistencia, no tiene forma sencilla de ver la hora actual sin salir de la app.

El usuario solicito agregar la hora visible en la tarjeta donde esta el boton de escanear, para que el empleado pueda verla facilmente.

## Estado actual

La tarjeta inferior (`scanner.tsx` lineas 989-1107) contiene:

1. Banner de offline (condicional, solo cuando no hay red).
2. **Device status row:** indicador verde + nombre del dispositivo + estado "Conectado".
3. **Boton de escaneo:** boton grande con el tipo de asistencia actual.

No hay ningun elemento que muestre la hora.

## Objetivo

Agregar un reloj en vivo (actualizado cada segundo) en la tarjeta inferior del scanner, visible de manera prominente para que el empleado pueda confirmar la hora antes de registrar su asistencia.

## Enfoque recomendado

Crear un estado local `currentTime` con un `setInterval` de 1 segundo que actualice la hora formateada como `HH:mm:ss`. Renderizarlo como texto prominente centrado entre el device status row y el boton de escaneo.

### Razones

- No requiere cambios en el backend.
- Un `setInterval` de 1s es suficiente para un reloj y tiene impacto minimo en rendimiento.
- Colocar la hora entre el status y el boton la hace visible sin requerir interaccion.
- El formato `HH:mm:ss` con segundos visibles da confianza de que es un reloj en vivo.

## Diseno tecnico

### Hook de reloj en vivo

Agregar un `useState` + `useEffect` con `setInterval` para mantener la hora actualizada:

```typescript
const [currentTime, setCurrentTime] = useState(() =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
);

useEffect(() => {
  const timer = setInterval(() => {
    setCurrentTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }, 1000);

  return () => clearInterval(timer);
}, []);
```

### Ubicacion en la UI

Dentro del `Card.Body` de la tarjeta inferior, entre el device status row y el boton de escaneo:

```tsx
{/* Device status row */}
<View className="flex-row items-start justify-between gap-3">
  {/* ... existing device status ... */}
</View>

{/* Live clock */}
<Text className="text-center text-3xl font-bold text-foreground tracking-wide">
  {currentTime}
</Text>

{/* Scan button */}
<Button ...>
```

### Layout visual resultante

```
+--------------------------------------+
| [*] Terminal Centro    [v] Conectado |
|                                      |
|              10:34:27                |
|                                      |
|   [========= Registrar Entrada ===] |
+--------------------------------------+
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/mobile/app/(main)/scanner.tsx` | Agregar estado `currentTime`, efecto de intervalo, renderizar reloj en la tarjeta inferior |

## Edge cases

1. **Zona horaria:** Se usa `toLocaleTimeString` del dispositivo, consistente con la hora local del empleado.
2. **Rendimiento:** El `setInterval` de 1s solo actualiza un string de texto. El re-render es trivial dado que la tarjeta ya es un componente ligero.
3. **Cleanup:** El `clearInterval` en el cleanup del `useEffect` evita memory leaks al desmontar.
4. **Pantalla bloqueada / background:** Cuando la app va a background, React Native pausa los timers. Al volver a foreground, el primer tick del intervalo actualiza a la hora correcta automaticamente.
5. **Dispositivo no configurado:** Cuando no hay `deviceId`, se muestra el empty state de vinculacion. El reloj solo aparece en el flujo normal con dispositivo vinculado, junto al boton de escaneo.

## Criterios de aceptacion

- [ ] La tarjeta inferior del scanner muestra la hora actual en formato `HH:mm:ss`.
- [ ] La hora se actualiza cada segundo (reloj en vivo).
- [ ] El reloj esta posicionado entre el device status y el boton de escaneo.
- [ ] El reloj es visible y prominente (texto grande, bold).
- [ ] El reloj no aparece si el dispositivo no esta vinculado (empty state).
- [ ] No se modifica ningun endpoint del API.
- [ ] No hay memory leaks al navegar fuera del scanner.
