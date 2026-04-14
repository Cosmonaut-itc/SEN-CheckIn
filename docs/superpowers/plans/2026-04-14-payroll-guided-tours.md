# Payroll Guided Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand payroll onboarding into one main tour plus auto-launched PTU and Aguinaldo sub-recorridos, each persisted independently and replayable from contextual help.

**Architecture:** Keep the existing `TourProvider` and `useTour` primitives. Add two new `tourId`s in the registry, control the active payroll tab in `PayrollPageClient`, and wire `useTour(...)` per active tab so the first visit to each tab launches the correct sub-tour. Use stable `data-tour` anchors on section containers instead of volatile controls or conditionally rendered rows.

**Tech Stack:** Next.js App Router, React 19, `react-joyride`, `next-intl`, Vitest, Testing Library

**Design Spec:** `docs/superpowers/specs/2026-04-14-payroll-guided-tours-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/lib/tours/payroll.ts` | Expand the main payroll tour to cover the regular payroll tab end-to-end. |
| Create | `apps/web/lib/tours/payroll-ptu.ts` | Define PTU-specific sub-tour steps. |
| Create | `apps/web/lib/tours/payroll-aguinaldo.ts` | Define Aguinaldo-specific sub-tour steps. |
| Modify | `apps/web/lib/tours/registry.ts` | Register both new sub-tours. |
| Modify | `apps/web/lib/tours/registry.test.ts` | Lock the expected selectors and placements for all three payroll tours. |
| Modify | `apps/web/app/(dashboard)/payroll/payroll-client.tsx` | Control the active tab, auto-launch the right tour, add contextual help routing, and add top-level tour anchors. |
| Modify | `apps/web/app/(dashboard)/payroll/ptu-tab.tsx` | Add stable `data-tour` anchors for PTU config, actions, summary, table, and history. |
| Modify | `apps/web/app/(dashboard)/payroll/aguinaldo-tab.tsx` | Add stable `data-tour` anchors for Aguinaldo config, actions, summary, table, and history. |
| Modify | `apps/web/app/(dashboard)/payroll/payroll-client.test.tsx` | Verify active-tab tour wiring and contextual help behavior. |
| Modify | `apps/web/components/tour-provider.test.tsx` | Verify translated Joyride steps for the expanded payroll tours. |
| Modify | `apps/web/messages/es.json` | Add Spanish tutorial copy for the new steps. |

---

### Task 1: Define the three payroll tours in the registry

**Files:**
- Create: `apps/web/lib/tours/payroll-ptu.ts`
- Create: `apps/web/lib/tours/payroll-aguinaldo.ts`
- Modify: `apps/web/lib/tours/payroll.ts`
- Modify: `apps/web/lib/tours/registry.ts`
- Test: `apps/web/lib/tours/registry.test.ts`

- [ ] **Step 1: Write the failing registry test first**

Add assertions in `apps/web/lib/tours/registry.test.ts` for:

```tsx
expect(getTourById('payroll')?.steps).toEqual([
	{ target: '[data-tour="payroll-tabs"]', contentKey: 'payroll.step1', placement: 'bottom' },
	{ target: '[data-tour="payroll-legal-rules"]', contentKey: 'payroll.step2', placement: 'bottom' },
	{ target: '[data-tour="payroll-insights"]', contentKey: 'payroll.step3', placement: 'bottom' },
	{ target: '[data-tour="payroll-process"]', contentKey: 'payroll.step4', placement: 'left' },
	{ target: '[data-testid="payroll-preview-table-container"]', contentKey: 'payroll.step5', placement: 'top' },
	{ target: '[data-tour="payroll-run-history"]', contentKey: 'payroll.step6', placement: 'top' },
	{ target: '[data-tour="payroll-tab-ptu"]', contentKey: 'payroll.step7', placement: 'bottom' },
	{ target: '[data-tour="payroll-tab-aguinaldo"]', contentKey: 'payroll.step8', placement: 'bottom' },
]);

expect(getTourById('payroll-ptu')?.steps).toEqual([
	{ target: '[data-tour="payroll-tab-ptu"]', contentKey: 'payrollPtu.step1', placement: 'bottom' },
	{ target: '[data-tour="payroll-ptu-config"]', contentKey: 'payrollPtu.step2', placement: 'bottom' },
	{ target: '[data-tour="payroll-ptu-actions"]', contentKey: 'payrollPtu.step3', placement: 'bottom' },
	{ target: '[data-tour="payroll-ptu-summary"]', contentKey: 'payrollPtu.step4', placement: 'top' },
	{ target: '[data-tour="payroll-ptu-table"]', contentKey: 'payrollPtu.step5', placement: 'top' },
	{ target: '[data-tour="payroll-ptu-history"]', contentKey: 'payrollPtu.step6', placement: 'top' },
]);

expect(getTourById('payroll-aguinaldo')?.steps).toEqual([
	{ target: '[data-tour="payroll-tab-aguinaldo"]', contentKey: 'payrollAguinaldo.step1', placement: 'bottom' },
	{ target: '[data-tour="payroll-aguinaldo-config"]', contentKey: 'payrollAguinaldo.step2', placement: 'bottom' },
	{ target: '[data-tour="payroll-aguinaldo-actions"]', contentKey: 'payrollAguinaldo.step3', placement: 'bottom' },
	{ target: '[data-tour="payroll-aguinaldo-summary"]', contentKey: 'payrollAguinaldo.step4', placement: 'top' },
	{ target: '[data-tour="payroll-aguinaldo-table"]', contentKey: 'payrollAguinaldo.step5', placement: 'top' },
	{ target: '[data-tour="payroll-aguinaldo-history"]', contentKey: 'payrollAguinaldo.step6', placement: 'top' },
]);
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `bunx vitest run apps/web/lib/tours/registry.test.ts`
Expected: FAIL because `payroll` still has 3 steps and `payroll-ptu` / `payroll-aguinaldo` are not registered.

- [ ] **Step 3: Implement the tour definitions**

Create `apps/web/lib/tours/payroll-ptu.ts`:

```ts
import type { TourConfig } from './types';

