# Mobile Responsiveness Audit & Fix — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Scope:** Full app (public pages + dashboard + modals/forms)

## 1. Problem Statement

The web app (apps/web) has significant responsiveness issues on mobile viewports (375px–1024px). The Playwright audit at 375×812 revealed:

### Critical
- **Schedule Calendar**: Weekly view is completely illegible — 7 days compressed into 375px with truncated "PLANT PLANT PLANT..." text
- **Data Tables**: Employees (12 cols → 2 visible), Attendance (9 → 2), Locations (7 → 2). Most data is inaccessible
- **Page Headers**: Title overlaps action buttons on Employees, Attendance, Locations pages

### Moderate
- **Landing Bento Grid**: Cards overflow by 40px each
- **Landing Trust Section**: 80px horizontal overflow
- **Attendance Action Buttons**: 3 buttons overflow horizontally
- **Dashboard Stats Cards**: 5 cards compressed in a horizontal row without good legibility

### Working Well
- Sign-in / Sign-up, Sidebar (overlay), Hero Section, Nómina (card-based), Registrate, Privacidad, Footer

## 2. Requirements

| Aspect | Decision |
|--------|----------|
| Scope | All public pages + all dashboard pages + modals/forms |
| Mobile Functionality | Fully functional (CRUD, payroll processing, schedule management) |
| Breakpoint | 1024px (includes tablets) — update `useIsMobile` hook |
| Table Pattern | Card layout on mobile (≤1024px) |
| Calendar Pattern | Single-day view with ◀ ▶ navigation on mobile |
| Dashboard Pattern | Map Hero (60% viewport) + horizontal stats strip + vertical scroll for data |
| Architecture | Shared reusable components |
| Touch Optimization | Min 44px touch targets, generous spacing between interactive elements |
| Testing | E2E Playwright tests at 375px and 1024px viewports |
| Git Workflow | Dedicated branch, atomic commits, PR when done |

## 3. Architecture

### 3.1 Shared Components (New)

#### `<ResponsiveDataView>`
- **Location**: `components/ui/responsive-data-view.tsx`
- **Purpose**: Automatically renders TanStack Table on desktop (>1024px) or stacked cards on mobile (≤1024px)
- **Props**:
  - `columns`: TanStack Table column definitions
  - `data`: Data array
  - `cardRenderer`: `(row) => ReactNode` — how to render each row as a card on mobile
  - `pagination`, `sorting`, `filtering` — forwarded to TanStack Table
- **Behavior**: Uses `useIsMobile()` hook to determine render mode

#### `<MobileDayCalendar>`
- **Location**: `components/ui/mobile-day-calendar.tsx`
- **Purpose**: Single-day calendar view for schedules on mobile
- **Props**:
  - `date`: Current date
  - `employees`: Employee schedule data for the week
  - `onDateChange`: `(date) => void`
- **UI**: Header with ◀ date ▶ navigation, employee cards showing template name + time range + shift type

#### `<ResponsivePageHeader>`
- **Location**: `components/ui/responsive-page-header.tsx`
- **Purpose**: Page header that stacks title and action buttons vertically on mobile
- **Props**:
  - `title`, `description`
  - `actions`: `ReactNode` — action buttons
- **Behavior**: Side-by-side on desktop, stacked on mobile with full-width buttons

### 3.2 Updated Components

#### `useIsMobile` Hook
- **Change**: Update breakpoint from 768px to 1024px
- **Location**: `hooks/use-mobile.ts`
- **Impact**: All existing usages (sidebar, etc.) will respect new breakpoint

### 3.3 Dashboard Mobile Layout (Map Hero)

Desktop (>1024px): Keep current layout unchanged.

Mobile (≤1024px):
1. **Map**: 60vh height, fully interactive (zoom, pan, tap markers)
2. **Stats Strip**: Horizontal scrollable row with colored stat cards (Presentes, Ubicaciones, Empleados, Dispositivos, Organizaciones)
3. **Content**: Vertical scroll below map — "Mapa operativo" card, locations accordion, "Fuera de oficina" section
4. **Action Buttons**: "Actualizar presencia" and "Administrar ubicaciones" as full-width stacked buttons

