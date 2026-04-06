# Employee Bulk Import from Document (OCR/AI)

## Summary

Allow users to upload payroll documents (images or PDFs) and automatically extract employee data using AI vision models. The system presents an editable preview for the user to review, correct, and confirm before bulk-creating employees.

---

## Requirements (from brainstorming)

### Input
- **Accepted formats:** JPG, PNG, HEIC, PDF
- **Max file size:** 10MB per file
- **Multiple files:** Yes, user can add more files incrementally (upload one, see preview, add more)
- **Document types:** Payroll reports, individual pay stubs, scanned lists, photos of documents
- **Photo quality:** Must handle cell phone photos (angled, shadows, low quality)

### Fields to Extract
- `firstName` — employee first name(s)
- `lastName` — employee last name(s)
- `dailyPay` — salary/pay if visible (attempt extraction, user verifies in preview)

### Fields NOT Extracted (user provides)
- `code` — auto-generated using existing logic
- `jobPositionId` — user selects default before import, editable per row
- `locationId` — user selects default before import, editable per row
- `paymentFrequency` — user selects default before import, editable per row

### Volume
- Typical: 10-50 employees per document
- PDF: process all pages automatically, no page limit

### Processing
- **Where:** Backend (Elysia API)
- **Model:** GPT-4o (or gpt-5.4-nano) via OpenRouter
- **SDK:** Vercel AI SDK (`ai` package) with `@openrouter/ai-sdk-provider`
- **Output:** Structured output via `generateObject()` with Zod schema

---

## Architecture

### Flow

```
User uploads file(s) → API validates & rate-limits → AI SDK processes per page
→ Structured JSON returned → Editable preview table → User confirms
→ Bulk create employees → Results + undo option
```

### New API Endpoints

#### 1. `POST /employees/import`

Receives a file, processes it with AI, returns extracted employee data.

**Request:** `multipart/form-data`
- `file` — the document (image or PDF, max 10MB)
- `defaultLocationId` — UUID, must exist in org
- `defaultJobPositionId` — UUID, must exist in org
- `defaultPaymentFrequency` — `WEEKLY | BIWEEKLY | MONTHLY`

**Response 200:**
```json
{
  "employees": [
    {
      "firstName": "Juan",
      "lastName": "Pérez García",
      "dailyPay": 450.00,
      "confidence": 0.92,
      "fieldConfidence": {
        "firstName": 0.95,
        "lastName": 0.90,
        "dailyPay": 0.85
      },
      "locationId": "uuid-...",
      "jobPositionId": "uuid-...",
      "paymentFrequency": "BIWEEKLY"
    }
  ],
  "processingMeta": {
    "pagesProcessed": 3,
    "totalEmployeesFound": 15,
    "processingTimeMs": 4200
  }
}
```

**Error responses:**
- `400` — invalid file, unsupported format, no employees detected
- `429` — rate limit exceeded (10 imports/hour per user)

**Validations:**
- File exists and < 10MB
- MIME type: `image/jpeg`, `image/png`, `image/heic`, `application/pdf`
- Location and job position IDs exist and belong to user's organization
- Rate limit: 10 imports/hour per user (in-memory with timestamp array)

#### 2. `POST /employees/bulk`

Creates multiple employees from the reviewed preview data.

**Request:** JSON
```json
{
  "employees": [
    {
      "firstName": "Juan",
      "lastName": "Pérez García",
      "dailyPay": 450.00,
      "locationId": "uuid-...",
      "jobPositionId": "uuid-...",
      "paymentFrequency": "BIWEEKLY",
      "code": "EMP-042"
    }
  ]
}
```

**Response 200:**
```json
{
  "batchId": "uuid-...",
  "results": [
    { "index": 0, "success": true, "employeeId": "uuid-..." },
    { "index": 1, "success": true, "employeeId": "uuid-..." },
    { "index": 2, "success": false, "error": "Código duplicado" }
  ],
  "summary": { "total": 15, "created": 13, "failed": 2 }
}
```

**Logic:**
- Creates employees one by one, reusing existing validation logic from `POST /employees/`
- Tags each created employee with `importBatchId`
- Returns per-employee success/failure results

#### 3. `DELETE /employees/bulk/:batchId`

Undoes a bulk import by deleting all employees in the batch.

**Response 200:**
```json
{
  "deleted": 13,
  "batchId": "uuid-..."
}
```

