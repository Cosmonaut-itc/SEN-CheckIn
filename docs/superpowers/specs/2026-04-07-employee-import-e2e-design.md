# Employee Bulk Import — E2E Tests with Playwright

## Summary

End-to-end tests for the employee bulk import wizard using Playwright. Tests verify the full user flow: upload a real payroll document, review the editable preview, confirm bulk creation, and undo. Uses real OpenRouter API calls (no mocks).

---

## Scope

5 test cases covering the `/employees/import` wizard:

1. **Happy path** — upload, preview, confirm, undo
2. **Invalid file rejection** — upload a .txt, verify error
3. **Editable preview** — edit name, delete row, change location, confirm
4. **Append more files** — upload, preview, add another file, verify rows accumulate
5. **Cancel** — upload, preview, cancel, verify no employees created

---

## Architecture

### Test Structure

- **File:** `apps/web/e2e/employee-import.spec.ts`
- **Pattern:** `test.describe.serial` — all 5 tests run sequentially in one worker, sharing browser context and auth session
- **Fixture:** `apps/web/e2e/fixtures/NOMINA_TEST.jpg` — real payroll document (~3.5MB, ~30 employees)

### Why Serial

- Minimizes OpenRouter API calls (~5 total instead of ~10+ with independent tests)
- Suite completes in ~2-3 minutes instead of ~5+
- Tests represent a continuous user journey — serial is the natural fit
- Trade-off: if test 1 fails, tests 2-5 are skipped

### Dependencies

- **Auth:** Reuses existing `e2e/helpers/auth.ts` (registerTestAccounts, signIn)
- **Seed data:** Relies on bootstrapped locations and job positions from `apps/api/scripts/seed.ts`
- **Environment:** Requires `OPENROUTER_API_KEY` in the environment
- **Servers:** API on port 3002, Web on port 3001 (started by Playwright config)

---

## Test Details

### Setup (beforeAll)

1. Register test accounts using `buildTestRegistrationPayload()` + `registerTestAccounts(page, payload)`
2. Sign in as admin using `signIn(page, email, password)`
3. Navigate to `/employees` to confirm dashboard loads

### Shared Helper

```typescript
async function uploadAndWaitForPreview(
  page: Page,
  options: { locationName: string; jobPositionName: string; frequency: string }
): Promise<number> {
  // 1. Navigate to /employees/import
  // 2. Select location, job position, payment frequency from dropdowns
  // 3. Upload NOMINA_TEST.jpg via file input
  // 4. Click "Analizar documento"
  // 5. Wait for preview table to appear with at least 1 row (timeout: 90s)
  // Returns: number of rows in preview table
}
```

### Test 1: Happy path — upload, preview, confirm, undo

1. Navigate to `/employees`, click split button dropdown "Importar desde documento"
2. Verify URL is `/employees/import`
3. Call `uploadAndWaitForPreview()` with seeded location/position
4. Verify preview table has > 0 rows
5. Click "Importar N empleados" button
6. Wait for results screen
7. Verify success message shows > 0 employees created
8. Click "Deshacer importacion"
9. Verify success toast and navigation to `/employees`

### Test 2: Rejects invalid file type

1. Navigate to `/employees/import`
2. Select location and job position defaults
3. Upload a `.txt` file (created inline as a test fixture)
4. Verify error feedback (toast or inline message rejecting the file)

### Test 3: Preview is editable

1. Call `uploadAndWaitForPreview()`, capture initial row count
2. Edit the firstName input of the first row
3. Delete the second row using the delete button
4. Change the location dropdown on the third row
5. Verify row count decreased by 1
6. Click confirm button
7. Verify results screen shows `created = initial row count - 1`
8. Click "Deshacer importacion" to clean up

### Test 4: Append more files

1. Call `uploadAndWaitForPreview()`, capture initial row count
2. Click "Agregar mas archivos"
3. Upload NOMINA_TEST.jpg again
4. Wait for append to complete (row count increases)
5. Verify new row count > initial row count
6. Click "Cancelar" to exit without creating

### Test 5: Cancel returns to employees without creating

1. Call `uploadAndWaitForPreview()`
2. Click "Cancelar"
3. Verify URL is `/employees`
4. Verify no unwanted side effects (page loads normally)

### Teardown (afterAll)

- Browser context cleanup (automatic by Playwright)
- Undo operations within tests clean up created employees

---

## Assertions Strategy

- **Flow-based, not data-based** — verify UI elements appear, buttons work, navigation is correct
- **No specific name/salary assertions** — the AI model output varies between runs
- **Row count checks are approximate** — `> 0` for single upload, `> initialCount` for append
- **Timeouts:** 90s for AI processing waits, default (10s) for everything else

## Key Selectors

The tests should use these selectors (verify against actual implementation):

- Split button dropdown: `data-testid` or text content
- File input: `input[type="file"]` or dropzone click
- Preview table rows: `table tbody tr`
- Confirm button: button containing "Importar" text
- Cancel button: button containing "Cancelar" text
- Results success: text matching `/empleados creados/i`
- Undo button: text matching `/Deshacer/i`
- Error toast: Sonner toast element `[data-sonner-toast]`

---

## Fixture

- **File:** `apps/web/e2e/fixtures/NOMINA_TEST.jpg`
- **Source:** Real payroll document from "Molinos Don Ramon GDL 07"
- **Size:** ~3.5MB
- **Content:** ~30 employees with names and biweekly salaries
- **Note:** Contains real names — repo is private

---

## Environment Requirements

```bash
# Required for E2E tests that exercise the import feature
OPENROUTER_API_KEY=sk-or-...
```

If `OPENROUTER_API_KEY` is not set, the import tests will fail at the AI processing step. Other E2E tests are unaffected.

---

## New Files

| Action | File |
|--------|------|
| Create | `apps/web/e2e/employee-import.spec.ts` |
| Create | `apps/web/e2e/fixtures/NOMINA_TEST.jpg` |

No modifications to existing files.
