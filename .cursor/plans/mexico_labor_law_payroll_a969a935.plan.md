---
name: Mexico Labor Law Payroll
overview: Adapt the payroll system to comply with Mexican labor laws (LFT), including shift-based hour calculations, overtime at double/triple rates, Sunday premium, geographic zone minimum wages, and configurable enforcement with informational UI.
todos:
  - id: schema-enums
    content: "Add new enums: shiftType, geographicZone, overtimeEnforcement to schema.ts"
    status: completed
  - id: schema-tables
    content: "Update tables: jobPosition (dailyPay), employee (shiftType), location (geographicZone), payrollSetting (overtimeEnforcement)"
    status: completed
  - id: schema-payroll-employee
    content: Extend payrollRunEmployee with overtime breakdown fields
    status: completed
  - id: migration
    content: Generate and apply Drizzle migration for all schema changes
    status: pending
  - id: labor-constants
    content: Create mexico-labor-constants.ts with CONASAMI wages, shift limits, OT rules
    status: completed
  - id: api-schemas
    content: Update Zod schemas for job positions, employees, locations, payroll settings
    status: completed
  - id: api-routes-crud
    content: Update CRUD routes for job positions, employees, locations with new fields
    status: completed
  - id: api-payroll-calc
    content: Refactor payroll calculation with Mexican labor law logic (OT double/triple, Sunday premium)
    status: in_progress
  - id: api-payroll-validation
    content: Add minimum wage validation and overtime limit warnings/blocking
    status: in_progress
  - id: web-types
    content: Update client-functions.ts with new types (ShiftType, GeographicZone, PayrollBreakdown)
    status: completed
  - id: web-job-positions
    content: Update job positions page with dailyPay field and auto-calculation info
    status: pending
  - id: web-employees
    content: Update employees page with shiftType selector and info tooltips
    status: pending
  - id: web-locations
    content: Update locations page with geographicZone selector and minimum wage info
    status: pending
  - id: web-payroll-settings
    content: Update payroll settings with overtimeEnforcement toggle and rules info card
    status: pending
  - id: web-payroll-page
    content: Refactor payroll page with detailed breakdown, warnings section, and info panel
    status: pending
---

# Mexico Labor Law Payroll Adaptation

This plan adapts the existing payroll feature to comply with Mexican Federal Labor Law (Ley Federal del Trabajo), adding shift types, overtime calculations, Sunday premiums, geographic zones for minimum wage validation, and comprehensive UI warnings/information.

**Agent must follow [`AGENTS.md`](AGENTS.md) guidelines throughout implementation.**

---

## 1. Database Schema Changes

### 1.1 New Enums

Add to [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts):

```typescript
/** Shift type per Mexican labor law (LFT Art. 60-61) */
export const shiftType = pgEnum('shift_type', ['DIURNA', 'NOCTURNA', 'MIXTA']);

/** Geographic zone for minimum wage (CONASAMI) */
export const geographicZone = pgEnum('geographic_zone', ['GENERAL', 'ZLFN']);

/** Overtime enforcement mode */
export const overtimeEnforcement = pgEnum('overtime_enforcement', ['WARN', 'BLOCK']);
```

### 1.2 Update Existing Tables

| Table | New Field | Type | Description |

|-------|-----------|------|-------------|

| `jobPosition` | `dailyPay` | numeric(10,2) | Daily salary rate (salario diario) |

| `employee` | `shiftType` | shiftType enum | Employee's assigned shift (defaults DIURNA) |

| `location` | `geographicZone` | geographicZone enum | Zone for minimum wage validation (defaults GENERAL) |

| `payrollSetting` | `overtimeEnforcement` | overtimeEnforcement enum | WARN or BLOCK when limits exceeded |

### 1.3 Update Payroll Run Employee Table

Extend `payrollRunEmployee` with overtime breakdown fields:

```typescript
normalHours: numeric('normal_hours', { precision: 10, scale: 2 }),
normalPay: numeric('normal_pay', { precision: 12, scale: 2 }),
overtimeDoubleHours: numeric('overtime_double_hours', { precision: 10, scale: 2 }),
overtimeDoublePay: numeric('overtime_double_pay', { precision: 12, scale: 2 }),
overtimeTripleHours: numeric('overtime_triple_hours', { precision: 10, scale: 2 }),
overtimeTriplePay: numeric('overtime_triple_pay', { precision: 12, scale: 2 }),
sundayPremiumAmount: numeric('sunday_premium_amount', { precision: 12, scale: 2 }),
```

### 1.4 Migration

Generate and apply migration via `bun run db:gen` and `bun run db:mig`.

---

## 2. API Schema Updates

### 2.1 Job Position Schema

Update [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts):

