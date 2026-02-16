# Release 14 - Registro Facial de Empleados en Mobile

## Objetivo

Habilitar en `apps/mobile` un flujo dedicado para registrar y re-registrar rostros de empleados activos desde la app, reutilizando los endpoints existentes de Rekognition sin cambios en APIs públicas.

## Skill UI utilizado

Skill usado para UI: `building-ui`.

## UX final

- Nueva pantalla: `/(main)/face-enrollment`.
- Acceso directo desde la barra superior del escáner.
- Requisitos previos del dispositivo:
    - Dispositivo vinculado (`deviceId`).
    - Ubicación configurada (`locationId`).
- Selección de empleados:
    - Solo empleados `ACTIVE`.
    - Límite de carga: 200 registros.
    - Búsqueda local por nombre/código.
    - Badge por empleado: `Registrado` / `Sin registro`.
    - Aviso visible si el total supera el límite cargado.
- Flujo de captura:
    - Cámara en vivo.
    - Cámara frontal por defecto.
    - Botón para cambiar a cámara trasera.
    - Capturar -> vista previa -> confirmar.
- Resultado post-éxito (misma pantalla):
    - Resumen ligero de operación.
    - Acciones: `Registrar otro` y `Volver al escáner`.

## Endpoints utilizados (sin cambios)

- `POST /employees/:id/create-rekognition-user`
- `POST /employees/:id/enroll-face`

## Lógica de enrolamiento mobile

1. Si el empleado no tiene `rekognitionUserId`, se intenta crear usuario en Rekognition.
2. Si `create-rekognition-user` responde `REKOGNITION_USER_EXISTS` (409), el flujo continúa automáticamente.
3. Se ejecuta `enroll-face` con imagen base64.
4. Si `enroll-face` responde `REKOGNITION_USER_MISSING`, se intenta crear usuario y reintentar enrolamiento.

## Privacidad

- La imagen capturada se mantiene en memoria solo durante el flujo de confirmación.
- Tras éxito, la imagen se limpia inmediatamente del estado local.
- No se agregó almacenamiento persistente de imágenes en mobile.

## Pruebas implementadas

### API (contrato)

Archivo: `apps/api/src/routes/employees.contract.test.ts`

- Caso de éxito en enrolamiento.
- Error `REKOGNITION_USER_MISSING`.
- Error `INVALID_IMAGE_BASE64`.

### Mobile (Expo oficial)

Configuración agregada:

- `apps/mobile/jest.config.js` (preset `jest-expo`)
- `apps/mobile/jest.setup.ts`
- `apps/mobile/types/jest.d.ts`

Tests agregados:

- `apps/mobile/app/(main)/face-enrollment.test.tsx`
    - Render de pantalla.
    - Selección de empleado.
    - Submit y éxito.
    - Manejo de errores de API.
- `apps/mobile/lib/client-functions.face-enrollment.test.ts`
    - Flujo create + enroll.
    - Continuidad automática cuando create responde 409 (`REKOGNITION_USER_EXISTS`).
    - Retry cuando enroll responde `REKOGNITION_USER_MISSING`.

## QA manual sugerido

1. Iniciar sesión en mobile con sesión activa.
2. Entrar a escáner y abrir `Registro facial` desde top bar.
3. Validar bloqueo cuando falta `deviceId` o `locationId`.
4. Buscar empleado activo por nombre/código y revisar badge de estado.
5. Capturar con cámara frontal y confirmar enrolamiento.
6. Repetir cambiando a cámara trasera.
7. Verificar resumen de éxito y botones `Registrar otro` / `Volver al escáner`.
8. Forzar errores (imagen inválida o empleado sin usuario Rekognition) y validar mensajes mostrados.