export const payrollPtuTour: TourConfig = {
	id: 'payroll-ptu',
	section: '/payroll',
	adminOnly: false,
	steps: [
		{ target: '[data-tour="payroll-tab-ptu"]', contentKey: 'payrollPtu.step1', placement: 'bottom' },
		{ target: '[data-tour="payroll-ptu-config"]', contentKey: 'payrollPtu.step2', placement: 'bottom' },
		{ target: '[data-tour="payroll-ptu-actions"]', contentKey: 'payrollPtu.step3', placement: 'bottom' },
		{ target: '[data-tour="payroll-ptu-summary"]', contentKey: 'payrollPtu.step4', placement: 'top' },
		{ target: '[data-tour="payroll-ptu-table"]', contentKey: 'payrollPtu.step5', placement: 'top' },
		{ target: '[data-tour="payroll-ptu-history"]', contentKey: 'payrollPtu.step6', placement: 'top' },
	],
};
```

Create `apps/web/lib/tours/payroll-aguinaldo.ts` with the symmetric `payrollAguinaldoTour`, and expand `apps/web/lib/tours/payroll.ts` to the 8-step shape from Step 1. Then register both tours in `apps/web/lib/tours/registry.ts`:

```ts
import { payrollAguinaldoTour } from './payroll-aguinaldo';
import { payrollPtuTour } from './payroll-ptu';

const tours: TourConfig[] = [
	// ...
	payrollTour,
	payrollPtuTour,
	payrollAguinaldoTour,
	payrollSettingsTour,
	// ...
];
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `bunx vitest run apps/web/lib/tours/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/tours/payroll.ts apps/web/lib/tours/payroll-ptu.ts apps/web/lib/tours/payroll-aguinaldo.ts apps/web/lib/tours/registry.ts apps/web/lib/tours/registry.test.ts
git commit -m "feat(web): add payroll sub-tour definitions"
```

---

### Task 2: Wire payroll tab state, auto-launch by tab, and contextual help

**Files:**
- Modify: `apps/web/app/(dashboard)/payroll/payroll-client.tsx`
- Test: `apps/web/app/(dashboard)/payroll/payroll-client.test.tsx`

- [ ] **Step 1: Write the failing client tests**

Add tests in `apps/web/app/(dashboard)/payroll/payroll-client.test.tsx` that mock `useTour` and `TourHelpButton`:

```tsx
vi.mock('@/hooks/use-tour', () => ({
	useTour: vi.fn((tourId: string, enabled = true) => ({
		restartTour: vi.fn(),
		isTourRunning: false,
		tourId,
		enabled,
	})),
}));
```

Cover these cases:

```tsx
it('enables the main payroll tour only on the payroll tab', async () => {
	renderWithProviders();
	await waitFor(() => expect(screen.getByTestId('payroll-tab-payroll')).toBeInTheDocument());
	expect(useTour).toHaveBeenCalledWith('payroll', true);
	expect(useTour).toHaveBeenCalledWith('payroll-ptu', false);
	expect(useTour).toHaveBeenCalledWith('payroll-aguinaldo', false);
});

it('auto-enables the PTU sub-tour after switching to PTU', async () => {
	// settings should resolve with ptuEnabled: true
});

it('keeps the contextual help button bound to the active tab tour id', async () => {
	// expect TourHelpButton to receive "payroll", then "payroll-ptu", then "payroll-aguinaldo"
});
```

