# Plan: Mobile Responsiveness Fix — jale. by SEN

**Spec:** `docs/superpowers/specs/2026-03-12-mobile-responsiveness-design.md`
**Branch:** `feat/mobile-responsiveness`
**Breakpoint:** 1024px (update `useIsMobile` from 768px)

## Instrucciones para el agente

> **OBLIGATORIO:** Debes seguir estas directivas al ejecutar este plan:
>
> 1. **TDD (Test-Driven Development):** Para cada sección, escribe primero los tests E2E de Playwright que validen el comportamiento responsive esperado, verifica que fallen, implementa el fix, y verifica que pasen. Usa la skill `test-driven-development` o `superpowers:test-driven-development`.
> 2. **Skills de Next.js:** Usa las skills `nextjs-app-router-patterns` y `shadcn-ui` cuando trabajes con componentes, layouts y server/client components. Consulta Context7 MCP (`resolve-library-id` + `query-docs`) para documentación actualizada de Next.js, Tailwind CSS v4, shadcn/ui, y TanStack Table.
> 3. **UI/UX Pro Max:** Usa la skill `frontend-design` para asegurar que los componentes responsive tengan calidad de producción y diseño distintivo. No genéricos.
> 4. **NO uses skills de Expo/React Native** — este trabajo es exclusivamente web (Next.js).
> 5. **Git Workflow:**
>    - Crea la rama `feat/mobile-responsiveness` desde `main`
>    - Haz commits atómicos al completar cada sección (no mega-commits)
>    - Cada commit debe pasar lint (`bun run lint`) y type-check (`bun run check-types`)
>    - Al terminar todo el plan, abre un PR contra `main` con resumen de cambios
> 6. **Coding Standards:** Sigue estrictamente AGENTS.md — TypeScript estricto, JSDoc, imports organizados, UI strings en español, kebab-case para archivos.
> 7. **Verificación:** Antes de marcar una sección como completada, ejecuta los tests E2E relevantes y verifica visualmente con Playwright (screenshot a 375px y 1024px).

---

## Sección 0: Setup y Infraestructura

### 0.1 Crear rama y actualizar breakpoint
- [ ] Crear rama `feat/mobile-responsiveness` desde `main`
- [ ] Actualizar `apps/web/hooks/use-mobile.ts`: cambiar breakpoint de 768px a 1024px
- [ ] Verificar que la sidebar ahora se comporta como móvil en viewports ≤1024px
- [ ] Commit: `feat(responsive): update useIsMobile breakpoint to 1024px`

### 0.2 Crear estructura de tests E2E
- [ ] Crear directorio `apps/web/e2e/responsiveness/`
- [ ] Crear helper de test con viewports predefinidos: `mobile: { width: 375, height: 812 }`, `tablet: { width: 1024, height: 768 }`
- [ ] Crear test base que verifica no-horizontal-overflow para cada página
- [ ] Commit: `test(e2e): add responsive test infrastructure`

**Verificación Sección 0:**
- [ ] `bun run lint` pasa
- [ ] `bun run check-types` pasa
- [ ] Tests E2E ejecutan (aunque fallen — TDD red phase)

---

## Sección 1: Componentes Compartidos

### 1.1 `<ResponsivePageHeader>`
- [ ] **TEST FIRST:** Escribir test E2E que verifica que en 375px el header de `/employees` no tiene overlap entre título y botón
- [ ] Crear `apps/web/components/ui/responsive-page-header.tsx`
  - Props: `title: string`, `description?: string`, `actions?: ReactNode`
  - Desktop (>1024px): `flex justify-between items-start` — título izquierda, acciones derecha
  - Mobile (≤1024px): `flex flex-col gap-3` — título arriba, acciones abajo full-width
  - Touch: botones de acción con min-h de 44px
- [ ] Escribir test unitario (Vitest) para el componente
- [ ] Commit: `feat(ui): add ResponsivePageHeader component`

