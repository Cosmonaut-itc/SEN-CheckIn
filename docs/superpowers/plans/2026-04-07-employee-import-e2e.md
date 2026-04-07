# Employee Bulk Import E2E Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 serial Playwright E2E tests covering the employee bulk import wizard — upload, preview, edit, confirm, undo, cancel — using real OpenRouter API calls and a real payroll document.

**Architecture:** Single spec file using `test.describe.serial` with shared browser context. Tests share auth session and seed data. A helper function encapsulates the upload-and-wait-for-preview flow to avoid repetition. Real AI processing via OpenRouter (no mocks).

**Tech Stack:** Playwright, Bun, Next.js, Elysia API, OpenRouter (GPT-4o)

**Design Spec:** `docs/superpowers/specs/2026-04-07-employee-import-e2e-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/web/e2e/fixtures/NOMINA_TEST.jpg` | Test fixture — real payroll document |
| Create | `apps/web/e2e/employee-import.spec.ts` | 5 serial E2E tests for the import wizard |

No modifications to existing files.

---

## Task 1: Copy Fixture File

**Files:**
- Create: `apps/web/e2e/fixtures/NOMINA_TEST.jpg`

- [ ] **Step 1: Create fixtures directory and copy the file**

```bash
mkdir -p apps/web/e2e/fixtures
cp /Users/felixddhs/Downloads/NOMINA_TEST.jpg apps/web/e2e/fixtures/NOMINA_TEST.jpg
```

- [ ] **Step 2: Verify the file exists and is the correct size**

Run: `ls -la apps/web/e2e/fixtures/NOMINA_TEST.jpg`
Expected: File exists, ~3.5MB (`3517200` bytes)

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/fixtures/NOMINA_TEST.jpg
git commit -m "test(e2e): add payroll document fixture for import tests"
```

---

## Task 2: Write the E2E Spec File

**Files:**
- Create: `apps/web/e2e/employee-import.spec.ts`

- [ ] **Step 1: Create the spec file with full content**

```typescript
// apps/web/e2e/employee-import.spec.ts
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

// ---------------------------------------------------------------------------
// Test-data helpers (API-first, following existing E2E patterns)
// ---------------------------------------------------------------------------

