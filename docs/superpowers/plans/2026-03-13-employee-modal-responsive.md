# Employee Modal Responsive Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the employee detail/edit dialog fully usable on mobile (≤1024px) by fixing overflow, collapsing the header, adding horizontal scroll tabs, and converting the edit form to a wizard stepper.

**Architecture:** Fix the overflow bug in the existing Dialog, extract the view-mode header fields into a new "Info" tab, replace the mobile edit form with a 5-step wizard, and optimize all tab content for mobile. Desktop (>1024px) remains unchanged.

**Tech Stack:** Next.js, Radix UI Dialog, Tailwind CSS, shadcn/ui, TanStack Form, next-intl, Playwright E2E

**Spec:** `docs/superpowers/specs/2026-03-13-employee-modal-responsive-design.md`

**Existing Responsiveness Plan:** `.cursor/plans/mobile-responsiveness.md` (follow conventions from Section 6)

---

## Chunk 1: Fix Overflow & Mobile Header

### Task 1: Create branch, setup prerequisites, and fix DialogContent overflow

**Files:**
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx:3308,3325,3327`
- Modify: `packages/types/src/index.ts:192` (add `'info'` to `EmployeeDetailTab` type)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/employee-modal-responsive
```

- [ ] **Step 2: Add `'info'` to `EmployeeDetailTab` type**

In `packages/types/src/index.ts`, find the `EmployeeDetailTab` type union (line ~192). Add `'info'` as the first option:

```typescript
export type EmployeeDetailTab = 'info' | 'summary' | 'attendance' | ... ;
```

Also update `VALID_DETAIL_TABS` in `employees-client.tsx` (line ~805) to include `'info'`.

- [ ] **Step 3: Import `useIsMobile` hook in employees-client.tsx**

Add at the top of the component function body:

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
// Inside the component:
const isMobile = useIsMobile();
```

- [ ] **Step 4: Fix the overflow bug on the view mode content container**

In `employees-client.tsx`, the content wrapper at line 3325 has `overflow-hidden` which clips everything:

Line 3325 — change:
```tsx
<div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
```
to:
```tsx
<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 min-[1025px]:px-6 min-[1025px]:pb-6">
```

Note: also migrate `sm:` → `min-[1025px]:` per project convention.

- [ ] **Step 5: Migrate sm: breakpoints on DialogContent**

Line 3308 — change:
```tsx
<DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-6rem)] sm:max-w-5xl sm:rounded-lg sm:border sm:p-0 lg:max-w-6xl">
```
to:
```tsx
<DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0 min-[1025px]:h-[calc(100vh-4rem)] min-[1025px]:max-h-[calc(100vh-6rem)] min-[1025px]:max-w-5xl min-[1025px]:rounded-lg min-[1025px]:border min-[1025px]:p-0 min-[1025px]:max-w-6xl">
```

- [ ] **Step 6: Verify fix works — open dialog on mobile viewport in browser**

Open http://localhost:3001/employees at 375px width. Click on an employee card. The dialog should now scroll internally, and the tabs should be reachable by scrolling down.

- [ ] **Step 7: Verify desktop is unchanged**

Open http://localhost:3001/employees at 1280px width. Open an employee detail. The layout should look identical to before.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/(dashboard)/employees/employees-client.tsx
git commit -m "fix(employees): fix dialog overflow and migrate sm: breakpoints to min-[1025px]:"
```

---

### Task 2: Implement mobile compact header

