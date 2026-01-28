---
name: payroll-receipts-pdf-zip
overview: Agregar descarga de recibos de nómina (PDF) por empleado y en ZIP para una ejecución PROCESADA, accesible desde el historial por periodo/fecha; incluir recibo imprimible (PDF) de baja/finiquito con firma.
todos:
  - id: api-run-detail-employee-fields
    content: Modificar `GET /payroll/runs/:id` para incluir `employeeName` y `employeeCode` en cada línea (join con `employee`).
    status: pending
  - id: employee-identifiers
    content: Agregar campos opcionales `nss` y `rfc` en `employee` (DB+API+Web) para mostrarlos en recibos cuando existan.
    status: pending
  - id: termination-receipt-api
    content: Agregar endpoints API para (1) obtener el settlement de terminación (último) y (2) obtener el último payroll run PROCESADO del empleado con `taxBreakdown` para el resumen fiscal del recibo.
    status: pending
  - id: termination-receipt-pdf
    content: Implementar PDF de recibo de baja/finiquito (firma) en Next.js route y conectarlo al UI de empleados (descarga post-terminación + re-descarga).
    status: pending
  - id: web-types-run-detail
    content: Actualizar `PayrollRunEmployee` + `fetchPayrollRunDetail()` en `apps/web/lib/client-functions.ts` para manejar los nuevos campos.
    status: pending
  - id: web-ui-receipts-dialog
    content: Agregar columna de acciones en historial y crear diálogo “Recibos” con descargas individual/ZIP en `apps/web/app/(dashboard)/payroll/`.
    status: pending
  - id: pdf-generator
    content: Agregar utilidad `buildPayrollReceiptPdf()` con `pdf-lib` para renderizar el recibo en PDF con área de firma y secciones tipo la imagen.
    status: pending
  - id: next-routes-downloads
    content: Implementar routes Next.js para descargar PDF individual y ZIP de todos los recibos (con `jszip`).
    status: pending
  - id: tests-e2e-and-contract
    content: "Añadir/ajustar pruebas: contract API para campos nuevos y Playwright e2e para descargas (ZIP/PDF)."
    status: pending
  - id: run-checks
    content: Ejecutar tests + lint + check-types al final y corregir cualquier fallo.
    status: pending
isProject: false
---

# Recibos de nómina (PDF + ZIP)

## Alcance

- Generar **recibos tipo “comprobante”** en **PDF** para cada empleado de una **nómina PROCESADA**.
- Permitir descargar:
- **Un recibo individual** (PDF)
- **Todos los recibos del run** en un **ZIP** (un PDF por empleado)
- Permitir descargar recibos de **cualquier periodo pasado** usando el **historial de ejecuciones**.

## Cambios necesarios (API)

- Actualizar el endpoint de detalle de run para incluir datos mínimos del empleado (para nombrar/mostrar recibos):
- Archivo: [apps/api/src/routes/payroll.ts](apps/api/src/routes/payroll.ts)
- Cambio: en `GET /payroll/runs/:id` hacer `join` con `employee` y devolver por cada línea:
- `employeeName` (nombre completo)
- `employeeCode`
- Motivo: `payroll_run_employee` no almacena nombre/código; el UI y los PDFs lo necesitan.
- Campos opcionales para recibos (si existen en la empresa/empleado):
- Agregar `employee.nss` y `employee.rfc` (nullable) en [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts) y exponerlos en `employees` create/update/detail.

## Cambios necesarios (Web UI)

- Actualizar tipos y normalización del detalle de run:
- Archivo: [apps/web/lib/client-functions.ts](apps/web/lib/client-functions.ts)
- Cambio: extender `PayrollRunEmployee` con `employeeName` y `employeeCode`, y ajustar `fetchPayrollRunDetail()` para conservarlos.

- Añadir acciones de “Recibos” al historial:
- Archivo: [apps/web/app/(dashboard)/payroll/payroll-client.tsx](apps/web/app/\\\\\\\\\\\\\(dashboard)/payroll/payroll-client.tsx)
- Cambio: agregar una columna `actions` a `runColumns` y renderizar un trigger `Recibos`.

- Crear un diálogo para listar empleados y descargas:
- Archivo nuevo (propuesto): [apps/web/app/(dashboard)/payroll/payroll-run-receipts-dialog.tsx](apps/web/app/\\\\\\\\\\\\\(dashboard)/payroll/payroll-run-receipts-dialog.tsx)
- UX:
- Al abrir, cargar `fetchPayrollRunDetail(runId)` con `queryKeys.payroll.runDetail(runId)`.
- Mostrar:
- Botón **“Descargar todos (ZIP)”**
- Lista de empleados con **“Descargar recibo (PDF)”** por empleado (mostrar también neto como ayuda).