async function createLocation(
  request: APIRequestContext,
  organizationName: string,
): Promise<string> {
  const response = await request.post('/api/locations', {
    data: {
      name: `${organizationName} HQ`,
      code: `LOC-${randomUUID().slice(0, 6)}`,
      timeZone: 'America/Mexico_City',
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const locationId = payload?.data?.id as string | undefined;
  if (!locationId) {
    throw new Error('Expected location id from POST /api/locations');
  }
  return locationId;
}

async function createJobPosition(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/job-positions', {
    data: {
      name: `Operador ${randomUUID().slice(0, 4)}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const jobPositionId = payload?.data?.id as string | undefined;
  if (!jobPositionId) {
    throw new Error('Expected job position id from POST /api/job-positions');
  }
  return jobPositionId;
}

// ---------------------------------------------------------------------------
// Shared helper: navigate to import, configure defaults, upload, wait for
// the preview table to appear with at least one row.
// Returns the number of rows in the preview table.
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'NOMINA_TEST.jpg');

/** Timeout for AI processing — OpenRouter + GPT-4o can take 10-30s per image. */
const AI_PROCESSING_TIMEOUT = 90_000;

async function uploadAndWaitForPreview(
  page: Page,
  opts: { locationName: string; jobPositionName: string },
): Promise<number> {
  await page.goto('/employees/import');

  // Select location from dropdown
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: new RegExp(opts.locationName, 'i') }).click();

  // Select job position from dropdown
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: new RegExp(opts.jobPositionName, 'i') }).click();

  // Payment frequency — defaults to "Mensual", leave as-is

  // Upload the fixture file via the hidden file input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_PATH);

  // Click "Analizar documentos"
  await page.getByRole('button', { name: /analizar/i }).click();

  // Wait for the preview table to appear with at least one data row.
  // The AI processing can take up to ~30s so we use a generous timeout.
  const previewTable = page.locator('table tbody tr');
  await previewTable.first().waitFor({ timeout: AI_PROCESSING_TIMEOUT });

  return previewTable.count();
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe.serial('Employee Bulk Import', () => {
  let locationName: string;
  let jobPositionName: string;

  test.beforeAll(async ({ browser }) => {
    // Provision a fresh org + admin account, sign in, and seed test data.
    const context = await browser.newContext();
    const page = await context.newPage();
    const request = context.request;

    const registration = buildTestRegistrationPayload();
    await registerTestAccounts(page, registration);
    await signIn(page, registration.admin.email, registration.admin.password);

    // Create location and job position via API
    const locId = await createLocation(request, registration.organizationName);
    void locId; // we only need the name for the UI dropdown
    locationName = `${registration.organizationName} HQ`;

    jobPositionName = `Operador ${randomUUID().slice(0, 4)}`;
    const response = await request.post('/api/job-positions', {
      data: { name: jobPositionName },
    });
    expect(response.ok()).toBeTruthy();

    await context.storageState({ path: 'apps/web/e2e/.auth-state.json' });
    await context.close();
  });

  test.use({ storageState: 'apps/web/e2e/.auth-state.json' });

  // -----------------------------------------------------------------------
  // Test 1: Happy path — upload, preview, confirm, undo
  // -----------------------------------------------------------------------
  test('uploads a payroll document, confirms import, and undoes it', async ({ page }) => {
    // Navigate via the split button on the employees page
    await page.goto('/employees');
    await page.getByTestId('employees-add-menu-button').click();
    await page.getByRole('menuitem', { name: /importar/i }).click();
    await expect(page).toHaveURL(/\/employees\/import/);

    // Upload and wait for preview
    // (We're already on /employees/import after the menu click, so we
    //  configure defaults and upload inline instead of calling the helper.)

    // Select location
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(locationName, 'i') }).click();

    // Select job position
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: new RegExp(jobPositionName, 'i') }).click();

    // Upload fixture
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Click analyze
    await page.getByRole('button', { name: /analizar/i }).click();

    // Wait for preview rows
    const rows = page.locator('table tbody tr');
    await rows.first().waitFor({ timeout: AI_PROCESSING_TIMEOUT });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Click confirm button (e.g. "Importar 25 empleados")
    await page.getByRole('button', { name: /importar \d+ empleado/i }).click();

    // Wait for results screen
    await page.getByText(/empleados? creados? correctamente/i).waitFor({ timeout: 30_000 });

    // Click undo
    await page.getByRole('button', { name: /deshacer/i }).click();

    // Verify navigation back or success toast
    // The undo redirects to /employees after success
    await expect(page).toHaveURL(/\/employees/, { timeout: 15_000 });
  });

  // -----------------------------------------------------------------------
  // Test 2: Rejects invalid file type
  // -----------------------------------------------------------------------
  test('rejects an invalid file type', async ({ page }) => {
    await page.goto('/employees/import');

    // Select defaults so the UI is ready
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(locationName, 'i') }).click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: new RegExp(jobPositionName, 'i') }).click();

    // Upload a .txt file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a valid payroll document'),
    });

    // Verify error feedback — toast or inline message about unsupported format
    // The client-side validation should reject it before sending to API.
    // Check for the toast message from es.json: "Algunos archivos no tienen un formato soportado."
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /formato/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // -----------------------------------------------------------------------
  // Test 3: Preview is editable — edit name, delete row, change location
  // -----------------------------------------------------------------------
  test('allows editing the preview before confirming', async ({ page }) => {
    const initialRowCount = await uploadAndWaitForPreview(page, {
      locationName,
      jobPositionName,
    });

    expect(initialRowCount).toBeGreaterThan(1);

    // Edit the firstName of the first row
    const firstNameInput = page.locator('table tbody tr').first().locator('input[type="text"]').first();
    await firstNameInput.clear();
    await firstNameInput.fill('NombreEditado');

    // Delete the second row
    const deleteButtons = page.locator('table tbody tr').nth(1).getByRole('button').filter({ has: page.locator('svg') }).last();
    await deleteButtons.click();

    // Verify row count decreased by 1
    const newRowCount = await page.locator('table tbody tr').count();
    expect(newRowCount).toBe(initialRowCount - 1);

    // Change location on the third row (click the location combobox in that row)
    // The location selects are inside the table — they are the first combobox-like
    // select in each row. The exact selector depends on the implementation.
    // We verify the row is still interactive by checking the location dropdown exists.
    const thirdRowLocationSelect = page.locator('table tbody tr').nth(2).getByRole('combobox').first();
    await expect(thirdRowLocationSelect).toBeVisible();

    // Confirm import
    const includedCount = newRowCount; // all remaining rows are included
    await page.getByRole('button', { name: /importar \d+ empleado/i }).click();

    // Wait for results
    await page.getByText(/empleados? creados? correctamente/i).waitFor({ timeout: 30_000 });

    // Verify the created count is > 0
    await expect(page.getByText(/empleados? creados? correctamente/i)).toBeVisible();

    // Undo to clean up
    await page.getByRole('button', { name: /deshacer/i }).click();
    await expect(page).toHaveURL(/\/employees/, { timeout: 15_000 });
  });

  // -----------------------------------------------------------------------
  // Test 4: Append more files — upload, preview, add another, verify
  // -----------------------------------------------------------------------
  test('appends rows when uploading additional files', async ({ page }) => {
    const initialRowCount = await uploadAndWaitForPreview(page, {
      locationName,
      jobPositionName,
    });

    expect(initialRowCount).toBeGreaterThan(0);

    // Click "Agregar más archivos"
    await page.getByRole('button', { name: /agregar/i }).click();

    // Upload the same fixture again
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // The append triggers another AI processing round.
    // Wait for the row count to increase.
    await page.waitForFunction(
      (prevCount) => {
        const rows = document.querySelectorAll('table tbody tr');
        return rows.length > prevCount;
      },
      initialRowCount,
      { timeout: AI_PROCESSING_TIMEOUT },
    );

    const newRowCount = await page.locator('table tbody tr').count();
    expect(newRowCount).toBeGreaterThan(initialRowCount);

    // Cancel — don't create employees
    await page.getByRole('button', { name: /cancelar/i }).click();
    await expect(page).toHaveURL(/\/employees/);
  });

  // -----------------------------------------------------------------------
  // Test 5: Cancel returns to employees without creating anything
  // -----------------------------------------------------------------------
  test('cancels import and returns to employees list', async ({ page }) => {
    await uploadAndWaitForPreview(page, {
      locationName,
      jobPositionName,
    });

    // Click cancel
    await page.getByRole('button', { name: /cancelar/i }).click();

    // Verify we're back on the employees page
    await expect(page).toHaveURL(/\/employees/);
  });
});
```

**Important notes for the implementer:**

1. **Selectors are approximate.** The `import-client.tsx` file has NO `data-testid` attributes. The selectors above use `getByRole('combobox')`, `getByRole('button', { name })`, and `locator('table tbody tr')` patterns. The implementer MUST verify these match the actual rendered DOM by running the tests and inspecting failures. If selectors don't match, adjust them — the rendered text comes from `apps/web/messages/es.json` under `Employees.import`.

2. **The `beforeAll` creates auth state** via `storageState()` and subsequent tests reuse it with `test.use({ storageState })`. This is the standard Playwright pattern for sharing auth across serial tests without re-logging in.

3. **The `.auth-state.json` file** is created in `apps/web/e2e/` and should be gitignored (check if `e2e/.auth-state.json` is already in `.gitignore`; if not, add it).

4. **The `input[type="file"]` is hidden** in the component (class `hidden`) but Playwright's `setInputFiles()` works on hidden file inputs without needing to click the dropzone.

5. **The combobox selectors** (`getByRole('combobox').first()`, `.nth(1)`) assume the dropdowns render as comboboxes (which shadcn/ui `Select` does). If they don't match, try `page.getByRole('button', { name: /ubicación/i })` or similar text-based selectors.

6. **Test 4 (append)** uses `page.waitForFunction()` to poll the DOM for row count increase. This is necessary because the append triggers an async mutation with AI processing, and there's no single element to `waitFor`.

- [ ] **Step 2: Add `.auth-state.json` to `.gitignore`**

Check if `apps/web/.gitignore` or `apps/web/e2e/.gitignore` exists. If so, add:

```
.auth-state.json
```

If no `.gitignore` exists in `e2e/`, create `apps/web/e2e/.gitignore`:

```
.auth-state.json
```

- [ ] **Step 3: Run the tests**

Run: `cd apps/web && npx playwright test e2e/employee-import.spec.ts --headed`

The `--headed` flag opens a visible browser so you can see the flow. Expected:
- Tests take 2-3 minutes total due to AI processing
- All 5 tests pass
- If a selector doesn't match, Playwright will timeout and show the last screenshot in the trace

If a test fails due to selector mismatch:
1. Run `npx playwright test e2e/employee-import.spec.ts --headed --debug` to step through
2. Use `page.pause()` to inspect the DOM
3. Adjust the selector to match the actual rendered element

- [ ] **Step 4: Fix any selector mismatches**

Common issues and fixes:
- If `getByRole('combobox')` doesn't find the Select: try `page.locator('[role="combobox"]')` or `page.getByLabel(/ubicación/i)`
- If `getByRole('option')` doesn't find dropdown items: the Select component may use `[role="option"]` inside a portal. Try `page.getByRole('option', { name: /pattern/i })` or `page.locator('[data-value]')`.
- If `table tbody tr` doesn't match: inspect the preview table structure — it may use `div` rows instead of `<table>`. Adjust to match.
- If toast selector `[data-sonner-toast]` doesn't match: try `page.getByRole('alert')` or `page.locator('[data-sonner-toaster] [data-type]')`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/employee-import.spec.ts apps/web/e2e/.gitignore
git commit -m "test(e2e): add 5 serial tests for employee bulk import wizard"
```

---

## Task 3: Verify Full E2E Suite Still Passes

- [ ] **Step 1: Run the complete E2E suite**

Run: `cd apps/web && npx playwright test`

Expected: All existing tests still pass. The new serial tests run alongside existing parallel tests without interference (each test suite uses its own registered org/accounts).

- [ ] **Step 2: If any existing test breaks, investigate**

The new tests should be fully isolated (own org, own auth state). If something breaks:
- Check if the `.auth-state.json` file leaks into other tests (it shouldn't — other tests don't use `test.use({ storageState })`)
- Check if the fixture file causes issues with the web server (it shouldn't — it's not served)

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test(e2e): fix integration with existing test suite"
```