### 1.2 `<ResponsiveDataView>`
- [ ] **TEST FIRST:** Escribir test E2E que verifica que en 375px `/employees` renderiza cards en lugar de tabla
- [ ] Crear `apps/web/components/ui/responsive-data-view.tsx`
  - Props: Acepta la configuración de TanStack Table + `cardRenderer: (row: TData) => ReactNode`
  - Desktop: Renderiza la tabla TanStack normal (componente DataTable existente)
  - Mobile: Renderiza cards apiladas con la función `cardRenderer`
  - Incluye paginación, search, y filtros adaptativos (stacked en mobile)
  - Los cards deben tener min touch target de 44px para acciones
- [ ] Escribir test unitario (Vitest) para rendering condicional
- [ ] Commit: `feat(ui): add ResponsiveDataView component`

### 1.3 `<MobileDayCalendar>`
- [ ] **TEST FIRST:** Escribir test E2E que verifica que en 375px `/schedules` muestra vista de día individual
- [ ] Crear `apps/web/components/ui/mobile-day-calendar.tsx`
  - Props: `date: Date`, `employees: ScheduleEntry[]`, `onDateChange: (date: Date) => void`, `weekRange: { start: Date, end: Date }`
  - UI: Header con `◀ [Lunes 9 mar 2026] ▶`, lista de empleados con plantilla, horario, tipo de turno
  - Navegación limitada al rango de la semana seleccionada
  - Cards por empleado con 44px min height
- [ ] Escribir test unitario (Vitest)
- [ ] Commit: `feat(ui): add MobileDayCalendar component`

**Verificación Sección 1:**
- [ ] Los 3 componentes tienen tests unitarios que pasan
- [ ] Tests E2E del red phase fallan (componentes no integrados aún)
- [ ] `bun run lint` y `bun run check-types` pasan
- [ ] Revisión visual: componentes renderizados correctamente en storybook o test page

---

## Sección 2: Landing Page (Páginas Públicas)

### 2.1 Fix Bento Grid overflow
- [ ] **TEST FIRST:** Test E2E que verifica `document.body.scrollWidth <= window.innerWidth` en `/` a 375px
- [ ] Modificar `apps/web/app/(marketing)/page.tsx` (o componente de bento grid):
  - Cambiar grid a `grid-cols-1` en mobile (≤1024px)
  - Eliminar `sm:col-span-2` en mobile — todas las cards full-width
  - Asegurar padding correcto: `px-4` en mobile
- [ ] Commit: `fix(marketing): fix bento grid overflow on mobile`

### 2.2 Fix Trust/Testimonials section overflow
- [ ] Modificar sección de confianza/trust:
  - Stack layout vertical en mobile: `flex flex-col` en lugar de `lg:grid lg:grid-cols-[1.1fr_0.9fr]`
  - CardStack de testimonios: ajustar dimensiones para mobile
  - Verificar que los bullet points de seguridad tienen buen spacing
- [ ] Commit: `fix(marketing): fix trust section overflow on mobile`

### 2.3 Fix header nav y CTA buttons
- [ ] Verificar que la nav del marketing layout es responsive
- [ ] CTA buttons: full-width en mobile (`w-full` en ≤1024px)
- [ ] Stats pills: wrapping correcto
- [ ] Commit: `fix(marketing): improve mobile nav and CTAs`

### 2.4 Auth pages touch optimization
- [ ] Verificar sign-in y sign-up: inputs con min-h 44px, botones full-width con 44px height
- [ ] Commit: `fix(auth): optimize touch targets on mobile`

**Verificación Sección 2:**
- [ ] Screenshot de landing a 375px: sin overflow horizontal, bento grid stacked, trust section readable
- [ ] Screenshot de landing a 1024px: layout adaptado correctamente
- [ ] Test E2E de no-overflow pasa para `/`, `/sign-in`, `/sign-up`, `/registrate`
- [ ] `bun run lint` y `bun run check-types` pasan

---

## Sección 3: Dashboard

