---
name: payroll-receipts-pdf-zip
overview: Agregar descarga de recibos de nómina (PDF) por empleado y en ZIP para una ejecución PROCESADA, accesible desde el historial por periodo/fecha.
todos:
  - id: api-run-detail-employee-fields
    content: Modificar `GET /payroll/runs/:id` para incluir `employeeName` y `employeeCode` en cada línea (join con `employee`).
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

## Cambios necesarios (Web UI)

- Actualizar tipos y normalización del detalle de run:
- Archivo: [apps/web/lib/client-functions.ts](apps/web/lib/client-functions.ts)
- Cambio: extender `PayrollRunEmployee` con `employeeName` y `employeeCode`, y ajustar `fetchPayrollRunDetail()` para conservarlos.

- Añadir acciones de “Recibos” al historial:
- Archivo: [apps/web/app/(dashboard)/payroll/payroll-client.tsx](apps/web/app/\\(dashboard)/payroll/payroll-client.tsx)
- Cambio: agregar una columna `actions` a `runColumns` y renderizar un trigger `Recibos`.

- Crear un diálogo para listar empleados y descargas:
- Archivo nuevo (propuesto): [apps/web/app/(dashboard)/payroll/payroll-run-receipts-dialog.tsx](apps/web/app/\\(dashboard)/payroll/payroll-run-receipts-dialog.tsx)
- UX:
- Al abrir, cargar `fetchPayrollRunDetail(runId)` con `queryKeys.payroll.runDetail(runId)`.
- Mostrar:
- Botón **“Descargar todos (ZIP)”**
- Lista de empleados con **“Descargar recibo (PDF)”** por empleado (mostrar también neto como ayuda).

- i18n:
- Archivo: [apps/web/messages/es.json](apps/web/messages/es.json)
- Agregar strings para botones/diálogo (todo en español).

## Generación de documentos (Web API routes)

- Agregar dependencias (en `apps/web`):
- `pdf-lib` para PDFs
- `jszip` para ZIP

- Crear generador de PDF (utilidad reutilizable):
- Archivo nuevo (propuesto): [apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts](apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts)
- Entrada: org + run + línea de empleado (con taxBreakdown) y valores numéricos normalizados.
- Salida: `Promise<Uint8Array>`.
- Diseño: inspirado en la imagen (sin emojis) y alineado al estilo del app (tipografía simple, secciones claras, barras verde/roja para neto y aportaciones, área de firma).

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