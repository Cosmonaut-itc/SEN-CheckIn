# Interactive Guided Tours — Design Spec

## Overview

Sistema de tutoriales interactivos in-app para la aplicación web de SEN-CheckIn. Utiliza guided tours con tooltips paso a paso para enseñar a los usuarios a utilizar cada sección del dashboard sin intervención humana.

**Alcance**: Solo la app web (Next.js). La app mobile queda fuera de alcance por ahora.

## Decisiones de diseño

| Decisión | Elección | Alternativas descartadas |
|----------|----------|--------------------------|
| Estilo de tutorial | Guided Tour (tooltips paso a paso) | Interactive Walkthrough, Sandbox, Híbrido |
| Estructura | Mini-tours por sección (auto-activación en primera visita) | Tour único largo, Tour inicial + mini-tours opcionales |
| Relanzamiento | Botón de ayuda (?) en cada sección | Centro de tutoriales centralizado, Ambos |
| Comportamiento al saltar | Confirmación + marca como skipped | Bloqueo total, Saltar sin fricción |
| Librería | React Joyride | Shepherd.js, Implementación custom |
| Persistencia | Tabla dedicada `tour_progress` | Campo JSON en tabla `member` |

## Arquitectura

### Componentes principales

1. **`TourProvider`** — Context provider que envuelve el dashboard layout. Maneja el estado de Joyride (running/idle, step actual), la lógica de completitud por sección, y la función para lanzar/relanzar tours.

2. **Definiciones de tours** — Un archivo por sección que exporta un `TourConfig` con el array de steps de Joyride.

3. **Tabla `tour_progress`** — Persistencia en PostgreSQL del progreso de cada usuario por organización.

4. **Hook `useTour(sectionId)`** — Cada página lo llama. Verifica si el tour fue completado, lo lanza automáticamente si no, y expone `restartTour()` para el botón de ayuda.

### Estructura de archivos

```
apps/web/
  lib/
    tours/
      index.ts              # Registry central de todos los tours
      types.ts              # Tipos: TourStep, TourConfig
      dashboard.ts          # Tour del dashboard principal
      employees.ts          # Tour de empleados
      job-positions.ts      # Tour de puestos de trabajo
      devices.ts            # Tour de dispositivos
      locations.ts          # Tour de ubicaciones
      attendance.ts         # Tour de asistencia
      schedules.ts          # Tour de horarios
      vacations.ts          # Tour de vacaciones
      incapacities.ts       # Tour de incapacidades
      payroll.ts            # Tour de nómina
      payroll-settings.ts   # Tour de config de nómina (admin)
      users.ts              # Tour de usuarios (admin)
      organizations.ts      # Tour de organizaciones (admin)
      api-keys.ts           # Tour de API keys (admin)
      overtime-authorizations.ts  # Tour de horas extra (admin)
      deductions.ts         # Tour de deducciones (admin)
  components/
    tour-provider.tsx       # Context provider + Joyride wrapper
    tour-help-button.tsx    # Botón de ayuda reutilizable
  hooks/
    use-tour.ts             # Hook principal

apps/api/
  src/
    routes/tours.ts         # Endpoints de tours
    db/schema.ts            # (modificado) Nueva tabla tour_progress
  drizzle/
    XXXX_add_tour_progress.sql  # Migración
```

### Tipo `TourConfig`

```ts
interface TourStep {
  target: string;        // Selector CSS del elemento a resaltar
  content: string;       // Clave de i18n para next-intl
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface TourConfig {
  id: string;            // ID único, mismo usado en tour_progress
  section: string;       // Ruta donde se activa (ej: '/employees')
  adminOnly: boolean;    // Si requiere rol admin/owner/superuser
  steps: TourStep[];
}
```

## Base de datos

### Tabla `tour_progress`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `text` (PK) | ID único generado |
| `userId` | `text` (FK → user) | Usuario que completó/saltó |
| `organizationId` | `text` (FK → organization) | Organización activa |
| `tourId` | `text` | Identificador del tour |
| `status` | `text` | `completed` o `skipped` |
| `completedAt` | `timestamp` | Cuándo se completó/saltó |

**Índice único**: `(userId, organizationId, tourId)` — un usuario solo tiene un registro por tour por organización.

## API Endpoints

Todos los endpoints requieren autenticación y usan el `userId` y `organizationId` de la sesión activa.

### `GET /tours/progress`

Retorna todos los tours completados/saltados del usuario en la organización activa.