## 4. Page-by-Page Adaptations

### 4.1 Public Pages

**Landing Page (`/`)**:
- Fix bento grid: `grid-cols-1` on mobile, proper card sizing
- Fix trust section overflow: Stack testimonials vertically
- Ensure CTA buttons are full-width on mobile

**Registrate (`/registrate`)**: Already works well. Minor touch target adjustments.

**Privacidad (`/privacidad`)**: Already works well. No changes needed.

### 4.2 Auth Pages

**Sign-in / Sign-up**: Already works well. Verify touch targets ≥44px.

### 4.3 Dashboard Pages

**Dashboard (`/dashboard`)**: Map Hero layout as described in §3.3.

**Employees (`/employees`)**: Use `<ResponsiveDataView>` with card renderer showing: Code, Name, Position, Location, Status, Face enrollment indicator, Actions menu.

**Attendance (`/attendance`)**: Use `<ResponsiveDataView>` with card renderer showing: Employee name, Type (entry/exit), Classification, Time, Date. Stack filter dropdowns.

**Schedules (`/schedules`)**: Use `<MobileDayCalendar>` for calendar tab. Template and exception tabs use `<ResponsiveDataView>`.

**Payroll (`/payroll`)**: Already mostly card-based. Fix history table with `<ResponsiveDataView>`. Ensure form inputs are full-width.

**Locations (`/locations`)**: Use `<ResponsiveDataView>` with cards showing: Code, Name, Address, Zone, Timezone.

**Devices (`/devices`)**: Use `<ResponsiveDataView>` with cards.

**Vacations (`/vacations`)**: Use `<ResponsiveDataView>` with cards.

**Incapacities (`/incapacities`)**: Use `<ResponsiveDataView>` with cards.

**Job Positions (`/job-positions`)**: Use `<ResponsiveDataView>` with cards.

**Users (`/users`)**: Use `<ResponsiveDataView>` with cards.

**Organizations (`/organizations`)**: Use `<ResponsiveDataView>` with cards.

**API Keys (`/api-keys`)**: Use `<ResponsiveDataView>` with cards.

**Payroll Settings (`/payroll-settings`)**: Ensure form-based layout adapts — full-width inputs, stacked fields.

**Overtime Authorizations (`/overtime-authorizations`)**: Use `<ResponsiveDataView>` with cards.

**App Móvil (`/app-movil`)**: Review and adapt any layout issues.

**Disciplinary Measures (`/disciplinary-measures`)**: Use `<ResponsiveDataView>` with cards.

### 4.4 Modals & Forms

- All dialogs/sheets: Ensure `max-w` doesn't clip on mobile, use `w-full` or `max-w-[calc(100vw-2rem)]`
- Form fields: Full-width inputs on mobile, stacked labels
- Action buttons in modals: Full-width, stacked vertically
- Touch targets: All buttons and interactive elements ≥44px height

## 5. Testing Strategy

### E2E Tests (Playwright)
- **Location**: `apps/web/e2e/responsiveness/`
- **Viewports**: 375×812 (iPhone), 1024×768 (iPad landscape)
- **Per page**:
  1. No horizontal body overflow (`document.body.scrollWidth <= window.innerWidth`)
  2. Correct component rendered (cards on mobile, table on desktop)
  3. Interactive elements functional (navigation, filters, actions)
  4. Touch targets ≥44px for primary actions

### Test Coverage
- All public pages (landing, auth, privacy)
- All dashboard pages
- Modal/dialog opening and basic interaction
- Calendar day navigation on mobile

## 6. Non-Goals

- PWA or offline support
- Native-like gestures beyond basic touch
- Dark mode responsive-specific adjustments (already handled by theme system)
- Performance optimization of map rendering on low-end devices
