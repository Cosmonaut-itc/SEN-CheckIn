---
name: UI Spanish Translation i18n
overview: Set up internationalization infrastructure for both web (next-intl) and mobile (expo-localization + i18n-js) apps, translate all UI strings to Spanish (Latin American/MX), and update AGENTS.md with language requirements.
todos:
  - id: web-deps
    content: Install next-intl in web app and configure next.config.ts
    status: pending
  - id: web-i18n-setup
    content: Create i18n/request.ts and wrap layout with NextIntlClientProvider
    status: pending
  - id: web-messages
    content: Create apps/web/messages/es.json with all Spanish translations
    status: pending
  - id: web-sidebar
    content: Update app-sidebar.tsx to use useTranslations hook
    status: pending
  - id: web-dashboard
    content: Update all dashboard client components (13 files) with translations
    status: pending
  - id: web-schedules
    content: Update schedules page and 8 sub-components with translations (NEW)
    status: pending
  - id: web-auth
    content: Update auth pages (sign-in, sign-up, device verification) with translations
    status: pending
  - id: web-components
    content: Update shared components (dialogs, forms, skeletons) with translations
    status: pending
  - id: mobile-deps
    content: Install expo-localization and i18n-js in mobile app
    status: pending
  - id: mobile-i18n-setup
    content: Create lib/i18n.ts configuration and translations/es.json
    status: pending
  - id: mobile-screens
    content: Update all mobile screens (scanner, login, settings, device-setup) with i18n.t()
    status: pending
  - id: agents-md
    content: Update AGENTS.md with Spanish UI language requirement
    status: pending
  - id: quality-checks
    content: Run bun run format, bun run lint, and bun run check-types - fix any errors
    status: pending
---

# UI Spanish Translation with i18n Infrastructure

## Architecture Overview

```mermaid
flowchart TB
    subgraph Web["Web App (Next.js)"]
        NextIntl[next-intl plugin]
        WebMessages["messages/es.json"]
        WebProvider[NextIntlClientProvider]
        WebComponents[Components use useTranslations]
    end
    
    subgraph Mobile["Mobile App (Expo)"]
        ExpoLoc[expo-localization]
        I18nJS[i18n-js]
        MobileMessages["lib/translations/es.json"]
        MobileComponents[Components use i18n.t]
    end
    
    NextIntl --> WebProvider
    WebMessages --> WebProvider
    WebProvider --> WebComponents
    
    ExpoLoc --> I18nJS
    MobileMessages --> I18nJS
    I18nJS --> MobileComponents
```

## Phase 1: Web App i18n Setup (next-intl)

### 1.1 Install Dependencies

```bash
bun run add:web -- next-intl
```

### 1.2 Create Configuration Files

- [`apps/web/i18n/request.ts`](apps/web/i18n/request.ts) - Request config for server components
- [`apps/web/next.config.ts`](apps/web/next.config.ts) - Add next-intl plugin wrapper
- [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx) - Wrap with NextIntlClientProvider

### 1.3 Create Spanish Translation Files

- [`apps/web/messages/es.json`](apps/web/messages/es.json) - All Spanish translations organized by namespace:
  - `Common` - Shared labels (Save, Cancel, Delete, Loading, etc.)
  - `Navigation` - Sidebar items (Dashboard, Employees, Locations, Schedules, etc.)
  - `Employees` - Employee management page strings
  - `Devices` - Device management strings
  - `Locations` - Location management strings
  - `Attendance` - Attendance page strings
  - `Payroll` - Payroll page strings
  - `PayrollSettings` - Payroll settings page strings
  - `Schedules` - Schedule management strings (calendar, templates, exceptions)
  - `Auth` - Login/signup forms
  - `DeviceAuth` - Device authorization verification page
  - `Errors` - Error messages
  - `Dialogs` - Confirmation dialogs

### 1.4 Update Web Components

Key files to update (using `useTranslations` hook):

**Dashboard Pages (13 client components):**

