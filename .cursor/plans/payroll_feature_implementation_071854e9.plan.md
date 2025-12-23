---
name: Payroll Feature Implementation
overview: Add a payroll calculation feature with job position pay configuration, employee payment tracking, organization-level payroll settings, and a payroll page for calculating, reviewing, and processing payments based on attendance hours.
todos:
    - id: schema-updates
      content: 'Update database schema: add paymentFrequency enum, job position fields, employee lastPayrollDate'
      status: completed
    - id: new-tables
      content: 'Create new tables: payrollSettings, payrollRun, payrollRunEmployee'
      status: completed
    - id: migration
      content: Generate and apply Drizzle migration
      status: in_progress
    - id: api-schemas
      content: Create/update Zod schemas for job positions and payroll
      status: completed
    - id: job-position-routes
      content: Update job position routes to handle hourlyPay and paymentFrequency
      status: completed
    - id: payroll-settings-routes
      content: Create payroll settings API routes (GET/PUT)
      status: completed
    - id: payroll-routes
      content: Create payroll API routes (calculate, process, history)
      status: completed
    - id: web-query-keys
      content: Add payroll query/mutation keys to query-keys.ts
      status: completed
    - id: web-client-functions
      content: Add payroll types and fetchers to client-functions.ts
      status: completed
    - id: web-server-functions
      content: Add payroll server fetchers and prefetch helpers
      status: completed
    - id: web-actions
      content: Create payroll server actions
      status: completed
    - id: job-positions-page
      content: Update job positions page with hourlyPay and paymentFrequency fields
      status: completed
    - id: payroll-settings-page
      content: Create payroll settings page with week start configuration
      status: completed
    - id: payroll-page
      content: Create payroll page with calculate/review/process workflow
      status: completed
    - id: sidebar-navigation
      content: Add payroll navigation items to app sidebar
      status: completed
---

# Payroll Feature Implementation

## Summary

This plan adds payroll functionality including:

- Job position hourly pay and payment frequency fields
- Employee last payroll date tracking
- Organization-level payroll settings (week start/end)
- Payroll runs with historical records
- Payroll page for calculating, reviewing, and marking payments

---

## 1. Database Schema Changes

### 1.1 New Enum: Payment Frequency

Add to [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts):

```typescript
export const paymentFrequency = pgEnum('payment_frequency', ['WEEKLY', 'BIWEEKLY', 'MONTHLY']);
```

### 1.2 Update Job Position Table

Add two columns to `jobPosition`:

- `hourlyPay`: decimal/numeric field for hourly rate
- `paymentFrequency`: enum field (WEEKLY, BIWEEKLY, MONTHLY)

### 1.3 Update Employee Table

Add audit column:

- `lastPayrollDate`: timestamp tracking when employee last received payroll

### 1.4 New Table: Employee Schedule

Store weekly work schedule per employee (one row per day):

- `id`: primary key
- `employeeId`: foreign key to employee
- `dayOfWeek`: integer 0-6 (0=Sunday, 1=Monday, etc.)
- `startTime`: time field (e.g., "09:00")
- `endTime`: time field (e.g., "17:00")
- `isWorkingDay`: boolean (false = day off)
- `createdAt`, `updatedAt`

Unique constraint on `(employeeId, dayOfWeek)` to prevent duplicate entries.

This enables:

- Full weekly schedule with different times per day
- Expected hours calculation for payroll
- Attendance validation (early/late check-ins)

### 1.5 New Table: Payroll Settings

Store per-organization payroll configuration:

- `id`, `organizationId` (unique)
- `weekStartDay`: integer 0-6 (0=Sunday, 1=Monday, etc.)
- `createdAt`, `updatedAt`

### 1.5 New Table: Payroll Run

Store payroll run history:

- `id`, `organizationId`
- `periodStart`, `periodEnd`: date range for the pay period
- `paymentFrequency`: which frequency this run covers
- `status`: enum (DRAFT, PROCESSED)
- `totalAmount`, `employeeCount`
- `processedAt`, `createdAt`, `updatedAt`

### 1.6 New Table: Payroll Run Employee

Store individual employee records per run:

- `id`, `payrollRunId`, `employeeId`
- `hoursWorked`, `hourlyPay`, `totalPay`
- `periodStart`, `periodEnd`

### 1.7 Drizzle Migration

Generate migration: `bun run db:gen` then `bun run db:mig`

---

## 2. API Changes

### 2.1 Update Job Position Schemas

File: [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts)

Update `createJobPositionSchema` and `updateJobPositionSchema`:

- Add `hourlyPay`: positive number
- Add `paymentFrequency`: enum validation

### 2.2 Update Job Position Routes

File: [`apps/api/src/routes/job-positions.ts`](apps/api/src/routes/job-positions.ts)

Handle new fields in create/update handlers.

### 2.3 Update Employee Schemas

File: [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts)

Add `lastPayrollDate` to response types (read-only, updated by payroll processing).

### 2.4 New Payroll Schemas

Create [`apps/api/src/schemas/payroll.ts`](apps/api/src/schemas/payroll.ts):

- Settings schemas (create, update, query)
- Payroll run schemas (calculate request, process request)
- Validation for date ranges

### 2.5 New Payroll Settings Routes

Create [`apps/api/src/routes/payroll-settings.ts`](apps/api/src/routes/payroll-settings.ts):