**Logic:**
- Finds all employees with matching `importBatchId` in user's org
- Deletes in a transaction
- Only works if batch exists and belongs to user's organization

### Database Changes

**`employee` table — new column:**
- `importBatchId` — `text`, nullable, indexed
- Purpose: groups employees from the same import for undo functionality

---

## AI Service

**File:** `apps/api/src/services/document-ai.ts`

### Structured Output Schema

```typescript
const extractedEmployeeSchema = z.object({
  employees: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
    dailyPay: z.number().nullable(),
    confidence: z.number().min(0).max(1),
    fieldConfidence: z.object({
      firstName: z.number().min(0).max(1),
      lastName: z.number().min(0).max(1),
      dailyPay: z.number().min(0).max(1),
    }),
  })),
})
```

### Processing by File Type

- **Image (JPG/PNG):** Convert to base64, single `generateObject()` call
- **HEIC:** Convert to JPG using `sharp`, then process as image
- **PDF:** Extract each page as image using `pdfjs-dist`, one `generateObject()` call per page, consolidate results

### System Prompt

```
Analiza este documento y extrae todos los empleados que encuentres.
Para cada persona, extrae: nombre(s), apellido(s), y sueldo/salario si está visible.
El documento puede ser una nómina, lista de personal, recibo de pago, u otro documento laboral mexicano.
Si un campo no es legible o no existe, devuelve null.
Asigna un score de confianza (0-1) a cada campo basado en qué tan legible/claro es el dato.
NO incluyas encabezados, totales, firmas, o datos que no sean personas.
```

### Dependencies (new)

- `ai` — Vercel AI SDK
- `@openrouter/ai-sdk-provider` — OpenRouter provider for AI SDK
- `sharp` — HEIC→JPG conversion, image resize
- `pdfjs-dist` — PDF page extraction as images

---

## Frontend

### Route

`/employees/import` — new page with dedicated import flow

### File Structure

```
apps/web/app/(dashboard)/employees/import/
  ├── page.tsx              # Server Component (prefetch locations, jobPositions)
  └── import-client.tsx     # Client Component (wizard flow)
```

### Entry Point

Split button in employees page header:
- Primary action: "Crear empleado" (existing behavior)
- Dropdown option: "Importar desde documento" → navigates to `/employees/import`

### Design System Reference (SEN Design System — Paleta Michoacán v4.0)

**Reference file:** `design/SEN_Design_System_Web_Michoacan.html`

The import page MUST follow the SEN Design System conventions:

