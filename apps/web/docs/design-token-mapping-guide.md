# Michoacán Token Mapping Guide (Web)

## Scope

- Web app: `apps/web`
- Shared token source: `packages/design-tokens`
- Brand system: Michoacán palette + `jale. by SEN`

## Token Layers

### Layer 1: Brand variables

Defined in `packages/design-tokens/src/tokens.css`:

- `--bg-*`
- `--text-*`
- `--accent-*`
- `--status-*`

These variables are the brand contract and should be treated as the source for UI colors.

### Layer 2: shadcn variables

Defined in `apps/web/app/globals.css`, mapped from brand variables:

- `--background`, `--foreground`
- `--primary`, `--secondary`, `--muted`, `--accent`
- `--destructive`, `--border`, `--input`, `--ring`

This keeps `new-york` shadcn ergonomics while enforcing brand consistency.

## Typography Contract

Configured in `apps/web/app/layout.tsx` via `next/font/google`:

- Body: `DM Sans`
- Display/headlines: `Playfair Display`
- Technical/mono content: `JetBrains Mono`

## Component Mapping

Primary component updates aligned to tokens:

- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/badge.tsx`
- `apps/web/components/ui/alert.tsx`
- `apps/web/components/ui/input.tsx`
- `apps/web/components/ui/textarea.tsx`
- `apps/web/components/ui/select.tsx`
- `apps/web/components/ui/table.tsx`
- `apps/web/components/ui/dialog.tsx`
- `apps/web/components/ui/sheet.tsx`
- `apps/web/components/ui/tooltip.tsx`
- `apps/web/components/ui/tabs.tsx`
- `apps/web/components/ui/sonner.tsx`

Auxiliary surfaces themed with token fallbacks:

- `apps/web/components/ui/map.tsx`
- `apps/web/components/signature-canvas-dialog.tsx`

## E2E Selector Contract

Design/copy resilient test selectors were standardized with `data-testid` for critical flows:

- Payroll holidays management (`payroll-holiday-*`)
- Payroll receipts + holiday notices (`payroll-run-*`)
- PTU/Aguinaldo runs and receipts (`ptu-run-*`, `aguinaldo-run-*`)
- Disciplinary measures detail/status actions (`disciplinary-measure-*`)

Specs updated under `apps/web/e2e` now depend on stable selectors instead of translatable text.

## Color Hardcode Guardrail

Guardrail script:

- `apps/web/scripts/check-color-hardcodes.ts`

Integrated in web lint pipeline:

- `apps/web/package.json`
- `lint` now runs `check:colors` before `eslint`

Rule summary:

- Blocks hardcoded `#hex` and `rgba(...)` in `apps/web` source files.
- Allows only explicit whitelist files when needed.

## Safe Extension Rules

When adding new UI:

1. Prefer existing brand variables (`--accent-*`, `--text-*`, `--bg-*`).
2. If adding a new token, define it first in `packages/design-tokens`.
3. Map new semantics in `globals.css` only when needed by shadcn primitives.
4. Never bypass guardrail with inline hardcoded colors outside whitelist.
5. Add/update `data-testid` for any critical interaction that appears in e2e flows.