### 3.1 Dashboard — Map Hero Mobile Layout
- [ ] **TEST FIRST:** Test E2E que verifica en 375px que el mapa tiene al menos 50vh de alto y los stats son visibles
- [ ] Modificar `apps/web/app/(dashboard)/dashboard/page.tsx` (y componentes relacionados):
  - Mobile: Mapa al 60vh, full-width
  - Stats strip: horizontal scrollable con `overflow-x-auto`, cards coloreadas (min-w 80px cada una)
  - "Mapa operativo" text card: below map, full-width
  - Action buttons: `flex flex-col gap-2 w-full` en mobile
- [ ] Asegurar que MapLibre GL se redimensiona correctamente con `resize()` en viewport change
- [ ] Commit: `feat(dashboard): implement Map Hero mobile layout`

### 3.2 Dashboard — Locations panel mobile
- [ ] Locations accordion: full-width cards en mobile
- [ ] Search: full-width input
- [ ] Secciones (Con coordenadas, Sin coordenadas, Fuera de oficina): stacked con spacing generoso
- [ ] Commit: `fix(dashboard): adapt locations panel for mobile`

**Verificación Sección 3:**
- [ ] Screenshot de dashboard a 375px: mapa prominente, stats legibles, ubicaciones accesibles
- [ ] Screenshot a 1024px: layout adaptado (puede ser similar al mobile o intermedio)
- [ ] Mapa es interactivo (zoom, pan) en ambos viewports
- [ ] Test E2E pasa

---

## Sección 4: Páginas de Tablas — Core

### 4.1 Employees (`/employees`)
- [ ] **TEST FIRST:** Test E2E que verifica cards en 375px y tabla en 1280px
- [ ] Reemplazar `<ResponsivePageHeader>` en el header
- [ ] Integrar `<ResponsiveDataView>` con cardRenderer:
  - Card muestra: Código (badge), Nombre (bold), Puesto, Ubicación, Estatus (badge coloreado), Rostro (indicador), Acciones (menú ...)
- [ ] Adaptar filtros: stacked full-width en mobile
- [ ] Commit: `feat(employees): implement responsive card layout`

### 4.2 Attendance (`/attendance`)
- [ ] Reemplazar con `<ResponsivePageHeader>` — stacked buttons en mobile
- [ ] Integrar `<ResponsiveDataView>` con cardRenderer:
  - Card: Empleado, ID, Tipo (Entrada/Salida con badge), Clasificación, Hora, Fecha, Acciones
- [ ] Adaptar filtros y action buttons: stacked full-width
- [ ] Commit: `feat(attendance): implement responsive card layout`

### 4.3 Schedules (`/schedules`)
- [ ] Integrar `<MobileDayCalendar>` en el tab "Calendario" para mobile
- [ ] Tab "Plantillas": usar `<ResponsiveDataView>` con cards
- [ ] Tab "Excepciones": usar `<ResponsiveDataView>` con cards
- [ ] Mantener controles de semana/mes, ubicación en stacked layout
- [ ] Commit: `feat(schedules): implement mobile day calendar and responsive tables`

### 4.4 Payroll (`/payroll`)
- [ ] Adaptar historial de ejecuciones con `<ResponsiveDataView>`
- [ ] Cards: Periodo, Frecuencia, Estatus (badge), Total, Procesado, Recibos (link)
- [ ] Asegurar que los forms de periodo de pago son full-width en mobile
- [ ] PTU y Aguinaldo tabs: verificar y adaptar si tienen tablas
- [ ] Commit: `feat(payroll): implement responsive payroll history table`

### 4.5 Locations (`/locations`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Card: Código, Nombre, Dirección, Zona, Timezone, Acciones
- [ ] Commit: `feat(locations): implement responsive card layout`

**Verificación Sección 4:**
- [ ] Screenshots de employees, attendance, schedules, payroll, locations a 375px: todas muestran cards
- [ ] Screenshots a 1280px (desktop): todas muestran tablas
- [ ] Calendario de horarios es legible y navegable en 375px
- [ ] Filtros y acciones funcionan en mobile
- [ ] Tests E2E pasan para las 5 páginas
- [ ] `bun run lint` y `bun run check-types` pasan

