# Employee Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload payroll documents and automatically extract employee data using AI vision models (GPT-4o via OpenRouter + Vercel AI SDK), review in an editable preview, and bulk-create employees.

**Architecture:** New Elysia API endpoints handle file upload, AI processing, bulk creation, and undo. A new Next.js page (`/employees/import`) provides a wizard flow (config → processing → preview → results). The AI service uses `generateObject()` with Zod structured output for reliable extraction.

**Tech Stack:** Vercel AI SDK (`ai`), OpenRouter (`@openrouter/ai-sdk-provider`), `sharp` (image conversion), `pdfjs-dist` (PDF processing), Elysia (API), Next.js (web), TanStack Query, Drizzle ORM.

**Design System:** SEN Design System — Paleta Michoacán v4.0 (`design/SEN_Design_System_Web_Michoacan.html`). Use existing shadcn/ui components in `apps/web/components/ui/`.

**Design Spec:** `docs/superpowers/specs/2026-04-06-employee-bulk-import-design.md`

---

## File Structure

### API (`apps/api`)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/services/document-ai.ts` | AI processing: image/PDF → structured employee data via AI SDK |
| Create | `src/services/document-ai.test.ts` | Unit tests for document-ai service |
| Create | `src/routes/employee-import.ts` | 3 endpoints: POST /import, POST /bulk, DELETE /bulk/:batchId |
| Create | `src/routes/employee-import.test.ts` | Unit tests for import routes |
| Create | `src/utils/rate-limit.ts` | In-memory rate limiter utility |
| Create | `src/utils/rate-limit.test.ts` | Unit tests for rate limiter |
| Create | `drizzle/0046_employee_import_batch.sql` | Migration: add importBatchId column |
| Modify | `src/db/schema.ts` | Add `importBatchId` column to employee table |
| Modify | `src/app.ts` | Register `employeeImportRoutes` in protected routes |

### Web (`apps/web`)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/(dashboard)/employees/import/page.tsx` | Server Component with prefetching |
| Create | `app/(dashboard)/employees/import/import-client.tsx` | Client Component: wizard flow |
| Create | `actions/employee-import.ts` | Server actions for import mutations |
| Modify | `lib/query-keys.ts` | Add import/bulk mutation keys |
| Modify | `lib/client-functions.ts` | Add `fetchEmployeesList` duplicate-check helper (if needed) |
| Modify | `components/employees/employee-detail-dialog.tsx` | Split button: add "Importar desde documento" dropdown option |

---

## Task 1: Database Migration — Add `importBatchId` Column

**Files:**
- Create: `apps/api/drizzle/0046_employee_import_batch.sql`
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- apps/api/drizzle/0046_employee_import_batch.sql
ALTER TABLE "employee" ADD COLUMN "import_batch_id" text;
CREATE INDEX "employee_import_batch_id_idx" ON "employee" USING btree ("import_batch_id");
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `apps/api/src/db/schema.ts`, find the `employee` table definition. Add the new column after `scheduleTemplateId`:

```typescript
importBatchId: text('import_batch_id'),
```

And add the index to the table's indexes:

```typescript
importBatchIdIdx: index('employee_import_batch_id_idx').on(table.importBatchId),
```

- [ ] **Step 3: Update the Drizzle journal**

In `apps/api/drizzle/meta/_journal.json`, add a new entry after the last one (idx 45):

```json
{
  "idx": 46,
  "version": "7",
  "when": 1774972800000,
  "tag": "0046_employee_import_batch",
  "breakpoints": true
}
```

- [ ] **Step 4: Verify the migration applies cleanly**

