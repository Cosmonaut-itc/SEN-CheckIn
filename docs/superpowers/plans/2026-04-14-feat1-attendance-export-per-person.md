# FEAT-1: Attendance Export Per Person Per Day — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw per-event attendance CSV export with a per-person-per-day summary showing first entry, last exit, and total hours worked.

**Architecture:** New pure helper file `attendance-export-helpers.ts` with `aggregateAttendanceByPersonDay()` function. The existing `handleExportCsv()` in `attendance-client.tsx` calls this helper between fetch and CSV generation. New type `AttendanceSummaryCsvRow` replaces the old `AttendanceCsvRow`.

**Tech Stack:** TypeScript, Vitest, date-fns, React

**Branch:** `feat/attendance-export-per-person` from `main`
**PR Target:** `main`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.ts` | Create | Pure aggregation function |
| `apps/web/app/(dashboard)/attendance/attendance-export-helpers.test.ts` | Create | Unit tests for aggregation |
| `apps/web/app/(dashboard)/attendance/attendance-client.tsx` | Modify | Wire aggregation into export |
| `apps/web/messages/es.json` | Modify | Add new CSV column translations |

---

### Task 1: Create branch and set up

- [ ] **Step 1: Create branch from main**

```bash
git checkout main && git pull && git checkout -b feat/attendance-export-per-person
```

- [ ] **Step 2: Verify tests pass on clean branch**

```bash
cd apps/web && bun run test -- --run 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: start feat/attendance-export-per-person branch"
```

---

### Task 2: Write tests for the aggregation helper

**Files:**
- Create: `apps/web/app/(dashboard)/attendance/attendance-export-helpers.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from 'vitest';

import {
	aggregateAttendanceByPersonDay,
	type AttendanceSummaryCsvRow,
} from './attendance-export-helpers';