---

## Sección 5: Páginas de Tablas — Secundarias

### 5.1 Devices (`/devices`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(devices): implement responsive card layout`

### 5.2 Vacations (`/vacations`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(vacations): implement responsive card layout`

### 5.3 Incapacities (`/incapacities`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(incapacities): implement responsive card layout`

### 5.4 Job Positions (`/job-positions`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(job-positions): implement responsive card layout`

### 5.5 Users (`/users`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(users): implement responsive card layout`

### 5.6 Organizations (`/organizations`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(organizations): implement responsive card layout`

### 5.7 API Keys (`/api-keys`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(api-keys): implement responsive card layout`

### 5.8 Overtime Authorizations (`/overtime-authorizations`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(overtime): implement responsive card layout`

### 5.9 Disciplinary Measures (`/disciplinary-measures`)
- [ ] `<ResponsivePageHeader>` + `<ResponsiveDataView>`
- [ ] Commit: `feat(disciplinary): implement responsive card layout`

### 5.10 Payroll Settings (`/payroll-settings`)
- [ ] Adaptar forms: full-width inputs, stacked fields en mobile
- [ ] Verificar holiday calendar y deduction rules layout
- [ ] Commit: `feat(payroll-settings): adapt forms for mobile`

### 5.11 App Móvil (`/app-movil`)
- [ ] Verificar y adaptar layout
- [ ] Commit: `fix(app-movil): adapt layout for mobile`

**Verificación Sección 5:**
- [ ] Screenshots de todas las páginas secundarias a 375px: cards layout correcto
- [ ] Tests E2E pasan para todas las páginas
- [ ] `bun run lint` y `bun run check-types` pasan

---

## Sección 6: Modales, Dialogs y Formularios

### 6.1 Auditar todos los modales
- [ ] Listar todos los dialogs/sheets usados en la app (crear empleado, editar ubicación, etc.)
- [ ] Para cada modal:
  - [ ] Verificar que `max-w` no clip en mobile — usar `w-full max-w-[calc(100vw-2rem)]` o `sm:max-w-lg`
  - [ ] Form fields: full-width, stacked labels
  - [ ] Botones de acción: full-width stacked en mobile, min-h 44px
  - [ ] Select/combobox: verificar que despliegan correctamente

### 6.2 Fix modales críticos
- [ ] Modal de agregar/editar empleado
- [ ] Modal de agregar/editar ubicación
- [ ] Modal de registrar fuera de oficina
- [ ] Modal de excepciones de horario
- [ ] Sheet de detalle de empleado
- [ ] Commit: `fix(modals): adapt all modals and forms for mobile`

### 6.3 Fix modales secundarios
- [ ] Modales de: devices, vacations, incapacities, job-positions, users, organizations, API keys
- [ ] Commit: `fix(modals): adapt secondary modals for mobile`

**Verificación Sección 6:**
- [ ] Abrir cada modal en 375px: sin overflow, inputs accesibles, botones legibles
- [ ] Tests E2E que abren modales principales y verifican no-overflow
- [ ] `bun run lint` y `bun run check-types` pasan

---

## Sección 7: Touch Optimization Pass

### 7.1 Audit de touch targets
- [ ] **TEST:** Test E2E que verifica que todos los botones principales tienen ≥44px de height en 375px
- [ ] Pasar por todas las páginas y asegurar:
  - [ ] Botones: `min-h-[44px]` en mobile
  - [ ] Links: padding suficiente para 44px touch target
  - [ ] Checkbox/radio: wrapper con 44px hit area
  - [ ] Spacing entre elementos interactivos: ≥8px gap
- [ ] Commit: `fix(ux): ensure 44px minimum touch targets across app`

