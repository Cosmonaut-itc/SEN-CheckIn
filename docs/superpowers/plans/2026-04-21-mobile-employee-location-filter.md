# Filtrar empleados de la app movil por sucursal del dispositivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar la lista de empleados en Face Enrollment para que solo muestre empleados asignados a la misma sucursal (locationId) del dispositivo, aprovechando el soporte existente en el API.
**Architecture:** Cambio en 3 archivos del mobile app — tipos de query keys, funcion de fetch, y componente de enrollment.
**Tech Stack:** React Native, Expo, TypeScript, TanStack React Query, Eden Treaty
**Design Spec:** `docs/superpowers/specs/2026-04-21-mobile-employee-location-filter-design.md`

## File Structure

| Archivo | Responsabilidad |
|---------|----------------|
| `apps/mobile/lib/query-keys.ts` | Tipo `FaceEnrollmentEmployeeListQueryParams` — agregar `locationId` |
| `apps/mobile/lib/client-functions.ts` | `FaceEnrollmentEmployeesParams` y `fetchFaceEnrollmentEmployees()` — propagar `locationId` al API |
| `apps/mobile/app/(main)/face-enrollment.tsx` | Componente — pasar `locationId` del device context al query |

---

## Task 1 — Agregar `locationId` al tipo de query params

**Files:** `apps/mobile/lib/query-keys.ts`

- [ ] **Step 1.1** — En el tipo `FaceEnrollmentEmployeeListQueryParams` (linea 18), agregar `locationId`:

```typescript
// Antes
export interface FaceEnrollmentEmployeeListQueryParams {
  organizationId?: string | null;
  limit?: number;
  [key: string]: unknown;
}

// Despues
export interface FaceEnrollmentEmployeeListQueryParams {
  organizationId?: string | null;
  locationId?: string | null;
  limit?: number;
  [key: string]: unknown;
}
```

Esto asegura que React Query invalide y refetch cuando el `locationId` cambie (ej. al reconfigurarse el dispositivo).

- [ ] **Step 1.2** — Verificar type check:

```bash
cd apps/mobile && bunx tsc --noEmit
```

---

## Task 2 — Propagar `locationId` en la funcion de fetch

**Files:** `apps/mobile/lib/client-functions.ts`

- [ ] **Step 2.1** — Agregar `locationId` al tipo `FaceEnrollmentEmployeesParams` (~linea 518):

```typescript
// Antes
export interface FaceEnrollmentEmployeesParams extends FaceEnrollmentEmployeeListQueryParams {
  status?: 'ACTIVE';
}

// Despues
export interface FaceEnrollmentEmployeesParams extends FaceEnrollmentEmployeeListQueryParams {
  status?: 'ACTIVE';
  locationId?: string | null;
}
```

> Nota: `locationId` ya esta heredado de `FaceEnrollmentEmployeeListQueryParams`, pero declararlo explicitamente mejora la legibilidad. Si se prefiere evitar duplicacion, omitir esta redeclaracion es valido.

- [ ] **Step 2.2** — En `fetchFaceEnrollmentEmployees()`, dentro del while loop (~linea 548), agregar el tipo `locationId` al objeto `query` y la condicion para enviarlo:

```typescript
const query: {
  limit: number;
  offset: number;
  status: 'ACTIVE';
  organizationId?: string;
  locationId?: string;
} = {
  limit: Math.min(apiPageLimit, requestedLimit - employees.length),
  offset,
  status: 'ACTIVE',
};

if (params?.organizationId) {
  query.organizationId = params.organizationId;
}

if (params?.locationId) {
  query.locationId = params.locationId;
}
```

- [ ] **Step 2.3** — Verificar type check:

```bash
cd apps/mobile && bunx tsc --noEmit
```

---

## Task 3 — Pasar `locationId` desde el componente de Face Enrollment

**Files:** `apps/mobile/app/(main)/face-enrollment.tsx`

- [ ] **Step 3.1** — En el componente `FaceEnrollmentScreen`, el `locationId` ya esta disponible via `settings?.locationId`. Actualizar el `employeeQueryParams` memo (~linea 145) para incluirlo:

```typescript
// Antes
const employeeQueryParams = useMemo(
  () => ({
    limit: EMPLOYEE_FETCH_LIMIT,
    organizationId,
  }),
  [organizationId],
);

// Despues
const locationId = settings?.locationId ?? null;

const employeeQueryParams = useMemo(
  () => ({
    limit: EMPLOYEE_FETCH_LIMIT,
    organizationId,
    locationId,
  }),
  [organizationId, locationId],
);
```

> Nota: `locationId` se extrae a una variable para que sea una dependencia estable del `useMemo`.

- [ ] **Step 3.2** — Verificar type check:

```bash
cd apps/mobile && bunx tsc --noEmit
```

---

## Task 4 — Verificacion funcional

- [ ] **Step 4.1** — Ejecutar la app en simulador/dispositivo con un dispositivo configurado en una sucursal especifica.
- [ ] **Step 4.2** — Abrir Face Enrollment y confirmar que solo se ven empleados de esa sucursal.
- [ ] **Step 4.3** — Cambiar la sucursal del dispositivo en Settings y confirmar que la lista se actualiza automaticamente.
- [ ] **Step 4.4** — Si es posible, probar con un dispositivo sin locationId y confirmar que se ven todos los empleados.

---

## Self-Review

- [ ] El tipo `FaceEnrollmentEmployeeListQueryParams` incluye `locationId` para que el query key invalide correctamente.
- [ ] La funcion `fetchFaceEnrollmentEmployees()` propaga `locationId` al `GET /employees`.
- [ ] Cuando `locationId` es `null`, no se envia el parametro (comportamiento de fallback).
- [ ] El `useMemo` en el componente incluye `locationId` en las dependencias.
- [ ] No se modificaron endpoints del API.
- [ ] El type check de TypeScript pasa sin errores.
