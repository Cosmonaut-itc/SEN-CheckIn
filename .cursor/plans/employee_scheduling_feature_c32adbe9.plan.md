# Employee Scheduling Feature Implementation

This plan implements a full employee scheduling system compliant with Mexican labor law (LFT), following the established architecture patterns from [release-04](documentacion/release-04-query-fetch-architecture.md) and [release-06](documentacion/release-06-form-architecture.md).

**Agent must follow [`AGENTS.md`](AGENTS.md) guidelines throughout implementation.**

---

## 1. Database Schema Changes

### 1.1 New Tables

Add to [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts):

**Schedule Template Table** - Reusable schedule templates (e.g., "Turno Matutino", "Turno Nocturno"):

```typescript
export const scheduleTemplate = pgTable('schedule_template', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  shiftType: shiftType('shift_type').default('DIURNA').notNull(),
  organizationId: text('organization_id').notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow()
    .$onUpdate(() => new Date()).notNull(),
});
```

**Schedule Template Day Table** - Daily configuration for each template:

```typescript
export const scheduleTemplateDay = pgTable('schedule_template_day', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  templateId: text('template_id').notNull()
    .references(() => scheduleTemplate.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday, 6=Saturday
  startTime: time('start_time', { withTimezone: false }).notNull(),
  endTime: time('end_time', { withTimezone: false }).notNull(),
  isWorkingDay: boolean('is_working_day').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow()
    .$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index('schedule_template_day_template_idx').on(table.templateId),
  uniqueIndex('schedule_template_day_uniq').on(table.templateId, table.dayOfWeek),
]);
```

**Schedule Exception Table** - Date-specific overrides for day-offs or schedule changes:

```typescript
export const scheduleExceptionType = pgEnum('schedule_exception_type', [
  'DAY_OFF',      // Employee not working this day
  'MODIFIED',     // Different hours than base schedule
  'EXTRA_DAY',    // Working on normally off day
]);

export const scheduleException = pgTable('schedule_exception', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  employeeId: text('employee_id').notNull()
    .references(() => employee.id, { onDelete: 'cascade' }),
  exceptionDate: timestamp('exception_date').notNull(),
  exceptionType: scheduleExceptionType('exception_type').notNull(),
  startTime: time('start_time', { withTimezone: false }), // null for DAY_OFF
  endTime: time('end_time', { withTimezone: false }),     // null for DAY_OFF
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow()
    .$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index('schedule_exception_employee_idx').on(table.employeeId),
  index('schedule_exception_date_idx').on(table.exceptionDate),
  uniqueIndex('schedule_exception_employee_date_uniq').on(table.employeeId, table.exceptionDate),
]);
```

### 1.2 Update Employee Table

Add optional reference to schedule template:

```typescript
// In employee table, add:
scheduleTemplateId: text('schedule_template_id')
  .references(() => scheduleTemplate.id, { onDelete: 'set null' }),
```

### 1.3 Add Relations

Add Drizzle relations for new tables.

### 1.4 Migration

Generate and apply migration: `bun run db:gen` then `bun run db:mig`.

---

## 2. API Schema Updates

### 2.1 Schedule Template Schemas

Create [`apps/api/src/schemas/schedules.ts`](apps/api/src/schemas/schedules.ts):

- `createScheduleTemplateSchema` - name, description, shiftType, days array
- `updateScheduleTemplateSchema` - partial update
- `scheduleTemplateDaySchema` - dayOfWeek, startTime, endTime, isWorkingDay
- `scheduleTemplateQuerySchema` - pagination with organizationId filter

### 2.2 Schedule Exception Schemas

Add to same file:

- `createScheduleExceptionSchema` - employeeId, exceptionDate, exceptionType, times, reason
- `updateScheduleExceptionSchema` - partial update
- `scheduleExceptionQuerySchema` - filter by employee, date range

### 2.3 Calendar Query Schema

- `calendarQuerySchema` - startDate, endDate, organizationId for fetching scheduled employees

---

## 3. API Route Implementation

### 3.1 Schedule Templates Routes

Create [`apps/api/src/routes/schedule-templates.ts`](apps/api/src/routes/schedule-templates.ts):

| Method | Endpoint | Description |

|--------|----------|-------------|

| GET | `/schedule-templates` | List templates with pagination |

| GET | `/schedule-templates/:id` | Get template with days |

| POST | `/schedule-templates` | Create template with days |

| PUT | `/schedule-templates/:id` | Update template and days |

| DELETE | `/schedule-templates/:id` | Delete template |

**Validation Logic:**

- Validate shift type limits (DIURNA: max 8h/day, NOCTURNA: max 7h/day, MIXTA: max 7.5h/day)
- Check weekly hour limits (48h DIURNA, 42h NOCTURNA, 45h MIXTA)
- Use `overtimeEnforcement` from payroll settings: WARN allows saving with warnings, BLOCK prevents saving

### 3.2 Schedule Exceptions Routes

Create [`apps/api/src/routes/schedule-exceptions.ts`](apps/api/src/routes/schedule-exceptions.ts):

