---
name: Superusuario y permisos
overview: Implementar un rol de superusuario (plataforma) con capacidad global para crear organizaciones/usuarios y asignar miembros, corregir la revocación de sesión al crear miembros, y bloquear completamente el acceso del rol de organización `member` al portal de administración (apps/web).
todos:
  - id: role-model
    content: "Confirmar/implementar el modelo de roles: superusuario = platform `user.role === admin`, admin de org = member.role admin/owner, member bloqueado del portal."
    status: pending
  - id: deny-member-portal
    content: Agregar guard en `apps/web/app/(dashboard)/layout.tsx` usando `organization.getActiveMemberRole` + nueva página `app/acceso-restringido` + ocultar nav en `AppSidebar`.
    status: pending
    dependencies:
      - role-model
  - id: fix-session-revoke
    content: Reemplazar `createOrganizationUser` por un endpoint del API `POST /organization/provision-user` que cree user vía sign-up email + agregue member sin tocar cookies del caller; actualizar action web y validar que no revoca sesión.
    status: pending
    dependencies:
      - role-model
  - id: superuser-global-admin
    content: Restringir creación de organización en `apps/api/utils/auth.ts` (allowUserToCreateOrganization) y agregar endpoints globales (listar orgs, consultar miembros cross-org, add-member para super).
    status: pending
    dependencies:
      - role-model
  - id: web-superuser-ui
    content: "Actualizar `/users` y `/organizations` UI para superusuario: selector de organización, creación/asignación de usuarios, DataTable + TanStack Form + i18n."
    status: pending
    dependencies:
      - superuser-global-admin
      - deny-member-portal
---

# Superusuario + autorización de rutas + fix de sesión (apps/web)

## Contexto y reglas a seguir

- **Cumplir estrictamente** con: `AGENTS.md`, `documentacion/release-06-form-architecture.md`, `apps/web/docs/data-table-architecture.md`, `documentacion/release-04-query-fetch-architecture.md`, `documentacion/release-08-organization-architecture.md`.
- **Tipado estricto + JSDoc** en todo TypeScript.
- **Cadenas UI en español** vía `next-intl` (`apps/web/messages/es.json`).
- **Fechas** con `date-fns`.

## Modelo de roles (alineado a tu requerimiento)

- **Superusuario (plataforma)**: `user.role === 'admin'` (BetterAuth admin plugin). Tiene facultades globales: crear organizaciones, crear usuarios y asignar usuarios a cualquier organización.
- **Admin de organización**: `member.role ∈ { 'owner', 'admin' }` (BetterAuth organization plugin). Administra recursos *solo de su organización*.
- **Member de organización**: `member.role === 'member'`. **No puede acceder** al portal web de administración (rutas del grupo `(dashboard)`), ni aunque escriba la URL.

> Nota: conservamos `user.role === 'admin'` como “superusuario” para evitar migraciones grandes. En la UI lo etiquetamos como **Superusuario** y a la pertenencia organizacional como **Admin/Miembro**.

## Fix 1 — Bloquear completamente a `member` del portal de administración

### Backend (fuente de verdad)

- Resolver el rol organizacional activo con BetterAuth:
- Usar `organization.getActiveMemberRole()`/`getActiveMember()` (BetterAuth org plugin) para determinar si el usuario es `owner/admin/member` en la organización activa.

### Web (enforcement en servidor)

- En `[apps/web/app/(dashboard)/layout.tsx](apps/web/app/\\\(dashboard)/layout.tsx)`:
- Obtener sesión (platform role) **y** rol de miembro activo (org role).
- Si **NO** es superusuario y el rol de miembro **NO** es `admin|owner`, **redirigir** a una nueva ruta pública (fuera de `(dashboard)`) `app/acceso-restringido/page.tsx`.
- Mantener el comportamiento de `NoOrganizationState` (release-08) cuando el usuario no tiene organización.

### UI (defensa en profundidad)

- En [`apps/web/components/app-sidebar.tsx`](apps/web/components/app-sidebar.tsx):
- No renderizar navegación de “Administración” para usuarios sin `admin|owner` (org) y sin superusuario.
- (Opcional) Agregar sección “Superusuario” para herramientas globales.

### Página de acceso restringido

- Crear [`apps/web/app/acceso-restringido/page.tsx`](apps/web/app/acceso-restringido/page.tsx):
- Texto en español via `next-intl` (ej. “Tu cuenta no tiene permisos para entrar al portal de administración.”)
- CTA: cerrar sesión o volver al inicio.

## Fix 2 — “Crear miembro” no debe revocar sesión

### Hipótesis probable

Hoy `apps/web/actions/users.ts` crea un usuario con `serverAuthClient.admin.createUser()` (BetterAuth admin endpoint) y luego llama a `/organization/add-member-direct`. Este flujo puede provocar efectos colaterales de cookies/sesión en el contexto de Server Actions.

### Solución robusta (sin tocar cookies del caller)

- Mover el “provisionamiento” (crear usuario + asignarlo a org) al **API service** y que el web action solo invoque un endpoint propio.

