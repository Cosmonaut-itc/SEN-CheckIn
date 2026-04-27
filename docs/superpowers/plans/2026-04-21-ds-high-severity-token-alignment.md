# Design System High-Severity Token Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Design Spec:** `docs/superpowers/specs/2026-04-21-ds-high-severity-token-alignment-design.md`

**Goal:** Align all HIGH severity token deviations between the SEN Design System canonical source and the jale. implementation across web and mobile.

**Architecture:** Three files own the tokens: `packages/design-tokens/src/tokens.css` (CSS vars for web), `packages/design-tokens/src/index.ts` (TypeScript objects), and `apps/mobile/global.css` (OKLch CSS vars for mobile). The web `globals.css` has a broken radius `@theme`. All changes are value-only.

**Tech Stack:** CSS custom properties, TypeScript, Tailwind CSS v4 `@theme`, OKLch color space (mobile)

---

## Reglas obligatorias para el agente implementador

1. **TDD:** Antes de modificar cualquier archivo de tokens, escribir un test que valide los valores esperados. El test DEBE fallar antes de la correccion y pasar despues. Correr los tests antes de avanzar a la siguiente task.
2. **Rama:** Crear la rama `fix/ds-token-alignment` desde `main` antes de cualquier cambio. Todos los commits van a esta rama.
3. **Commits atomicos:** Cada task genera exactamente un commit con mensaje convencional (`fix(scope): ...`). No acumular cambios de multiples tasks en un solo commit.
4. **Screenshots:** Despues de cada task que afecte UI, tomar screenshot del antes y despues en el browser/simulador y adjuntarla en el chat para verificacion visual. Usar la herramienta de Playwright para screenshots web.
5. **Validacion obligatoria:** Antes de avanzar a la siguiente task, ejecutar `bun run check-types` y `bun run lint`. Si fallan, corregir antes de commitear.
6. **No modificar componentes:** Este plan es exclusivamente de valores de tokens. No tocar ningun componente, layout, ni logica.

---

## DS Canonical Reference Values (Michoacan)

Estos son los valores de `/Users/cosmonaut/Documents/SEN Design System/colors_and_type.css` que sirven como fuente de verdad:

```
Light semantic:   success=#4A7C3F  warning=#C98A16  destructive=#B03A2E  info=#2E6DB4
Light border:     border-strong=#D3C5B8
Dark brand:       foreground=#F1E9DE  muted-fg=#B4A090  border=#2E241E  border-strong=#3E312A  primary-hover=#E09672
Radius:           sm=6px  md=10px  lg=14px  xl=20px
```

---

## File Map

| File | Action | Task |
|------|--------|------|
| `packages/design-tokens/src/tokens.test.ts` | Create | Task 1 |
| `packages/design-tokens/src/tokens.css` | Modify | Task 2, 3 |
| `packages/design-tokens/src/index.ts` | Modify | Task 4 |
| `apps/mobile/global.css` | Modify | Task 5 |
| `apps/web/app/globals.css` | Modify | Task 6 |

---

## Task 0: Setup — crear rama y verificar estado base

**Files:** ninguno

- [ ] **Step 1: Crear rama desde main**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git checkout main
git pull origin main
git checkout -b fix/ds-token-alignment
```

- [ ] **Step 2: Verificar que el proyecto compila limpio**

```bash
bun run check-types
bun run lint
```

Expected: Todo pasa sin errores. Si hay errores preexistentes, documentarlos pero no corregirlos — estan fuera de scope.

- [ ] **Step 3: Tomar screenshots del estado actual (ANTES)**

Levantar la web y tomar screenshot del dashboard en light y dark mode. Estos son los "antes" para comparar al final.

```bash
bun run dev:web
```

Usar Playwright o el browser para capturar:
- Web dashboard light mode
- Web dashboard dark mode
- Un formulario o pantalla con inputs y botones (para ver radius)

Adjuntar las screenshots en el chat.

---

## Task 1: TDD — escribir tests de valores de tokens

**Files:**
- Create: `packages/design-tokens/src/tokens.test.ts`

- [ ] **Step 1: Escribir el test file**

```typescript
import { describe, expect, it } from 'bun:test';
import { michoacanTokens, michoacanShared } from './index';

