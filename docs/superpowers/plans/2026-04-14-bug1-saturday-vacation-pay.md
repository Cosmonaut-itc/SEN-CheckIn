# BUG-1: Saturday Vacation Pay Bonus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `countSaturdayAsWorkedForSeventhDay` is enabled and an employee with a Mon-Fri schedule takes vacation that spans a Saturday, pay that Saturday as a bonus day without consuming from the vacation balance.

**Architecture:** New pure function `countSaturdayBonusDaysForPeriod()` in `vacations.ts` counts Saturdays in the intersection of vacation periods and the payroll period. A new optional field `saturdayVacationBonusDays` in `CalculatePayrollFromDataArgs` carries this count into payroll calculation, where it adds `bonusDays × dailyPay` to both fiscal and real gross pay.

**Tech Stack:** TypeScript, Bun test runner, Elysia API

**Branch:** `fix/saturday-vacation-pay` from `main`
**PR Target:** `main`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/services/vacations.ts` | Modify | Add `countSaturdayBonusDaysForPeriod()` |
| `apps/api/src/services/vacations.test.ts` | Modify | Tests for new function |
| `apps/api/src/services/payroll-calculation.ts` | Modify | Accept `saturdayVacationBonusDays`, compute bonus, add to gross pay |
| `apps/api/src/services/payroll-calculation.test.ts` | Modify | Tests for Saturday bonus in payroll |
| `apps/api/src/routes/payroll.ts` | Modify | Compute `saturdayVacationBonusDays` per employee before calling payroll calc |

---

### Task 1: Create branch and set up

- [ ] **Step 1: Create branch from main**

```bash
git checkout main && git pull && git checkout -b fix/saturday-vacation-pay
```

- [ ] **Step 2: Verify tests pass on clean branch**

```bash
cd apps/api && bun run test:unit -- --run 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: start fix/saturday-vacation-pay branch"
```

---

### Task 2: Write and implement `countSaturdayBonusDaysForPeriod()` in vacations.ts

**Files:**
- Modify: `apps/api/src/services/vacations.test.ts`
- Modify: `apps/api/src/services/vacations.ts`

- [ ] **Step 1: Write failing tests**

Add this test block at the end of the describe block in `apps/api/src/services/vacations.test.ts`:

```typescript
describe('countSaturdayBonusDaysForPeriod', () => {
	it('counts one Saturday when vacation Mon-Sat overlaps a weekly payroll period', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-06', endDateKey: '2026-04-11' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(1);
	});

	it('returns 0 when flag is disabled', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-06', endDateKey: '2026-04-11' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: false,
		});
		expect(count).toBe(0);
	});

	it('returns 0 for non-Mon-Fri schedules (e.g. Mon-Sat)', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-06', endDateKey: '2026-04-11' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: true },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(0);
	});

	it('counts two Saturdays in a biweekly vacation period', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-06', endDateKey: '2026-04-18' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-19',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(2);
	});

	it('returns 0 when vacation is a single Friday', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-10', endDateKey: '2026-04-10' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(0);
	});

	it('counts Saturday when vacation Fri-Mon spans weekend', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [{ startDateKey: '2026-04-10', endDateKey: '2026-04-13' }],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(1);
	});

	it('returns 0 when no vacation periods provided', () => {
		const count = countSaturdayBonusDaysForPeriod({
			vacationPeriods: [],
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			schedule: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			countSaturdayAsWorkedForSeventhDay: true,
		});
		expect(count).toBe(0);
	});
});
```

Import at the top of the test file:
```typescript
import { countSaturdayBonusDaysForPeriod } from './vacations';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bun test src/services/vacations.test.ts --run 2>&1 | tail -10
```

Expected: FAIL — `countSaturdayBonusDaysForPeriod` is not exported

- [ ] **Step 3: Implement the function**

Add to `apps/api/src/services/vacations.ts` after the existing exports (before `buildVacationDayBreakdown`):

```typescript
/**
 * Counts Saturdays that fall within the intersection of vacation periods and a
 * payroll period, for Mon-Fri schedules when the Saturday-as-worked flag is on.
 * These Saturdays are paid as bonus days without consuming vacation balance.
 */