**Response:**
```json
{
  "tours": [
    { "tourId": "dashboard", "status": "completed", "completedAt": "2026-04-13T..." },
    { "tourId": "employees", "status": "skipped", "completedAt": "2026-04-13T..." }
  ]
}
```

### `POST /tours/:tourId/complete`

Marca un tour como completado o saltado. Usa upsert para manejar el caso de re-completar un tour previamente saltado.

**Body:**
```json
{ "status": "completed" | "skipped" }
```

### `DELETE /tours/:tourId/progress`

Resetea el progreso de un tour específico. Útil para cuando se actualiza la UI y se quiere que los usuarios repitan el tour.

## Flujo de primera visita

1. Usuario navega a una sección (ej: `/employees`)
2. `useTour('employees')` se ejecuta en el componente de la página
3. El hook consulta `GET /tours/progress` (cacheado con React Query, un solo request para todas las secciones)
4. Si `employees` no está en la lista → lanza Joyride automáticamente tras ~500ms de delay (para que la UI termine de renderizar)
5. Si ya está completado/saltado → no hace nada

## Comportamiento del tour

### Durante el tour
- Overlay oscuro sobre toda la página excepto el elemento activo
- Tooltip con texto explicativo y botones "Siguiente" / "Anterior"
- Botón "Omitir tutorial" visible en cada paso
- Indicador de progreso: "Paso 3 de 7"

### Al completar (último paso)
- `POST /tours/employees/complete` con `status: 'completed'`
- Invalidar cache de React Query de progreso
- Mensaje de cierre: "Tutorial completado! Puedes repetirlo desde el botón de ayuda"

### Al omitir
- Dialog de confirmación: "Seguro que quieres saltar este tutorial? Puedes repetirlo desde el botón de ayuda (?) en cualquier momento"
- Si confirma → `POST /tours/employees/complete` con `status: 'skipped'`
- Si cancela → continúa el tour

## Botón de ayuda

- **Componente**: `<TourHelpButton tourId="employees" />`
- **Ubicación**: Header de cada página, junto al título de la sección
- **Ícono**: `CircleHelp` de Lucide React
- **Tooltip en hover**: "Repetir tutorial de esta sección"
- **Comportamiento**: Llama a `restartTour()` del context, lanza Joyride desde el paso 1
- **No actualiza tracking**: Relanzar un tour completado no cambia su estado en BD

## Secciones con tour

### Tours generales (todos los usuarios)
- `dashboard` — Dashboard principal (KPIs, métricas)
- `employees` — Lista y gestión de empleados
- `job-positions` — Puestos de trabajo
- `devices` — Dispositivos de check-in
- `locations` — Ubicaciones/sucursales
- `attendance` — Registro de asistencia (con tabs)
- `schedules` — Horarios y turnos
- `vacations` — Gestión de vacaciones
- `incapacities` — Incapacidades médicas
- `payroll` — Nómina

### Tours admin (admin/owner/superuser)
- `payroll-settings` — Configuración de nómina
- `users` — Gestión de usuarios
- `organizations` — Administración de organizaciones
- `api-keys` — Llaves API
- `overtime-authorizations` — Autorizaciones de horas extra
- `deductions` — Deducciones
- `disciplinary-measures` — Medidas disciplinarias (condicional a setting)

## i18n

Todos los textos de los tours usan claves de `next-intl`. Se agregan al archivo `apps/web/messages/es.json` bajo un namespace `tours`:

```json
{
  "tours": {
    "employees": {
      "step1": "Aquí puedes ver la lista completa de empleados...",
      "step2": "Usa este botón para agregar un nuevo empleado...",
      ...
    },
    "skipConfirmTitle": "Omitir tutorial?",
    "skipConfirmMessage": "Puedes repetirlo desde el botón de ayuda (?) en cualquier momento",
    "skipConfirmButton": "Sí, omitir",
    "skipCancelButton": "Continuar tutorial",
    "completedMessage": "Tutorial completado! Puedes repetirlo desde el botón de ayuda",
    "helpButtonTooltip": "Repetir tutorial de esta sección",
    "progressLabel": "Paso {current} de {total}"
  }
}
```

## Dependencias nuevas

- `react-joyride` — Librería principal para guided tours

## Testing

- **Unit tests**: `TourProvider`, `useTour` hook, lógica de registry
- **E2E tests (Playwright)**: Flujo completo de primera visita → tour → completar, flujo de skip, flujo de relanzamiento desde botón de ayuda
- **API tests**: Endpoints de tours (CRUD de progreso)
