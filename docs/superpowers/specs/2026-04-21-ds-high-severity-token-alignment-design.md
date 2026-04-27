# FIX: Alinear tokens de alta severidad con el Design System canonico de SEN

**Fecha:** 2026-04-21
**Rama:** `fix/ds-token-alignment`
**PR destino:** `main`

## Contexto

Se realizo una auditoria de compliance entre el Design System canonico de SEN (`/Users/cosmonaut/Documents/SEN Design System/colors_and_type.css`) y la implementacion actual del proyecto jale. (web + mobile). Se encontraron desviaciones de alta severidad en tres areas que afectan la identidad visual del producto.

### Fuente de verdad

El archivo canonico es `/Users/cosmonaut/Documents/SEN Design System/colors_and_type.css`. Este define la paleta Michoacan para jale./checa. con valores exactos. Cualquier diferencia entre este archivo y la implementacion se considera un drift que debe corregirse.

## Estado actual

### 1. Colores semanticos (light mode) — INCORRECTO

Los colores de status en `packages/design-tokens/src/tokens.css` e `index.ts` difieren del DS:

| Token | DS Canonico | Implementacion actual | Delta |
|-------|-------------|----------------------|-------|
| success | `#4A7C3F` | `#2D8659` | Verde diferente |
| warning | `#C98A16` | `#CC8A17` | Drift leve |
| destructive | `#B03A2E` | `#C4302B` | Rojo diferente |
| info | `#2E6DB4` (azul) | `#4A7C3F` (verde) | **Completamente distinto** |
| border-strong | `#D3C5B8` | `#D1C2B6` | Drift leve |

El caso mas critico: `info` paso de azul a verde, perdiendo toda distincion semantica con `success` y `secondary`.

### 2. Tokens dark mode — INCORRECTO

Los valores de marca en dark mode han derivado:

| Token | DS Canonico | Implementacion actual |
|-------|-------------|----------------------|
| foreground | `#F1E9DE` | `#F0EAE4` |
| muted-fg | `#B4A090` | `#9A8B80` |
| border | `#2E241E` | `#3D3028` |
| border-strong | `#3E312A` | `#4D3F36` |
| primary-hover | `#E09672` | `#E09A78` |

Los bordes en dark mode son significativamente mas claros de lo que el DS especifica, reduciendo el contraste intencional del diseno.

### 3. Radius web — INCORRECTO

El `@theme` de Tailwind en `apps/web/app/globals.css` usa la formula calc de shadcn en lugar de los valores absolutos del DS:

| Token | DS Canonico | Web actual | Diferencia |
|-------|-------------|-----------|------------|
| radius-sm | 6px | 6px | OK |
| radius-md | 10px | 8px | -2px |
| radius-lg | 14px | 10px | -4px |
| radius-xl | 20px | 14px | -6px |

Esto causa que botones, inputs y otros componentes con `rounded-md` se rendericen 2px menos redondeados de lo especificado. Cards con `rounded-xl` obtienen 14px en vez de 20px.

## Objetivo

Corregir todos los valores de tokens para que coincidan exactamente con el DS canonico. Los cambios son exclusivamente de valores — no se modifica ninguna estructura, API, componente, ni logica.

## Enfoque recomendado

Corregir los 4 archivos que contienen tokens, en orden de dependencia:

1. `packages/design-tokens/src/tokens.css` — CSS vars consumidas por web
2. `packages/design-tokens/src/index.ts` — objetos TypeScript consumidos programaticamente
3. `apps/mobile/global.css` — CSS vars en OKLch consumidas por mobile
4. `apps/web/app/globals.css` — `@theme` de Tailwind (solo radius)

### Razones

- Cambios de valor puro — cero riesgo de regresion funcional.
- El paquete `design-tokens` es compartido; corregirlo ahi propaga a web automaticamente.
- Mobile tiene su propio archivo CSS con valores en OKLch que deben actualizarse independientemente.
- El radius del web es un problema aislado en el `@theme` de Tailwind.