export function countSaturdayBonusDaysForPeriod(args: {
	vacationPeriods: { startDateKey: string; endDateKey: string }[];
	periodStartDateKey: string;
	periodEndDateKey: string;
	schedule: Omit<ScheduleRow, 'employeeId'>[];
	countSaturdayAsWorkedForSeventhDay: boolean;
}): number {
	const {
		vacationPeriods,
		periodStartDateKey,
		periodEndDateKey,
		schedule,
		countSaturdayAsWorkedForSeventhDay,
	} = args;

	if (!countSaturdayAsWorkedForSeventhDay || vacationPeriods.length === 0) {
		return 0;
	}

	// Only applies to classic Mon-Fri schedules where Saturday is NOT a working day
	const workingDays = new Set(
		schedule.filter((entry) => entry.isWorkingDay).map((entry) => entry.dayOfWeek),
	);
	const isClassicMonFri =
		workingDays.size === 5 &&
		[1, 2, 3, 4, 5].every((d) => workingDays.has(d)) &&
		!workingDays.has(0) &&
		!workingDays.has(6);

	if (!isClassicMonFri) {
		return 0;
	}

	let count = 0;

	for (const vacation of vacationPeriods) {
		// Intersect vacation range with payroll period
		const intersectStart =
			vacation.startDateKey > periodStartDateKey
				? vacation.startDateKey
				: periodStartDateKey;
		const intersectEnd =
			vacation.endDateKey < periodEndDateKey
				? vacation.endDateKey
				: periodEndDateKey;

		if (intersectStart > intersectEnd) {
			continue;
		}

		// Iterate each day in the intersection looking for Saturdays
		let currentKey = intersectStart;
		for (let i = 0; i < 400 && currentKey <= intersectEnd; i += 1) {
			const date = new Date(`${currentKey}T00:00:00Z`);
			if (date.getUTCDay() === 6) {
				count += 1;
			}
			// Advance to next day
			date.setUTCDate(date.getUTCDate() + 1);
			currentKey = date.toISOString().slice(0, 10);
		}
	}

	return count;
}
```

Also add the import for `ScheduleRow` if not already imported at the top of vacations.ts. Check if `ScheduleRow` is defined in `payroll-calculation.ts` — if so, import it from there or define a local compatible type.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bun test src/services/vacations.test.ts --run 2>&1 | tail -10
```