- Add `dailyPay` (optional positive number) to create/update schemas
- Auto-derive `hourlyPay` from `dailyPay` if only daily provided: `hourlyPay = dailyPay / 8` (default diurna)

### 2.2 Employee Schema

Update [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts):

- Add `shiftType` field (enum: DIURNA, NOCTURNA, MIXTA) to create/update schemas

### 2.3 Location Schema

Update [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts):

- Add `geographicZone` field (enum: GENERAL, ZLFN) to create/update schemas

### 2.4 Payroll Settings Schema

Update [`apps/api/src/schemas/payroll.ts`](apps/api/src/schemas/payroll.ts):

- Add `overtimeEnforcement` field (enum: WARN, BLOCK)

### 2.5 New Payroll Calculation Response

Create detailed response types in [`apps/api/src/schemas/payroll.ts`](apps/api/src/schemas/payroll.ts):

```typescript
interface PayrollEmployeeBreakdown {
  employeeId: string;
  name: string;
  shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
  dailyPay: number;
  hourlyPay: number;
  // Hours breakdown
  normalHours: number;
  overtimeDoubleHours: number;
  overtimeTripleHours: number;
  sundayHoursWorked: number;
  // Pay breakdown
  normalPay: number;
  overtimeDoublePay: number;
  overtimeTriplePay: number;
  sundayPremiumAmount: number;
  totalPay: number;
  // Warnings
  warnings: PayrollWarning[];
}

interface PayrollWarning {
  type: 'OVERTIME_DAILY_EXCEEDED' | 'OVERTIME_WEEKLY_EXCEEDED' | 'BELOW_MINIMUM_WAGE';
  message: string;
  severity: 'warning' | 'error';
}
```

---

## 3. API Route Updates

### 3.1 Update Job Position Routes

File: [`apps/api/src/routes/job-positions.ts`](apps/api/src/routes/job-positions.ts)

- Handle `dailyPay` in create/update, auto-calculate `hourlyPay` if not provided

### 3.2 Update Employee Routes

File: [`apps/api/src/routes/employees.ts`](apps/api/src/routes/employees.ts)

- Handle `shiftType` in create/update, default to DIURNA

### 3.3 Update Location Routes

File: [`apps/api/src/routes/locations.ts`](apps/api/src/routes/locations.ts)

- Handle `geographicZone` in create/update, default to GENERAL

### 3.4 Update Payroll Settings Routes

File: [`apps/api/src/routes/payroll-settings.ts`](apps/api/src/routes/payroll-settings.ts)

- Handle `overtimeEnforcement` in create/update

### 3.5 Refactor Payroll Calculation Logic

File: [`apps/api/src/routes/payroll.ts`](apps/api/src/routes/payroll.ts)

Implement Mexican labor law calculation:

1. **Get shift-based normal hours limit:**

   - DIURNA: 8 hours/day, 48 hours/week
   - NOCTURNA: 7 hours/day, 42 hours/week
   - MIXTA: 7.5 hours/day, 45 hours/week

2. **Calculate overtime:**

   - First 9 hours/week overtime = double rate (hora normal × 2)
   - Beyond 9 hours/week = triple rate (hora normal × 3)
   - Max 3 hours/day OT, max 3 days/week

3. **Sunday premium:**

   - If employee works Sunday but has different rest day = 25% premium on daily salary

4. **Minimum wage validation:**

   - Query location's geographicZone
   - Compare `dailyPay` against CONASAMI 2025 rates
   - GENERAL: $278.80 MXN
   - ZLFN: $419.88 MXN

5. **Generate warnings:**

   - Daily OT > 3 hours
   - Weekly OT > 9 hours
   - Pay below minimum wage

6. **Block if configured:**

   - Return error if `overtimeEnforcement = BLOCK` and limits exceeded

---

## 4. Web Client Updates

### 4.1 Update Types

File: [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts)

Add/update types:

- `ShiftType = 'DIURNA' | 'NOCTURNA' | 'MIXTA'`
- `GeographicZone = 'GENERAL' | 'ZLFN'`
- Update `JobPosition` with `dailyPay`
- Update `Employee` with `shiftType`
- Update `Location` with `geographicZone`
- Update `PayrollSettings` with `overtimeEnforcement`
- Add `PayrollEmployeeBreakdown` and `PayrollWarning` types

### 4.2 Update Query Keys

File: [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts)

- Ensure payroll keys include new parameters

---

## 5. Web UI Updates

### 5.1 Update Job Positions Page

File: [`apps/web/app/(dashboard)/job-positions/job-positions-client.tsx`](apps/web/app/\\\\(dashboard)/job-positions/job-positions-client.tsx)