### Nota sobre dark mode semantic colors

El DS canonico NO define colores semanticos separados para dark mode — usa los mismos que light. El proyecto agrego variantes mas claras para legibilidad en fondos oscuros, lo cual es una mejora valida de UX. Este spec mantiene esas adaptaciones pero las recalcula desde los valores BASE correctos del DS:

| Token | Base DS (light) | Dark adaptado (corregido) |
|-------|----------------|--------------------------|
| success | `#4A7C3F` | `#7FB573` (mas claro del verde correcto) |
| info | `#2E6DB4` | `#5A9AD4` (mas claro del azul correcto) |
| destructive | `#B03A2E` | `#D4685E` (mas claro del rojo correcto) |
| warning | `#C98A16` | `#E8B44A` / `#F0B840` (se mantienen, son derivados razonables) |

### Nota sobre primary-fg dark mode

El DS dice `--primary-fg: #110D0A` en dark mode (texto oscuro sobre el primary copper claro). Sin embargo, en el contexto shadcn/ui donde `--primary-foreground` se usa en botones sobre fondo `--primary` (`#D4835E`), el texto oscuro `#110D0A` NO tiene suficiente contraste WCAG AA. Se mantiene `#FFFFFF` — esto es una correccion de accesibilidad sobre el DS.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `packages/design-tokens/src/tokens.css` | Corregir colores semanticos light, border-strong, tokens dark mode de marca |
| `packages/design-tokens/src/index.ts` | Alinear objetos TS con los valores CSS corregidos |
| `apps/mobile/global.css` | Corregir valores OKLch para colores semanticos y tokens dark mode |
| `apps/web/app/globals.css` | Reemplazar formula calc de radius con valores absolutos del DS |

## Edge cases

1. **Componentes que usan status-info directamente:** Cambia de verde a azul. Cualquier componente que asuma que info es verde (ej. badge info con icono verde) se vera diferente. Verificar visualmente.
2. **Dark mode border contrast:** Los bordes en dark mode seran mas oscuros (`#2E241E` vs `#3D3028`). Verificar que el contenido no se pierda contra el fondo.
3. **Radius en componentes web:** Botones pasan de 8px a 10px, cards potencialmente de 14px a 20px si usan `rounded-xl`. Verificar que no se vean exageradamente redondeados.
4. **Color hardcode guardrail:** El script `check-color-hardcodes.ts` valida que no haya colores hardcodeados en componentes. Los cambios en este spec son solo en archivos de tokens, que estan excluidos del guardrail. No deberia haber conflicto.
5. **OKLch precision (mobile):** Las conversiones hex → OKLch tienen precision limitada. Los comentarios `/* #HEXVAL */` junto a cada valor OKLch sirven como referencia humana. La diferencia perceptual es imperceptible.

## Criterios de aceptacion

- [ ] Los 5 colores semanticos light mode (`success`, `warning`, `destructive`, `info`, `border-strong`) coinciden con el DS canonico en `tokens.css` e `index.ts`.
- [ ] Los 5 tokens dark mode de marca (`foreground`, `muted-fg`, `border`, `border-strong`, `primary-hover`) coinciden con el DS canonico.
- [ ] Los colores semanticos dark mode son variantes claras de los valores BASE correctos del DS (info es azul derivado, no verde).
- [ ] Los valores OKLch en `apps/mobile/global.css` corresponden a los hex correctos del DS (verificable por los comentarios inline).
- [ ] El `@theme` de Tailwind en `apps/web/app/globals.css` usa valores absolutos: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 20px`.
- [ ] `bun run lint` pasa sin errores.
- [ ] `bun run check-types` pasa sin errores.
- [ ] La web se renderiza correctamente en light y dark mode (verificado con screenshot).
- [ ] La mobile se renderiza correctamente en light y dark mode (verificado con screenshot).
- [ ] No se modifico ningun componente, endpoint, ni logica de negocio.