- [`apps/web/app/(dashboard)/dashboard/dashboard-client.tsx`](apps/web/app/\\\\\\\(dashboard)/dashboard/dashboard-client.tsx)
- [`apps/web/app/(dashboard)/employees/employees-client.tsx`](apps/web/app/\\\\\\\(dashboard)/employees/employees-client.tsx)
- [`apps/web/app/(dashboard)/job-positions/job-positions-client.tsx`](apps/web/app/\\\\\\\(dashboard)/job-positions/job-positions-client.tsx)
- [`apps/web/app/(dashboard)/devices/devices-client.tsx`](apps/web/app/\\\\\\\(dashboard)/devices/devices-client.tsx)
- [`apps/web/app/(dashboard)/locations/locations-client.tsx`](apps/web/app/\\\\\\\(dashboard)/locations/locations-client.tsx)
- [`apps/web/app/(dashboard)/attendance/attendance-client.tsx`](apps/web/app/\\\\\\\(dashboard)/attendance/attendance-client.tsx)
- [`apps/web/app/(dashboard)/payroll/payroll-client.tsx`](apps/web/app/\\\\\\\(dashboard)/payroll/payroll-client.tsx)
- [`apps/web/app/(dashboard)/payroll-settings/payroll-settings-client.tsx`](apps/web/app/\\\\\\\(dashboard)/payroll-settings/payroll-settings-client.tsx)
- [`apps/web/app/(dashboard)/api-keys/api-keys-client.tsx`](apps/web/app/\\\\\\\(dashboard)/api-keys/api-keys-client.tsx)
- [`apps/web/app/(dashboard)/users/users-client.tsx`](apps/web/app/\\\\\\\(dashboard)/users/users-client.tsx)
- [`apps/web/app/(dashboard)/organizations/organizations-client.tsx`](apps/web/app/\\\\\\\(dashboard)/organizations/organizations-client.tsx)
- [`apps/web/app/(dashboard)/schedules/schedules-client.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/schedules-client.tsx) **(NEW)**
- [`apps/web/app/(dashboard)/error.tsx`](apps/web/app/\\\\\\\(dashboard)/error.tsx)

**Schedules Sub-components (8 files - NEW):**

- [`apps/web/app/(dashboard)/schedules/components/calendar-view.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/calendar-view.tsx)
- [`apps/web/app/(dashboard)/schedules/components/day-schedule-editor.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/day-schedule-editor.tsx)
- [`apps/web/app/(dashboard)/schedules/components/exception-form-dialog.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/exception-form-dialog.tsx)
- [`apps/web/app/(dashboard)/schedules/components/labor-law-warnings.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/labor-law-warnings.tsx)
- [`apps/web/app/(dashboard)/schedules/components/location-schedule-card.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/location-schedule-card.tsx)
- [`apps/web/app/(dashboard)/schedules/components/schedule-exceptions-tab.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/schedule-exceptions-tab.tsx)
- [`apps/web/app/(dashboard)/schedules/components/schedule-templates-tab.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/schedule-templates-tab.tsx)
- [`apps/web/app/(dashboard)/schedules/components/template-form-dialog.tsx`](apps/web/app/\\\\\\\(dashboard)/schedules/components/template-form-dialog.tsx)

**Auth Pages (4 files):**

- [`apps/web/app/(auth)/sign-in/page.tsx`](apps/web/app/\\\\\\\(auth)/sign-in/page.tsx)
- [`apps/web/app/(auth)/sign-up/page.tsx`](apps/web/app/\\\\\\\(auth)/sign-up/page.tsx)
- [`apps/web/app/(auth)/device/device-client.tsx`](apps/web/app/\\\\\\\(auth)/device/device-client.tsx) **(NEW)**
- [`apps/web/app/(auth)/layout.tsx`](apps/web/app/\\\\\\\(auth)/layout.tsx)

**Shared Components:**

- [`apps/web/components/app-sidebar.tsx`](apps/web/components/app-sidebar.tsx) - Navigation labels
- [`apps/web/components/face-enrollment-dialog.tsx`](apps/web/components/face-enrollment-dialog.tsx)
- [`apps/web/components/no-organization-state.tsx`](apps/web/components/no-organization-state.tsx)
- [`apps/web/components/organization-gate.tsx`](apps/web/components/organization-gate.tsx)
- Skeleton components (10 files in `components/skeletons/`)

---

## Phase 2: Mobile App i18n Setup (expo-localization + i18n-js)

### 2.1 Install Dependencies

```bash
bun run add:mobile -- expo-localization i18n-js
```

### 2.2 Create i18n Configuration

- [`apps/mobile/lib/i18n.ts`](apps/mobile/lib/i18n.ts) - i18n instance setup with Spanish as default

### 2.3 Create Spanish Translation Files

- [`apps/mobile/lib/translations/es.json`](apps/mobile/lib/translations/es.json) - Mobile-specific Spanish translations:
  - `Scanner` - Face scanning UI strings
  - `Settings` - Device settings strings
  - `Login` - Device login flow strings
  - `DeviceSetup` - Setup wizard strings
  - `Common` - Shared mobile labels
  - `Errors` - Error messages

