---
name: hire-date-picker-ux
overview: 'Mejorar la UX del selector de “Fecha de ingreso” en el diálogo de crear/editar empleado: permitir escribir la fecha (YYYY-MM-DD) y, en el calendario, poder saltar por mes/año con dropdown; además, bloquear fechas futuras.'
todos:
    - id: datefield-input-variant
      content: Extender `DateField` en `apps/web/lib/forms.tsx` con variante `input` + popover y `captionLayout="dropdown"`, soportando rango (minYear) y bloqueo de fechas futuras (maxDate/hoy).
      status: pending
    - id: employees-hiredate-wireup
      content: Actualizar `apps/web/app/(dashboard)/employees/employees-client.tsx` para usar `variant="input"` en `hireDate` y añadir validadores (formato válido + no futuro).
      status: pending
    - id: i18n-validation-messages
      content: Agregar claves nuevas en `apps/web/messages/es.json` para errores de fecha inválida y fecha futura no permitida.
      status: pending
    - id: verify-web-checks
      content: Correr `bun run lint:web` y `bun run check-types:web` y hacer smoke test del diálogo de empleado (fechas antiguas y futuras).
      status: pending
isProject: false
---

# Mejorar UX de “Fecha de ingreso” (alta de empleado)

## Contexto actual

- En el diálogo de empleados se usa `form.AppField name="hireDate"` con `field.DateField`.
- `DateField` hoy es un botón que abre un `Calendar` (shadcn + `react-day-picker`) sin navegación rápida por año, lo que hace lento elegir fechas antiguas.

Archivos clave:

- UI del formulario de empleados: [apps/web/app/(dashboard)/employees/employees-client.tsx](<apps/web/app/(dashboard)/employees/employees-client.tsx>)
- Implementación del `DateField`: [apps/web/lib/forms.tsx](apps/web/lib/forms.tsx)
- Wrapper del calendario (shadcn): [apps/web/components/ui/calendar.tsx](apps/web/components/ui/calendar.tsx)
- Traducciones: [apps/web/messages/es.json](apps/web/messages/es.json)

## Enfoque UX (seleccionado)

- Cambiar “Fecha de ingreso” a **input editable (YYYY-MM-DD) + icono de calendario**.
- En el popover del calendario usar `captionLayout="dropdown"` para **salto rápido de mes/año** (según docs de shadcn y `react-day-picker`).
- **Bloquear fechas futuras** (tanto en calendario como en validación del input).

## Cambios propuestos

### 1) Extender `DateField` para soportar variante “input + dropdown”

En [apps/web/lib/forms.tsx](apps/web/lib/forms.tsx):

- **Agregar props nuevas** (tipadas) a `DateField`:
- `variant?: 'button' | 'input'` (default `'button'` para no afectar otros usos).
- `minYear?: number` (default recomendado: 1950) y `maxDate?: Date` (default: hoy) para controlar rango y bloqueo de futuro.
- **Implementar variante `variant="input"`** inspirada en el patrón oficial de shadcn “Calendar Picker with Text Input”:
- Renderizar un `Input` con `value={rawValue}` y placeholder (ya existe `YYYY-MM-DD`).
- Abrir el `Popover` con un botón/icono (usar `Common.selectDate` para el texto accesible `sr-only`).
- Mantener estado local `open` y `month` para que al escribir una fecha válida, el calendario salte a ese mes.
- Configurar el `Calendar` con:
- `captionLayout="dropdown"`
- `startMonth={new Date(minYear, 0, 1)}`
- `endMonth={maxDate}`
- `disabled={{ after: maxDate }}`
- En `onSelect`, normalizar siempre a `yyyy-MM-dd` usando `date-fns`.
- **Mantener la variante actual** (botón) para el resto de pantallas.

### 2) Usar la nueva variante solo en “Fecha de ingreso”

En [apps/web/app/(dashboard)/employees/employees-client.tsx](<apps/web/app/(dashboard)/employees/employees-client.tsx>):

- En el bloque actual:
- `form.AppField name="hireDate"` → cambiar a:
- `<field.DateField variant="input" minYear={1950} />` (y usar `maxDate={new Date()}` implícito o explícito para bloquear futuro).
- **Agregar validadores** al `AppField hireDate`:
- Si está vacío: OK (mantener opcionalidad actual).
- Si no está vacío:
- Validar formato/fecha real (`parse` + `isValid` + comparación contra `format(parsed,'yyyy-MM-dd')`).
- Validar “no futuro” (comparando contra hoy a nivel “día” con `date-fns`).

### 3) Añadir mensajes de error en i18n

En [apps/web/messages/es.json](apps/web/messages/es.json), sección `Employees.validation`:

- `hireDateInvalid`: “La fecha debe tener formato YYYY-MM-DD.”
- `hireDateFutureNotAllowed`: “La fecha de ingreso no puede ser posterior a hoy.”

### 4) Verificación

- Ejecutar checks del workspace web:
- `bun run lint:web`
- `bun run check-types:web`
- Smoke test manual:
- Abrir diálogo “Agregar empleado” → escribir `2010-05-10` (debe aceptarse y el calendario abrir en mayo 2010).
- Probar una fecha futura (debe marcar error y no permitir selección en calendario).
- Probar selección rápida cambiando año/mes desde los dropdowns.