- Add `dailyPay` number input field with label "Salario Diario (MXN)"
- Add helper text explaining relationship: "El pago por hora se calcula automáticamente según el tipo de jornada"
- Show both daily and hourly rates in table

### 5.2 Update Employees Page

File: [`apps/web/app/(dashboard)/employees/employees-client.tsx`](apps/web/app/\\\\(dashboard)/employees/employees-client.tsx)

- Add shift type selector with options:
  - Diurna (06:00-20:00, 8h máx)
  - Nocturna (20:00-06:00, 7h máx)
  - Mixta (7.5h máx)
- Add info tooltip explaining shift hour limits per LFT

### 5.3 Update Locations Page

File: [`apps/web/app/(dashboard)/locations/locations-client.tsx`](apps/web/app/\\\\(dashboard)/locations/locations-client.tsx)

- Add geographic zone selector:
  - General (Salario mínimo: $278.80 MXN)
  - ZLFN - Zona Libre de la Frontera Norte (Salario mínimo: $419.88 MXN)
- Add info text explaining minimum wage implications

### 5.4 Update Payroll Settings Page

File: [`apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx`](apps/web/app/\\\\(dashboard)/payroll-settings/payroll-settings-client.tsx)

- Add overtime enforcement toggle:
  - Advertir (mostrar avisos pero permitir procesar)
  - Bloquear (impedir procesamiento si se exceden límites)
- Add information card explaining Mexican overtime rules:
  - Max 3 horas extra por día
  - Max 9 horas extra por semana
  - Primeras 9h extra: pago doble
  - Excedente: pago triple

### 5.5 Refactor Payroll Page

File: [`apps/web/app/(dashboard)/payroll/payroll-client.tsx`](apps/web/app/\\\\(dashboard)/payroll/payroll-client.tsx)

**Add Information Panel:**

- Collapsible card explaining Mexican payroll rules
- Link to official CONASAMI/STPS resources

**Update Preview Table:**

Add columns for breakdown:

- Horas normales
- Horas extra (doble)
- Horas extra (triple)
- Prima dominical
- Total

**Add Warnings Section:**

- Display warnings per employee (orange for warnings, red for blocking errors)
- Show aggregate warnings count
- Disable "Process Payroll" button if BLOCK mode and errors exist

**Update Summary:**

- Show totals for each pay component
- Display minimum wage compliance status

---

## 6. Server Actions Updates

### 6.1 Update Job Position Actions

File: [`apps/web/actions/job-positions.ts`](apps/web/actions/job-positions.ts)

- Add `dailyPay` to create/update inputs

### 6.2 Update Employee Actions

File: [`apps/web/actions/employees.ts`](apps/web/actions/employees.ts)

- Add `shiftType` to create/update inputs

### 6.3 Update Location Actions

File: [`apps/web/actions/locations.ts`](apps/web/actions/locations.ts)

- Add `geographicZone` to create/update inputs

### 6.4 Update Payroll Actions

File: [`apps/web/actions/payroll.ts`](apps/web/actions/payroll.ts)

- Update to handle new response structure with warnings

---

## 7. Constants/Configuration

Create new file: [`apps/api/src/utils/mexico-labor-constants.ts`](apps/api/src/utils/mexico-labor-constants.ts)

```typescript
/** CONASAMI 2025 minimum wages */
export const MINIMUM_WAGES = {
  GENERAL: 278.80,
  ZLFN: 419.88,
} as const;

/** Shift hour limits per LFT */
export const SHIFT_LIMITS = {
  DIURNA: { dailyHours: 8, weeklyHours: 48, divisor: 8 },
  NOCTURNA: { dailyHours: 7, weeklyHours: 42, divisor: 7 },
  MIXTA: { dailyHours: 7.5, weeklyHours: 45, divisor: 7.5 },
} as const;

/** Overtime limits */
export const OVERTIME_LIMITS = {
  MAX_DAILY_HOURS: 3,
  MAX_WEEKLY_HOURS: 9,
  DOUBLE_RATE_MULTIPLIER: 2,
  TRIPLE_RATE_MULTIPLIER: 3,
} as const;

/** Sunday premium rate */
export const SUNDAY_PREMIUM_RATE = 0.25;
```

---

---

## 9. Testing Checklist

After implementation:

- [ ] Verify migration applies cleanly
- [ ] Test DIURNA/NOCTURNA/MIXTA hour calculations
- [ ] Verify overtime double rate (first 9h) calculation
- [ ] Verify overtime triple rate (beyond 9h) calculation
- [ ] Test Sunday premium calculation (25%)
- [ ] Validate minimum wage warnings per zone
- [ ] Test WARN mode allows processing with warnings
- [ ] Test BLOCK mode prevents processing with errors
- [ ] Run `bun run lint` and `bun run check-types`