#### API: nuevo endpoint de provisionamiento

- En [`apps/api/src/routes/organization.ts`](apps/api/src/routes/organization.ts) agregar `POST /organization/provision-user`:
- Auth: `authPlugin`.
- Autorización: permitir si el caller es **org admin/owner** en `organizationId` **o** si es superusuario (`session.user.role === 'admin'`).
- Crear usuario usando **sign-up email con username** (`/sign-up/email`, username plugin) **sin reutilizar headers/cookies del caller**.
- Agregar miembro vía `auth.api.addMember({ body: { userId, organizationId, role } })` **sin pasar headers** (server-only), ya que el authz ya se hizo en el endpoint.
- Rollback best-effort: si falla el alta de member, borrar el user recién creado.

#### Web: acción que llama al endpoint del API

- En [`apps/web/actions/users.ts`](apps/web/actions/users.ts):
- Reemplazar el uso de `serverAuthClient.admin.createUser()` por una llamada al API (`api.organization['provision-user']... `o `fetch` tipado) para evitar side-effects.
- Mantener la misma interfaz `CreateOrganizationUserInput` pero con validaciones y errores consistentes.

#### Verificación

- Probar manualmente: crear miembro como org admin; confirmar que:
- El usuario creador **permanece logueado**.
- La tabla de miembros refresca (React Query invalidation).

## Feature — Superusuario global (orgs + users + asignación cross-org)

### API: habilitar y limitar creación de organizaciones

- En [`apps/api/utils/auth.ts`](apps/api/utils/auth.ts):
- Cambiar `allowUserToCreateOrganization` a función:
    - `async (user) => user.role === 'admin'`
- Esto asegura que **solo superusuario** puede crear organizaciones (cumple tu requerimiento).

### API: endpoints para administración global

- Extender [`apps/api/src/routes/organization.ts`](apps/api/src/routes/organization.ts):
- `GET /organization/members`: permitir a superusuario consultar miembros de cualquier org (sin requerir pertenencia).
- `POST /organization/add-member-direct`: permitir a superusuario agregar miembros a cualquier org.
- `GET /organization/all`: listar **todas** las organizaciones con paginación/búsqueda (solo superusuario).

### Web: UX para superusuario

- En `[apps/web/app/(dashboard)/users/users-client.tsx](apps/web/app/\\\(dashboard)/users/users-client.tsx)`:
- Si es superusuario: mostrar selector de organización (usa `GET /organization/all`).
- Reusar el mismo formulario (TanStack Form toolkit) para crear usuario y asignarlo a la org seleccionada.
- Agregar acción “Asignar usuario existente” (usa `authClient.admin.listUsers` + `POST /organization/add-member-direct`).
- En `[apps/web/app/(dashboard)/organizations/organizations-client.tsx](apps/web/app/\\\(dashboard)/organizations/organizations-client.tsx)`:
- Ocultar/inhabilitar “Crear organización” si **no** es superusuario.
- (Opcional) Para superusuario, usar el endpoint global `GET /organization/all` en vez de `authClient.organization.list()`.

## Query/Fetch + i18n (release-04)

- Agregar/ajustar fetchers:
- [`apps/web/lib/client-functions.ts`](apps/web/lib/client-functions.ts) para `fetchAllOrganizations`.
- [`apps/web/lib/server-client-functions.ts`](apps/web/lib/server-client-functions.ts) para la variante server con header forwarding.
- [`apps/web/lib/server-functions.ts`](apps/web/lib/server-functions.ts) prefetch correspondiente (sin `await`).
- Agregar query keys:
- [`apps/web/lib/query-keys.ts`](apps/web/lib/query-keys.ts) (ej. `queryKeys.super.organizationsAll.list(params)`), evitando colisiones con `organizations.list()`.
- UI strings:
- [`apps/web/messages/es.json`](apps/web/messages/es.json) para `AccesoRestringido`, `Superusuario`, textos/labels/toasts nuevos.

## Nota sobre `proxy.ts` (middleware)

- En este proyecto, **`apps/web/proxy.ts` es la nomenclatura/entrypoint de middleware** (equivalente a `middleware.ts`) **según la documentación que estás siguiendo**, así que **está correcto mantenerlo así**.
- Cualquier ajuste de protección/redirecciones (auth pages vs rutas protegidas) se hará **dentro de `apps/web/proxy.ts`** y su `config.matcher`, sin introducir un `middleware.ts` adicional.

## Diagrama (alto nivel)

```mermaid
flowchart TD
  user[User] --> web[apps/web]
  web -->|cookies| authProxy[web /api/auth proxy]
  authProxy --> apiAuth[apps/api /api/auth]
  web --> api[apps/api protected routes]
  api --> orgRoutes[/organization/*]
  apiAuth --> betterAuth[BetterAuth]
  orgRoutes --> db[(Postgres)]

  web -->|layoutGuard| gate[DashboardLayoutAuthZ]
  gate -->|memberDenied| denied[acceso-restringido]
  gate -->|adminOrSuper| dashboard[DashboardPages]


```