- [ ] **Step 2: Run the client test to verify it fails**

Run: `bunx vitest run apps/web/app/(dashboard)/payroll/payroll-client.test.tsx`
Expected: FAIL because the page still uses `defaultValue="payroll"` and always renders `<TourHelpButton tourId="payroll" />`.

- [ ] **Step 3: Implement controlled tabs and tour wiring**

In `apps/web/app/(dashboard)/payroll/payroll-client.tsx`, add controlled tab state and three `useTour(...)` calls:

```tsx
const [activeTab, setActiveTab] = useState<'payroll' | 'ptu' | 'aguinaldo'>('payroll');

useTour('payroll', activeTab === 'payroll');
useTour('payroll-ptu', activeTab === 'ptu' && Boolean(settings?.ptuEnabled));
useTour(
	'payroll-aguinaldo',
	activeTab === 'aguinaldo' && Boolean(settings?.aguinaldoEnabled),
);

const activeTourId =
	activeTab === 'ptu' && settings?.ptuEnabled
		? 'payroll-ptu'
		: activeTab === 'aguinaldo' && settings?.aguinaldoEnabled
			? 'payroll-aguinaldo'
			: 'payroll';
```

Then update the JSX:

```tsx
<ResponsivePageHeader
	title={t('title')}
	description={t('subtitle')}
	actions={<TourHelpButton tourId={activeTourId} />}
/>

<Tabs
	value={activeTab}
	onValueChange={(value) => setActiveTab(value as 'payroll' | 'ptu' | 'aguinaldo')}
	className="min-w-0 space-y-4 overflow-x-hidden"
>
```

- [ ] **Step 4: Run the client test to verify it passes**

Run: `bunx vitest run apps/web/app/(dashboard)/payroll/payroll-client.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/payroll/payroll-client.tsx apps/web/app/\(dashboard\)/payroll/payroll-client.test.tsx
git commit -m "feat(web): wire payroll tours to active tabs"
```

---

### Task 3: Add stable anchors for payroll, PTU, and Aguinaldo sections

**Files:**
- Modify: `apps/web/app/(dashboard)/payroll/payroll-client.tsx`
- Modify: `apps/web/app/(dashboard)/payroll/ptu-tab.tsx`
- Modify: `apps/web/app/(dashboard)/payroll/aguinaldo-tab.tsx`
- Test: `apps/web/components/tour-provider.test.tsx`

- [ ] **Step 1: Write the failing TourProvider step-mapping test**

Expand the payroll assertions in `apps/web/components/tour-provider.test.tsx` so `joyrideState.props?.steps` includes:

```tsx
[
	{ target: '[data-tour="payroll-tabs"]', content: 'payroll.step1', placement: 'bottom', disableBeacon: true },
	{ target: '[data-tour="payroll-legal-rules"]', content: 'payroll.step2', placement: 'bottom', disableBeacon: true },
	{ target: '[data-tour="payroll-insights"]', content: 'payroll.step3', placement: 'bottom', disableBeacon: true },
	{ target: '[data-tour="payroll-process"]', content: 'payroll.step4', placement: 'left', disableBeacon: true },
	{ target: '[data-testid="payroll-preview-table-container"]', content: 'payroll.step5', placement: 'top', disableBeacon: true },
	{ target: '[data-tour="payroll-run-history"]', content: 'payroll.step6', placement: 'top', disableBeacon: true },
]
```

Add analogous assertions for `payroll-ptu` and `payroll-aguinaldo` if the test file already exercises `startTour(...)` generically.

- [ ] **Step 2: Run the TourProvider test to verify it fails**

Run: `bunx vitest run apps/web/components/tour-provider.test.tsx`
Expected: FAIL because the anchors are not yet present in the JSX.

- [ ] **Step 3: Add anchors to the page and tab sections**

In `apps/web/app/(dashboard)/payroll/payroll-client.tsx`:

```tsx
<TabsTrigger value="ptu" data-testid="payroll-tab-ptu" data-tour="payroll-tab-ptu" ... />
<TabsTrigger value="aguinaldo" data-testid="payroll-tab-aguinaldo" data-tour="payroll-tab-aguinaldo" ... />

<Card data-tour="payroll-legal-rules">...</Card>
<Card data-tour="payroll-insights">...</Card>
<Card data-tour="payroll-run-history">...</Card>
```

In `apps/web/app/(dashboard)/payroll/ptu-tab.tsx`, wrap stable containers:

```tsx
<Card data-tour="payroll-ptu-config">...</Card>
<div className="flex flex-wrap items-center gap-3" data-tour="payroll-ptu-actions">...</div>
<Card data-tour="payroll-ptu-summary">...</Card>
<Card data-tour="payroll-ptu-table">...</Card>
<Card data-tour="payroll-ptu-history">...</Card>
```

