# Spec: Modal de Empleados — Rediseño Responsive Móvil

**Fecha:** 2026-03-13
**Rama:** `feat/employee-modal-responsive`
**Breakpoint:** 1024px (via `useIsMobile` hook existente)
**Alcance:** Solo mobile (≤1024px). Desktop (>1024px) sin cambios.

---

## Problema

El dialog de detalle/edición de empleados en `employees-client.tsx` es inutilizable en mobile:

1. **Vista de detalles:** El header muestra 10 campos en stack vertical (~600px). Los tabs (Resumen, Asistencia, etc.) quedan fuera del viewport. `DialogContent` tiene `overflow-hidden` impidiendo scroll.
2. **Formulario de edición/creación:** 20+ campos generan 3005px de contenido. Solo los primeros ~11 campos son visibles. El botón "Guardar" y secciones como PTU y Horario son inaccesibles.

**Root cause:** `DialogContent` aplica `overflow-hidden` con `h-[100dvh]` en mobile. Los contenedores internos no tienen `overflow-y: auto`.

---

## Diseño: Vista de Detalles

### Header ultra-mínimo

En mobile, el header se reduce a una sola línea con:
- Nombre del empleado (font-weight bold)
- Código (EMP-XXXX) como texto secundario
- Badge de estatus (Activo/Inactivo/De permiso)
- Botón de editar (icono)
- Botón de cerrar (X)

Altura total del header: ~50px. Sticky en la parte superior del dialog.

En desktop (>1024px): Sin cambios. El header mantiene los 10 campos como actualmente.

### Nuevo tab "Info"

Los 10 campos que estaban en el header se mueven a un nuevo tab "Info" como **primer tab** en la lista:

| Campo | Tipo |
|-------|------|
| Ubicación | Texto |
| Puesto | Texto |
| Fecha de ingreso | Fecha formateada |
| Tipo de turno | Texto (traducido) |
| Correo electrónico | Link mailto |
| Teléfono | Link tel |
| NSS | Texto |
| RFC | Texto |
| Departamento | Texto |
| Usuario | Texto o "Sin usuario" |

**Layout del tab Info en mobile:** Grid de 1 columna, cada campo como par label/value. Touch targets de 44px para campos interactivos (email, teléfono).

**En desktop:** El tab "Info" NO se muestra. Los campos permanecen en el header como hoy. Esta es una diferencia condicional basada en `useIsMobile`.

### Tabs en scroll horizontal

Se elimina el dropdown "Más" en mobile. Todos los tabs se muestran en una línea scrolleable horizontalmente:

```
[Info] [Resumen] [Asistencia] [Vacaciones] [Documentos] [Nómina] [PTU] [Finiquito] [Excepciones] [Auditoría] [Disciplinario]
```

- `overflow-x: auto` con `-webkit-overflow-scrolling: touch`
- El tab activo se auto-centra con `scrollIntoView({ behavior: 'smooth', inline: 'center' })`
- En desktop: se mantiene el patrón actual (4 tabs + dropdown "Más")

### Estructura flex del dialog

```
DialogContent (fullscreen mobile)
├── Header (shrink-0, sticky, border-bottom)
├── TabsList (shrink-0, overflow-x-auto, border-bottom)
└── TabsContent (flex-1, min-h-0, overflow-y-auto) ← FIX CLAVE
```

El fix del overflow se logra haciendo que `TabsContent` (o su contenedor padre) tenga `flex-1 min-h-0 overflow-y-auto`. Esto permite scroll interno sin que el `DialogContent` necesite cambiar su `overflow-hidden`.

---

## Diseño: Wizard de Edición/Creación (Solo Mobile)

### Estructura

```
DialogContent (fullscreen mobile)
├── Header (shrink-0): "Editar empleado" + botón cerrar
├── Stepper (shrink-0): Dots de progreso + label "Paso X de 5: Nombre"
├── Form content (flex-1, overflow-y-auto): Campos del paso actual
└── Footer (shrink-0): Botones [← Anterior] [Siguiente →]
```

### 5 pasos

**Paso 1 — Personal:**
- Nombre (text)
- Apellido (text)
- NSS (text, opcional)
- RFC (text, opcional)
- Correo electrónico (email, opcional)
- Teléfono (tel, opcional)
- Departamento (text, opcional)

**Paso 2 — Laboral:**
- Código (text, disabled en edición, auto-gen en creación)
- Ubicación (combobox)
- Puesto (combobox)
- Estatus (combobox)
- Tipo de turno (combobox)
- Fecha de ingreso (date picker)
- Usuario (combobox)

**Paso 3 — Salario:**
- Frecuencia de pago (combobox)
- Salario del periodo (number)
- Salario diario calculado (text, disabled)
- SBC diario override (number, opcional)

**Paso 4 — PTU y Aguinaldo:**
- Tipo de contratación (combobox)
- Elegibilidad PTU (combobox)
- Días de aguinaldo override (number, opcional)
- Horas en plataforma (number, opcional)
- Checkboxes: Empleado de confianza, Director/Admin/GM, Trabajador del hogar, Trabajador de plataforma
- Historial PTU: Tabla inline (Año + Monto) + form para agregar