Run: `cd apps/api && bun run db:migrate`
Expected: Migration 0046 applies without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/drizzle/0046_employee_import_batch.sql apps/api/drizzle/meta/_journal.json apps/api/src/db/schema.ts
git commit -m "feat(api): add importBatchId column to employee table"
```

---

## Task 2: Rate Limiter Utility

**Files:**
- Create: `apps/api/src/utils/rate-limit.ts`
- Create: `apps/api/src/utils/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/utils/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
  });

  it('allows requests under the limit', () => {
    expect(limiter.check('user-1').allowed).toBe(true);
    expect(limiter.check('user-1').allowed).toBe(true);
    expect(limiter.check('user-1').allowed).toBe(true);
  });

  it('blocks requests over the limit', () => {
    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');
    const result = limiter.check('user-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks users independently', () => {
    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');
    expect(limiter.check('user-1').allowed).toBe(false);
    expect(limiter.check('user-2').allowed).toBe(true);
  });

  it('returns remaining count', () => {
    const r1 = limiter.check('user-1');
    expect(r1.remaining).toBe(2);
    const r2 = limiter.check('user-1');
    expect(r2.remaining).toBe(1);
    const r3 = limiter.check('user-1');
    expect(r3.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/utils/rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/utils/rate-limit.ts

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly timestamps: Map<string, number[]> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing timestamps for this key, filter to current window
    const existing = this.timestamps.get(key) ?? [];
    const recent = existing.filter((ts) => ts > windowStart);

    if (recent.length >= this.config.maxRequests) {
      const oldestInWindow = recent[0]!;
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestInWindow + this.config.windowMs - now,
      };
    }

    recent.push(now);
    this.timestamps.set(key, recent);

    return {
      allowed: true,
      remaining: this.config.maxRequests - recent.length,
      resetMs: recent[0]! + this.config.windowMs - now,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/utils/rate-limit.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/rate-limit.ts apps/api/src/utils/rate-limit.test.ts
git commit -m "feat(api): add in-memory rate limiter utility"
```

---

## Task 3: Install AI Dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install dependencies**

Run: `cd apps/api && bun add ai @openrouter/ai-sdk-provider sharp pdfjs-dist`
Run: `cd apps/api && bun add -d @types/sharp`

- [ ] **Step 2: Verify imports resolve**

Create a temporary test file to verify:

```bash
cd apps/api && bun -e "import { generateObject } from 'ai'; import { createOpenRouter } from '@openrouter/ai-sdk-provider'; console.log('AI SDK OK')"
```

Expected: "AI SDK OK" printed without errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "chore(api): add AI SDK, OpenRouter, sharp, pdfjs-dist dependencies"
```

---

## Task 4: Document AI Service

**Files:**
- Create: `apps/api/src/services/document-ai.ts`
- Create: `apps/api/src/services/document-ai.test.ts`

- [ ] **Step 1: Write the failing test for image processing**

```typescript
// apps/api/src/services/document-ai.test.ts
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { extractEmployeesFromImage, type ExtractedEmployee } from './document-ai.js';

// Mock the AI SDK generateObject
const mockGenerateObject = mock(() =>
  Promise.resolve({
    object: {
      employees: [
        {
          firstName: 'Juan',
          lastName: 'Pérez',
          dailyPay: 450,
          confidence: 0.95,
          fieldConfidence: { firstName: 0.98, lastName: 0.95, dailyPay: 0.90 },
        },
      ],
    },
  }),
);

mock.module('ai', () => ({
  generateObject: mockGenerateObject,
}));

describe('extractEmployeesFromImage', () => {
  beforeEach(() => {
    mockGenerateObject.mockClear();
  });

  it('returns extracted employees from a base64 image', async () => {
    // 1x1 white PNG as base64
    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const result = await extractEmployeesFromImage(fakeBase64, 'image/png');

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].firstName).toBe('Juan');
    expect(result.employees[0].lastName).toBe('Pérez');
    expect(result.employees[0].dailyPay).toBe(450);
    expect(result.employees[0].confidence).toBe(0.95);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no employees found', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { employees: [] },
    });

    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const result = await extractEmployeesFromImage(fakeBase64, 'image/png');

    expect(result.employees).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/services/document-ai.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the document-ai service**

```typescript
// apps/api/src/services/document-ai.ts
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const EXTRACTION_MODEL = openrouter('openai/gpt-4o');

const SYSTEM_PROMPT = `Analiza este documento y extrae todos los empleados que encuentres.
Para cada persona, extrae: nombre(s), apellido(s), y sueldo/salario si está visible.
El documento puede ser una nómina, lista de personal, recibo de pago, u otro documento laboral mexicano.
Si un campo no es legible o no existe, devuelve null para ese campo.
Asigna un score de confianza (0-1) a cada campo basado en qué tan legible/claro es el dato.
NO incluyas encabezados, totales, firmas, o datos que no sean personas reales.`;

export const extractedEmployeesSchema = z.object({
  employees: z.array(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      dailyPay: z.number().nullable(),
      confidence: z.number().min(0).max(1),
      fieldConfidence: z.object({
        firstName: z.number().min(0).max(1),
        lastName: z.number().min(0).max(1),
        dailyPay: z.number().min(0).max(1),
      }),
    }),
  ),
});

export type ExtractedEmployee = z.infer<typeof extractedEmployeesSchema>['employees'][number];

export interface ExtractionResult {
  employees: ExtractedEmployee[];
}

export async function extractEmployeesFromImage(
  base64Image: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const { object } = await generateObject({
    model: EXTRACTION_MODEL,
    schema: extractedEmployeesSchema,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          {
            type: 'image',
            image: `data:${mimeType};base64,${base64Image}`,
          },
        ],
      },
    ],
  });

  return { employees: object.employees };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/services/document-ai.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Write test for PDF processing**

```typescript
// Add to apps/api/src/services/document-ai.test.ts
import { processDocument, type ProcessingProgress } from './document-ai.js';

describe('processDocument', () => {
  it('processes a single image file', async () => {
    const fakeImageBuffer = Buffer.from('fake-image-data');
    const progressUpdates: ProcessingProgress[] = [];

    const result = await processDocument(
      fakeImageBuffer,
      'image/png',
      (progress) => progressUpdates.push(progress),
    );

    expect(result.employees.length).toBeGreaterThanOrEqual(0);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0].step).toBe('processing');
  });
});
```

- [ ] **Step 6: Add processDocument function to document-ai.ts**

```typescript
// Add to apps/api/src/services/document-ai.ts
import sharp from 'sharp';

export interface ProcessingProgress {
  step: 'uploading' | 'processing' | 'extracting';
  currentPage?: number;
  totalPages?: number;
  message: string;
}

type ProgressCallback = (progress: ProcessingProgress) => void;

async function convertToProcessableImage(buffer: Buffer, mimeType: string): Promise<string> {
  // Convert HEIC or resize large images using sharp
  const processedBuffer = await sharp(buffer)
    .jpeg({ quality: 85 })
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  return processedBuffer.toString('base64');
}

async function extractPagesFromPdf(buffer: Buffer): Promise<Buffer[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: Buffer[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    // Create a canvas-like rendering using sharp
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    pages.push(pngBuffer);
  }

  return pages;
}

export async function processDocument(
  fileBuffer: Buffer,
  mimeType: string,
  onProgress?: ProgressCallback,
): Promise<ExtractionResult & { pagesProcessed: number }> {
  const allEmployees: ExtractedEmployee[] = [];

  if (mimeType === 'application/pdf') {
    onProgress?.({ step: 'processing', message: 'Extrayendo páginas del PDF...' });
    const pages = await extractPagesFromPdf(fileBuffer);
    const totalPages = pages.length;

    for (let i = 0; i < pages.length; i++) {
      onProgress?.({
        step: 'processing',
        currentPage: i + 1,
        totalPages,
        message: `Procesando página ${i + 1} de ${totalPages}...`,
      });

      const base64 = await convertToProcessableImage(pages[i], 'image/png');
      const result = await extractEmployeesFromImage(base64, 'image/jpeg');
      allEmployees.push(...result.employees);
    }

    return { employees: allEmployees, pagesProcessed: totalPages };
  }

  // Single image processing
  onProgress?.({ step: 'processing', currentPage: 1, totalPages: 1, message: 'Procesando imagen...' });
  const base64 = await convertToProcessableImage(fileBuffer, mimeType);
  const result = await extractEmployeesFromImage(base64, 'image/jpeg');

  return { employees: result.employees, pagesProcessed: 1 };
}
```

Note: The PDF extraction approach above uses `canvas` for rendering. If `canvas` is not available or causes issues in the API environment, an alternative approach is to use `pdf-to-img` or `@aspect-ratio/pdf-to-image` packages. The implementer should pick whatever works in the Bun runtime. If `canvas` doesn't work, a simpler approach is to extract text from the PDF using `pdfjs-dist` `getTextContent()` and send the raw text to the model instead of images.

- [ ] **Step 7: Run all document-ai tests**

Run: `cd apps/api && bun test src/services/document-ai.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/document-ai.ts apps/api/src/services/document-ai.test.ts
git commit -m "feat(api): add document AI service for employee extraction"
```

---

## Task 5: Employee Import API Routes

**Files:**
- Create: `apps/api/src/routes/employee-import.ts`
- Create: `apps/api/src/routes/employee-import.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing test for POST /employees/import**

```typescript
// apps/api/src/routes/employee-import.test.ts
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createApp } from '../app.js';