- `GET /payroll-settings` - Get org settings
- `PUT /payroll-settings` - Create/update org settings

### 2.6 New Payroll Routes

Create [`apps/api/src/routes/payroll.ts`](apps/api/src/routes/payroll.ts):

- `POST /payroll/calculate` - Calculate payroll for a period (returns preview)
- `POST /payroll/process` - Process payroll (creates run record, updates lastPayrollDate)
- `GET /payroll/runs` - List payroll run history
- `GET /payroll/runs/:id` - Get payroll run details with employee records

### 2.7 Payroll Calculation Logic

The calculation will:

1. Query employees by payment frequency (based on job position)
2. For each employee, query attendance records in the pay period
3. Calculate hours worked (pair CHECK_IN/CHECK_OUT, sum durations)
4. Multiply by hourly pay from job position
5. Filter employees whose `lastPayrollDate` is before the period start

---

## 3. Web App Changes

### 3.1 Update Query Keys

File: [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts)

Add keys for:

- `payrollSettings`
- `payroll.calculate`, `payroll.runs`, `payroll.runDetail`

### 3.2 Update Client Functions

File: [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts)

- Update `JobPosition` type with `hourlyPay`, `paymentFrequency`
- Add `PayrollSettings`, `PayrollRun`, `PayrollCalculation` types
- Add fetch functions for payroll endpoints

### 3.3 Update Server Client Functions

File: [`apps/web/lib/server-client-functions.ts`](apps/web/lib/server-client-functions.ts)

Add server-side fetchers for payroll settings and runs.

### 3.4 Update Server Functions (Prefetch)

File: [`apps/web/lib/server-functions.ts`](apps/web/lib/server-functions.ts)

Add `prefetchPayrollSettings`, `prefetchPayrollRuns`.

### 3.5 Update Job Positions Page

File: [`apps/web/app/(dashboard)/job-positions/job-positions-client.tsx`](apps/web/app/(dashboard)/job-positions/job-positions-client.tsx)

Add form fields for:

- Hourly Pay (number input)
- Payment Frequency (select: Weekly/Biweekly/Monthly)

Display new columns in table.

### 3.6 Create Job Positions Actions Update

File: [`apps/web/actions/job-positions.ts`](apps/web/actions/job-positions.ts)

Update create/update inputs to include new fields.

### 3.7 New Payroll Settings Page

Create [`apps/web/app/(dashboard)/payroll-settings/`](apps/web/app/(dashboard)/payroll-settings/):

- `page.tsx` - Server component with prefetch
- `payroll-settings-client.tsx` - Client component with form
- `loading.tsx` - Loading skeleton

Settings form includes:

- Week Start Day (select: Sunday through Saturday)

### 3.8 New Payroll Actions

Create [`apps/web/actions/payroll.ts`](apps/web/actions/payroll.ts):

- `updatePayrollSettings` - Save org settings
- `calculatePayroll` - Get payroll preview
- `processPayroll` - Process and record payroll run

### 3.9 New Payroll Page

Create [`apps/web/app/(dashboard)/payroll/`](apps/web/app/(dashboard)/payroll/):

- `page.tsx` - Server component with prefetch
- `payroll-client.tsx` - Client component with full workflow
- `loading.tsx` - Loading skeleton

Payroll page workflow:

1. **Select Period**: Auto-detect current pay period based on settings and frequency filter
2. **Calculate**: Show employees due for payment with hours worked and amounts
3. **Review**: Table showing employee name, hours, hourly rate, total pay
4. **Process**: Button to mark all as paid (creates payroll run, updates lastPayrollDate)
5. **History Tab**: View past payroll runs

### 3.10 Update Sidebar Navigation

File: [`apps/web/components/app-sidebar.tsx`](apps/web/components/app-sidebar.tsx)

Add navigation items for:

- Payroll (main payroll page)
- Payroll Settings (under settings or as separate item)

---

## 4. Key Files Reference

| Layer | Files |

|-------|-------|

| Schema | `apps/api/src/db/schema.ts` |

| Validation | `apps/api/src/schemas/crud.ts`, `apps/api/src/schemas/payroll.ts` (new) |

| API Routes | `apps/api/src/routes/job-positions.ts`, `apps/api/src/routes/payroll-settings.ts` (new), `apps/api/src/routes/payroll.ts` (new) |

| Query Keys | `apps/web/lib/query-keys.ts` |

| Client Fetchers | `apps/web/lib/client-functions.ts` |

| Server Fetchers | `apps/web/lib/server-client-functions.ts` |

| Prefetch | `apps/web/lib/server-functions.ts` |

| Actions | `apps/web/actions/job-positions.ts`, `apps/web/actions/payroll.ts` (new) |

| Pages | `apps/web/app/(dashboard)/job-positions/`, `apps/web/app/(dashboard)/payroll/` (new), `apps/web/app/(dashboard)/payroll-settings/` (new) |

---

## 5. Hours Calculation Logic

For each employee in a pay period:

1. Query `attendance_record` where `employeeId = X` and `timestamp` between period start/end
2. Sort by timestamp
3. Pair consecutive CHECK_IN/CHECK_OUT records
4. Sum duration of each pair using date-fns `differenceInHours` or `differenceInMinutes`
5. Handle edge cases: unpaired check-ins (employee forgot to check out)