- **Colors:** Use design tokens — `--primary` (Cobre Michoacano #B8602A) for primary actions, `--warning` (#CC8A17) for low-confidence indicators, `--destructive` (#C4302B) for errors/validation failures, `--success` (#2D8659) for success states, `--info` (#4A7C3F) for informational badges
- **Typography:** `--font-body` (DM Sans) for all UI text, `--font-display` (Playfair Display) for page title only, `--font-mono` (JetBrains Mono) for codes
- **Spacing:** Generous spacing between sections (`space-16` or more). Content must breathe — PyMEs use this on small screens
- **Tables:** Follow `sen-table` pattern — headers in muted gray, rows with subtle copper hover (`var(--primary-bg)`), generous padding
- **Badges:** Use existing badge variants for status: `badge-warning` for low confidence, `badge-error` for validation errors, `badge-info` for duplicate warnings, `badge-success` for confirmed rows
- **Alerts:** Use `alert-success`, `alert-warning`, `alert-error`, `alert-info` patterns for result feedback
- **Buttons:** Primary action in cobre (`--primary`), secondary/cancel in muted. Never multiple cobre buttons competing for attention
- **Accessibility:** Min 4.5:1 contrast for body text, 44x44px touch targets, all inputs with visible labels (never placeholder-only), focus ring in cobre
- **Motion:** `--transition-fast` (150ms) for hovers/toggles, `--transition-base` (250ms) for page transitions/modals, `--transition-slow` (400ms) for entry animations. No bouncing or exaggerated effects — this is work software
- **Text tone:** Direct, second person, no jargon. "Tu documento se procesó." NOT "El proceso de análisis del documento ha sido ejecutado satisfactoriamente."
- **Dark mode:** Must support dark theme via `[data-theme="dark"]` tokens (Noche Moreliana palette)

### Wizard Steps

**Step 1: Configuration + Upload**
- Default selectors: location, job position, payment frequency (fetched via React Query, prefetched on server)
- File dropzone: drag & drop or click, accepts JPG/PNG/HEIC/PDF, max 10MB. Styled with `--border`, `--muted` background, dashed border. On hover/drag-over: `--primary-bg` background with `--primary` border
- "Analizar documento" button in `--primary` (cobre)

**Step 2 (transition): Processing indicator**
- Step-by-step progress: "Subiendo archivo..." → "Procesando página X de Y..." → "Extrayendo datos..."
- Use `--primary` for progress bar fill, `--muted` for track
- Completed steps marked with `--success` checkmark
- Not streaming — the API processes and returns complete results

**Step 3: Editable Preview**
- Table following `sen-table` design pattern with inline-editable cells for: firstName, lastName, dailyPay
- Per-row: location dropdown, job position dropdown, payment frequency dropdown (default from step 1, individually overridable)
- Confidence indicators: `badge-warning` (yellow/orange) on fields with confidence < 0.7
- Validation errors: `badge-error` (red) on fields that fail validation, `--destructive-bg` row background
- Row actions: delete row (destructive icon), checkbox to include/exclude
- Duplicate detection: `badge-info` warning if employee name matches existing employee in org
- "Agregar más archivos" button (secondary style) to upload additional documents and append to the same preview
- Blocking submit if any row has validation errors (empty required fields, invalid pay)

**Step 4: Results**
- `alert-success` for successful imports, `alert-error` for failures
- Summary: X created, Y failed
- Per-failure detail: which row and why
- "Deshacer importación" button in `--destructive` style — calls `DELETE /employees/bulk/:batchId`
- "Ir a empleados" button in `--primary` — navigates back to employees list
- Undo only available on this screen; navigating away loses the option

### State Management

```typescript
type ImportStep = 'config' | 'processing' | 'preview' | 'confirming' | 'results'
```

- Wizard state: local React state (ephemeral, not cacheable)
- Locations, job positions: React Query (prefetched on server per architecture conventions)
- Mutations (import, bulk create, undo): `useMutation` with mutation keys
- Employee code generation: reuse existing `EmployeeCodeField` logic or auto-generate in bulk endpoint

### Architecture Conventions (per release-04-query-fetch-architecture.md)

- `page.tsx`: Server Component that prefetches locations and job positions using `server-functions.ts` pattern with cookie forwarding
- `import-client.tsx`: Client Component wrapped in `HydrationBoundary`
- Fetchers: use existing `fetchLocationsList`, `fetchJobPositionsList` from `client-functions.ts`
- Mutations: server actions in `apps/web/actions/employee-import.ts` calling server API client
- Query keys: add `import` and `bulkCreate` to `mutationKeys.employees`

---

## Permissions

- Same permission as creating individual employees — no new permission needed
- Rate limit enforced at API level: 10 imports/hour per user

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Unsupported file type | 400 error, toast in frontend |
| File > 10MB | Client-side rejection before upload |
| No employees detected | 400 error, "No se detectaron empleados en el documento" |
| AI model timeout/failure | 500 error, "Error procesando documento, intenta de nuevo" |
| Rate limit exceeded | 429 error, "Has alcanzado el límite de importaciones. Intenta más tarde" |
| Duplicate employee name | Warning in preview (yellow badge), does not block import |
| Bulk create partial failure | Results screen shows per-employee success/failure |
| Undo after navigation | Not available — only on results screen |

---

## i18n

- Spanish only for initial implementation
- Translation keys added to `es.json` following existing patterns
- Can be extended to English later

---

## Summary of New Files

### API (`apps/api`)
- `src/services/document-ai.ts` — AI processing service
- `src/routes/employee-import.ts` — import/bulk/undo endpoints
- `drizzle/XXXX_employee_import_batch.sql` — migration for `importBatchId` column

### Web (`apps/web`)
- `app/(dashboard)/employees/import/page.tsx` — server component
- `app/(dashboard)/employees/import/import-client.tsx` — client component
- `actions/employee-import.ts` — server actions for import mutations

### Shared
- New mutation keys in `lib/query-keys.ts`
- New translations in `lib/translations/es.json` (or equivalent)

### Dependencies (new in `apps/api`)
- `ai`
- `@openrouter/ai-sdk-provider`
- `sharp`
- `pdfjs-dist`