**Paso 5 — Horario:**
- 7 filas (Lunes a Domingo)
- Cada fila: Checkbox activo + Hora inicio (time) + Hora fin (time)
- Campos deshabilitados si el día no está activo

### Comportamiento del wizard

- **Navegación:** Botones Anterior/Siguiente fijos en footer sticky. Paso 1 no muestra "Anterior". Paso 5 muestra "Guardar" en lugar de "Siguiente".
- **Dot stepper:** Dots filled (●) para pasos visitados, dot con anillo (◉) para paso actual, dots vacíos (○) para pasos no visitados.
- **Navegación libre:** El usuario puede navegar hacia adelante o atrás libremente sin validación por paso.
- **Validación:** Al hacer "Guardar" en paso 5, se ejecuta la validación de todos los campos. Si hay errores, se muestra un toast con el paso que tiene el error y el stepper dot se marca en rojo.
- **Cierre con cambios:** Si hay campos modificados (comparados con el estado original), al intentar cerrar (X, escape, click overlay) se muestra `AlertDialog`:
  - Título: "¿Descartar cambios?"
  - Descripción: "Los cambios sin guardar se perderán."
  - Botones: "Cancelar" (vuelve al wizard) / "Descartar" (cierra el dialog)
- **Crear vs Editar:** Mismo componente wizard. Título cambia ("Agregar empleado" vs "Editar empleado"). En crear, Código se auto-genera y no es editable.
- **Solo mobile:** En desktop (>1024px), se usa el formulario actual con grid de 2 columnas. El wizard no aparece.

### Transición Vista → Edición

Cuando el usuario hace click en "Editar" desde la vista de detalles en mobile:
1. El dialog cambia de modo vista a modo edición
2. El wizard se abre en el **paso 1** (Personal)
3. Todos los campos están pre-populated con los datos del empleado

---

## Optimización del Contenido de Tabs

Principio: todas las tablas internas se convierten a cards stacked en mobile usando el patrón `ResponsiveDataView` existente. Touch targets mínimos de 44px.

### Tab "Info" (nuevo)
- Grid 1 columna en mobile. Cada campo como `<div>` con label (text-muted) + value (font-medium).
- Email y Teléfono son links interactivos (`mailto:` / `tel:`).

### Tab "Resumen"
- KPI cards: `grid-cols-2` en mobile con gaps reducidos.
- Numbers grandes, labels compactos.
- Sin cambios estructurales mayores.

### Tab "Asistencia"
- Stats cards: `grid-cols-2`.
- Accordions mensuales: stack natural, sin cambios.
- Tablas internas de ausencias: convertir a cards stacked.

### Tab "Vacaciones"
- Balance cards: `grid-cols-2` (reducir de `lg:grid-cols-5`).
- Tabla de solicitudes: cards con Periodo, Tipo, Estatus (badge), Días.
- Formulario de solicitud: inputs full-width stacked.

### Tab "Documentos"
- Checklist vertical: funciona naturalmente en mobile.
- Upload zones: full-width.
- Sin cambios mayores.

### Tab "Nómina"
- Tabla de corridas: cards con Periodo, Frecuencia, Estatus (badge), Total.
- Links de descarga: botones full-width con min-h 44px.

### Tab "PTU"
- Settings: stack vertical `grid-cols-1`.
- Historial: cards simples (Año + Monto).

### Tab "Finiquito"
- Cálculos numéricos: stack vertical con separadores.
- Campos: full-width.

### Tab "Excepciones"
- Tabla: cards con Fecha, Tipo de excepción, Motivo, Duración.

### Tab "Auditoría"
- Timeline de cambios: cards con timestamp, usuario, acción, campo modificado.

### Tab "Disciplinario"
- Cards de medidas con badge de severidad.
- Formulario nuevo: inputs full-width stacked.

---

## Convenciones Técnicas

| Aspecto | Convención |
|---------|------------|
| Breakpoint | 1024px via `useIsMobile` |
| Touch targets | min-h 44px |
| Componentes compartidos | `ResponsiveDataView`, `ResponsivePageHeader` |
| Responsive prefixes | `min-[1025px]:` para desktop-only |
| Testing | Playwright E2E a 375px y 1024px |
| Strings UI | Español via `next-intl` en `es.json` |
| Archivos | kebab-case |
| Commits | `fix(employees): ...` / `feat(employees): ...` |

## Archivos Principales

**Modificados:**
- `apps/web/app/(dashboard)/employees/employees-client.tsx` — Restructurar dialog, agregar tab Info, wizard mobile
- `apps/web/messages/es.json` — Traducciones para wizard steps, tab Info, confirmación de descarte

**Nuevos:**
- `apps/web/components/employees/employee-wizard-mobile.tsx` — Componente wizard de 5 pasos
- `apps/web/components/employees/employee-info-tab.tsx` — Contenido del tab Info

## Fuera de alcance

- Cambios al formulario de desktop (>1024px)
- Cambios al componente `dialog.tsx` base de shadcn
- Nuevas rutas (/employees/[id])
- Auto-guardado de borradores en localStorage
- Gestos swipe entre pasos del wizard
