---
name: Landing + privacidad
overview: Crear una landing pública en apps/web con UI consistente (incluyendo componentes de Aceternity UI) y una página pública de Política de Privacidad (por permiso de cámara), asegurando que / muestre la landing y /login lleve al login existente.
todos:
    - id: routes-marketing
      content: Crear route group (marketing) con landing en / y política en /privacidad; eliminar el redirect actual a /dashboard y resolver colisión de rutas /.
      status: pending
    - id: login-alias
      content: Agregar /login como alias que redirige a /sign-in y enlazarlo desde el header de la landing.
      status: pending
      dependencies:
          - routes-marketing
    - id: middleware-protect
      content: Crear/activar middleware de protección de rutas (reusar lógica de apps/web/proxy.ts), asegurando que dashboard quede protegido y landing/política queden públicas.
      status: pending
      dependencies:
          - routes-marketing
    - id: aceternity-components
      content: Integrar 1–2 componentes estilo Aceternity UI (mínimo CardStack) usando Motion; agregar dependencia motion y componentes en apps/web/components.
      status: pending
      dependencies:
          - routes-marketing
    - id: i18n-content
      content: Agregar llaves de traducción Landing.* y PrivacyPolicy.* a apps/web/messages/es.json y consumirlas con next-intl (incluyendo t.rich para links).
      status: pending
      dependencies:
          - routes-marketing
---

# Landing pública + Política de Privacidad (cámara)

## Objetivo