| Method | Endpoint | Description |

|--------|----------|-------------|

| GET | `/schedule-exceptions` | List exceptions by employee/date range |

| POST | `/schedule-exceptions` | Create exception (day-off, modified hours) |

| PUT | `/schedule-exceptions/:id` | Update exception |

| DELETE | `/schedule-exceptions/:id` | Remove exception |

### 3.3 Calendar/Scheduling Routes

Create [`apps/api/src/routes/scheduling.ts`](apps/api/src/routes/scheduling.ts):

| Method | Endpoint | Description |

|--------|----------|-------------|

| GET | `/scheduling/calendar` | Get employees with effective schedules for date range |

| POST | `/scheduling/assign-template` | Assign template to employee(s) |

| POST | `/scheduling/validate` | Validate schedule against labor law without saving |

**Calendar Response:** Returns employees with their effective schedule for each day, merging base schedule with exceptions.

### 3.4 Update Employee Routes

Modify [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts):

- Add `scheduleTemplateId` to create/update schemas
- Return schedule template info in employee responses

### 3.5 Register Routes

Add new routes to [`apps/api/src/index.ts`](apps/api/src/index.ts).

---

## 4. Labor Law Validation Utility

Create [`apps/api/src/utils/schedule-validator.ts`](apps/api/src/utils/schedule-validator.ts):

```typescript
interface ScheduleValidationResult {
  valid: boolean;
  warnings: ScheduleWarning[];
  errors: ScheduleWarning[];
}

interface ScheduleWarning {
  type: 'DAILY_HOURS_EXCEEDED' | 'WEEKLY_HOURS_EXCEEDED' | 'NO_REST_DAY' | 'INVALID_SHIFT_HOURS';
  dayOfWeek?: number;
  message: string;
  severity: 'warning' | 'error';
}
```

**Validation Rules (per LFT):**

- Daily hour limits by shift type (8h DIURNA, 7h NOCTURNA, 7.5h MIXTA)
- Weekly hour limits (48h, 42h, 45h respectively)
- At least one rest day per week (preferably Sunday)
- Max 3 hours overtime per day
- Max 9 hours overtime per week

---

## 5. Web Client Updates

### 5.1 Query Keys

Update [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts):

```typescript
scheduleTemplates: {
  all: ['scheduleTemplates'] as const,
  list: (params?: ListQueryParams) => 
    queryKeyConstructor(['scheduleTemplates', 'list'], params),
  detail: (id: string) => ['scheduleTemplates', 'detail', id] as const,
},
scheduleExceptions: {
  all: ['scheduleExceptions'] as const,
  list: (params?: ScheduleExceptionQueryParams) =>
    queryKeyConstructor(['scheduleExceptions', 'list'], params),
},
scheduling: {
  all: ['scheduling'] as const,
  calendar: (params: CalendarQueryParams) =>
    queryKeyConstructor(['scheduling', 'calendar'], params),
},
```

### 5.2 Client Functions

Update [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts):

Add types and fetchers:

- `ScheduleTemplate`, `ScheduleTemplateDay`, `ScheduleException` types
- `ShiftType = 'DIURNA' | 'NOCTURNA' | 'MIXTA'`
- `ScheduleExceptionType = 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY'`
- `CalendarEntry` type for calendar data
- `fetchScheduleTemplatesList`, `fetchScheduleExceptionsList`, `fetchCalendar` fetchers

### 5.3 Server Functions

Update [`apps/web/lib/server-client-functions.ts`](apps/web/lib/server-client-functions.ts) and [`apps/web/lib/server-functions.ts`](apps/web/lib/server-functions.ts):

Add server fetchers and prefetch helpers following established patterns.

### 5.4 Server Actions

Create [`apps/web/actions/schedules.ts`](apps/web/actions/schedules.ts):

```typescript
// Schedule Template actions
createScheduleTemplate(input): Promise<MutationResult>
updateScheduleTemplate(input): Promise<MutationResult>
deleteScheduleTemplate(id): Promise<MutationResult>

// Schedule Exception actions
createScheduleException(input): Promise<MutationResult>
updateScheduleException(input): Promise<MutationResult>
deleteScheduleException(id): Promise<MutationResult>

// Assignment action
assignTemplateToEmployees(templateId, employeeIds): Promise<MutationResult>
```

---

## 6. Web UI Implementation

### 6.1 Add Navigation

Update [`apps/web/components/app-sidebar.tsx`](apps/web/components/app-sidebar.tsx):

Add "Schedules" item to mainNavItems with Calendar icon, href `/schedules`.

### 6.2 Schedules Page Structure

Create `/schedules` folder with:

```
apps/web/app/(dashboard)/schedules/
├── page.tsx                    # Server component with prefetch
├── schedules-client.tsx        # Main client component with tabs
├── loading.tsx                 # Loading skeleton
├── components/
│   ├── schedule-templates-tab.tsx    # Template CRUD
│   ├── calendar-view.tsx             # Weekly/Monthly calendar
│   ├── template-form-dialog.tsx      # Create/edit template
│   ├── exception-form-dialog.tsx     # Create/edit exception
│   ├── employee-schedule-card.tsx    # Employee schedule display
│   ├── day-schedule-editor.tsx       # Edit individual day
│   └── labor-law-warnings.tsx        # Display validation warnings
```