In `apps/web/app/(dashboard)/payroll/aguinaldo-tab.tsx`, mirror the same pattern with:

```tsx
data-tour="payroll-aguinaldo-config"
data-tour="payroll-aguinaldo-actions"
data-tour="payroll-aguinaldo-summary"
data-tour="payroll-aguinaldo-table"
data-tour="payroll-aguinaldo-history"
```

- [ ] **Step 4: Run the TourProvider test to verify it passes**

Run: `bunx vitest run apps/web/components/tour-provider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/payroll/payroll-client.tsx apps/web/app/\(dashboard\)/payroll/ptu-tab.tsx apps/web/app/\(dashboard\)/payroll/aguinaldo-tab.tsx apps/web/components/tour-provider.test.tsx
git commit -m "feat(web): add stable anchors for payroll sub-tours"
```

---

### Task 4: Add Spanish tutorial copy and run focused verification

**Files:**
- Modify: `apps/web/messages/es.json`
- Test: `apps/web/lib/tours/registry.test.ts`
- Test: `apps/web/app/(dashboard)/payroll/payroll-client.test.tsx`
- Test: `apps/web/components/tour-provider.test.tsx`

- [ ] **Step 1: Add the missing tutorial strings**

Update `apps/web/messages/es.json`:

```json
"payroll": {
	"step1": "Estas pestañas separan la nómina regular, PTU y aguinaldo para que trabajes cada proceso por separado.",
	"step2": "Aquí revisas reglas legales y criterios operativos que afectan el cálculo de la corrida regular.",
	"step3": "Este bloque resume indicadores y referencias usadas al preparar la nómina del periodo.",
	"step4": "Desde aquí defines el periodo, calculas, guardas borradores y procesas la corrida regular.",
	"step5": "En esta vista previa validas importes, percepciones, deducciones y advertencias antes de procesar.",
	"step6": "Aquí consultas el historial de corridas y accedes a acciones como recibos y seguimiento.",
	"step7": "Cuando abras PTU se iniciará un recorrido específico para esa operación.",
	"step8": "Cuando abras Aguinaldo se iniciará un recorrido específico para esa operación."
},
"payrollPtu": {
	"step1": "Esta pestaña concentra el proceso anual de PTU.",
	"step2": "Aquí defines año fiscal, fecha de pago, base gravable, porcentaje y otros parámetros del reparto.",
	"step3": "Estas acciones te permiten calcular, guardar borradores, procesar o cancelar una corrida de PTU.",
	"step4": "Aquí revisas estatus, totales y advertencias antes de cerrar el reparto.",
	"step5": "En esta tabla ajustas elegibilidad y bases por empleado para revisar el resultado final de PTU.",
	"step6": "Aquí consultas el historial de corridas de PTU, descargas CSV y accedes a recibos."
},
"payrollAguinaldo": {
	"step1": "Esta pestaña concentra el proceso de cálculo y pago de aguinaldo.",
	"step2": "Aquí defines año, fecha de pago, inclusión de inactivos y parámetros base del cálculo.",
	"step3": "Estas acciones te permiten calcular, guardar borradores, procesar o cancelar una corrida de aguinaldo.",
	"step4": "Aquí revisas estatus, totales y advertencias antes de confirmar el pago.",
	"step5": "En esta tabla ajustas días, salarios y política por empleado para validar el resultado de aguinaldo.",
	"step6": "Aquí consultas corridas anteriores, descargas CSV y accedes a recibos emitidos."
}
```

- [ ] **Step 2: Run the focused test suite**

Run:

```bash
bunx vitest run apps/web/lib/tours/registry.test.ts apps/web/app/\(dashboard\)/payroll/payroll-client.test.tsx apps/web/components/tour-provider.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run typecheck and lint for web**

Run:

```bash
cd apps/web
bun run check-types
bun run lint
```

Expected: both commands exit `0`

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/es.json apps/web/lib/tours/registry.test.ts apps/web/app/\(dashboard\)/payroll/payroll-client.test.tsx apps/web/components/tour-provider.test.tsx
git commit -m "feat(web): add payroll tutorial copy and verification"
```

---

## Self-Review

- **Spec coverage:** Covered main tour expansion, PTU/Aguinaldo sub-recorridos, tab-controlled auto-launch, contextual replay, anchors, translations, and tests.
- **Placeholder scan:** No `TODO`, `TBD`, or “similar to previous task” shortcuts remain.
- **Type consistency:** The plan uses the same `tourId` names everywhere: `payroll`, `payroll-ptu`, `payroll-aguinaldo`.
