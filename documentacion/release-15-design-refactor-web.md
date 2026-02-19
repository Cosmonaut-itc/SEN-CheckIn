# Release 15: Refactor Visual Web Michoacán + Rebrand `jale. by SEN`

## Resumen

- Rama: `codex/refactor-web-design-michoacan`
- Alcance: `apps/web` completo (dashboard, auth, marketing, componentes custom)
- Base visual: `design/SEN_Design_System_Web_Michoacan.html`
- Branding aplicado: `jale. by SEN` (`shortName`: `JL`)
- Entrega técnica: tokens compartidos, convergencia visual, hardening e2e, guardrails de color y evidencia visual

## Bloque 4 (QA + Hardening)

### Cambios implementados

1. Selectores e2e endurecidos (`data-testid`/roles estables) para resiliencia frente a cambios de copy/diseño.
2. Guardrail de color para bloquear hardcodes (`#hex`, `rgba(...)`) fuera de whitelist explícita.
3. Capturas visuales `before/after` light/dark en rutas core y smoke en rutas secundarias.
4. Guía técnica de mapeo de tokens/componentes agregada en `apps/web/docs/design-token-mapping-guide.md`.

### Commits del bloque

- `test(web): harden e2e selectors for design and copy resilience`
- `chore(web): add color-hardcode guardrail checks`
- `docs: add release-15 design refactor report with visual evidence`

## Validación técnica

Comandos ejecutados en la rama de trabajo:

- `bun run lint:web` ✅
- `bun run check-types:web` ✅
- `bun run test:web:unit` ✅
- `bun run test:web:e2e` ✅
- `bun run lint` ✅
- `bun run check-types` ✅

## Evidencia visual

### Metodología

- `after`: capturas en `codex/refactor-web-design-michoacan`.
- `before`: baseline capturado desde `origin/main` (worktree temporal).
- Modo: light y dark.
- Viewport: escritorio (`1600x1000`).

## Rutas core (before/after, light/dark)

### `/dashboard`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![dashboard before light](./assets/release-15/before/core/light/dashboard.png) | ![dashboard after light](./assets/release-15/after/core/light/dashboard.png) | ![dashboard before dark](./assets/release-15/before/core/dark/dashboard.png) | ![dashboard after dark](./assets/release-15/after/core/dark/dashboard.png) |

### `/employees`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![employees before light](./assets/release-15/before/core/light/employees.png) | ![employees after light](./assets/release-15/after/core/light/employees.png) | ![employees before dark](./assets/release-15/before/core/dark/employees.png) | ![employees after dark](./assets/release-15/after/core/dark/employees.png) |

### `/attendance`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![attendance before light](./assets/release-15/before/core/light/attendance.png) | ![attendance after light](./assets/release-15/after/core/light/attendance.png) | ![attendance before dark](./assets/release-15/before/core/dark/attendance.png) | ![attendance after dark](./assets/release-15/after/core/dark/attendance.png) |

### `/payroll`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![payroll before light](./assets/release-15/before/core/light/payroll.png) | ![payroll after light](./assets/release-15/after/core/light/payroll.png) | ![payroll before dark](./assets/release-15/before/core/dark/payroll.png) | ![payroll after dark](./assets/release-15/after/core/dark/payroll.png) |

### `/sign-in`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![sign-in before light](./assets/release-15/before/core/light/sign-in.png) | ![sign-in after light](./assets/release-15/after/core/light/sign-in.png) | ![sign-in before dark](./assets/release-15/before/core/dark/sign-in.png) | ![sign-in after dark](./assets/release-15/after/core/dark/sign-in.png) |

### `/sign-up`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![sign-up before light](./assets/release-15/before/core/light/sign-up.png) | ![sign-up after light](./assets/release-15/after/core/light/sign-up.png) | ![sign-up before dark](./assets/release-15/before/core/dark/sign-up.png) | ![sign-up after dark](./assets/release-15/after/core/dark/sign-up.png) |

### `/`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![home before light](./assets/release-15/before/core/light/home.png) | ![home after light](./assets/release-15/after/core/light/home.png) | ![home before dark](./assets/release-15/before/core/dark/home.png) | ![home after dark](./assets/release-15/after/core/dark/home.png) |

### `/privacidad`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![privacidad before light](./assets/release-15/before/core/light/privacidad.png) | ![privacidad after light](./assets/release-15/after/core/light/privacidad.png) | ![privacidad before dark](./assets/release-15/before/core/dark/privacidad.png) | ![privacidad after dark](./assets/release-15/after/core/dark/privacidad.png) |

### `/registrate`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![registrate before light](./assets/release-15/before/core/light/registrate.png) | ![registrate after light](./assets/release-15/after/core/light/registrate.png) | ![registrate before dark](./assets/release-15/before/core/dark/registrate.png) | ![registrate after dark](./assets/release-15/after/core/dark/registrate.png) |

## Smoke visual (rutas secundarias)

### `/acceso-restringido`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![acceso-restringido before light](./assets/release-15/before/smoke/light/acceso-restringido.png) | ![acceso-restringido after light](./assets/release-15/after/smoke/light/acceso-restringido.png) | ![acceso-restringido before dark](./assets/release-15/before/smoke/dark/acceso-restringido.png) | ![acceso-restringido after dark](./assets/release-15/after/smoke/dark/acceso-restringido.png) |

### `/device`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![device before light](./assets/release-15/before/smoke/light/device.png) | ![device after light](./assets/release-15/after/smoke/light/device.png) | ![device before dark](./assets/release-15/before/smoke/dark/device.png) | ![device after dark](./assets/release-15/after/smoke/dark/device.png) |

### `/registro-pruebas`

| Before Light | After Light | Before Dark | After Dark |
| --- | --- | --- | --- |
| ![registro-pruebas before light](./assets/release-15/before/smoke/light/registro-pruebas.png) | ![registro-pruebas after light](./assets/release-15/after/smoke/light/registro-pruebas.png) | ![registro-pruebas before dark](./assets/release-15/before/smoke/dark/registro-pruebas.png) | ![registro-pruebas after dark](./assets/release-15/after/smoke/dark/registro-pruebas.png) |

## Checklist de aceptación

- Tema `light/dark/system` funcional y persistente. ✅
- Tipografía global (DM Sans/Playfair/JetBrains) consistente. ✅
- Sin hardcodes de color fuera de whitelist. ✅
- Primitives y componentes críticos alineados a tokens. ✅
- Rebrand visible en metadata y copy clave (`jale. by SEN`, `JL`). ✅
- Lint/types/unit/e2e en verde. ✅