describe('Design System Token Compliance — Michoacan', () => {
	describe('Light mode semantic colors', () => {
		const status = michoacanTokens.light.colors.status;

		it('success matches DS canonical #4A7C3F', () => {
			expect(status.success).toBe('#4A7C3F');
		});

		it('warning matches DS canonical #C98A16', () => {
			expect(status.warning).toBe('#C98A16');
		});

		it('error matches DS canonical #B03A2E', () => {
			expect(status.error).toBe('#B03A2E');
		});

		it('info matches DS canonical #2E6DB4 (blue, not green)', () => {
			expect(status.info).toBe('#2E6DB4');
		});
	});

	describe('Light mode border-strong', () => {
		it('matches DS canonical #D3C5B8', () => {
			expect(michoacanTokens.light.colors.border.strong).toBe('#D3C5B8');
		});
	});

	describe('Dark mode brand tokens', () => {
		const dark = michoacanTokens.dark.colors;

		it('foreground matches DS canonical #F1E9DE', () => {
			expect(dark.text.primary).toBe('#F1E9DE');
		});

		it('muted-fg matches DS canonical #B4A090', () => {
			expect(dark.text.tertiary).toBe('#B4A090');
		});

		it('border matches DS canonical #2E241E', () => {
			expect(dark.border.default).toBe('#2E241E');
		});

		it('border-strong matches DS canonical #3E312A', () => {
			expect(dark.border.strong).toBe('#3E312A');
		});

		it('primary-hover matches DS canonical #E09672', () => {
			expect(dark.accent.primaryHover).toBe('#E09672');
		});
	});

	describe('Dark mode semantic colors derive from correct DS base', () => {
		const status = michoacanTokens.dark.colors.status;

		it('info is blue-derived, not green', () => {
			// DS info base is #2E6DB4 (blue). Dark variant must NOT be green.
			// #7FB573 is green (wrong), #5A9AD4 is blue (correct)
			expect(status.info).not.toBe('#7FB573');
			expect(status.info).not.toBe('#4A7C3F');
		});

		it('success is green-derived from DS #4A7C3F', () => {
			// Dark success should be lighter green, not the old #5CC98A from wrong base
			expect(status.success).toBe('#7FB573');
		});
	});

	describe('Radius scale', () => {
		const radius = michoacanShared.radius;

		it('sm is 6px', () => {
			expect(radius.sm).toBe('6px');
		});

		it('md is 10px', () => {
			expect(radius.md).toBe('10px');
		});

		it('lg is 14px', () => {
			expect(radius.lg).toBe('14px');
		});

		it('xl is 20px', () => {
			expect(radius.xl).toBe('20px');
		});
	});
});
```

- [ ] **Step 2: Correr los tests — DEBEN FALLAR**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/packages/design-tokens && bun test src/tokens.test.ts
```

Expected: Los tests de semantic colors, border-strong, y dark-mode brand tokens fallan. Los tests de radius pasan (el TS tiene los valores correctos, el problema es solo en el CSS del web). Verificar que al menos 8-10 tests fallan.

- [ ] **Step 3: Commit el test file**

```bash
git add packages/design-tokens/src/tokens.test.ts
git commit -m "test(tokens): add DS compliance tests for Michoacan palette

Tests validate that TypeScript token values match the SEN Design
System canonical source. Tests fail on current values — semantic
colors, border-strong, and dark mode brand tokens have drifted."
```

---

## Task 2: Fix light-mode semantic colors + border-strong en `tokens.css`

**Files:**
- Modify: `packages/design-tokens/src/tokens.css` (`:root` block, lines 18-41)

- [ ] **Step 1: Corregir los 5 valores light-mode**

En `packages/design-tokens/src/tokens.css`, en el bloque `:root`:

OLD:
```css
	--border-strong: #d1c2b6;
```
NEW:
```css
	--border-strong: #D3C5B8;
```

OLD:
```css
	--status-success: #2d8659;
	--status-success-bg: rgba(45, 134, 89, 0.1);
	--status-warning: #cc8a17;
	--status-warning-bg: rgba(204, 138, 23, 0.1);
	--status-error: #c4302b;
	--status-error-bg: rgba(196, 48, 43, 0.1);
	--status-info: #4a7c3f;
	--status-info-bg: rgba(74, 124, 63, 0.1);
```
NEW:
```css
	--status-success: #4A7C3F;
	--status-success-bg: rgba(74, 124, 63, 0.1);
	--status-warning: #C98A16;
	--status-warning-bg: rgba(201, 138, 22, 0.1);
	--status-error: #B03A2E;
	--status-error-bg: rgba(176, 58, 46, 0.1);
	--status-info: #2E6DB4;
	--status-info-bg: rgba(46, 109, 180, 0.1);
```

- [ ] **Step 2: Verificar build**

```bash
bun run check-types && bun run lint
```

Expected: Pasa sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/design-tokens/src/tokens.css
git commit -m "fix(tokens): align light-mode semantic colors with DS canonical

