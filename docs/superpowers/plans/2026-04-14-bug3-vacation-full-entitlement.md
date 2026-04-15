# BUG-3: Vacation Full Entitlement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change vacation accrual from linear (fractional) to full entitlement at the start of each service year, so employees see all their entitled days immediately after their anniversary.

**Architecture:** One-line change in `calculateVacationAccrual()` replacing `(entitledDays * daysElapsed) / daysInServiceYear` with `entitledDays`. Update existing tests to expect full entitlement instead of fractional accrual.

**Tech Stack:** TypeScript, Bun test runner

**Branch:** `fix/vacation-full-entitlement` from `main`
**PR Target:** `main`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/services/vacations.ts` | Modify | Change one line in `calculateVacationAccrual()` |
| `apps/api/src/services/vacations.test.ts` | Modify | Update accrual tests to expect full entitlement |

---

### Task 1: Create branch and set up

- [ ] **Step 1: Create branch from main**

```bash
git checkout main && git pull && git checkout -b fix/vacation-full-entitlement
```

- [ ] **Step 2: Verify tests pass on clean branch**

```bash
cd apps/api && bun run test:unit -- --run 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: start fix/vacation-full-entitlement branch"
```

---

### Task 2: Update tests first (TDD — make them expect the new behavior)

**Files:**
- Modify: `apps/api/src/services/vacations.test.ts`

- [ ] **Step 1: Update the linear accrual test to expect full entitlement**

In `apps/api/src/services/vacations.test.ts`, find the first test (around line 14):

Replace:
```typescript
	it('accrues vacation days linearly within the service year', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2026-07-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.serviceYearEndDateKey).toBe('2026-12-31');
		expect(accrual.entitledDays).toBe(12);

		const expectedAccrued = (12 * 182) / 365;
		expect(accrual.accruedDays).toBeCloseTo(expectedAccrued, 6);
	});
```

With:
```typescript
	it('grants full entitlement at start of service year', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2026-07-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.serviceYearEndDateKey).toBe('2026-12-31');
		expect(accrual.entitledDays).toBe(12);
		expect(accrual.accruedDays).toBe(12);
	});
```

- [ ] **Step 2: Update the clamp-to-start test**

Replace:
```typescript
	it('clamps accrual to the service year start date when asOf precedes it', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2025-06-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.daysElapsed).toBe(1);
		expect(accrual.daysInServiceYear).toBe(365);
		expect(accrual.accruedDays).toBeCloseTo(12 / 365, 6);
	});
```

With:
```typescript
	it('grants full entitlement even when asOf precedes the service year start', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2025-06-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.daysElapsed).toBe(1);
		expect(accrual.daysInServiceYear).toBe(365);
		expect(accrual.accruedDays).toBe(12);
	});
```

- [ ] **Step 3: Update the leap year test**

In the leap year test (around line 85), replace the last line:

Replace:
```typescript
		expect(accrual.accruedDays).toBeCloseTo(12 / 366, 6);
```

With:
```typescript
		expect(accrual.accruedDays).toBe(12);
```

- [ ] **Step 4: Add a new test for day-one-of-service-year**

Add a new test after the existing ones:

```typescript
	it('grants full entitlement on the first day of the service year', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2026-01-01',
		});

		expect(accrual.entitledDays).toBe(12);
		expect(accrual.accruedDays).toBe(12);
		expect(accrual.daysElapsed).toBe(1);
	});

	it('grants 14 days for second service year', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 2,
			asOfDateKey: '2027-03-15',
		});

		expect(accrual.entitledDays).toBe(14);
		expect(accrual.accruedDays).toBe(14);
	});
```

- [ ] **Step 5: Update the available days test**

The existing test at around line 105 uses `accruedDays: 5.9835` and expects `2`. This is testing `calculateAvailableVacationDays()` which uses `Math.floor()`. With full entitlement, accrued will always be an integer, but the function should still work. Add an integer test:

```typescript
	it('calculates available days from integer accrued, used, and pending', () => {
		const available = calculateAvailableVacationDays({
			accruedDays: 12,
			usedDays: 3,
			pendingDays: 2,
		});

		expect(available).toBe(7);
	});
```

- [ ] **Step 6: Run tests to verify they FAIL (old code still uses linear)**

```bash
cd apps/api && bun test src/services/vacations.test.ts --run 2>&1 | tail -15
```

Expected: FAIL — accrual tests expect 12 but get fractional values

- [ ] **Step 7: Commit failing tests**

```bash
git add apps/api/src/services/vacations.test.ts
git commit -m "test(api): update vacation accrual tests to expect full entitlement"
```

---

### Task 3: Implement the fix

**Files:**
- Modify: `apps/api/src/services/vacations.ts`

- [ ] **Step 1: Change the accrual calculation**

In `apps/api/src/services/vacations.ts`, find the line (around line 200):

```typescript
	const accruedDays =
		daysInServiceYear > 0 ? (entitledDays * daysElapsed) / daysInServiceYear : 0;
```

Replace with:

```typescript
	const accruedDays = entitledDays;
```

- [ ] **Step 2: Run vacation tests to verify they pass**

```bash
cd apps/api && bun test src/services/vacations.test.ts --run 2>&1 | tail -15
```

Expected: all pass

- [ ] **Step 3: Run full API test suite for regressions**

```bash
cd apps/api && bun run test:unit -- --run 2>&1 | tail -10
```

Expected: all pass. If any payroll tests relied on fractional accrual values, update them.

- [ ] **Step 4: Run contract tests**

```bash
cd apps/api && bun run test:contract -- --run 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/vacations.ts
git commit -m "fix(api): grant full vacation entitlement at start of service year

Replaces linear accrual (prorated by days elapsed) with full entitlement.
Per LFT Art. 76-78, vacation days are earned at each service year anniversary."
```

---

### Task 4: Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin fix/vacation-full-entitlement
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "fix: grant full vacation entitlement at start of service year" --body "$(cat <<'EOF'
## Summary
- Changes vacation accrual from linear prorate to full entitlement at anniversary
- `accruedDays` now equals `entitledDays` for any `serviceYearNumber >= 1`
- Employees see all their vacation days available from day one of each service year
- Per LFT Art. 76-78, vacation days are earned when each year of service completes

## Test plan
- [ ] Updated accrual tests verify full entitlement (not fractional)
- [ ] New test verifies day-one-of-service-year gets full days
- [ ] Available days calculation still works with integer accrual
- [ ] Service year 0 still returns 0 days
- [ ] Full API unit and contract test suites pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
