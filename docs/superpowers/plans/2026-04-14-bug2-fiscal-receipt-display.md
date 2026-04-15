# BUG-2: Fiscal Receipt Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When dual payroll is active, the payroll receipt PDF and CSV export must show `fiscalGrossPay` as "percepciones gravadas", `complementPay` as "complemento", and `totalRealPay` as "total percepciones" — instead of displaying the real salary as taxable.

**Architecture:** The data is already correctly calculated. The fix reads `fiscalGrossPay`, `complementPay`, `totalRealPay` from the `PayrollRunEmployee` object in the PDF builder, and adjusts the CSV helper to use `fiscalGrossPay` for the main `grossPay` column when dual payroll is active.

**Tech Stack:** TypeScript, jsPDF (via pdf-lib), Vitest, Next.js

**Branch:** `fix/fiscal-receipt-display` from `main`
**PR Target:** `main`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts` | Modify | Show fiscal/complement/total rows in dual payroll |
| `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts` | Modify | Use fiscal value for `grossPay` field when dual payroll |
| `apps/web/app/(dashboard)/payroll/payroll-client.helpers.test.ts` | Modify | Add dual payroll CSV tests |
| `apps/web/messages/es.json` | Modify | Add receipt labels for complement and total |

---

### Task 1: Create branch and set up

- [ ] **Step 1: Create branch from main**

```bash
git checkout main && git pull && git checkout -b fix/fiscal-receipt-display
```

- [ ] **Step 2: Verify tests pass on clean branch**

```bash
cd apps/web && bun run test -- --run 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: start fix/fiscal-receipt-display branch"
```

---

### Task 2: Add translation keys

**Files:**
- Modify: `apps/web/messages/es.json`

- [ ] **Step 1: Add receipt summary labels**

In `apps/web/messages/es.json`, locate the `summary.rows` section (around line 2054) and add the new keys:

```json
"summary": {
	"title": "Resumen fiscal",
	"rows": {
		"companyCost": "Tu trabajo vale para la empresa",
		"grossPay": "La empresa te paga",
		"fiscalGrossPay": "Percepciones gravadas (fiscal)",
		"complementPay": "Complemento",
		"totalRealPay": "Total percepciones",
		"employerCosts": "La empresa le paga al gobierno por tu cuenta",
		"employeeWithholdings": "Después, el gobierno te quita",
		"netPay": "Te quedan"
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/messages/es.json
git commit -m "feat(web): add receipt translation keys for dual payroll summary"
```

---

### Task 3: Fix CSV helper for dual payroll

**Files:**
- Modify: `apps/web/app/(dashboard)/payroll/payroll-client.helpers.test.ts`
- Modify: `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts`

- [ ] **Step 1: Write failing test for dual payroll CSV row**

Add to `apps/web/app/(dashboard)/payroll/payroll-client.helpers.test.ts`:

```typescript
it('uses fiscalGrossPay for grossPay field when dual payroll is active', () => {
	const row = buildPayrollCsvEmployeeRow({
		row: buildEmployee({
			totalPay: 2000,
			grossPay: 2000,
			fiscalGrossPay: 1500,
			complementPay: 500,
			totalRealPay: 2000,
		}),
		periodStartDateKey: '2026-03-09',
		periodEndDateKey: '2026-03-15',
		t,
	});

	// grossPay CSV field should show fiscal amount when dual payroll data exists
	expect(row.grossPay).toBe(1500);
	expect(row.fiscalGrossPay).toBe(1500);
	expect(row.complementPay).toBe(500);
	expect(row.totalRealPay).toBe(2000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && bun test payroll-client.helpers.test.ts --run 2>&1 | tail -10
```

Expected: FAIL — `row.grossPay` is 2000 (real) not 1500 (fiscal)

- [ ] **Step 3: Fix the helper**

In `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts`, change the `grossPay` line (around line 57):

```typescript
		grossPay: row.fiscalGrossPay ?? row.grossPay ?? row.totalPay,
```

This makes the `grossPay` CSV field (labeled "percepciones_gravadas") use the fiscal value when available, falling back to real gross pay when dual payroll is not active.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && bun test payroll-client.helpers.test.ts --run 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts apps/web/app/(dashboard)/payroll/payroll-client.helpers.test.ts
git commit -m "fix(web): use fiscal gross pay for percepciones gravadas CSV column"
```

---

### Task 4: Fix receipt PDF for dual payroll

**Files:**
- Modify: `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts`

- [ ] **Step 1: Read the current file to get exact context**

Read `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts` lines 285-400 to understand the exact structure before modifying.

- [ ] **Step 2: Modify gross pay extraction for dual payroll**

At the top of `buildPayrollReceiptPdf()` (around line 306), after extracting `taxBreakdown`, add:

```typescript
	const isDualPayroll = input.employee.fiscalGrossPay != null;
	const displayGrossPay = isDualPayroll
		? toNumber(input.employee.fiscalGrossPay)
		: grossPay;
	const displayComplementPay = isDualPayroll
		? toNumber(input.employee.complementPay ?? 0)
		: null;
	const displayTotalRealPay = isDualPayroll
		? toNumber(input.employee.totalRealPay ?? grossPay)
		: null;
```

- [ ] **Step 3: Modify summary rows for dual payroll**

Replace the `summaryRows` construction (around line 340-380) with dual-payroll-aware logic:

```typescript
	const summaryRows: PayrollReceiptSummary[] = [
		{
			label: input.t('summary.rows.companyCost'),
			value: companyCost,
			color: SUMMARY_COLOR_POSITIVE,
		},
		...(isDualPayroll
			? [
					{
						label: input.t('summary.rows.fiscalGrossPay'),
						value: displayGrossPay,
						color: SUMMARY_COLOR_POSITIVE,
					},
					{
						label: input.t('summary.rows.complementPay'),
						value: displayComplementPay!,
						color: SUMMARY_COLOR_POSITIVE,
					},
					{
						label: input.t('summary.rows.totalRealPay'),
						value: displayTotalRealPay!,
						color: SUMMARY_COLOR_POSITIVE,
					},
			  ]
			: [
					{
						label: input.t('summary.rows.grossPay'),
						value: grossPay,
						color: SUMMARY_COLOR_POSITIVE,
					},
			  ]),
		{
			label: input.t('summary.rows.employerCosts'),
			value: employerCostsTotal,
			color: SUMMARY_COLOR_WARNING,
		},
		{
			label: input.t('summary.rows.employeeWithholdings'),
			value: employeeWithholdingsTotal,
			color: SUMMARY_COLOR_NEGATIVE,
		},
		{
			label: input.t('summary.rows.netPay'),
			value: netPay,
			color: SUMMARY_COLOR_POSITIVE,
		},
	];
```

- [ ] **Step 4: Verify build passes**

```bash
cd apps/web && bun run check-types 2>&1 | tail -5
```

Expected: no type errors

- [ ] **Step 5: Run full test suite**

```bash
cd apps/web && bun run test -- --run 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts
git commit -m "fix(web): show fiscal gross pay in receipt PDF when dual payroll is active"
```

---

### Task 5: Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin fix/fiscal-receipt-display
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "fix: show fiscal salary as percepciones gravadas in receipt and CSV" --body "$(cat <<'EOF'
## Summary
- Receipt PDF now shows fiscal gross pay, complement, and total real pay as separate rows when dual payroll is active
- CSV export uses `fiscalGrossPay` for the "percepciones_gravadas" column when dual payroll data exists
- Added Spanish translation keys for new receipt labels

## Test plan
- [ ] CSV helper test verifies fiscal value used when dual payroll fields are present
- [ ] CSV helper test verifies fallback to grossPay when no dual payroll
- [ ] Type check passes
- [ ] Full web test suite passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