### 6.3 Main Schedules Page

[`apps/web/app/(dashboard)/schedules/page.tsx`](apps/web/app/\\\\\\(dashboard)/schedules/page.tsx):

- Force dynamic rendering
- Prefetch schedule templates, calendar data for current week
- Wrap with HydrationBoundary and OrgProvider

### 6.4 Schedules Client Component

[`apps/web/app/(dashboard)/schedules/schedules-client.tsx`](apps/web/app/\\\\\\(dashboard)/schedules/schedules-client.tsx):

**Layout with Tabs:**

1. **Calendar Tab** - Weekly/Monthly view of scheduled employees
2. **Templates Tab** - CRUD for schedule templates
3. **Exceptions Tab** - View/manage schedule exceptions

### 6.5 Calendar View Component

**Two Main Views:**

1. **Location-Based View** (default) - See who's scheduled at a specific location

   - Location selector dropdown at top
   - Shows all employees scheduled at that location for the date range
   - Useful for managers to see daily staffing levels

2. **Employee-Focused View** - See a single employee's full schedule

   - Employee selector to pick individual
   - Shows their complete schedule across weeks/months
   - Includes base schedule + all exceptions
   - Useful for reviewing/modifying individual schedules

**Common Features:**

- Toggle between Weekly and Monthly view
- Color-coded by shift type (DIURNA, NOCTURNA, MIXTA)
- Click on day to see details/add exceptions
- Click on employee to edit their schedule
- Visual indicators for exceptions (day-off, modified, extra day)
- Navigation (prev/next week/month)

**Weekly View:**

- 7-column grid (Sun-Sat or Mon-Sun based on weekStartDay)
- Each cell shows employees working that day with times
- Highlight current day
- Location view: grouped by employee
- Employee view: shows daily schedule details

**Monthly View:**

- Standard calendar grid
- Location view: each day cell shows employee count + names on hover
- Employee view: shows working/off status per day
- Click to expand day details

### 6.6 Template Form Dialog

Using TanStack Form (`useAppForm`):

- Template name, description
- Shift type selector (DIURNA, NOCTURNA, MIXTA) with info tooltip about hour limits
- 7-day schedule editor (each day: working/not working, start time, end time)
- Real-time validation warnings
- Save disabled if BLOCK mode and errors exist

**Day Schedule Editor:**

- Toggle for working day
- Time pickers for start/end (when working)
- Calculate and display daily hours
- Warning badges if exceeds shift limit

### 6.7 Exception Form Dialog

- Employee selector (if not in context)
- Date picker
- Exception type: Day Off, Modified Hours, Extra Day
- Time inputs (for MODIFIED/EXTRA_DAY)
- Reason text field

### 6.8 Labor Law Info Panel

Collapsible card explaining:

- Shift types and their limits
- Overtime rules
- Sunday premium info
- Link to official STPS resources

---

## 7. Form Components Extension

Add to [`apps/web/lib/forms.tsx`](apps/web/lib/forms.tsx):

**TimeField** - Time input with label:

```typescript
export function TimeField({ label, ... }): React.ReactElement
```

**DateField** - Date picker with label (using shadcn Calendar):

```typescript
export function DateField({ label, ... }): React.ReactElement
```

**ToggleField** - Boolean toggle/switch:

```typescript
export function ToggleField({ label, ... }): React.ReactElement
```

Register in `fieldComponents`.

---

## 8. UI Components

### 8.1 Calendar Component

Either use existing shadcn calendar or implement custom weekly/monthly grid.

### 8.2 Time Picker

Simple time input or use a time picker component.

---

## 9. Integration with Existing Features

### 9.1 Employee Page Updates

- Show assigned schedule template in employee list/detail
- Add "Schedule" column or badge
- Link to modify individual employee schedule

### 9.2 Payroll Integration

The payroll calculation already uses `employeeSchedule` table. Ensure:

- Schedule templates populate `employeeSchedule` when assigned
- Schedule exceptions are considered in payroll hour calculations

---

## 10. Testing Checklist

After implementation:

- [ ] Create schedule template with DIURNA shift, verify 8h/day validation
- [ ] Create NOCTURNA template, verify 7h/day limit
- [ ] Create MIXTA template, verify 7.5h/day limit
- [ ] Test weekly hour totals validation
- [ ] Test WARN mode allows saving with warnings
- [ ] Test BLOCK mode prevents saving with errors
- [ ] Assign template to employee, verify calendar shows correctly
- [ ] Create day-off exception, verify calendar updates
- [ ] Create modified hours exception, verify display
- [ ] Test weekly calendar navigation
- [ ] Test monthly calendar view
- [ ] Run `bun run lint` and `bun run check-types`