// Mock document-ai service
mock.module('../services/document-ai.js', () => ({
  processDocument: mock(() =>
    Promise.resolve({
      employees: [
        {
          firstName: 'María',
          lastName: 'García',
          dailyPay: 380,
          confidence: 0.92,
          fieldConfidence: { firstName: 0.95, lastName: 0.90, dailyPay: 0.85 },
        },
      ],
      pagesProcessed: 1,
    }),
  ),
  extractEmployeesFromImage: mock(),
  extractedEmployeesSchema: {},
}));

describe('POST /employees/import', () => {
  it('returns 400 when no file is provided', async () => {
    const app = createApp();
    const response = await app.handle(
      new Request('http://localhost/employees/import', {
        method: 'POST',
        headers: { cookie: 'test-session-cookie' },
      }),
    );
    expect(response.status).toBe(400);
  });
});
```

Note: Integration testing with auth is complex in this project. The implementer should follow the testing patterns established in existing test files like `apps/api/src/routes/recognition.unit.test.ts` and `apps/api/src/app.unit.test.ts`. Use mocks for the auth plugin and database as needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/routes/employee-import.test.ts`
Expected: FAIL — module not found or route not registered.

- [ ] **Step 3: Write the import route file**

```typescript
// apps/api/src/routes/employee-import.ts
import { Elysia, t } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, ilike, or } from 'drizzle-orm';

import db from '../db/index.js';
import { employee } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { RateLimiter } from '../utils/rate-limit.js';
import { processDocument } from '../services/document-ai.js';
import { createEmployeeSchema } from '../schemas/crud.js';

const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 10 imports per hour per user
const importRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

export const employeeImportRoutes = new Elysia({ prefix: '/employees' })
  .use(combinedAuthPlugin)

  // POST /employees/import — Process document with AI
  .post(
    '/import',
    async ({ body, set, ...ctx }) => {
      // Resolve user ID for rate limiting
      const userId = ctx.authType === 'session' ? ctx.user.id : ctx.apiKeyUserId;
      const rateLimitResult = importRateLimiter.check(userId);

      if (!rateLimitResult.allowed) {
        set.status = 429;
        return buildErrorResponse(
          'Has alcanzado el límite de importaciones. Intenta más tarde.',
          429,
        );
      }

      const { file, defaultLocationId, defaultJobPositionId, defaultPaymentFrequency } = body;

      // Validate file
      if (!file) {
        set.status = 400;
        return buildErrorResponse('No se proporcionó un archivo.', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        set.status = 400;
        return buildErrorResponse('El archivo excede el tamaño máximo de 10MB.', 400);
      }

      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        set.status = 400;
        return buildErrorResponse(
          'Formato no soportado. Usa JPG, PNG, HEIC o PDF.',
          400,
        );
      }

      // Validate defaults exist in org
      const organizationId = resolveOrganizationId(ctx);
      if (!organizationId) {
        set.status = 400;
        return buildErrorResponse('Organization ID is required.', 400);
      }

      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const startTime = Date.now();

        const result = await processDocument(fileBuffer, file.type);

        if (result.employees.length === 0) {
          set.status = 400;
          return buildErrorResponse(
            'No se detectaron empleados en el documento.',
            400,
          );
        }

        // Attach defaults to each extracted employee
        const employeesWithDefaults = result.employees.map((emp) => ({
          ...emp,
          locationId: defaultLocationId,
          jobPositionId: defaultJobPositionId,
          paymentFrequency: defaultPaymentFrequency,
        }));

        return {
          employees: employeesWithDefaults,
          processingMeta: {
            pagesProcessed: result.pagesProcessed,
            totalEmployeesFound: result.employees.length,
            processingTimeMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        console.error('Document processing error:', error);
        set.status = 500;
        return buildErrorResponse(
          'Error procesando documento. Intenta de nuevo.',
          500,
        );
      }
    },
    {
      body: t.Object({
        file: t.File(),
        defaultLocationId: t.String(),
        defaultJobPositionId: t.String(),
        defaultPaymentFrequency: t.Union([
          t.Literal('WEEKLY'),
          t.Literal('BIWEEKLY'),
          t.Literal('MONTHLY'),
        ]),
      }),
    },
  )

  // POST /employees/bulk — Create multiple employees
  .post(
    '/bulk',
    async ({ body, set, ...ctx }) => {
      const organizationId = resolveOrganizationId(ctx);
      if (!organizationId) {
        set.status = 400;
        return buildErrorResponse('Organization ID is required.', 400);
      }

      const batchId = crypto.randomUUID();
      const results: Array<{
        index: number;
        success: boolean;
        employeeId?: string;
        error?: string;
      }> = [];

      for (let i = 0; i < body.employees.length; i++) {
        const emp = body.employees[i];
        try {
          // Check code uniqueness
          const existingCode = await db
            .select({ id: employee.id })
            .from(employee)
            .where(eq(employee.code, emp.code))
            .limit(1);

          if (existingCode.length > 0) {
            results.push({ index: i, success: false, error: `Código "${emp.code}" duplicado` });
            continue;
          }

          const id = crypto.randomUUID();
          await db.insert(employee).values({
            id,
            code: emp.code,
            firstName: emp.firstName,
            lastName: emp.lastName,
            dailyPay: emp.dailyPay.toFixed(2),
            paymentFrequency: emp.paymentFrequency,
            jobPositionId: emp.jobPositionId,
            locationId: emp.locationId,
            organizationId,
            importBatchId: batchId,
            status: 'ACTIVE',
            employmentType: 'PERMANENT',
            shiftType: 'DIURNA',
          });

          results.push({ index: i, success: true, employeeId: id });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error desconocido';
          results.push({ index: i, success: false, error: message });
        }
      }

      const created = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      set.status = 200;
      return {
        batchId,
        results,
        summary: { total: body.employees.length, created, failed },
      };
    },
    {
      body: t.Object({
        employees: t.Array(
          t.Object({
            code: t.String(),
            firstName: t.String(),
            lastName: t.String(),
            dailyPay: t.Number(),
            paymentFrequency: t.Union([
              t.Literal('WEEKLY'),
              t.Literal('BIWEEKLY'),
              t.Literal('MONTHLY'),
            ]),
            jobPositionId: t.String(),
            locationId: t.String(),
          }),
        ),
      }),
    },
  )

  // DELETE /employees/bulk/:batchId — Undo a bulk import
  .delete(
    '/bulk/:batchId',
    async ({ params, set, ...ctx }) => {
      const organizationId = resolveOrganizationId(ctx);
      if (!organizationId) {
        set.status = 400;
        return buildErrorResponse('Organization ID is required.', 400);
      }

      const { batchId } = params;

      // Find all employees in this batch belonging to this org
      const batchEmployees = await db
        .select({ id: employee.id })
        .from(employee)
        .where(
          and(
            eq(employee.importBatchId, batchId),
            eq(employee.organizationId, organizationId),
          ),
        );

      if (batchEmployees.length === 0) {
        set.status = 404;
        return buildErrorResponse('No se encontró el lote de importación.', 404);
      }

      // Delete all employees in the batch
      await db
        .delete(employee)
        .where(
          and(
            eq(employee.importBatchId, batchId),
            eq(employee.organizationId, organizationId),
          ),
        );

      return { deleted: batchEmployees.length, batchId };
    },
    {
      params: t.Object({
        batchId: t.String(),
      }),
    },
  );
```