- Convertir `apps/web` en un sitio **mixto**:
- **Marketing público** en `/` (landing) y `/privacidad` (política)
- **App admin protegida** en rutas del dashboard (p. ej. `/dashboard`, `/employees`, etc.)
- Incluir un **botón de login** visible en la landing.
- Cumplir con `AGENTS.md` (strings en español vía `next-intl`, tipado estricto, JSDoc, DateFns, etc.).
- Integrar componentes inspirados en [Aceternity UI](https://ui.aceternity.com/) y, si se usa el flujo de instalación, referenciar su [CLI](https://ui.aceternity.com/docs/cli).

## Hallazgos relevantes del repo

- Hoy `/` **redirige a** `/dashboard` en [`apps/web/app/page.tsx`](apps/web/app/page.tsx).
- Existe también [`apps/web/app/(dashboard)/page.tsx`](<apps/web/app/(dashboard)/page.tsx>), que también redirige a `/dashboard` y **puede generar conflicto de ruta** (ambas mapean a `/` por ser route group).
- `apps/web` ya tiene `next-intl`, Tailwind y UI tipo shadcn.
- La app móvil (`apps/mobile`) usa `expo-camera` y envía una foto (base64) al API `/recognition/identify` para verificación; el API usa **Amazon Rekognition** (User Vectors). Esto debe reflejarse en la política.

## Enfoque de implementación

### 1) Rutas: separar “marketing” y “dashboard” con route groups

- Crear un nuevo route group **`(marketing)`** para servir landing y política:
- [`apps/web/app/(marketing)/layout.tsx`](<apps/web/app/(marketing)/layout.tsx>)
    - Header con logo/nombre, `ThemeModeToggle` y botón principal **“Iniciar sesión”** (link a `/login` o `/sign-in`).
    - Footer con links a `/privacidad`.
- [`apps/web/app/(marketing)/page.tsx`](<apps/web/app/(marketing)/page.tsx>)
    - Landing de marketing (secciones: hero, features web, features móvil, cómo funciona, seguridad/privacidad, CTA).
- [`apps/web/app/(marketing)/privacidad/page.tsx`](<apps/web/app/(marketing)/privacidad/page.tsx>)
    - Página pública de Política de Privacidad (texto del anexo).
- Eliminar el comportamiento actual de “siempre ir al dashboard”:
- Reemplazar/retirar [`apps/web/app/page.tsx`](apps/web/app/page.tsx) (ya no debe redirigir a `/dashboard`).
- Retirar [`apps/web/app/(dashboard)/page.tsx`](<apps/web/app/(dashboard)/page.tsx>) para evitar colisión de `/`.

> Resultado: navegar a `https://tu-dominio/` siempre cae en la landing.

### 2) Ruta de login “bonita”

- Crear [`apps/web/app/login/page.tsx`](apps/web/app/login/page.tsx) como alias que **redirija** a `/sign-in`.
- Mantener `/sign-in` como implementación real (ya existe en `app/(auth)/sign-in/page.tsx`).

### 3) Protección de rutas del dashboard (middleware)

- Activar/centralizar el “route protection” creando **middleware real de Next.js**:
- Mover o reutilizar la lógica existente de [`apps/web/proxy.ts`](apps/web/proxy.ts) dentro de [`apps/web/middleware.ts`](apps/web/middleware.ts).
- Extender:
    - Agregar `/login` a `authPages`.
    - (Opcional recomendado) incluir `callbackUrl` al redirigir a `/sign-in` para volver al destino original.
    - Confirmar que `/` y `/privacidad` **NO** estén en los matchers (deben quedar públicos).

> Esto asegura que el usuario sólo ve el dashboard si tiene sesión; de lo contrario va a login.

### 4) Componentes estilo Aceternity UI (con Motion)

- Elegir 1–2 componentes para mantener consistencia visual. Propuesta:
- **CardStack** (para “testimonios” o “casos de uso”) basado en el ejemplo de [Aceternity UI](https://ui.aceternity.com/).
- (Opcional) un fondo/hero con gradientes/animación ligera (sin sobrecargar el bundle).
- Dependencias:
- Agregar `motion` en `apps/web` (para usar `import { motion } from "motion/react"` como recomienda la documentación de Motion).
- Implementación sugerida:
- [`apps/web/components/aceternity/card-stack.tsx`](apps/web/components/aceternity/card-stack.tsx)
    - `use client`.
    - Tipado estricto (sin `any`).
    - `interval` tipado como `ReturnType<typeof setInterval> | null`.
    - JSDoc en componentes y helpers.

### 5) i18n (next-intl) y contenido en español

- Agregar nuevas llaves a [`apps/web/messages/es.json`](apps/web/messages/es.json):
- `Landing.*` para toda la landing.
- `PrivacyPolicy.*` para la política.
- Para links dentro del texto, usar `t.rich` (recomendado por `next-intl`) para renderizar `<Link />` y listas sin `dangerouslySetInnerHTML`.

### 6) Registro en Google Play Console

- Una vez desplegado, en Play Console registrar la URL pública:
- `https://<tu-dominio>/privacidad`

## Anexo A — Texto de Política de Privacidad (listo para pegar)

**Política de Privacidad — SEN CheckInÚltima actualización:** 2026-01-07

### 1. Responsable del tratamiento

El responsable del tratamiento de los datos personales descritos en esta Política es la entidad que opera el servicio **SEN CheckIn** (en adelante, “SEN CheckIn”, “nosotros” o “el Servicio”).

- **Nombre/Razón social:** [COMPLETAR]
- **Domicilio:** [COMPLETAR]
- **Correo de contacto de privacidad:** [COMPLETAR]

Si usas SEN CheckIn a través de tu empleador o una organización, es posible que **tu organización** sea el responsable (y SEN CheckIn actúe como **encargado**) respecto de ciertos datos (por ejemplo, registros de asistencia y enrolamiento biométrico). En esos casos, también aplican los avisos internos de tu organización.

### 2. Alcance

Esta Política aplica al uso de:

- La **aplicación móvil** SEN CheckIn (por ejemplo, el módulo de verificación con cámara para registro de asistencia).
- El **portal web** SEN CheckIn (por ejemplo, administración de empleados, dispositivos, horarios, y el enrolamiento de rostro con webcam o carga de imagen).

### 3. Datos personales que tratamos

Dependiendo de tu rol (administrador, operador, empleado) y del uso del Servicio, podemos tratar:**3.1 Datos de cuenta y administración**

- Identificadores de cuenta (p. ej., correo electrónico, nombre visible, rol).
- Organización/tenant y permisos.

**3.2 Datos laborales/operativos**

- Información de empleados (p. ej., nombre, apellidos, código de empleado, asignación de ubicación/dispositivo).
- Registros de asistencia (check-in/check-out), fecha y hora, dispositivo usado y metadatos operativos.

**3.3 Datos biométricos y fotografías (reconocimiento facial)**Para habilitar el registro de asistencia por reconocimiento facial, se tratan datos relacionados con el rostro:

- **Imágenes capturadas por cámara** (móvil o webcam web) para:
- Enrolamiento (registrar un rostro para futuras verificaciones), o
- Verificación (confirmar identidad en un check-in/check-out).
- **Plantillas/vectores faciales y/o identificadores de rostro** generados por el proveedor de reconocimiento (Amazon Rekognition) durante el enrolamiento. Estos datos se asocian a un identificador de empleado para permitir la coincidencia posterior.

**Importante:** El Servicio utiliza la cámara para **capturar una fotografía** (no graba audio). La captura se usa para procesamiento de reconocimiento facial y para registrar asistencia.**3.4 Datos técnicos**

- Cookies/sesión, dirección IP, user-agent, registros de seguridad y diagnóstico.

### 4. Uso de la cámara (permiso CAMERA) y reconocimiento facial

**4.1 App móvil**La app solicita el permiso de **CÁMARA** para permitir la captura de una imagen del rostro y enviarla al Servicio con el fin de:

- Identificar al empleado (si existe enrolamiento previo), y
- Registrar un evento de asistencia (entrada/salida) asociado al dispositivo.

Si no otorgas el permiso de cámara, no podrás usar las funciones que dependen de reconocimiento facial.**4.2 Portal web**El portal web puede solicitar acceso a la **webcam** del navegador únicamente cuando un administrador elige la opción de capturar una foto para enrolamiento. Alternativamente, puede cargarse una imagen desde archivo.

### 5. Finalidades del tratamiento

Tratamos los datos para:

- Operar el Servicio de control de asistencia (registro de entradas/salidas).
- Administrar empleados, dispositivos, ubicaciones y horarios.
- Enrolar y verificar identidad por reconocimiento facial para reducir fraude/suplantación.
- Mantener la seguridad del Servicio (auditoría, prevención de abuso, cumplimiento).
- Cumplir obligaciones legales aplicables (p. ej. laborales/contables, según corresponda a tu organización).

### 6. Base legal y consentimiento

Cuando la funcionalidad requiere cámara/reconocimiento facial, la base principal es tu **consentimiento** (y/o la necesidad de ejecutar el servicio solicitado por tu organización). Puedes retirar el consentimiento dejando de usar la función y solicitando la eliminación del enrolamiento biométrico (ver sección 10).

### 7. Conservación y eliminación

- **Imágenes de verificación (capturas para identificar)**: se utilizan para el proceso de verificación y, en general, **no se almacenan como fotografías** por el Servicio (salvo registros técnicos mínimos necesarios para seguridad/diagnóstico, si aplican).
- **Datos biométricos enrolados (vectores/plantillas)**: se conservan mientras el enrolamiento esté activo. Un administrador puede **eliminar el enrolamiento** del empleado; esto elimina los datos biométricos asociados en el proveedor de reconocimiento.
- **Registros de asistencia**: se conservan por el tiempo necesario para prestar el Servicio y cumplir obligaciones de la organización.

### 8. Transferencias y terceros

Para operar el reconocimiento facial, el Servicio utiliza proveedores:

- **Amazon Web Services — Rekognition** (procesamiento/almacenamiento de plantillas o identificadores necesarios para el reconocimiento).

También podemos usar proveedores de infraestructura (hosting, monitoreo) estrictamente para operar el Servicio.No vendemos tus datos personales.

### 9. Medidas de seguridad

Implementamos medidas razonables de seguridad administrativas, técnicas y físicas, incluyendo controles de acceso y segregación por organización, para proteger los datos contra pérdida, uso indebido y acceso no autorizado.

### 10. Derechos y solicitudes

Puedes solicitar (según aplique) acceso, corrección, actualización o eliminación de datos personales.En particular, para **datos biométricos**:

- Puedes solicitar la **eliminación del enrolamiento facial** (a través de un administrador o mediante el canal de privacidad).

Envía tu solicitud a: **[COMPLETAR]**

### 11. Privacidad de menores

El Servicio no está dirigido a menores de edad y debe ser usado conforme a las políticas de la organización.

### 12. Cambios a esta Política

Podemos actualizar esta Política para reflejar cambios legales o técnicos. Publicaremos la versión vigente en esta misma URL.---

## Checklist de aceptación (lo que debe quedar listo al final)

- `/` muestra landing pública.
- `/login` existe y lleva a `/sign-in`.