success (#4A7C3F), warning (#C98A16), destructive (#B03A2E),
info (#2E6DB4), and border-strong (#D3C5B8) now match the SEN
Design System source. Most critically, info returns to blue."
```

---

## Task 3: Fix dark-mode brand tokens en `tokens.css`

**Files:**
- Modify: `packages/design-tokens/src/tokens.css` (`.dark` block, lines 99-145)

- [ ] **Step 1: Corregir los 5 valores dark-mode de marca**

En el bloque `.dark` de `packages/design-tokens/src/tokens.css`:

OLD:
```css
	--text-primary: #f0eae4;
```
NEW:
```css
	--text-primary: #F1E9DE;
```

OLD:
```css
	--text-tertiary: #9a8b80;
```
NEW:
```css
	--text-tertiary: #B4A090;
```

OLD:
```css
	--border-default: #3d3028;
```
NEW:
```css
	--border-default: #2E241E;
```

OLD:
```css
	--border-strong: #4d3f36;
```
NEW:
```css
	--border-strong: #3E312A;
```

OLD:
```css
	--accent-primary-hover: #e09a78;
```
NEW:
```css
	--accent-primary-hover: #E09672;
```

- [ ] **Step 2: Verificar build**

```bash
bun run check-types && bun run lint
```

Expected: Pasa sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/design-tokens/src/tokens.css
git commit -m "fix(tokens): align dark-mode brand tokens with DS canonical

foreground (#F1E9DE), muted-fg (#B4A090), border (#2E241E),
border-strong (#3E312A), primary-hover (#E09672) now match DS."
```

---

## Task 4: Fix TypeScript token objects en `index.ts`

**Files:**
- Modify: `packages/design-tokens/src/index.ts` (lines 155-253)

- [ ] **Step 1: Corregir light-mode border.strong**

OLD:
```typescript
			strong: '#D1C2B6',
```
NEW:
```typescript
			strong: '#D3C5B8',
```

- [ ] **Step 2: Corregir light-mode status**

OLD:
```typescript
			status: {
				success: '#2D8659',
				successBg: 'rgba(45, 134, 89, 0.10)',
				warning: '#CC8A17',
				warningBg: 'rgba(204, 138, 23, 0.10)',
				error: '#C4302B',
				errorBg: 'rgba(196, 48, 43, 0.10)',
				info: '#4A7C3F',
				infoBg: 'rgba(74, 124, 63, 0.10)',
			},
```
NEW:
```typescript
			status: {
				success: '#4A7C3F',
				successBg: 'rgba(74, 124, 63, 0.10)',
				warning: '#C98A16',
				warningBg: 'rgba(201, 138, 22, 0.10)',
				error: '#B03A2E',
				errorBg: 'rgba(176, 58, 46, 0.10)',
				info: '#2E6DB4',
				infoBg: 'rgba(46, 109, 180, 0.10)',
			},
```

- [ ] **Step 3: Corregir dark-mode text.primary y text.tertiary**

OLD:
```typescript
			text: {
				primary: '#F0EAE4',
				secondary: '#D6CCC3',
				tertiary: '#9A8B80',
```
NEW:
```typescript
			text: {
				primary: '#F1E9DE',
				secondary: '#D6CCC3',
				tertiary: '#B4A090',
```

- [ ] **Step 4: Corregir dark-mode border**

OLD:
```typescript
			border: {
				default: '#3D3028',
				subtle: '#2D231C',
				strong: '#4D3F36',
			},
```
NEW:
```typescript
			border: {
				default: '#2E241E',
				subtle: '#2D231C',
				strong: '#3E312A',
			},
```

- [ ] **Step 5: Corregir dark-mode accent.primaryHover**

OLD:
```typescript
				primaryHover: '#E09A78',
```
NEW:
```typescript
				primaryHover: '#E09672',
```

- [ ] **Step 6: Corregir dark-mode status (rebase a colores DS correctos)**

OLD:
```typescript
			status: {
				success: '#5CC98A',
				successBg: 'rgba(92, 201, 138, 0.16)',
				warning: '#E8B44A',
				warningBg: 'rgba(232, 180, 74, 0.16)',
				error: '#E8605A',
				errorBg: 'rgba(232, 96, 90, 0.16)',
				info: '#7FB573',
				infoBg: 'rgba(127, 181, 115, 0.16)',
			},
```
NEW:
```typescript
			status: {
				success: '#7FB573',
				successBg: 'rgba(127, 181, 115, 0.16)',
				warning: '#E8B44A',
				warningBg: 'rgba(232, 180, 74, 0.16)',
				error: '#D4685E',
				errorBg: 'rgba(212, 104, 94, 0.16)',
				info: '#5A9AD4',
				infoBg: 'rgba(90, 154, 212, 0.16)',
			},
```

- [ ] **Step 7: Correr los tests — DEBEN PASAR**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/packages/design-tokens && bun test src/tokens.test.ts
```

Expected: TODOS los tests pasan. Si alguno falla, corregir antes de continuar.

- [ ] **Step 8: Correr check-types y lint**

```bash
bun run check-types && bun run lint
```

Expected: Pasa sin errores.

- [ ] **Step 9: Commit**

```bash
git add packages/design-tokens/src/index.ts
git commit -m "fix(tokens): align TypeScript token objects with DS canonical

Light semantic colors use DS values. Dark semantic colors rebase
lighter variants on correct DS base colors. Info is now blue-derived
(#5A9AD4) not green. Border and text dark values match DS."
```

---

## Task 5: Fix mobile OKLch tokens en `global.css`

**Files:**
- Modify: `apps/mobile/global.css` (lines 8-140)

Conversiones OKLch calculadas desde los hex canonicos. Cada linea incluye el hex target en el comentario para verificacion humana.

- [ ] **Step 1: Corregir light-mode semantic colors**

En `apps/mobile/global.css`, en el bloque `@variant light`:

OLD:
```css
		--success: oklch(0.5551 0.1100 157.45); /* #2D8659 */
		--success-foreground: oklch(1 0 0); /* #FFFFFF */
		--success-bg: rgba(45, 134, 89, 0.10); /* #2D8659 @ 10% */
```
NEW:
```css
		--success: oklch(0.5353 0.1056 140.03); /* #4A7C3F */
		--success-foreground: oklch(1 0 0); /* #FFFFFF */
		--success-bg: rgba(74, 124, 63, 0.10); /* #4A7C3F @ 10% */
```

OLD:
```css
		--warning: oklch(0.6835 0.1395 73.74); /* #CC8A17 */
		--warning-bg: rgba(204, 138, 23, 0.10); /* #CC8A17 @ 10% */
```
NEW:
```css
		--warning: oklch(0.6690 0.1452 73.20); /* #C98A16 */
		--warning-bg: rgba(201, 138, 22, 0.10); /* #C98A16 @ 10% */
```

OLD:
```css
		--destructive: oklch(0.5417 0.1856 27.43); /* #C4302B */
		--destructive-bg: rgba(196, 48, 43, 0.10); /* #C4302B @ 10% */
```
NEW:
```css
		--destructive: oklch(0.4893 0.1326 24.83); /* #B03A2E */
		--destructive-bg: rgba(176, 58, 46, 0.10); /* #B03A2E @ 10% */
```

OLD:
```css
		--info: oklch(0.5353 0.1056 140.03); /* #4A7C3F */
		--info-bg: rgba(74, 124, 63, 0.10); /* #4A7C3F @ 10% */
```
NEW:
```css
		--info: oklch(0.4965 0.1140 252.26); /* #2E6DB4 */
		--info-bg: rgba(46, 109, 180, 0.10); /* #2E6DB4 @ 10% */
```

OLD:
```css
		--ring: oklch(0.8231 0.0237 61.17); /* #D1C2B6 */
```
NEW:
```css
		--ring: oklch(0.8329 0.0216 62.50); /* #D3C5B8 */
```

- [ ] **Step 2: Corregir dark-mode brand tokens**

En el bloque `@variant dark`:

OLD:
```css
		--foreground: oklch(0.9401 0.0103 67.70); /* #F0EAE4 */
```
NEW:
```css
		--foreground: oklch(0.9433 0.0117 69.82); /* #F1E9DE */
```

OLD:
```css
		--muted-foreground: oklch(0.6469 0.0242 58.58); /* #9A8B80 */
```
NEW:
```css
		--muted-foreground: oklch(0.7315 0.0282 58.43); /* #B4A090 */
```

OLD:
```css
		--border: oklch(0.3211 0.0235 53.25); /* #3D3028 */
```
NEW:
```css
		--border: oklch(0.2622 0.0192 49.80); /* #2E241E */
```

OLD:
```css
		--ring: oklch(0.3796 0.0246 54.54); /* #4D3F36 */
```
NEW:
```css
		--ring: oklch(0.3231 0.0224 51.73); /* #3E312A */
```

OLD:
```css
		--primary-hover: oklch(0.7471 0.0965 46.71); /* #E09A78 */
```
NEW:
```css
		--primary-hover: oklch(0.7358 0.0999 45.12); /* #E09672 */
```

- [ ] **Step 3: Corregir dark-mode semantic colors (rebase)**

OLD:
```css
		--success: oklch(0.7554 0.1365 155.68); /* #5CC98A */
		--success-bg: rgba(92, 201, 138, 0.16); /* #5CC98A @ 16% */
```
NEW:
```css
		--success: oklch(0.7187 0.1088 139.95); /* #7FB573 */
		--success-bg: rgba(127, 181, 115, 0.16); /* #7FB573 @ 16% */
```

OLD:
```css
		--destructive: oklch(0.6605 0.1703 25.37); /* #E8605A */
		--destructive-bg: rgba(232, 96, 90, 0.16); /* #E8605A @ 16% */
```
NEW:
```css
		--destructive: oklch(0.6310 0.1080 29.52); /* #D4685E */
		--destructive-bg: rgba(212, 104, 94, 0.16); /* #D4685E @ 16% */
```

OLD:
```css
		--info: oklch(0.7187 0.1088 139.95); /* #7FB573 */
		--info-bg: rgba(127, 181, 115, 0.16); /* #7FB573 @ 16% */
```
NEW:
```css
		--info: oklch(0.6340 0.1020 249.52); /* #5A9AD4 */
		--info-bg: rgba(90, 154, 212, 0.16); /* #5A9AD4 @ 16% */
```

- [ ] **Step 4: Verificar que mobile compila**

```bash
bun run check-types:mobile && bun run lint:mobile
```

Expected: Pasa sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/global.css
git commit -m "fix(mobile): align OKLch tokens with DS canonical

Light semantic colors match DS source. Dark semantic colors rebase
on correct DS values. Info is now blue-derived in both modes.
Dark brand tokens (foreground, borders, primary-hover) fixed."
```

---

## Task 6: Fix web radius @theme — valores absolutos del DS

**Files:**
- Modify: `apps/web/app/globals.css` (lines 49-53)
- Modify: `packages/design-tokens/src/tokens.css` (remove `--radius` base var)

- [ ] **Step 1: Reemplazar calc con valores absolutos**

En `apps/web/app/globals.css`, en el bloque `@theme inline`:

OLD:
```css
	--radius-sm: calc(var(--radius) - 4px);
	--radius-md: calc(var(--radius) - 2px);
	--radius-lg: var(--radius);
	--radius-xl: calc(var(--radius) + 4px);
```
NEW:
```css
	--radius-sm: 6px;
	--radius-md: 10px;
	--radius-lg: 14px;
	--radius-xl: 20px;
```

- [ ] **Step 2: Eliminar `--radius` base variable de tokens.css**

En `packages/design-tokens/src/tokens.css`, eliminar esta linea del bloque `:root`:

```css
	--radius: 0.625rem;
```

Esta variable solo era consumida por las formulas calc. Ya no se necesita.

- [ ] **Step 3: Correr todos los tests y verificaciones**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/packages/design-tokens && bun test src/tokens.test.ts
bun run check-types && bun run lint
```

Expected: Todos los tests pasan. Lint y types limpios.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css packages/design-tokens/src/tokens.css
git commit -m "fix(web): use absolute DS radius values in Tailwind @theme

Replace shadcn calc-based radius formula (md=8px, lg=10px, xl=14px)
with DS canonical absolutes (md=10px, lg=14px, xl=20px). Buttons
and inputs now correctly rounded at 10px."
```

---

## Task 7: Smoke test visual — screenshots DESPUES

- [ ] **Step 1: Levantar web y tomar screenshots**

```bash
bun run dev:web
```

Usar Playwright para capturar screenshots de:
- Dashboard light mode
- Dashboard dark mode
- Pantalla con inputs/botones (para verificar radius)
- Cualquier pantalla con badges de status (para verificar que info es azul)

Adjuntar las screenshots en el chat junto con las de "antes" de Task 0.

- [ ] **Step 2: Verificar visualmente**

Comparar antes vs despues:
- [ ] Botones tienen esquinas visiblemente mas redondeadas (10px vs 8px)
- [ ] Badges/indicadores de info son azules, no verdes
- [ ] Dark mode tiene bordes mas oscuros y sutiles
- [ ] No hay elementos rotos ni colores inesperados

- [ ] **Step 3: Si mobile esta disponible, levantar y verificar**

```bash
bun run dev:mobile
```

Tomar screenshots del simulador/dispositivo en light y dark mode. Adjuntar en el chat.

- [ ] **Step 4: Correr test suite completa**

```bash
bun run lint && bun run check-types
```

Expected: Todo pasa.

- [ ] **Step 5: Push de la rama**

```bash
git push -u origin fix/ds-token-alignment
```