- i18n:
- Archivo: [apps/web/messages/es.json](apps/web/messages/es.json)
- Agregar strings para botones/diálogo (todo en español).
- Datos opcionales del empleado (para mostrar en PDF si existen):
- Actualizar el modelo de empleado en web (`apps/web/lib/client-functions.ts`) + formularios de alta/edición de empleado para capturar `nss` y `rfc` (opcionales).

## Generación de documentos (Web API routes)

- Agregar dependencias (en `apps/web`):
- `pdf-lib` para PDFs
- `jszip` para ZIP

- Crear generador de PDF (utilidad reutilizable):
- Archivo nuevo (propuesto): [apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts](apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts)
- Entrada: org + run + línea de empleado (con taxBreakdown) y valores numéricos normalizados.
- Salida: `Promise<Uint8Array>`.
- Diseño (comparación de imágenes):
- **Mínimo obligatorio (2ª imagen)**: recibo tipo “comprobante” con estructura de tabla:
- Encabezado con periodo (inicio–fin) y fecha de pago/procesado.
- Datos del empleado (nombre, clave/código). NSS/RFC son **opcionales**: mostrarlos si existen; si no, `—`.
- Secciones **Ingresos** y **Deducciones** (tabla), con totales.
- Sección de “Neto recibido” y un área de **firma del empleado** + leyenda de “Recibí de la empresa…”.
- Forma de pago: por ahora **asumir 100% “Efectivo”** (y “Pago tarjeta” = 0) para mantener compatibilidad con el layout sin agregar flujo de captura.
- **Agregar resumen fiscal (1ª imagen, sin emojis)** arriba del recibo:
- “Tu trabajo vale para la empresa”: costo total empresa.
- “La empresa te paga”: percepciones.
- “La empresa le paga al gobierno por tu cuenta”: aportaciones patrón (IMSS, INFONAVIT, SAR, etc.).
- “Después, el gobierno te quita”: retenciones trabajador (ISR/IMSS obrero, etc.).
- “Te quedan”: neto a pagar.
- Estilo: tipografía simple (Helvetica), líneas y secciones claras, colores alineados a la UI (verde/rojo para barras/resúmenes), sin emojis.

- Implementar endpoints Next.js para descargas:
- PDF individual:
- Archivo nuevo: [apps/web/app/api/payroll/receipts/run/[runId]/employee/[employeeId]/route.ts](apps/web/app/api/payroll/receipts/run/[runId]/employee/[employeeId]/route.ts)
- Flujo:
- `getAdminAccessContext()` para asegurar sesión/organización.
- `createServerApiClient(cookieHeader)` y `GET /payroll/runs/:id`.
- Buscar `employeeId`, generar PDF y responder con:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="...pdf"`
- `Cache-Control: no-store`
- ZIP (todos los recibos del run):
- Archivo nuevo: [apps/web/app/api/payroll/receipts/run/[runId]/all/route.ts](apps/web/app/api/payroll/receipts/run/[runId]/all/route.ts)
- Flujo:
- Cargar run detail una vez.
- Generar PDF por empleado y agregarlos al ZIP con `jszip`.
- Responder con:
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="recibos_nomina_{start}_{end}.zip"`
- `Cache-Control: no-store`

## Pruebas

- API (contract):
- Archivo: [apps/api/src/routes/payroll.contract.test.ts](apps/api/src/routes/payroll.contract.test.ts)
- Agregar aserciones en “returns payroll run details” para verificar que las líneas incluyan `employeeName` y `employeeCode`.

- Web (Playwright e2e):
- Archivo nuevo: [apps/web/e2e/payroll-receipts.spec.ts](apps/web/e2e/payroll-receipts.spec.ts)
- Flujo de prueba:
- Crear org/usuarios (helpers existentes).
- Sembrar datos mínimos vía `/api` (proxy): location + job position + device + employee + attendance.
- Ir a `/payroll`, procesar nómina.
- Abrir “Recibos”, descargar ZIP y 1 PDF.
- Validar:
- nombre sugerido termina en `.zip` / `.pdf`
- bytes comienzan con `PK` (zip) y `%PDF-` (pdf)

