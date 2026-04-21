# FEAT: Filtrar empleados de la app movil por sucursal del dispositivo

**Fecha:** 2026-04-21
**Rama:** `feat/mobile-employee-location-filter`
**PR destino:** `main`

## Contexto

La pantalla de Face Enrollment en `apps/mobile/app/(main)/face-enrollment.tsx` carga la lista de empleados activos para que el operador seleccione a quien enrolar. Actualmente, la funcion `fetchFaceEnrollmentEmployees()` solo filtra por `organizationId` y `status: 'ACTIVE'`, pero **no filtra por la sucursal (location) del dispositivo**. Esto significa que un dispositivo registrado en la sucursal "Centro" ve a TODOS los empleados de la organizacion, incluyendo los de las sucursales "Norte", "Sur", etc.

El usuario solicito que la app movil filtre los empleados a la sucursal a la que esta registrado el dispositivo.

## Estado actual

### Flujo de carga de empleados

1. `face-enrollment.tsx` obtiene `organizationId` de `useDeviceContext().settings`.
2. Llama a `fetchFaceEnrollmentEmployees({ limit: 200, organizationId })`.
3. `fetchFaceEnrollmentEmployees()` en `client-functions.ts` hace `GET /employees` con `status=ACTIVE` y `organizationId`.
4. **No se pasa `locationId`** en ningun punto de la cadena.

### Soporte existente en el API

El endpoint `GET /employees` ya acepta `locationId` como query parameter opcional (validado como UUID). El backend ya filtra empleados por ubicacion cuando se pasa este parametro. **No se requiere ningun cambio en el backend.**

### Datos disponibles en el cliente

El `DeviceContext` ya tiene `settings.locationId` disponible desde el momento en que el dispositivo completa su configuracion en device-setup. Este valor se persiste en SecureStore y se refresca desde el servidor.

## Objetivo

Filtrar la lista de empleados en Face Enrollment para mostrar unicamente los empleados asignados a la misma sucursal (locationId) del dispositivo. Si el dispositivo no tiene locationId configurado, se mantiene el comportamiento actual (mostrar todos los empleados de la organizacion).

## Enfoque recomendado

Pasar el `locationId` del device context como parametro adicional a `fetchFaceEnrollmentEmployees()`, propagandolo hasta el query parameter del `GET /employees`.

### Razones

- El API ya soporta el filtro — cero cambios en backend.
- El `locationId` ya esta disponible en el device context — cero infraestructura nueva.
- El cambio es de dos puntos: la funcion de fetch y el componente que la invoca.
- Fallback natural: si `locationId` es `null`, el parametro no se envia y se obtienen todos los empleados.

## Diseno tecnico

### 1. Extender `FaceEnrollmentEmployeesParams`

En `client-functions.ts`, el tipo ya extiende `FaceEnrollmentEmployeeListQueryParams`. Necesitamos agregar `locationId` como parametro opcional:

```typescript
export interface FaceEnrollmentEmployeesParams extends FaceEnrollmentEmployeeListQueryParams {
  status?: 'ACTIVE';
  locationId?: string | null;
}
```

### 2. Propagar `locationId` en el query del fetch

En `fetchFaceEnrollmentEmployees()`, agregar `locationId` al objeto `query` dentro del while loop:

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

### 3. Pasar `locationId` desde `face-enrollment.tsx`

En el componente, obtener `locationId` del device context y pasarlo al query:

```typescript
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

### 4. Actualizar query keys para invalidacion correcta

En `query-keys.ts`, asegurarse de que el tipo `FaceEnrollmentEmployeeListQueryParams` incluya `locationId` para que React Query invalide correctamente al cambiar de ubicacion:

```typescript
export type FaceEnrollmentEmployeeListQueryParams = {
  limit?: number;
  organizationId?: string | null;
  locationId?: string | null;
};
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/mobile/lib/client-functions.ts` | Agregar `locationId` a `FaceEnrollmentEmployeesParams` y propagarlo al query de `fetchFaceEnrollmentEmployees()` |
| `apps/mobile/app/(main)/face-enrollment.tsx` | Pasar `locationId` del device context a los parametros del query |
| `apps/mobile/lib/query-keys.ts` | Agregar `locationId` al tipo `FaceEnrollmentEmployeeListQueryParams` |

## Edge cases

1. **Dispositivo sin locationId:** Si `settings.locationId` es `null` (dispositivo no configurado completamente), no se envia el parametro y se obtienen todos los empleados de la organizacion — mismo comportamiento actual.
2. **Empleado sin locationId:** Si un empleado tiene `locationId: null` en la base de datos, el backend no lo incluira en el filtro por ubicacion. Esto es correcto: empleados no asignados a ninguna sucursal no aparecen en dispositivos filtrados por sucursal.
3. **Cambio de sucursal del dispositivo:** Si el operador cambia la sucursal del dispositivo en Settings, el `locationId` en el context cambia, el `queryKey` cambia, y React Query refetch automaticamente la lista correcta.
4. **Lista vacia:** Si no hay empleados asignados a la sucursal del dispositivo, se muestra el empty state existente. No se necesita UI adicional.

## Criterios de aceptacion

- [ ] Un dispositivo registrado en la sucursal "Centro" solo ve empleados asignados a "Centro" en Face Enrollment.
- [ ] Un dispositivo sin locationId configurado ve todos los empleados activos de la organizacion.
- [ ] Cambiar la sucursal del dispositivo en Settings refresca la lista de empleados automaticamente.
- [ ] No se modifica ningun endpoint del API.
- [ ] El scanner/reconocimiento facial sigue funcionando con cualquier empleado que aparezca en la lista (no se filtra el reconocimiento, solo el enrollment).
- [ ] El type check de TypeScript pasa sin errores.