Expected: all tests pass including the new ones

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/vacations.ts apps/api/src/services/vacations.test.ts
git commit -m "feat(api): add countSaturdayBonusDaysForPeriod function with tests"
```

---

### Task 3: Add `saturdayVacationBonusDays` to payroll calculation

**Files:**
- Modify: `apps/api/src/services/payroll-calculation.test.ts`
- Modify: `apps/api/src/services/payroll-calculation.ts`

- [ ] **Step 1: Write failing tests**

Add these tests in `payroll-calculation.test.ts` after the existing `countSaturdayAsWorkedForSeventhDay` test block (around line 2870):

```typescript
describe('saturdayVacationBonusDays', () => {
	it('adds Saturday bonus pay to gross when vacation bonus days are provided', () => {
		const { employees: results } = calculatePayrollFromData({
			...baseArgs,
			periodStartDateKey: '2025-01-06',
			periodEndDateKey: '2025-01-12',
			periodBounds: getPayrollPeriodBounds({
				periodStartDateKey: '2025-01-06',
				periodEndDateKey: '2025-01-12',
				timeZone,
			}),
			vacationDayCounts: { [employeeId]: 5 },
			saturdayVacationBonusDays: { [employeeId]: 1 },
		});

		const row = results[0]!;
		// 5 vacation days * 800 daily = 4000 vacation pay
		// 1 Saturday bonus * 800 daily = 800 bonus
		expect(row.vacationDaysPaid).toBe(5);
		expect(row.vacationPayAmount).toBe(4000);
		expect(row.saturdayVacationBonus).toBe(800);
	});

	it('adds zero bonus when saturdayVacationBonusDays is not provided', () => {
		const { employees: results } = calculatePayrollFromData({
			...baseArgs,
			periodStartDateKey: '2025-01-06',
			periodEndDateKey: '2025-01-12',
			periodBounds: getPayrollPeriodBounds({
				periodStartDateKey: '2025-01-06',
				periodEndDateKey: '2025-01-12',
				timeZone,
			}),
			vacationDayCounts: { [employeeId]: 5 },
		});

		const row = results[0]!;
		expect(row.saturdayVacationBonus).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bun test src/services/payroll-calculation.test.ts -t "saturdayVacationBonusDays" --run 2>&1 | tail -10
```

Expected: FAIL — `saturdayVacationBonusDays` not in args type, `saturdayVacationBonus` not in result

- [ ] **Step 3: Add field to input type**

In `apps/api/src/services/payroll-calculation.ts`, add to `CalculatePayrollFromDataArgs` (after `vacationDayCounts` around line 219):

```typescript
	saturdayVacationBonusDays?: Record<string, number>;
```

- [ ] **Step 4: Add field to result type**

In `PayrollCalculationRow` (around line 90, after `vacationPremiumAmount`):

```typescript
	saturdayVacationBonus: number;
```

- [ ] **Step 5: Implement bonus calculation in the per-employee loop**

In `calculatePayrollFromData()`, after the vacation pay calculation (around line 1338), add:

```typescript
		const saturdayBonusDays = Math.max(0, saturdayVacationBonusDays?.[emp.id] ?? 0);
		const saturdayVacationBonus =
			saturdayBonusDays > 0 ? roundCurrency(saturdayBonusDays * taxDailyPay) : 0;
		const realSaturdayVacationBonus =
			saturdayBonusDays > 0 ? roundCurrency(saturdayBonusDays * realDailyPay) : 0;
```

Then add the bonus to `fiscalGrossPay` (around line 1378):

```typescript
	const fiscalGrossPay = roundCurrency(
		normalPay +
			overtimeDoublePay +
			overtimeTriplePay +
			sundayPremiumAmount +
			mandatoryRestDayPremiumAmount +
			seventhDayPay +
			vacationPayAmount +
			vacationPremiumAmount +
			saturdayVacationBonus,
	);
```

And to `realGrossPay` (around line 1388):

```typescript
	const realGrossPay = roundCurrency(
		realNormalPay +
			realOvertimeDoublePay +
			realOvertimeTriplePay +
			realSundayPremiumAmount +
			realMandatoryRestDayPremiumAmount +
			realSeventhDayPay +
			realVacationPayAmount +
			realVacationPremiumAmount +
			realSaturdayVacationBonus,
	);
```

Add `saturdayVacationBonus` to the returned row object.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/api && bun test src/services/payroll-calculation.test.ts -t "saturdayVacationBonusDays" --run 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
cd apps/api && bun run test:unit -- --run 2>&1 | tail -10
```

Expected: all pass. Some existing tests may need `saturdayVacationBonus: 0` added to expected results — fix any that fail.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/payroll-calculation.ts apps/api/src/services/payroll-calculation.test.ts
git commit -m "feat(api): add saturdayVacationBonusDays to payroll calculation"
```

---

### Task 4: Wire up Saturday bonus in the payroll route

**Files:**
- Modify: `apps/api/src/routes/payroll.ts`

- [ ] **Step 1: Add vacation period query**

In `apps/api/src/routes/payroll.ts`, after the `vacationDayRows` query (around line 345), add a query to get the actual vacation period date ranges:

```typescript
		const vacationPeriodRows =
			employeeIds.length === 0
				? []
				: await db
						.select({
							employeeId: vacationRequest.employeeId,
							startDateKey: vacationRequest.startDateKey,
							endDateKey: vacationRequest.endDateKey,
						})
						.from(vacationRequest)
						.where(
							and(
								eq(vacationRequest.organizationId, organizationId),
								inArray(vacationRequest.employeeId, employeeIds),
								eq(vacationRequest.status, 'APPROVED'),
								lte(vacationRequest.startDateKey, periodEndDateKey),
								gte(vacationRequest.endDateKey, periodStartDateKey),
							),
						);
```

- [ ] **Step 2: Build saturdayVacationBonusDays map**

After the query, import `countSaturdayBonusDaysForPeriod` from `../services/vacations` and build the map:

```typescript
		const saturdayVacationBonusDays: Record<string, number> = {};
		if (payrollSettingsSnapshot?.countSaturdayAsWorkedForSeventhDay) {
			const periodsByEmployee = new Map<string, { startDateKey: string; endDateKey: string }[]>();
			for (const row of vacationPeriodRows) {
				const periods = periodsByEmployee.get(row.employeeId) ?? [];
				periods.push({ startDateKey: row.startDateKey, endDateKey: row.endDateKey });
				periodsByEmployee.set(row.employeeId, periods);
			}

			for (const [empId, periods] of periodsByEmployee) {
				const empSchedule = schedules.filter((s) => s.employeeId === empId)
					.map(({ employeeId: _, ...rest }) => rest);
				const bonusDays = countSaturdayBonusDaysForPeriod({
					vacationPeriods: periods,
					periodStartDateKey,
					periodEndDateKey,
					schedule: empSchedule,
					countSaturdayAsWorkedForSeventhDay: true,
				});
				if (bonusDays > 0) {
					saturdayVacationBonusDays[empId] = bonusDays;
				}
			}
		}
```

- [ ] **Step 3: Pass to calculatePayrollFromData**

Add `saturdayVacationBonusDays` to the call (around line 468):

```typescript
		saturdayVacationBonusDays,
```

- [ ] **Step 4: Run full test suite**

```bash
bun run test:api:unit -- --run 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/payroll.ts
git commit -m "feat(api): wire Saturday vacation bonus into payroll route"
```

---

### Task 5: Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin fix/saturday-vacation-pay
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "fix: pay Saturday as bonus day during vacation when seventh-day flag is active" --body "$(cat <<'EOF'
## Summary
- Adds `countSaturdayBonusDaysForPeriod()` to count Saturdays within vacation periods for Mon-Fri employees
- Adds `saturdayVacationBonusDays` field to payroll calculation to pay Saturday as bonus without consuming vacation balance
- Wires the bonus computation into the payroll route

Closes the bug where Saturday was not being paid during vacation periods even when `countSaturdayAsWorkedForSeventhDay` was enabled.

## Test plan
- [ ] Unit tests for `countSaturdayBonusDaysForPeriod` cover: flag on/off, Mon-Fri vs Mon-Sat, biweekly, single Friday, spanning weekend
- [ ] Unit tests for payroll calculation verify bonus adds to gross pay
- [ ] Full API unit test suite passes without regressions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