- [ ] **Step 4: Register the routes in app.ts**

In `apps/api/src/app.ts`, add the import at the top with the other route imports:

```typescript
import { employeeImportRoutes } from './routes/employee-import.js';
```

Add `.use(employeeImportRoutes)` inside `createProtectedRoutes()`, after `.use(employeeRoutes)`:

```typescript
.use(employeeRoutes)
.use(employeeImportRoutes)
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && bun test src/routes/employee-import.test.ts`
Expected: Tests pass (adjust test expectations based on auth mocking patterns from existing tests).

- [ ] **Step 6: Verify the app compiles**

Run: `cd apps/api && bun run build` (or `bun run check` if available)
Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/employee-import.ts apps/api/src/routes/employee-import.test.ts apps/api/src/app.ts
git commit -m "feat(api): add employee import, bulk create, and undo endpoints"
```

---

## Task 6: Web — Mutation Keys and Server Actions

**Files:**
- Modify: `apps/web/lib/query-keys.ts`
- Create: `apps/web/actions/employee-import.ts`

- [ ] **Step 1: Add mutation keys**

In `apps/web/lib/query-keys.ts`, add to the `mutationKeys.employees` object:

```typescript
employees: {
  // ... existing keys ...
  fullEnrollment: ['employees', 'fullEnrollment'] as const,
  importDocument: ['employees', 'importDocument'] as const,
  bulkCreate: ['employees', 'bulkCreate'] as const,
  undoBulkImport: ['employees', 'undoBulkImport'] as const,
},
```

- [ ] **Step 2: Create the server actions file**

```typescript
// apps/web/actions/employee-import.ts
'use server';

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

interface ImportDocumentInput {
  formData: FormData;
}

interface BulkCreateInput {
  employees: Array<{
    code: string;
    firstName: string;
    lastName: string;
    dailyPay: number;
    paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
    jobPositionId: string;
    locationId: string;
  }>;
}