**Files:**
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx:3328-3452`
- Modify: `apps/web/messages/es.json`

This task conditionally renders a minimal header on mobile (name + code + status + edit button) and the full 10-field header on desktop.

- [ ] **Step 1: Add translation keys for the Info tab and compact header**

In `apps/web/messages/es.json`, find the `employees.tabs` section and add:

```json
"info": "Info"
```

Also add under `employees.details`:
```json
"showDetails": "Ver detalles completos",
"hideDetails": "Ocultar detalles"
```

- [ ] **Step 2: Wrap the existing header in a desktop-only conditional**

In `employees-client.tsx`, find the block at lines 3328-3452 (the `<div className="rounded-md border p-4">` block). Wrap it with a mobile/desktop conditional:

```tsx
{/* Mobile compact header */}
{isMobile && (
  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h2 className="truncate text-lg font-semibold">
          {activeEmployeeName || tCommon('notAvailable')}
        </h2>
        {activeEmployee?.status && (
          <Badge variant={statusVariants[activeEmployee.status]}>
            {t(`status.${activeEmployee.status}`)}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {activeEmployee?.code ?? tCommon('notAvailable')}
      </p>
    </div>
    <Button variant="outline" size="icon" onClick={handleEditFromDetails}>
      <Pencil className="h-4 w-4" />
      <span className="sr-only">{tCommon('edit')}</span>
    </Button>
  </div>
)}

{/* Desktop full header (unchanged) */}
{!isMobile && (
  <div className="rounded-md border p-4">
    {/* ... existing 10-field header code ... */}
  </div>
)}
```

Note: `isMobile` comes from the existing `useIsMobile()` hook already imported in the component.

- [ ] **Step 3: Verify mobile shows compact header**

At 375px: Open employee detail. Should see only name, badge, code, and edit icon. No location/puesto/email/etc fields.

- [ ] **Step 4: Verify desktop shows full header**

At 1280px: Open employee detail. Should see the full 10-field header grid as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/employees/employees-client.tsx apps/web/messages/es.json
git commit -m "feat(employees): add mobile compact header with conditional rendering"
```

---

### Task 3: Add "Info" tab and horizontal scroll tabs on mobile

**Files:**
- Create: `apps/web/components/employees/employee-info-tab.tsx`
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx:3454-3500`
- Modify: `apps/web/messages/es.json`

- [ ] **Step 1: Create the employee-info-tab component**

Create directory and file `apps/web/components/employees/employee-info-tab.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

import type { Employee } from '@sen-checkin/types';

/** Props for the EmployeeInfoTab component. */
interface EmployeeInfoTabProps {
  /** The employee whose details are displayed. */
  employee: Employee;
  /** Resolved location display name. */
  locationName: string;
  /** Translated shift type label. */
  shiftTypeLabel: string;
  /** Date format string from locale. */
  dateFormat: string;
}

/**
 * Displays employee detail fields in a mobile-friendly grid layout.
 * Used as the "Info" tab on mobile viewports.
 *
 * @param props - Component props
 * @returns JSX element with employee info fields
 */
export function EmployeeInfoTab({
  employee,
  locationName,
  shiftTypeLabel,
  dateFormat,
}: EmployeeInfoTabProps): React.JSX.Element {
  const t = useTranslations('employees');
  const tCommon = useTranslations('common');

  const fields = [
    { label: t('fields.location'), value: locationName },
    { label: t('fields.jobPosition'), value: employee.jobPositionName ?? tCommon('notAvailable') },
    {
      label: t('fields.hireDate'),
      value: employee.hireDate
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(employee.hireDate))
        : tCommon('notAvailable'),
    },
    { label: t('fields.shiftType'), value: shiftTypeLabel || tCommon('notAvailable') },
    {
      label: t('fields.email'),
      value: employee.email ?? tCommon('notAvailable'),
      href: employee.email ? `mailto:${employee.email}` : undefined,
    },
    {
      label: t('fields.phone'),
      value: employee.phone ?? tCommon('notAvailable'),
      href: employee.phone ? `tel:${employee.phone}` : undefined,
    },
    { label: t('fields.nss'), value: employee.nss ?? tCommon('notAvailable') },
    { label: t('fields.rfc'), value: employee.rfc ?? tCommon('notAvailable') },
    { label: t('fields.department'), value: employee.department ?? tCommon('notAvailable') },
    { label: t('fields.user'), value: employee.userId ?? t('placeholders.noUser') },
  ];

  return (
    <div className="grid gap-3 py-2">
      {fields.map((field) => (
        <div key={field.label} className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{field.label}</p>
          {field.href ? (
            <a
              href={field.href}
              className="block min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {field.value}
            </a>
          ) : (
            <p className="text-sm font-medium">{field.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add "info" to the tab definitions in employees-client.tsx**

Find the constant `PRIMARY_DETAIL_TABS` (search for it near the top of the file). Add `'info'` as the first element for mobile. The approach is to conditionally prepend it:

In the TabsList section (line ~3459), replace the current TabsList with a mobile/desktop conditional:

```tsx
{isMobile ? (
  <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto p-1">
    <TabsTrigger value="info" onFocus={() => markTabAsVisited('info' as DetailTab)}>
      {t('tabs.info')}
    </TabsTrigger>
    {ALL_DETAIL_TABS.map((tab) => (
      <TabsTrigger key={tab} value={tab} onFocus={() => markTabAsVisited(tab)}>
        {t(`tabs.${tab}`)}
      </TabsTrigger>
    ))}
  </TabsList>
) : (
  <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
    {PRIMARY_DETAIL_TABS.map((tab) => (
      <TabsTrigger key={tab} value={tab} onFocus={() => markTabAsVisited(tab)}>
        {t(`tabs.${tab}`)}
      </TabsTrigger>
    ))}
    {/* existing dropdown menu for secondary tabs */}
    <DropdownMenu>
      {/* ... keep existing code ... */}
    </DropdownMenu>
  </TabsList>
)}
```

Where the mobile tab list uses `[...PRIMARY_DETAIL_TABS, ...secondaryDetailTabs]` (the existing `secondaryDetailTabs` is a `useMemo` that conditionally includes `'disciplinary'` based on `canUseDisciplinaryModule`). Do NOT create a static `ALL_DETAIL_TABS` constant — the list is dynamic.

- [ ] **Step 3: Add the Info TabsContent**

Before the existing summary TabsContent, add:

```tsx
<TabsContent value="info" className="h-full overflow-y-auto">
  {activeEmployee && (
    <EmployeeInfoTab
      employee={activeEmployee}
      locationName={activeEmployeeLocation}
      shiftTypeLabel={
        activeEmployee.shiftType
          ? t(`shiftTypeLabels.${activeEmployee.shiftType}`)
          : ''
      }
      dateFormat={t('dateFormat')}
    />
  )}
</TabsContent>
```

- [ ] **Step 4: Set default tab to "info" on mobile, "summary" on desktop**

When opening the detail dialog, change the initial `detailTab` to be `'info'` on mobile:

In `openEmployeeDetailTab` (line ~2593), modify the default tab:

```tsx
const defaultTab = isMobile ? 'info' : initialTab;
```

- [ ] **Step 5: Auto-center active tab on mobile**

Add a `ref` on the `TabsList` and a `useEffect` that scrolls the active tab into view:

```tsx
const tabsListRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!isMobile || !tabsListRef.current) return;
  const activeTabEl = tabsListRef.current.querySelector('[data-state="active"]');
  activeTabEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}, [detailTab, isMobile]);
```

Pass `ref={tabsListRef}` to the mobile `TabsList` component. This avoids `document.querySelector` and scopes the query to the correct `TabsList`.

- [ ] **Step 6: Verify mobile Info tab works**

At 375px: Open employee detail. Should see compact header + horizontal scroll tabs with "Info" selected. The Info tab content shows all 10 fields. Email and phone are tappable links.

- [ ] **Step 7: Verify desktop is unchanged**

At 1280px: No "Info" tab visible. Full header with 10 fields. Tabs show 4 primary + "Más" dropdown.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/employees/employee-info-tab.tsx apps/web/app/(dashboard)/employees/employees-client.tsx apps/web/messages/es.json
git commit -m "feat(employees): add Info tab and horizontal scroll tabs for mobile"
```

---

## Chunk 2: Mobile Wizard for Edit/Create

### Task 4: Create the wizard stepper component

**Files:**
- Create: `apps/web/components/employees/employee-wizard-mobile.tsx`
- Modify: `apps/web/messages/es.json`

- [ ] **Step 1: Add wizard translation keys**

In `apps/web/messages/es.json`, under `employees`, add:

```json
"wizard": {
  "steps": {
    "personal": "Personal",
    "laboral": "Laboral",
    "salario": "Salario",
    "ptu": "PTU y Aguinaldo",
    "horario": "Horario"
  },
  "stepOf": "Paso {current} de {total}",
  "next": "Siguiente",
  "previous": "Anterior",
  "save": "Guardar",
  "discardTitle": "¿Descartar cambios?",
  "discardDescription": "Los cambios sin guardar se perderán.",
  "discardCancel": "Cancelar",
  "discardConfirm": "Descartar",
  "validationErrors": "Hay errores en los pasos: {steps}"
}
```

- [ ] **Step 2: Create the wizard stepper component skeleton**

Create `apps/web/components/employees/employee-wizard-mobile.tsx` with the 5-step structure. This component:
- Receives the TanStack Form instance as a prop
- Manages `currentStep` state (0-4)
- Renders: header → dot stepper → form content area (scrollable) → footer with prev/next
- Each step renders the relevant form fields from the parent form instance

The component should export:
```tsx
export const WIZARD_STEPS = ['personal', 'laboral', 'salario', 'ptu', 'horario'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
```

Key props interface:
```tsx
/** Type for the form instance — derived from the parent component's useAppForm call. */
type EmployeeFormInstance = ReturnType<typeof useAppForm<EmployeeFormValues>>;

interface EmployeeWizardMobileProps {
  mode: 'create' | 'edit';
  form: EmployeeFormInstance;  // TanStack Form instance with employee field types
  schedule: EmployeeScheduleEntry[];
  upsertScheduleEntry: (entry: EmployeeScheduleEntry) => void;
  onSave: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}
```

Note: Use `form.state.canSubmit` or compare form values against initial values to determine dirty state, rather than relying on `isDirty` which may not exist in all TanStack Form versions. Verify the API via Context7 MCP docs before implementation.

The stepper UI:
- Dots: `●` (completed/visited), `◉` (current, larger with ring), `○` (not visited)
- Connected by thin lines
- Below dots: "Paso X de 5: {step name}"
- Footer: `[← Anterior] [Siguiente →]` or `[← Anterior] [Guardar]` on last step
- **Accessibility:** The stepper uses `role="navigation"` with `aria-label="Progreso del formulario"`. Each dot gets `aria-label="Paso N: {nombre}, {estado}"` and the current step gets `aria-current="step"`. Keyboard: Tab navigates between interactive elements, Enter/Space activates.

- [ ] **Step 3: Implement Step 1 — Personal fields**

Render these fields from the form instance inside the wizard when `currentStep === 0`:
- `firstName`, `lastName`, `code` (disabled in edit), `nss`, `rfc`, `email`, `phone`, `department`

Each field uses the same `form.AppField` pattern already used in the existing form. Fields are stacked full-width (no grid).

- [ ] **Step 4: Implement Step 2 — Laboral fields**

When `currentStep === 1`:
- `locationId`, `jobPositionId`, `status`, `shiftType`, `hireDate`, `userId`

- [ ] **Step 5: Implement Step 3 — Salario fields**

When `currentStep === 2`:
- `paymentFrequency`, `periodPay`, calculated daily pay (disabled), `sbcDailyOverride`

- [ ] **Step 6: Implement Step 4 — PTU y Aguinaldo fields**

When `currentStep === 3`:
- `employmentType`, `ptuEligibilityOverride`, `aguinaldoDaysOverride`, `platformHoursYear`
- Checkboxes: `isTrustEmployee`, `isDirectorAdminGeneralManager`, `isDomesticWorker`, `isPlatformWorker`
- PTU history table (inline)

- [ ] **Step 7: Implement Step 5 — Horario fields**

When `currentStep === 4`:
- 7 rows (Monday–Sunday) using the `schedule` and `upsertScheduleEntry` props
- Each row: checkbox + time start + time end

- [ ] **Step 8: Implement discard confirmation AlertDialog**

When `isDirty` is true and the user attempts to close:
```tsx
<AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t('wizard.discardTitle')}</AlertDialogTitle>
      <AlertDialogDescription>{t('wizard.discardDescription')}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t('wizard.discardCancel')}</AlertDialogCancel>
      <AlertDialogAction onClick={onCancel}>{t('wizard.discardConfirm')}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 9: Implement validation error reporting on save**

When the user clicks "Guardar" on step 5:
1. Run `form.handleSubmit()`
2. If validation fails, collect which steps have errors
3. Mark errored step dots in red
4. Show toast: "Hay errores en los pasos: Personal, Salario"
5. Auto-navigate to first errored step

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/employees/employee-wizard-mobile.tsx apps/web/messages/es.json
git commit -m "feat(employees): create mobile wizard stepper component with 5 steps"
```

---

### Task 5: Integrate wizard into the employee dialog

**Files:**
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx:5245-5956`

- [ ] **Step 1: Import the wizard component**

```tsx
import { EmployeeWizardMobile } from '@/components/employees/employee-wizard-mobile';
```

- [ ] **Step 2: Add mobile/desktop conditional for the form section**

In the form rendering section (lines 5245-5956), wrap with a mobile conditional:

```tsx
{isMobile ? (
  <EmployeeWizardMobile
    mode={isCreateMode ? 'create' : 'edit'}
    form={form}
    schedule={schedule}
    upsertScheduleEntry={upsertScheduleEntry}
    onSave={() => form.handleSubmit()}
    onCancel={() => handleDialogOpenChange(false)}
    isSubmitting={isUpdating || isCreating}
    isDirty={form.state.isDirty}
  />
) : (
  <form className="flex h-full min-h-0 flex-col" onSubmit={...}>
    {/* existing desktop form code unchanged */}
  </form>
)}
```

- [ ] **Step 3: Wire up the discard confirmation to Dialog's onOpenChange**

Modify `handleDialogOpenChange` to check for dirty state on mobile and show the confirmation dialog instead of closing directly.

- [ ] **Step 4: Verify mobile wizard works — create flow**

At 375px: Click "Agregar empleado". Should see wizard with "Paso 1 de 5: Personal". Fill in name, navigate through steps, save.

- [ ] **Step 5: Verify mobile wizard works — edit flow**

At 375px: Open employee detail → Click edit. Should see wizard starting at step 1, pre-filled with employee data.

- [ ] **Step 6: Verify desktop form unchanged**

At 1280px: The existing 2-column grid form should render as before.

- [ ] **Step 7: Verify discard confirmation**

At 375px: Open wizard, change a field, press X. Should see "¿Descartar cambios?" dialog.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/(dashboard)/employees/employees-client.tsx
git commit -m "feat(employees): integrate mobile wizard into employee dialog"
```

---

## Chunk 3: Tab Content Optimization

### Task 6: Optimize tab content for mobile

**Files:**
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx:3500-5242`

This task ensures each tab's content is usable on mobile. The changes are CSS-focused (grid adjustments, card conversions for tables).

- [ ] **Step 1: Optimize Summary tab (lines ~3773-4046)**

- KPI cards grid: Ensure `grid-cols-2` on mobile with reduced gaps
- Already uses `md:grid-cols-2 xl:grid-cols-3` — verify this works well at 375px
- Reduce card padding if needed for compactness

- [ ] **Step 2: Optimize Attendance tab (lines ~4045-4213)**

- Stats cards: ensure `grid-cols-2` on mobile
- Monthly accordion content: verify stack is clean
- If any internal tables exist, add `overflow-x-auto` wrapper

- [ ] **Step 3: Optimize Vacations tab (lines ~4212-4294)**

- Balance cards: change `sm:grid-cols-2 lg:grid-cols-5` to `grid-cols-2 min-[1025px]:grid-cols-5`
- If there's a vacation request table, wrap with `overflow-x-auto` or convert to cards

- [ ] **Step 4: Optimize Documents tab (line ~3500-3522)**

- Document checklist already stacks vertically — verify spacing
- Upload zones: ensure full-width
- Touch targets on action buttons: min-h 44px

- [ ] **Step 5: Optimize Payroll tab (lines ~4293-4477)**

- Payroll runs table: add `overflow-x-auto` wrapper or convert to cards on mobile
- Download links: ensure min-h 44px touch targets

- [ ] **Step 6: Optimize PTU tab**

- Settings grid: `grid-cols-1` on mobile
- History table: convert to simple cards (Year + Amount)

- [ ] **Step 7: Optimize Finiquito tab (lines ~5027-5107)**

- Calculation fields: stack vertical with full-width
- Number display: ensure readable font sizes

- [ ] **Step 8: Optimize Exceptions tab (lines ~4476-5028)**

- Exception table: add `overflow-x-auto` or convert to cards (Date, Type, Reason, Duration)

- [ ] **Step 9: Optimize Audit tab (lines ~5106-5242)**

- Audit trail: timeline-style cards with timestamp, user, action, field

- [ ] **Step 10: Optimize Disciplinary tab (lines ~3525-3774)**

- Measure cards: ensure badge severity visible
- Action form: full-width inputs

- [ ] **Step 11: Verify all tabs at 375px**

Open each tab in sequence at 375px viewport. Confirm:
- No horizontal overflow
- Content is readable and tappable
- Tables are scrollable or converted to cards
- Touch targets ≥ 44px

- [ ] **Step 12: Verify all tabs at 1280px (no regression)**

Open each tab at 1280px. Confirm layout is unchanged from before.

- [ ] **Step 13: Commit**

```bash
git add apps/web/app/(dashboard)/employees/employees-client.tsx
git commit -m "feat(employees): optimize all tab content for mobile viewports"
```

---

## Chunk 4: Dialog Extraction & E2E Tests

### Task 7: Extract employee detail dialog to its own file

**Files:**
- Create: `apps/web/components/employees/employee-detail-dialog.tsx`
- Modify: `apps/web/app/(dashboard)/employees/employees-client.tsx`

- [ ] **Step 1: Extract the Dialog block**

Move the entire `<Dialog>...</Dialog>` block (lines 3295-5960) from `employees-client.tsx` into a new component `EmployeeDetailDialog` in `employee-detail-dialog.tsx`.

The new component receives all necessary state and handlers as props:
- `isDialogOpen`, `handleDialogOpenChange`
- `dialogMode`, `activeEmployee`, `detailTab`
- `form`, `schedule`, `upsertScheduleEntry`
- All event handlers
- All lookup data (locationLookup, etc.)

- [ ] **Step 2: Import and use the extracted component**

In `employees-client.tsx`, replace the Dialog block with:

```tsx
<EmployeeDetailDialog
  isOpen={isDialogOpen}
  onOpenChange={handleDialogOpenChange}
  mode={dialogMode}
  // ... all other props
/>
```

- [ ] **Step 3: Verify nothing broke**

Test at both 375px and 1280px. All functionality should work identically.

- [ ] **Step 4: Run lint and type-check**

```bash
bun run lint:web && bun run check-types:web
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/employees/employee-detail-dialog.tsx apps/web/app/(dashboard)/employees/employees-client.tsx
git commit -m "refactor(employees): extract dialog to employee-detail-dialog.tsx"
```

---

### Task 8: Write E2E tests for the responsive modal

**Files:**
- Create: `apps/web/e2e/responsiveness/employee-modal.spec.ts`

- [ ] **Step 1: Write the E2E test file**

Follow the pattern from `employees.spec.ts`. Create `employee-modal.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

import {
  expectMinimumTouchHeight,
  expectNoHorizontalOverflow,
  provisionResponsiveUser,
  RESPONSIVE_VIEWPORTS,
  seedResponsiveEmployeeDataViaBrowser,
  setActiveResponsiveOrganization,
} from './helpers';

test.describe('employee modal responsiveness', () => {
  test('shows compact header and Info tab on mobile', async ({ page }) => {
    await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
    const reg = await provisionResponsiveUser(page);
    await setActiveResponsiveOrganization(page, reg.organizationSlug);
    await seedResponsiveEmployeeDataViaBrowser(page, reg.organizationName);
    await page.goto(`/employees?t=${Date.now()}`);
    await page.reload();

    // Click first employee card
    await page.getByTestId('responsive-data-card').first().click();

    // Verify compact header (no full detail fields visible)
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Verify Info tab is selected by default
    await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute(
      'data-state',
      'active',
    );

    // Verify horizontal scroll tabs (no "Más" dropdown)
    await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test('opens wizard on edit in mobile', async ({ page }) => {
    await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
    const reg = await provisionResponsiveUser(page);
    await setActiveResponsiveOrganization(page, reg.organizationSlug);
    await seedResponsiveEmployeeDataViaBrowser(page, reg.organizationName);
    await page.goto(`/employees?t=${Date.now()}`);
    await page.reload();

    // Open detail then edit
    await page.getByTestId('responsive-data-card').first().click();
    await page.getByRole('button', { name: /editar/i }).click();

    // Verify wizard step indicator visible
    await expect(page.getByText(/Paso 1 de 5/)).toBeVisible();

    // Verify next/previous buttons
    await expect(page.getByRole('button', { name: /siguiente/i })).toBeVisible();
  });

  test('keeps full header and dropdown tabs on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const reg = await provisionResponsiveUser(page);
    await setActiveResponsiveOrganization(page, reg.organizationSlug);
    await seedResponsiveEmployeeDataViaBrowser(page, reg.organizationName);
    await page.goto(`/employees?t=${Date.now()}`);
    await page.reload();

    await page.getByRole('row').nth(1).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Desktop should NOT have Info tab
    await expect(page.getByRole('tab', { name: 'Info' })).toHaveCount(0);

    // Desktop should have "Más" dropdown
    await expect(page.getByRole('button', { name: /más/i })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E tests**

```bash
bun run test:web:e2e -- --grep "employee modal"
```

Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/responsiveness/employee-modal.spec.ts
git commit -m "test(e2e): add responsive employee modal tests"
```

---

### Task 9: Final verification and cleanup

**Files:**
- Modify: various (lint fixes only)

- [ ] **Step 1: Run full lint and type-check**

```bash
bun run lint:web && bun run check-types:web
```

Fix any issues found.

- [ ] **Step 2: Run all responsive E2E tests**

```bash
bun run test:web:e2e -- --grep "responsiveness"
```

Ensure no regressions in other pages.

- [ ] **Step 3: Visual verification at 375px**

Open each view at 375px:
- [ ] Employee list (cards)
- [ ] Employee detail dialog (compact header + Info tab)
- [ ] Tab navigation (horizontal scroll)
- [ ] Each tab content (Resumen through Disciplinario)
- [ ] Edit wizard (5 steps, prev/next, save)
- [ ] Create wizard (same as edit but with auto-gen code)
- [ ] Discard changes confirmation

- [ ] **Step 4: Visual verification at 1024px (tablet)**

Same checks as above — should still trigger mobile behavior.

- [ ] **Step 5: Visual verification at 1280px (desktop)**

- [ ] Full header visible
- [ ] Tabs with "Más" dropdown
- [ ] 2-column form grid (no wizard)

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(employees): final cleanup and lint fixes"
```

- [ ] **Step 7: Create PR**

```bash
gh pr create --title "feat(employees): responsive employee modal (view + wizard + tabs)" --body "$(cat <<'EOF'
## Summary
- Fix dialog overflow bug preventing scroll on mobile
- Add compact header with new "Info" tab for employee details
- Replace edit form with 5-step wizard on mobile (≤1024px)
- Optimize all 10+ tab contents for mobile viewports
- Extract dialog to dedicated component
- Add E2E tests for responsive behavior

## Spec
`docs/superpowers/specs/2026-03-13-employee-modal-responsive-design.md`

## Test plan
- [ ] E2E tests pass (`bun run test:web:e2e -- --grep "employee modal"`)
- [ ] Visual verification at 375px, 1024px, 1280px
- [ ] Desktop layout unchanged (no regression)
- [ ] Lint and type-check clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
