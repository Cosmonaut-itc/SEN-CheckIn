# Mostrar reloj en vivo en la tarjeta del scanner

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un reloj en vivo (HH:mm:ss) en la tarjeta inferior del scanner, entre el device status y el boton de escaneo, para que el empleado vea la hora antes de registrar.
**Architecture:** Cambio aislado en `ScannerScreen` — un nuevo estado + intervalo + un `<Text>` en el card body.
**Tech Stack:** React Native, Expo, TypeScript
**Design Spec:** `docs/superpowers/specs/2026-04-21-scanner-time-display-design.md`

## File Structure

| Archivo | Responsabilidad |
|---------|----------------|
| `apps/mobile/app/(main)/scanner.tsx` | Estado del reloj, intervalo de actualizacion, renderizado en tarjeta inferior |

---

## Task 1 — Agregar estado y efecto del reloj

**Files:** `apps/mobile/app/(main)/scanner.tsx`

- [ ] **Step 1.1** — Agregar el estado `currentTime` junto a los demas `useState` del componente (~linea 330):

```typescript
const [currentTime, setCurrentTime] = useState(() =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
);
```

- [ ] **Step 1.2** — Agregar el `useEffect` con `setInterval` para actualizar cada segundo. Colocarlo junto a los demas efectos del componente (~linea 535):

```typescript
useEffect(() => {
  const timer = setInterval(() => {
    setCurrentTime(
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }, 1000);

  return () => clearInterval(timer);
}, []);
```

- [ ] **Step 1.3** — Verificar type check:

```bash
cd apps/mobile && bunx tsc --noEmit
```

---

## Task 2 — Renderizar el reloj en la tarjeta inferior

**Files:** `apps/mobile/app/(main)/scanner.tsx`

- [ ] **Step 2.1** — En la tarjeta inferior ("Bottom Status Card"), dentro del bloque que tiene el device status row y el scan button (~linea 1066, entre el cierre del device status `</View>` y el comentario `{/* Scan button */}`), agregar el reloj:

```tsx
{/* Device status row */}
<View className="flex-row items-start justify-between gap-3">
  {/* ... sin cambios ... */}
</View>

{/* Live clock */}
<Text className="text-center text-3xl font-bold text-foreground tracking-wide">
  {currentTime}
</Text>

{/* Scan button */}
<Button
  onPress={handleCapture}
  {/* ... sin cambios ... */}
```

- [ ] **Step 2.2** — Verificar type check:

```bash
cd apps/mobile && bunx tsc --noEmit
```

---

## Task 3 — Verificacion visual

- [ ] **Step 3.1** — Ejecutar la app en simulador/dispositivo.
- [ ] **Step 3.2** — Confirmar que el reloj aparece en la tarjeta inferior entre el device status y el boton.
- [ ] **Step 3.3** — Confirmar que los segundos avanzan (reloj en vivo).
- [ ] **Step 3.4** — Confirmar que al navegar a otra pantalla y volver, el reloj sigue correcto.
- [ ] **Step 3.5** — Confirmar que con dispositivo no vinculado (empty state) el reloj NO aparece.

---

## Self-Review

- [ ] El `setInterval` se limpia en el cleanup del `useEffect` (sin memory leak).
- [ ] El reloj usa `toLocaleTimeString` con formato `HH:mm:ss` del locale del dispositivo.
- [ ] El reloj esta posicionado entre el device status y el boton de escaneo.
- [ ] El texto es grande (`text-3xl`) y bold para visibilidad.
- [ ] No se modificaron endpoints del API.
- [ ] El type check de TypeScript pasa sin errores.
