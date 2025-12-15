---
name: Employee locations + schedules by location
overview: Add required employee location assignment end-to-end (DB constraint + API validation + web form + table column), and redesign the Schedules calendar to render only By Location with per-location employee filtering and clear per-day expected employees.
todos:
    - id: db-backfill-location-not-null
      content: Add Drizzle migration to backfill employee.location_id and enforce NOT NULL; update Drizzle schema accordingly.
      status: pending
    - id: api-enforce-location-required
      content: Update API Zod schemas to require locationId for employee create and disallow null updates; verify employee routes remain consistent.
      status: pending
      dependencies:
          - db-backfill-location-not-null
    - id: web-employee-location-selector
      content: Update web Employees server actions + employees-client form to require and submit locationId; add employees table column for locationId.
      status: pending
      dependencies:
          - api-enforce-location-required
    - id: web-schedules-by-location-ui
      content: Redesign schedules calendar view to be only By Location with per-location employee filter and per-day expected employee lists (weekly/monthly).
      status: pending
      dependencies:
          - web-employee-location-selector
---

# Plan: Required employee location + schedules by location

### Non-negotiables (must comply)

- **Must comply with** `AGENTS.md` (strict TypeScript, strong typing everywhere, JSDoc on functions, follow repo commands/workspace structure).
- **Dates**: use `date-fns` for any new/modified date logic.
- **No `any`**: use proper types or `unknown`.

---

## 1) Employees: add required Location selector + show locationId column

### Backend (API + DB)

- **DB constraint & backfill (required)**
    - Update `apps/api/src/db/schema.ts`:
        - Make `employee.locationId` **NOT NULL** by adding `.notNull()` to the `locationId` column definition.
    - Create a new Drizzle SQL migration in `apps/api/drizzle/` that:
        - **Backfills** `employee.location_id` where null by setting it to the **first created** location for that employee’s `organization_id`.
            - Use `location.created_at` to pick the earliest per org.
            - Add a guard: if any organization has employees but **no** locations, **abort the migration** with a clear error message (so we don’t silently create data you didn’t ask for).
        - After backfill, apply `ALTER TABLE employee ALTER COLUMN location_id SET NOT NULL`.

- **API validation**
    - Update `apps/api/src/schemas/crud.ts`:
        - `createEmployeeSchema.locationId`: make **required** (`z.string().uuid()`), not optional.
        - `updateEmployeeSchema.locationId`: disallow `null` (keep optional, but when present it must be a UUID).
    - Verify `apps/api/src/routes/employees.ts` behavior remains correct:
        - It already validates location existence and org ownership; ensure it now always runs on create.

### Web (Employees UI + server actions)

- **Server actions**
    - Update `apps/web/actions/employees.ts`:
        - Add required `locationId: string` to `CreateEmployeeInput` and `UpdateEmployeeInput`.
        - Include `locationId` in `api.employees.post(...)` and `api.employees[id].put(...)` payloads.

- **Employees create/edit dialog**
    - Update `apps/web/app/(dashboard)/employees/employees-client.tsx`:
        - Extend `EmployeeFormValues` with **required** `locationId: string`.
        - Fetch locations via `fetchLocationsList` (scoped to `organizationId`), similar to job positions.
        - Add a `SelectField` for Location inside the dialog form (required validator).
        - On edit: initialize `locationId` from `employee.locationId`.
        - On submit: include `locationId` in both create and update mutations.

- **Employees table column**
    - Update `apps/web/app/(dashboard)/employees/employees-client.tsx`:
        - Add a new table column that **renders `employee.locationId`**.
        - (Optional UX) Also build a `locationLookup` (id → name) to show name in a tooltip while still rendering the ID, if you want.

---

## 2) Schedules calendar: ONLY “By location”, filter employees within each location card, show per-day expected employees

### Target behavior

- Remove the “By Employee” visualization entirely.
- Calendar renders **location cards**. Each card:
    - Shows the location name.
    - Has an **employee filter** (inside the card) to narrow which employees are displayed for that location.
    - Shows, for each day in the range, **which employees are expected** and their scheduled time + source (`template`/`manual`/`exception`).

### Web implementation

- Update `apps/web/app/(dashboard)/schedules/components/calendar-view.tsx`:
    - Remove `scope` state and the By Employee toggle.
    - Keep `viewMode` (`week`/`month`) and navigation.
    - Use `date-fns` (`startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `format`, etc.) when touching date computations.
    - Fetch calendar entries once (`fetchCalendar`) for the selected range.
    - Group `CalendarEmployee[]` by `locationId`.
        - Since we are enforcing “no unassigned employees”, treat missing `locationId` as a data issue and show a small warning banner with count + guidance to fix Employees.

- Replace/augment the card component
    - Add a new component: `apps/web/app/(dashboard)/schedules/components/location-schedule-card.tsx`.
        - Props (strongly typed): `location`, `employeesInLocation`, `calendarEmployeesInLocation`, `viewMode`, `rangeStart`, `rangeEnd`, etc.
        - Internal state: selected employeeId(s) for filtering within the card.
        - Render rules:
            - **Weekly**: 7 columns; each day column lists employee rows (name + `HH:mm–HH:mm` + small badge for source/exception).
            - **Monthly**: 7-column month grid; each day cell shows up to N employees and a “+X more” line; full list on hover using existing `Tooltip` (no new UI primitives).

- Remove/retire `apps/web/app/(dashboard)/schedules/components/employee-schedule-card.tsx` usage
    - Keep the file only if it’s used elsewhere; otherwise plan to delete it after verifying no imports remain.

---

## Data flow diagram (calendar)

```mermaid
flowchart LR
  WebCalendar[Web CalendarView] -->|fetchCalendar(startDate,endDate,orgId)| ApiCalendar[API GET /scheduling/calendar]
  ApiCalendar -->|CalendarEmployee[] per employee| WebCalendar
  WebCalendar -->|groupBy(locationId)| LocationCards[LocationScheduleCard[]]
  LocationCards -->|filterBy(employeeId)| DayCells[PerDayEmployeeLists]
```

---

## Verification checklist (post-implementation)

- **Employees**
    - Creating employee requires selecting a location.
    - Editing employee keeps location selected; can change it.
    - Employees table shows the locationId column.
- **Migration**
    - Employees with null `location_id` get backfilled to earliest location per org.
    - DB enforces NOT NULL for `employee.location_id`.
- **Schedules (Calendar tab)**
    - Only By Location UI exists.
    - Each location card can filter employees.
    - Each day clearly shows expected employees + time + schedule source.

---

## Files expected to change

- API
    - `apps/api/src/db/schema.ts`
    - `apps/api/src/schemas/crud.ts`
    - `apps/api/drizzle/<new_migration>.sql`
    - (Verify only) `apps/api/src/routes/employees.ts`
- Web
    - `apps/web/actions/employees.ts`
    - `apps/web/app/(dashboard)/employees/employees-client.tsx`
    - `apps/web/app/(dashboard)/schedules/components/calendar-view.tsx`
    - `apps/web/app/(dashboard)/schedules/components/location-schedule-card.tsx` (new)
    - Potentially `apps/web/app/(dashboard)/schedules/components/employee-schedule-card.tsx` (remove if unused)