function buildRecord(overrides: {
	employeeId: string;
	employeeName: string;
	timestamp: string;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	checkOutReason?: 'REGULAR' | 'LUNCH_BREAK' | 'PERSONAL' | null;
	offsiteDateKey?: string | null;
	offsiteDayKind?: 'LABORABLE' | 'NO_LABORABLE' | null;
}) {
	return {
		id: crypto.randomUUID(),
		employeeId: overrides.employeeId,
		employeeName: overrides.employeeName,
		deviceId: 'dev-1',
		deviceLocationId: null,
		deviceLocationName: null,
		timestamp: new Date(overrides.timestamp),
		type: overrides.type,
		checkOutReason: overrides.checkOutReason ?? null,
		offsiteDateKey: overrides.offsiteDateKey ?? null,
		offsiteDayKind: overrides.offsiteDayKind ?? null,
		offsiteReason: null,
		offsiteCreatedByUserId: null,
		offsiteUpdatedByUserId: null,
		offsiteUpdatedAt: null,
		metadata: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

const TZ = 'America/Mexico_City';

describe('aggregateAttendanceByPersonDay', () => {
	it('aggregates a simple check-in and check-out into one row', () => {
		const records = [
			buildRecord({
				employeeId: 'emp-1',
				employeeName: 'Juan',
				timestamp: '2026-04-10T14:30:00Z', // 08:30 CST
				type: 'CHECK_IN',
			}),
			buildRecord({
				employeeId: 'emp-1',
				employeeName: 'Juan',
				timestamp: '2026-04-10T23:30:00Z', // 17:30 CST
				type: 'CHECK_OUT',
			}),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.employeeName).toBe('Juan');
		expect(rows[0]!.employeeId).toBe('emp-1');
		expect(rows[0]!.date).toBe('10/04/2026');
		expect(rows[0]!.firstEntry).toBe('08:30');
		expect(rows[0]!.lastExit).toBe('17:30');
		expect(rows[0]!.totalHours).toBe('09:00');
	});

	it('handles lunch break (two check-in/out pairs)', () => {
		const records = [
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T14:30:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T18:30:00Z', type: 'CHECK_OUT', checkOutReason: 'LUNCH_BREAK' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T19:30:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T23:30:00Z', type: 'CHECK_OUT' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.firstEntry).toBe('08:30');
		expect(rows[0]!.lastExit).toBe('17:30');
		// 4h (08:30-12:30) + 4h (13:30-17:30) = 8h
		expect(rows[0]!.totalHours).toBe('08:00');
	});

	it('shows "Sin salida" and "Incompleto" for check-in without check-out', () => {
		const records = [
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T14:30:00Z', type: 'CHECK_IN' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.firstEntry).toBe('08:30');
		expect(rows[0]!.lastExit).toBe('Sin salida');
		expect(rows[0]!.totalHours).toBe('Incompleto');
	});

	it('shows "Sin entrada" and "Incompleto" for check-out without check-in', () => {
		const records = [
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T23:30:00Z', type: 'CHECK_OUT' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.firstEntry).toBe('Sin entrada');
		expect(rows[0]!.lastExit).toBe('17:30');
		expect(rows[0]!.totalHours).toBe('Incompleto');
	});

	it('treats CHECK_OUT_AUTHORIZED the same as CHECK_OUT', () => {
		const records = [
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T14:30:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T20:00:00Z', type: 'CHECK_OUT_AUTHORIZED' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.lastExit).toBe('14:00');
		expect(rows[0]!.totalHours).toBe('05:30');
	});

	it('shows WORK_OFFSITE as "Fuera de oficina"', () => {
		const records = [
			buildRecord({
				employeeId: 'emp-1',
				employeeName: 'Juan',
				timestamp: '2026-04-10T06:00:00Z',
				type: 'WORK_OFFSITE',
				offsiteDateKey: '2026-04-10',
				offsiteDayKind: 'LABORABLE',
			}),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.firstEntry).toBe('Fuera de oficina');
		expect(rows[0]!.lastExit).toBe('Fuera de oficina');
		expect(rows[0]!.totalHours).toBe('Fuera de oficina');
	});

	it('sorts output by employee name then date', () => {
		const records = [
			buildRecord({ employeeId: 'emp-2', employeeName: 'María', timestamp: '2026-04-10T14:00:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Ana', timestamp: '2026-04-11T14:00:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Ana', timestamp: '2026-04-10T14:00:00Z', type: 'CHECK_IN' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(3);
		expect(rows[0]!.employeeName).toBe('Ana');
		expect(rows[0]!.date).toBe('10/04/2026');
		expect(rows[1]!.employeeName).toBe('Ana');
		expect(rows[1]!.date).toBe('11/04/2026');
		expect(rows[2]!.employeeName).toBe('María');
	});

	it('returns empty array for empty input', () => {
		const rows = aggregateAttendanceByPersonDay([], TZ);
		expect(rows).toHaveLength(0);
	});

	it('groups two employees on the same day into separate rows', () => {
		const records = [
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T14:00:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-1', employeeName: 'Juan', timestamp: '2026-04-10T22:00:00Z', type: 'CHECK_OUT' }),
			buildRecord({ employeeId: 'emp-2', employeeName: 'María', timestamp: '2026-04-10T15:00:00Z', type: 'CHECK_IN' }),
			buildRecord({ employeeId: 'emp-2', employeeName: 'María', timestamp: '2026-04-10T23:00:00Z', type: 'CHECK_OUT' }),
		];

		const rows = aggregateAttendanceByPersonDay(records, TZ);

		expect(rows).toHaveLength(2);
		expect(rows[0]!.employeeName).toBe('Juan');
		expect(rows[1]!.employeeName).toBe('María');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && bun test attendance-export-helpers.test.ts --run 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/web/app/\(dashboard\)/attendance/attendance-export-helpers.test.ts
git commit -m "test(web): add attendance export aggregation tests"
```

---

### Task 3: Implement the aggregation helper

**Files:**
- Create: `apps/web/app/(dashboard)/attendance/attendance-export-helpers.ts`

- [ ] **Step 1: Write the helper file**

```typescript
import { format, toZonedTime } from 'date-fns-tz';

import type { AttendanceRecord } from '@/lib/client-functions';

export type AttendanceSummaryCsvRow = {
	employeeName: string;
	employeeId: string;
	date: string;
	firstEntry: string;
	lastExit: string;
	totalHours: string;
};

function toLocalDate(timestamp: Date, timeZone: string): { dateKey: string; time: string } {
	const zoned = toZonedTime(timestamp, timeZone);
	return {
		dateKey: format(zoned, 'yyyy-MM-dd', { timeZone }),
		time: format(zoned, 'HH:mm', { timeZone }),
	};
}

function formatMinutesAsHHmm(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = Math.round(totalMinutes % 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function aggregateAttendanceByPersonDay(
	records: AttendanceRecord[],
	timeZone: string,
): AttendanceSummaryCsvRow[] {
	if (records.length === 0) return [];

	// Group by employeeId + dateKey
	const groups = new Map<string, { employeeName: string; employeeId: string; dateKey: string; records: AttendanceRecord[] }>();

	for (const record of records) {
		let dateKey: string;

		if (record.type === 'WORK_OFFSITE' && record.offsiteDateKey) {
			dateKey = record.offsiteDateKey;
		} else {
			const local = toLocalDate(new Date(record.timestamp), timeZone);
			dateKey = local.dateKey;
		}

		const groupKey = `${record.employeeId}|${dateKey}`;
		const group = groups.get(groupKey) ?? {
			employeeName: record.employeeName,
			employeeId: record.employeeId,
			dateKey,
			records: [],
		};
		group.records.push(record);
		groups.set(groupKey, group);
	}

	// Process each group into a summary row
	const rows: AttendanceSummaryCsvRow[] = [];

	for (const group of groups.values()) {
		// Check if any record is WORK_OFFSITE
		const hasOffsite = group.records.some((r) => r.type === 'WORK_OFFSITE');
		if (hasOffsite) {
			const [year, month, day] = group.dateKey.split('-');
			rows.push({
				employeeName: group.employeeName,
				employeeId: group.employeeId,
				date: `${day}/${month}/${year}`,
				firstEntry: 'Fuera de oficina',
				lastExit: 'Fuera de oficina',
				totalHours: 'Fuera de oficina',
			});
			continue;
		}

		// Separate entries and exits, sorted by timestamp
		const entries = group.records
			.filter((r) => r.type === 'CHECK_IN')
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		const exits = group.records
			.filter((r) => r.type === 'CHECK_OUT' || r.type === 'CHECK_OUT_AUTHORIZED')
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		// Pair sequentially and sum minutes
		const maxPairs = Math.max(entries.length, exits.length);
		let totalMinutes = 0;
		let allPairsComplete = true;

		for (let i = 0; i < maxPairs; i++) {
			const entry = entries[i];
			const exit = exits[i];

			if (entry && exit) {
				const diff = (new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()) / 60_000;
				totalMinutes += Math.max(0, diff);
			} else {
				allPairsComplete = false;
			}
		}

		const firstEntry = entries[0]
			? toLocalDate(new Date(entries[0].timestamp), timeZone).time
			: 'Sin entrada';
		const lastExit = exits.length > 0
			? toLocalDate(new Date(exits[exits.length - 1]!.timestamp), timeZone).time
			: 'Sin salida';

		const [year, month, day] = group.dateKey.split('-');

		rows.push({
			employeeName: group.employeeName,
			employeeId: group.employeeId,
			date: `${day}/${month}/${year}`,
			firstEntry,
			lastExit,
			totalHours: !allPairsComplete ? 'Incompleto' : formatMinutesAsHHmm(totalMinutes),
		});
	}

	// Sort by employee name, then date
	rows.sort((a, b) => {
		const nameCompare = a.employeeName.localeCompare(b.employeeName);
		if (nameCompare !== 0) return nameCompare;
		return a.date.localeCompare(b.date);
	});

	return rows;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/web && bun test attendance-export-helpers.test.ts --run 2>&1 | tail -15
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/attendance/attendance-export-helpers.ts
git commit -m "feat(web): add attendance aggregation helper for per-person-per-day export"
```

---

### Task 4: Add translations

**Files:**
- Modify: `apps/web/messages/es.json`

- [ ] **Step 1: Add new CSV header translations**

In `apps/web/messages/es.json`, find the attendance section and add under the `csv` key:

```json
"csv": {
	"fileName": "asistencia_{start}_{end}.csv",
	"headers": {
		"employeeName": "Empleado",
		"employeeId": "ID Empleado",
		"date": "Fecha",
		"firstEntry": "Entrada",
		"lastExit": "Salida",
		"totalHours": "Horas Trabajadas"
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/messages/es.json
git commit -m "feat(web): add attendance CSV summary column translations"
```

---

### Task 5: Wire aggregation into the export handler

**Files:**
- Modify: `apps/web/app/(dashboard)/attendance/attendance-client.tsx`

- [ ] **Step 1: Update the handleExportCsv function**

In `apps/web/app/(dashboard)/attendance/attendance-client.tsx`, replace the `handleExportCsv` callback (around line 1033-1098).

First, add the import at the top of the file:

```typescript
import {
	aggregateAttendanceByPersonDay,
	type AttendanceSummaryCsvRow,
} from './attendance-export-helpers';
```

Then update `handleExportCsv`:

Replace the columns, rows mapping, and CSV building section (the part after `if (exportRecords.length === 0)`) with:

```typescript
		const summaryRows = aggregateAttendanceByPersonDay(exportRecords, organizationTimeZone);

		type SummaryCsvColumn = { key: keyof AttendanceSummaryCsvRow; label: string };

		const columns: SummaryCsvColumn[] = [
			{ key: 'employeeName', label: t('csv.headers.employeeName') },
			{ key: 'employeeId', label: t('csv.headers.employeeId') },
			{ key: 'date', label: t('csv.headers.date') },
			{ key: 'firstEntry', label: t('csv.headers.firstEntry') },
			{ key: 'lastExit', label: t('csv.headers.lastExit') },
			{ key: 'totalHours', label: t('csv.headers.totalHours') },
		];

		const header = columns.map((col) => escapeCsvValue(col.label)).join(',');
		const lines = summaryRows.map((row) =>
			columns.map((col) => escapeCsvValue(row[col.key])).join(','),
		);
		const csv = [header, ...lines].join('\n');

		const fileName = t('csv.fileName', {
			start: format(start, 'yyyyMMdd'),
			end: format(end, 'yyyyMMdd'),
		});

		downloadCsvFile(csv, fileName);
```

Note: You'll need to get `organizationTimeZone` from the org context. Check how the component accesses it — it's likely available from the `OrgProvider` or from a hook. If it's not directly available, use `'America/Mexico_City'` as the default (matching the API's default).

- [ ] **Step 2: Update `escapeCsvValue` to accept string values**

The existing `escapeCsvValue` uses `AttendanceCsvRow[keyof AttendanceCsvRow]` as its parameter type. Change the parameter type to `string | null | undefined` so it works with both old and new row types:

```typescript
function escapeCsvValue(value: string | null | undefined): string {
	const rawValue = value ?? '';
	const stringValue = String(rawValue);
	const escaped = stringValue.replace(/"/g, '""');
	const needsQuotes = /[",\n]/.test(escaped);
	return needsQuotes ? `"${escaped}"` : escaped;
}
```

- [ ] **Step 3: Clean up unused types**

Remove `AttendanceCsvRow` type and `CsvColumn` type and the old `buildCsvContent` function if they are no longer referenced elsewhere in the file. Keep `downloadCsvFile` and `escapeCsvValue`.

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
git add apps/web/app/\(dashboard\)/attendance/attendance-client.tsx
git commit -m "feat(web): wire attendance aggregation into CSV export handler"
```

---

### Task 6: Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/attendance-export-per-person
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: per-person per-day attendance CSV export with calculated hours" --body "$(cat <<'EOF'
## Summary
- Replaces raw per-event attendance CSV with per-person-per-day summary
- New format: Employee | Date | First Entry | Last Exit | Total Hours
- Automatically calculates total hours, handling lunch breaks and multiple pairs
- Handles edge cases: missing check-out, missing check-in, WORK_OFFSITE, CHECK_OUT_AUTHORIZED

## Test plan
- [ ] Unit tests for aggregation helper cover: simple pair, lunch break, missing check-out, missing check-in, CHECK_OUT_AUTHORIZED, WORK_OFFSITE, sorting, empty input, multiple employees
- [ ] Type check passes
- [ ] Full web test suite passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