### 7.2 Font sizing mobile pass
- [ ] Verificar que no hay texto <12px en mobile
- [ ] Headings: escalar apropiadamente (no tan grandes que rompan layout)
- [ ] Labels y descriptions: legibles sin zoom
- [ ] Commit: `fix(ux): optimize font sizes for mobile readability`

**Verificación Sección 7:**
- [ ] Auditoría manual de touch targets en 5 páginas clave
- [ ] Tests E2E pasan
- [ ] `bun run lint` y `bun run check-types` pasan

---

## Sección 8: Tests E2E Finales y Cleanup

### 8.1 Suite completa de tests responsive
- [ ] Crear/completar tests E2E para CADA página del dashboard:
  - [ ] No horizontal overflow a 375px
  - [ ] No horizontal overflow a 1024px
  - [ ] Componente correcto renderizado (card vs tabla)
  - [ ] Navegación funcional (sidebar, links)
  - [ ] Al menos 1 acción funcional por página (click, filter, search)
- [ ] Commit: `test(e2e): complete responsive test suite`

### 8.2 Screenshots de referencia
- [ ] Tomar screenshots de CADA página a 375px y 1024px como baseline de referencia
- [ ] Guardar en `apps/web/e2e/responsiveness/screenshots/`
- [ ] Commit: `test(e2e): add responsive reference screenshots`

### 8.3 Cleanup y verificación final
- [ ] `bun run lint` — sin errores
- [ ] `bun run check-types` — sin errores
- [ ] Todos los tests E2E responsive pasan
- [ ] Revisar que no se rompió nada en desktop (>1024px)
- [ ] Commit: `chore: cleanup and final verification`

**Verificación Sección 8:**
- [ ] TODOS los tests pasan (unit + E2E)
- [ ] Lint y type-check limpios
- [ ] Screenshots de referencia generados

---

## Sección 9: PR

### 9.1 Abrir Pull Request
- [ ] Push branch `feat/mobile-responsiveness` a origin
- [ ] Crear PR contra `main` con:
  - **Título:** `feat(web): complete mobile responsiveness overhaul`
  - **Descripción:**
    - Resumen de cambios por sección
    - Lista de componentes compartidos nuevos
    - Screenshots before/after de las páginas críticas
    - Link al spec: `docs/superpowers/specs/2026-03-12-mobile-responsiveness-design.md`
  - **Test plan:**
    - [ ] E2E tests pasan en CI
    - [ ] Verificar visualmente en Chrome DevTools a 375px, 768px, 1024px
    - [ ] Verificar que desktop (>1024px) no se rompió
    - [ ] Verificar sidebar behavior en nuevo breakpoint
    - [ ] Verificar modales en mobile

---

## Resumen de Archivos Nuevos

| Archivo | Descripción |
|---------|-------------|
| `components/ui/responsive-data-view.tsx` | Tabla/Cards adaptativo |
| `components/ui/mobile-day-calendar.tsx` | Calendario de día para horarios |
| `components/ui/responsive-page-header.tsx` | Header de página adaptativo |
| `e2e/responsiveness/*.spec.ts` | Suite de tests E2E responsive |
| `e2e/responsiveness/helpers.ts` | Helpers de viewport para tests |

## Resumen de Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `hooks/use-mobile.ts` | Breakpoint 768→1024 |
| `app/(marketing)/page.tsx` | Fix bento grid + trust section |
| `app/(dashboard)/dashboard/page.tsx` | Map Hero mobile layout |
| `app/(dashboard)/employees/page.tsx` | ResponsiveDataView + PageHeader |
| `app/(dashboard)/attendance/page.tsx` | ResponsiveDataView + PageHeader |
| `app/(dashboard)/schedules/page.tsx` | MobileDayCalendar integration |
| `app/(dashboard)/payroll/page.tsx` | ResponsiveDataView for history |
| `app/(dashboard)/locations/page.tsx` | ResponsiveDataView + PageHeader |
| + todas las demás páginas del dashboard | ResponsiveDataView + PageHeader |
| + todos los modales/dialogs | Mobile-friendly sizing + touch |