interface MutationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function importDocument(
  formData: FormData,
): Promise<MutationResult> {
  try {
    const requestHeaders = await headers();
    const cookieHeader = requestHeaders.get('cookie') ?? '';

    // Use fetch directly for multipart — Eden Treaty doesn't support FormData well
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const response = await fetch(`${apiBaseUrl}/employees/import`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage =
        errorData?.message ?? `Error del servidor (${response.status})`;
      return { success: false, error: errorMessage };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to import document:', error);
    return { success: false, error: 'Error procesando el documento.' };
  }
}

export async function bulkCreateEmployees(
  input: BulkCreateInput,
): Promise<MutationResult> {
  try {
    const requestHeaders = await headers();
    const cookieHeader = requestHeaders.get('cookie') ?? '';
    const api = createServerApiClient(cookieHeader);

    const response = await api.employees.bulk.post({
      employees: input.employees,
    });

    if (response.error) {
      return { success: false, error: 'Error creando empleados.' };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Failed to bulk create employees:', error);
    return { success: false, error: 'Error creando empleados.' };
  }
}

export async function undoBulkImport(batchId: string): Promise<MutationResult> {
  try {
    const requestHeaders = await headers();
    const cookieHeader = requestHeaders.get('cookie') ?? '';
    const api = createServerApiClient(cookieHeader);

    const response = await api.employees.bulk({ batchId }).delete();

    if (response.error) {
      return { success: false, error: 'Error deshaciendo la importación.' };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Failed to undo bulk import:', error);
    return { success: false, error: 'Error deshaciendo la importación.' };
  }
}
```

Note: The Eden Treaty client paths (`api.employees.bulk.post()`, `api.employees.bulk({ batchId }).delete()`) are auto-generated from the Elysia routes. The implementer should verify the exact path shapes match what Eden generates. For the `importDocument` action, we use raw `fetch` because multipart form data with files doesn't work well through Eden Treaty.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/query-keys.ts apps/web/actions/employee-import.ts
git commit -m "feat(web): add mutation keys and server actions for employee import"
```

---

## Task 7: Web — Import Page (Server Component)

**Files:**
- Create: `apps/web/app/(dashboard)/employees/import/page.tsx`

- [ ] **Step 1: Create the server component**

```typescript
// apps/web/app/(dashboard)/employees/import/page.tsx
export const dynamic = 'force-dynamic';

import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import {
  prefetchLocationsList,
  prefetchJobPositionsList,
} from '@/lib/server-functions';
import { ImportClient } from './import-client';

export default async function EmployeeImportPage(): Promise<React.ReactElement> {
  const queryClient = getQueryClient();
  const { organization, organizationRole, userRole } = await getAdminAccessContext();

  // Prefetch without await for streaming
  prefetchLocationsList(queryClient, {
    organizationId: organization.organizationId,
  });
  prefetchJobPositionsList(queryClient, {
    organizationId: organization.organizationId,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrgProvider value={{ ...organization, organizationRole, userRole }}>
        <ImportClient />
      </OrgProvider>
    </HydrationBoundary>
  );
}
```

Note: The implementer should verify that `prefetchLocationsList` and `prefetchJobPositionsList` exist in `server-functions.ts`. If not, add them following the existing `prefetchEmployeesList` pattern.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(dashboard\)/employees/import/page.tsx
git commit -m "feat(web): add employee import server component page"
```

---

## Task 8: Web — Import Client Component (Wizard Flow)

**Files:**
- Create: `apps/web/app/(dashboard)/employees/import/import-client.tsx`

This is the largest task. The client component implements the 4-step wizard: Config → Processing → Preview → Results.

- [ ] **Step 1: Create the client component with step 1 (Config + Upload)**

```typescript
// apps/web/app/(dashboard)/employees/import/import-client.tsx
'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, Plus, Trash2, AlertTriangle, Check, X, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchLocationsList, fetchJobPositionsList, fetchEmployeesList } from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
  importDocument,
  bulkCreateEmployees,
  undoBulkImport,
} from '@/actions/employee-import';
import { toast } from 'sonner';

// --- Types ---

interface ExtractedEmployee {
  firstName: string;
  lastName: string;
  dailyPay: number | null;
  confidence: number;
  fieldConfidence: {
    firstName: number;
    lastName: number;
    dailyPay: number;
  };
  locationId: string;
  jobPositionId: string;
  paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}

interface PreviewRow extends ExtractedEmployee {
  id: string; // client-side temporary ID
  code: string;
  included: boolean;
  isDuplicate: boolean;
  validationErrors: string[];
}

interface ImportResult {
  batchId: string;
  results: Array<{ index: number; success: boolean; employeeId?: string; error?: string }>;
  summary: { total: number; created: number; failed: number };
}

type ImportStep = 'config' | 'processing' | 'preview' | 'confirming' | 'results';

interface ProcessingProgress {
  step: string;
  currentPage?: number;
  totalPages?: number;
  message: string;
}

// --- Constants ---

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.heic,.heif,.pdf';
const LOW_CONFIDENCE_THRESHOLD = 0.7;

// --- Component ---

export function ImportClient(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { organizationId } = useOrgContext();

  // Wizard state
  const [step, setStep] = useState<ImportStep>('config');
  const [processingMessage, setProcessingMessage] = useState('');

  // Config state
  const [defaultLocationId, setDefaultLocationId] = useState('');
  const [defaultJobPositionId, setDefaultJobPositionId] = useState('');
  const [defaultPaymentFrequency, setDefaultPaymentFrequency] = useState<
    'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  >('MONTHLY');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [nextCode, setNextCode] = useState(1);

  // Results state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch locations and job positions
  const { data: locationsData } = useQuery({
    queryKey: queryKeys.locations.list({ organizationId }),
    queryFn: () => fetchLocationsList({ organizationId }),
  });
  const { data: jobPositionsData } = useQuery({
    queryKey: queryKeys.jobPositions.list({ organizationId }),
    queryFn: () => fetchJobPositionsList({ organizationId }),
  });

  const locations = locationsData?.data ?? [];
  const jobPositions = jobPositionsData?.data ?? [];

  // --- File handling ---

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE);

    if (validFiles.length < files.length) {
      toast.error('Algunos archivos superan el límite de 10MB y fueron excluidos.');
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE);

    if (validFiles.length < files.length) {
      toast.error('Algunos archivos superan el límite de 10MB y fueron excluidos.');
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Import mutation ---

  const importMutation = useMutation({
    mutationKey: mutationKeys.employees.importDocument,
    mutationFn: async (files: File[]) => {
      const allEmployees: ExtractedEmployee[] = [];
      let totalPages = 0;

      for (let i = 0; i < files.length; i++) {
        setProcessingMessage(`Procesando archivo ${i + 1} de ${files.length}...`);

        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('defaultLocationId', defaultLocationId);
        formData.append('defaultJobPositionId', defaultJobPositionId);
        formData.append('defaultPaymentFrequency', defaultPaymentFrequency);

        const result = await importDocument(formData);

        if (!result.success || !result.data) {
          throw new Error(result.error ?? 'Error procesando archivo');
        }

        const data = result.data as {
          employees: ExtractedEmployee[];
          processingMeta: { pagesProcessed: number };
        };

        allEmployees.push(...data.employees);
        totalPages += data.processingMeta.pagesProcessed;
      }

      return { employees: allEmployees, pagesProcessed: totalPages };
    },
    onSuccess: async (data) => {
      // Check for duplicates against existing employees
      const existingEmployees = await fetchEmployeesList({
        organizationId,
        limit: 1000,
        offset: 0,
      });
      const existingNames = new Set(
        existingEmployees.data.map(
          (e) => `${e.firstName.toLowerCase()} ${e.lastName.toLowerCase()}`,
        ),
      );

      const rows: PreviewRow[] = data.employees.map((emp, i) => {
        const code = `EMP-${String(nextCode + i).padStart(3, '0')}`;
        const fullName = `${emp.firstName.toLowerCase()} ${emp.lastName.toLowerCase()}`;
        const isDuplicate = existingNames.has(fullName);

        const validationErrors: string[] = [];
        if (!emp.firstName.trim()) validationErrors.push('Nombre es requerido');
        if (!emp.lastName.trim()) validationErrors.push('Apellido es requerido');
        if (emp.dailyPay !== null && emp.dailyPay <= 0)
          validationErrors.push('Sueldo debe ser mayor a 0');

        return {
          ...emp,
          id: crypto.randomUUID(),
          code,
          included: true,
          isDuplicate,
          validationErrors,
        };
      });

      setPreviewRows(rows);
      setNextCode((prev) => prev + data.employees.length);
      setStep('preview');
    },
    onError: (error) => {
      toast.error(error.message);
      setStep('config');
    },
  });

  // --- Bulk create mutation ---

  const bulkCreateMutation = useMutation({
    mutationKey: mutationKeys.employees.bulkCreate,
    mutationFn: async () => {
      const includedRows = previewRows.filter((r) => r.included);
      return bulkCreateEmployees({
        employees: includedRows.map((r) => ({
          code: r.code,
          firstName: r.firstName,
          lastName: r.lastName,
          dailyPay: r.dailyPay ?? 0,
          paymentFrequency: r.paymentFrequency,
          jobPositionId: r.jobPositionId,
          locationId: r.locationId,
        })),
      });
    },
    onSuccess: (result) => {
      if (result.success && result.data) {
        setImportResult(result.data as ImportResult);
        queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
        setStep('results');
      } else {
        toast.error(result.error ?? 'Error creando empleados.');
      }
    },
    onError: () => {
      toast.error('Error creando empleados.');
    },
  });

  // --- Undo mutation ---

  const undoMutation = useMutation({
    mutationKey: mutationKeys.employees.undoBulkImport,
    mutationFn: async () => {
      if (!importResult?.batchId) throw new Error('No batch ID');
      return undoBulkImport(importResult.batchId);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Importación deshecha correctamente.');
        queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
        router.push('/employees');
      } else {
        toast.error(result.error ?? 'Error deshaciendo la importación.');
      }
    },
  });

  // --- Handlers ---

  const handleAnalyze = () => {
    if (selectedFiles.length === 0) {
      toast.error('Selecciona al menos un archivo.');
      return;
    }
    if (!defaultLocationId || !defaultJobPositionId) {
      toast.error('Selecciona ubicación y puesto por defecto.');
      return;
    }
    setStep('processing');
    importMutation.mutate(selectedFiles);
  };

  const handleAddMoreFiles = () => {
    fileInputRef.current?.click();
  };

  const handleProcessMoreFiles = async () => {
    if (selectedFiles.length === 0) return;

    // Process only newly added files (those not yet in preview)
    setStep('processing');
    importMutation.mutate(selectedFiles);
  };

  const updateRow = (id: string, updates: Partial<PreviewRow>) => {
    setPreviewRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...updates };
        // Revalidate
        const errors: string[] = [];
        if (!updated.firstName.trim()) errors.push('Nombre es requerido');
        if (!updated.lastName.trim()) errors.push('Apellido es requerido');
        if (updated.dailyPay !== null && updated.dailyPay <= 0)
          errors.push('Sueldo debe ser mayor a 0');
        updated.validationErrors = errors;
        return updated;
      }),
    );
  };

  const deleteRow = (id: string) => {
    setPreviewRows((prev) => prev.filter((row) => row.id !== id));
  };

  const hasValidationErrors = previewRows
    .filter((r) => r.included)
    .some((r) => r.validationErrors.length > 0);

  const handleConfirm = () => {
    if (hasValidationErrors) {
      toast.error('Corrige los errores antes de importar.');
      return;
    }
    setStep('confirming');
    bulkCreateMutation.mutate();
  };

  // --- Render ---

  return (
    <div className="min-w-0 space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => router.push('/employees')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Empleados
      </Button>

      <h1 className="font-display text-3xl font-bold tracking-tight">
        Importar Empleados desde Documento
      </h1>

      {/* Hidden file input for re-use */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Step 1: Config */}
      {step === 'config' && (
        <div className="space-y-6">
          {/* Default selectors */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Ubicación por defecto</Label>
              <Select value={defaultLocationId} onValueChange={setDefaultLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Puesto por defecto</Label>
              <Select value={defaultJobPositionId} onValueChange={setDefaultJobPositionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona puesto" />
                </SelectTrigger>
                <SelectContent>
                  {jobPositions.map((jp) => (
                    <SelectItem key={jp.id} value={jp.id}>
                      {jp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frecuencia de pago</Label>
              <Select
                value={defaultPaymentFrequency}
                onValueChange={(v) =>
                  setDefaultPaymentFrequency(v as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="BIWEEKLY">Quincenal</SelectItem>
                  <SelectItem value="MONTHLY">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 p-8 text-center transition-colors hover:border-primary hover:bg-primary-bg"
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Arrastra archivos aquí o haz click para seleccionar
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, HEIC, PDF — Máximo 10MB
            </p>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Archivos seleccionados ({selectedFiles.length})</Label>
              {selectedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <span className="text-sm">{file.name}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleAnalyze} disabled={selectedFiles.length === 0}>
              Analizar documento
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center space-y-6 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-lg font-medium">{processingMessage || 'Analizando documento...'}</p>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {previewRows.length} empleados detectados
            </p>
            <Button variant="outline" onClick={handleAddMoreFiles}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar más archivos
            </Button>
          </div>

          {/* Editable table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse bg-card">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Incluir
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Apellido
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Sueldo diario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Ubicación
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Puesto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Frecuencia
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b transition-colors hover:bg-primary-bg ${
                      row.validationErrors.length > 0
                        ? 'bg-destructive/5'
                        : ''
                    } ${!row.included ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) =>
                          updateRow(row.id, { included: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <code className="text-xs">{row.code}</code>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={row.firstName}
                          onChange={(e) =>
                            updateRow(row.id, { firstName: e.target.value })
                          }
                          className={`h-8 ${
                            row.fieldConfidence.firstName < LOW_CONFIDENCE_THRESHOLD
                              ? 'border-warning'
                              : ''
                          }`}
                        />
                        {row.fieldConfidence.firstName < LOW_CONFIDENCE_THRESHOLD && (
                          <Badge variant="outline" className="shrink-0 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Verificar
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={row.lastName}
                          onChange={(e) =>
                            updateRow(row.id, { lastName: e.target.value })
                          }
                          className={`h-8 ${
                            row.fieldConfidence.lastName < LOW_CONFIDENCE_THRESHOLD
                              ? 'border-warning'
                              : ''
                          }`}
                        />
                        {row.fieldConfidence.lastName < LOW_CONFIDENCE_THRESHOLD && (
                          <Badge variant="outline" className="shrink-0 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Verificar
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={row.dailyPay ?? ''}
                          onChange={(e) =>
                            updateRow(row.id, {
                              dailyPay: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`h-8 w-28 ${
                            row.fieldConfidence.dailyPay < LOW_CONFIDENCE_THRESHOLD
                              ? 'border-warning'
                              : ''
                          }`}
                          placeholder="$0.00"
                        />
                        {row.fieldConfidence.dailyPay < LOW_CONFIDENCE_THRESHOLD && (
                          <Badge variant="outline" className="shrink-0 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Verificar
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={row.locationId}
                        onValueChange={(v) => updateRow(row.id, { locationId: v })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={row.jobPositionId}
                        onValueChange={(v) =>
                          updateRow(row.id, { jobPositionId: v })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {jobPositions.map((jp) => (
                            <SelectItem key={jp.id} value={jp.id}>
                              {jp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={row.paymentFrequency}
                        onValueChange={(v) =>
                          updateRow(row.id, {
                            paymentFrequency: v as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WEEKLY">Semanal</SelectItem>
                          <SelectItem value="BIWEEKLY">Quincenal</SelectItem>
                          <SelectItem value="MONTHLY">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        {row.isDuplicate && (
                          <Badge variant="outline" className="border-info text-info">
                            Duplicado
                          </Badge>
                        )}
                        {row.validationErrors.length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {row.validationErrors.length} error(es)
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteRow(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            <AlertTriangle className="mr-1 inline h-3 w-3 text-warning" />
            = confianza baja, verificar manualmente. Campos vacíos requeridos marcados en rojo.
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push('/employees')}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={
                hasValidationErrors ||
                previewRows.filter((r) => r.included).length === 0
              }
            >
              Importar {previewRows.filter((r) => r.included).length} empleados
            </Button>
          </div>
        </div>
      )}

      {/* Step 3.5: Confirming */}
      {step === 'confirming' && (
        <div className="flex flex-col items-center justify-center space-y-6 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-lg font-medium">Creando empleados...</p>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && importResult && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Importación completada</h2>

          {importResult.summary.created > 0 && (
            <div className="flex items-start gap-3 rounded-lg border-l-4 border-l-success bg-success/10 p-4">
              <Check className="mt-0.5 h-5 w-5 text-success" />
              <p className="font-medium text-success">
                {importResult.summary.created} empleados creados correctamente
              </p>
            </div>
          )}

          {importResult.summary.failed > 0 && (
            <div className="space-y-2 rounded-lg border-l-4 border-l-destructive bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <X className="mt-0.5 h-5 w-5 text-destructive" />
                <p className="font-medium text-destructive">
                  {importResult.summary.failed} empleados fallaron:
                </p>
              </div>
              <ul className="ml-8 space-y-1 text-sm text-destructive">
                {importResult.results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <li key={r.index}>
                      Fila {r.index + 1}: {r.error}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => undoMutation.mutate()}
              disabled={undoMutation.isPending}
              className="text-destructive"
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Deshacer importación
            </Button>
            <Button onClick={() => router.push('/employees')}>
              Ir a empleados
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

The implementer should adapt this code to match exact import paths and type shapes from the codebase. Key adaptation points:

- The `fetchLocationsList` and `fetchJobPositionsList` return types should match what the existing codebase defines (check `client-functions.ts` for exact shapes).
- The `toast` import may use `sonner` or the project's existing toast mechanism — check existing usage patterns.
- The `useOrgContext()` hook returns `organizationId` — verify the exact field name.
- CSS class names like `border-warning`, `text-warning`, `bg-primary-bg` follow the SEN Design System tokens but need to be verified against the project's Tailwind config.
- The `Badge` component may not have all the variants used here — adapt to what's available or extend the component.

- [ ] **Step 2: Verify the page renders**

Run: `cd apps/web && bun run dev`
Navigate to `http://localhost:3001/employees/import` (or whatever port the web app runs on).
Expected: The config page renders with location/position dropdowns and file dropzone.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/employees/import/import-client.tsx
git commit -m "feat(web): add employee import wizard client component"
```

---

## Task 9: Web — Add Split Button to Employees Page

**Files:**
- Modify: `apps/web/components/employees/employee-detail-dialog.tsx`

- [ ] **Step 1: Update the employees page header**

In `apps/web/components/employees/employee-detail-dialog.tsx`, find the `ResponsivePageHeader` actions area (around line 573-584). Replace the single button with a button group containing a dropdown:

**Before:**
```tsx
<ResponsivePageHeader
  title={t('title')}
  description={t('subtitle')}
  actions={
    <DialogTrigger asChild>
      <Button data-testid="employees-add-button" onClick={handleCreateNew}>
        <Plus className="mr-2 h-4 w-4" />
        {t('actions.addEmployee')}
      </Button>
    </DialogTrigger>
  }
/>
```

**After:**
```tsx
<ResponsivePageHeader
  title={t('title')}
  description={t('subtitle')}
  actions={
    <div className="flex items-center gap-1">
      <DialogTrigger asChild>
        <Button data-testid="employees-add-button" onClick={handleCreateNew} className="rounded-r-none">
          <Plus className="mr-2 h-4 w-4" />
          {t('actions.addEmployee')}
        </Button>
      </DialogTrigger>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-l-primary-foreground/20 px-2">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push('/employees/import')}>
            <Upload className="mr-2 h-4 w-4" />
            Importar desde documento
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  }
/>
```

Add the necessary imports at the top of the file:

```typescript
import { ChevronDown, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
```

And add `const router = useRouter();` in the component body (if not already present).

Note: The implementer should check if `DropdownMenu` and related components are already imported in this file. If they need `useRouter`, check if Next.js `useRouter` is available in this context or if navigation should be handled differently (e.g., via `Link` component).

- [ ] **Step 2: Verify the split button renders**

Run: `cd apps/web && bun run dev`
Navigate to the employees page.
Expected: The "Agregar empleado" button has a dropdown arrow next to it. Clicking the arrow shows "Importar desde documento" option. Clicking it navigates to `/employees/import`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/employees/employee-detail-dialog.tsx
git commit -m "feat(web): add import from document option to employees page header"
```

---

## Task 10: Environment Variable and Final Verification

**Files:**
- Modify: `apps/api/.env` (or `.env.example`)

- [ ] **Step 1: Add OPENROUTER_API_KEY to environment**

Add to `apps/api/.env`:

```
OPENROUTER_API_KEY=your-openrouter-api-key-here
```

If there's a `.env.example`, add it there as well:

```
OPENROUTER_API_KEY=
```

- [ ] **Step 2: Run all API tests**

Run: `cd apps/api && bun test`
Expected: All existing tests still pass, new tests pass.

- [ ] **Step 3: Run the full application**

Run: `bun run dev` (from root, or start API and web separately)
Expected: Both API and web start without errors.

- [ ] **Step 4: End-to-end manual test**

1. Navigate to `/employees`
2. Click the dropdown arrow next to "Agregar empleado"
3. Click "Importar desde documento"
4. Select a location, job position, and payment frequency
5. Upload a test image or PDF with employee names
6. Verify the processing indicator shows
7. Verify the preview table shows extracted employees
8. Edit a name, delete a row, change a location
9. Click "Importar X empleados"
10. Verify results screen shows success/failure counts
11. Click "Deshacer importación"
12. Verify employees are removed

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete employee bulk import from document feature"
```