## Ejecución al final

- `bun run test:api:contract`
- `bun run test:web:e2e`
- `bun run lint`
- `bun run check-types`

---

# Recibo de baja / finiquito (PDF imprimible + firma)

## Objetivo

Cuando el admin confirma la baja del empleado (flujo ya existente en `POST /employees/:id/termination`), debe poder **descargar/impimir un recibo** para que el empleado **firme** y reconozca el monto recibido.

## Fuente de datos (lo que ya existe vs lo que falta)

- **Ya existe** (implementado en API/Web):
- `POST /employees/:id/termination/preview` y `POST /employees/:id/termination`
- Persistencia de `employee_termination_settlement` con snapshot `calculation` y totales
- **Falta** (para el recibo):
- Endpoint API para leer el último settlement (y permitir re-descarga).
- Datos opcionales NSS/RFC en `employee` (ya están en este plan como todo).
- Resumen fiscal “tipo 1ª imagen” basado en la **última nómina PROCESADA** del empleado (desde `payroll_run_employee.taxBreakdown`).

## Diseño (comparación de imágenes)

- **Mínimo obligatorio (2ª imagen)**:
- Encabezado con título y fecha de pago (usar `createdAt` del settlement o fecha de confirmación).
- Datos del empleado: nombre, clave/código y **NSS/RFC opcionales** (mostrar `—` si faltan).
- Tabla estilo recibo:
- **Ingresos**: conceptos del finiquito y, si aplica, liquidación/indemnización (del `calculation.breakdown`).
- **Deducciones**: por ahora `0.00` (o futuros campos).
- Totales: **total** y **neto recibido**.
- Forma de pago: por ahora **asumir 100% “Efectivo”** (tarjeta = 0) para cumplir layout sin nuevo flujo de captura.
- Leyenda de recibo + “Firma del empleado” (línea) + folio del documento (usar `settlement.id`).
- **Agregar resumen fiscal (1ª imagen, sin emojis)** arriba del recibo:
- Bloque de “Resumen fiscal” con barras/filas:
- “Tu trabajo vale para la empresa”: costo total empresa (aprox: `companyCost` del último payroll)
- “La empresa te paga”: percepciones (aprox: `grossPay`)
- “La empresa le paga al gobierno por tu cuenta”: aportaciones patrón (aprox: `employerCosts.total`)
- “Después, el gobierno te quita”: retenciones trabajador (aprox: `employeeWithholdings.total`)
- “Te quedan”: neto (aprox: `netPay`)
- Nota: el finiquito/liquidación V1 es **bruto**; el resumen fiscal se toma de la última nómina (si existe) y se muestra como contexto.

## Endpoints propuestos (API)

- **Leer último settlement**:
- `GET /employees/:id/termination/settlement` → devuelve el último `employee_termination_settlement` (calculation + totales + createdAt) para re-descarga.
- **Última nómina PROCESADA del empleado (para resumen fiscal)**:
- `GET /employees/:id/payroll/latest` → devuelve el último `payroll_run_employee` asociado a un `payroll_run.status = PROCESSED` (incluye `taxBreakdown` + periodo + processedAt).
- Alternativa: incluir este bloque como `lastPayrollTaxBreakdown` dentro del endpoint de settlement.

## Web (Next.js route de descarga)

- Crear endpoint que genere el PDF con `pdf-lib`:
- Sugerido: `apps/web/app/api/employees/[employeeId]/termination/receipt/route.ts`
- Flujo:
- `getAdminAccessContext()` → `createServerApiClient(cookieHeader)`
- `GET /employees/:id/termination/settlement` (y `GET /employees/:id/payroll/latest` si se separa)
- Generar PDF y responder con:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="recibo_baja_{employeeCode}_{terminationDateKey}.pdf"`
- `Cache-Control: no-store`

## UI (Admin)

- En `apps/web/app/(dashboard)/employees/employees-client.tsx` (pestaña Finiquito):
- Mostrar botón **“Descargar recibo”**:
- Después de terminar con éxito.
- Y cuando el empleado ya esté `INACTIVE` y exista settlement (re-descarga).

## Pruebas

- **API contract**:
- Agregar tests para `GET /employees/:id/termination/settlement` y `GET /employees/:id/payroll/latest` (o la variante consolidada).
- **Playwright e2e**:
- Terminar un empleado y descargar el PDF; validar:
- filename sugerido termina en `.pdf`
- bytes empiezan con `%PDF-`