### 2.4 Update Mobile Components

Key files to update (using `i18n.t()` function):

- [`apps/mobile/app/(main)/scanner.tsx`](apps/mobile/app/\\\\\\\\\\\\\(main)/scanner.tsx) - Scanner UI strings
- [`apps/mobile/app/(auth)/login.tsx`](apps/mobile/app/\\\\\\\\\\\\\(auth)/login.tsx) - Login flow strings
- [`apps/mobile/app/(auth)/device-setup.tsx`](apps/mobile/app/\\\\\\\\\\\\\(auth)/device-setup.tsx) - Setup strings
- [`apps/mobile/app/(main)/settings.tsx`](apps/mobile/app/\\\\\\\\\\\\\(main)/settings.tsx) - Settings strings

---

## Phase 3: Update AGENTS.md

Add new section under "Coding Style and Naming Conventions":

```markdown
## Language & Localization

- **All UI strings must be in Spanish** (Latin American, Mexican Spanish preferred).
- Use i18n infrastructure: `next-intl` for web, `expo-localization` + `i18n-js` for mobile.
- Never hardcode user-facing strings; always use translation keys.
- Translation files: `apps/web/messages/es.json` and `apps/mobile/lib/translations/es.json`.
```

---

## Translation Samples

### Spanish Navigation Labels

| English | Spanish (es-MX) |

|---------|-----------------|

| Dashboard | Panel de Control |

| Employees | Empleados |

| Job Positions | Puestos de Trabajo |

| Devices | Dispositivos |

| Locations | Ubicaciones |

| Attendance | Asistencia |

| Payroll | Nómina |

| Payroll Settings | Configuración de Nómina |

| Schedules | Horarios |

| API Keys | Claves de API |

| Users | Usuarios |

| Organizations | Organizaciones |

| Settings | Configuración |

| Sign out | Cerrar Sesión |

### Spanish Schedules Page Labels (NEW)

| English | Spanish (es-MX) |

|---------|-----------------|

| Calendar | Calendario |

| Templates | Plantillas |

| Exceptions | Excepciones |

| Week | Semana |

| Month | Mes |

| Schedule Template | Plantilla de Horario |

| Add Exception | Agregar Excepción |

| Labor Law Warning | Advertencia de Ley Laboral |

| Overtime | Tiempo Extra |

| Working Hours | Horas de Trabajo |

### Spanish Device Auth Labels (NEW)

| English | Spanish (es-MX) |

|---------|-----------------|

| Enter the device code | Ingresa el código del dispositivo |

| Verify code | Verificar código |

| Approve | Aprobar |

| Deny | Rechazar |

| Pending approval | Pendiente de aprobación |

| Approved | Aprobado |

| Denied | Rechazado |

### Spanish Common Actions

| English | Spanish (es-MX) |

|---------|-----------------|

| Save | Guardar |

| Cancel | Cancelar |

| Delete | Eliminar |

| Edit | Editar |

| Add | Agregar |

| Search | Buscar |

| Loading... | Cargando... |

| Confirm | Confirmar |

| Next | Siguiente |

| Previous | Anterior |

| Back | Volver |

| Close | Cerrar |

| Submit | Enviar |

| Required | Requerido |

| Optional | Opcional |

---

## File Count Estimate

- **Web**: ~60 files to update
  - 13 dashboard client pages (including new Schedules page)
  - 8 schedules sub-components (calendar, templates, exceptions, etc.)
  - 4 auth pages (sign-in, sign-up, device verification, layout)
  - ~35 shared components (sidebar, dialogs, skeletons, UI primitives)
- **Mobile**: ~7 screens + ~10 component files
- **New files**: ~6 (i18n config + translation JSONs)

---

## Implementation Guidelines

- **Follow [AGENTS.md](AGENTS.md)** - All code must adhere to repository guidelines including:
  - Strict TypeScript typing for all functions, variables, and component props
  - JSDoc documentation for all functions with `@param`, `@returns`, and `@throws`
  - Prettier formatting (2 spaces, semicolons)
  - Conventional commit messages (`feat(web): ...`, `feat(mobile): ...`)

---

## Phase 4: Quality Checks

After all translations are implemented, run the following commands from the project root:

```bash
# Format all files
bun run format

# Run linting across
 all workspaces

bun run lint

# Run type checking across all workspaces
bun run check-types
```

Fix any errors before considering the task complete.