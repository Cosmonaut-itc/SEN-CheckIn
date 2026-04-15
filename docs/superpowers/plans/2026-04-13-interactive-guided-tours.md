# Interactive Guided Tours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app guided tour system (React Joyride) to the web dashboard so every section has a tooltip-based walkthrough that auto-launches on first visit and can be replayed via a help button.

**Architecture:** A `TourProvider` context wraps the dashboard layout and manages Joyride state. Per-section tour definitions live in `lib/tours/`. A new `tour_progress` DB table + API endpoints track completion per user per organization. A `useTour` hook orchestrates auto-launch and replay logic. A `TourHelpButton` component enables replaying tours.

**Tech Stack:** React Joyride, Drizzle ORM (PostgreSQL), Elysia routes, React Query, next-intl, Radix UI

---

## File Map

### API (apps/api)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/db/schema.ts` | Add `tourProgress` table definition |
| Create | `drizzle/0048_tour_progress.sql` | Migration SQL |
| Create | `src/schemas/tours.ts` | Zod validation schemas for tour endpoints |
| Create | `src/routes/tours.ts` | GET/POST/DELETE tour progress endpoints |
| Modify | `src/app.ts` | Register `tourRoutes` in protected routes |

### Web (apps/web)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/tours/types.ts` | TourStep, TourConfig types |
| Create | `lib/tours/registry.ts` | Tour registry (Map of tourId → TourConfig) |
| Create | `lib/tours/dashboard.ts` | Dashboard section tour steps |
| Create | `components/tour-provider.tsx` | Context provider + Joyride wrapper |
| Create | `components/tour-help-button.tsx` | Reusable help button component |
| Create | `hooks/use-tour.ts` | Hook for auto-launch + replay |
| Modify | `lib/query-keys.ts` | Add `tours` query keys |
| Create | `lib/tour-client-functions.ts` | Client-side API functions for tours |
| Create | `lib/tour-server-functions.ts` | Server-side prefetch for tour progress |
| Modify | `app/providers.tsx` | Wrap children with TourProvider |
| Modify | `messages/es.json` | Add `Tours` i18n namespace |
| Modify | `app/(dashboard)/dashboard/dashboard-client.tsx` | Add useTour + TourHelpButton |

---

## Task 1: Install React Joyride

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn && bun add react-joyride --cwd apps/web
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun pm ls | grep joyride
```

Expected: `react-joyride@X.X.X` in the output.

- [ ] **Step 3: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/package.json bun.lock
git commit -m "chore(web): add react-joyride dependency"
```

---

## Task 2: Add `tourProgress` table to DB schema

**Files:**
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add the table definition**

Add after the last table export in `apps/api/src/db/schema.ts`:

```typescript
// ============================================================================
// Tour Progress
// ============================================================================

/**
 * Tour progress table - tracks guided tour completion per user per organization.
 * Stores whether a user has completed or skipped each section's tutorial.
 */
export const tourProgress = pgTable(
	'tour_progress',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		tourId: text('tour_id').notNull(),
		status: text('status').notNull(), // 'completed' | 'skipped'
		completedAt: timestamp('completed_at').defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex('tour_progress_user_org_tour_uniq').on(
			table.userId,
			table.organizationId,
			table.tourId,
		),
		index('tour_progress_user_org_idx').on(table.userId, table.organizationId),
	],
);
```

- [ ] **Step 2: Generate the migration**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api && bun run drizzle-kit generate
```

Expected: A new migration file is created in `drizzle/` (likely `0048_tour_progress.sql`).

- [ ] **Step 3: Verify the generated migration SQL**

Read the generated migration file and confirm it contains:
- `CREATE TABLE "tour_progress"` with all columns
- The unique index on `(user_id, organization_id, tour_id)`
- The composite index on `(user_id, organization_id)`
- Foreign key constraints to `user` and `organization` with `ON DELETE cascade`

- [ ] **Step 4: Run the migration against the dev DB**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api && bun run drizzle-kit migrate
```

Expected: Migration applies successfully with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): add tour_progress table for guided tour tracking"
```

---

## Task 3: Create API schemas and route for tours

**Files:**
- Create: `apps/api/src/schemas/tours.ts`
- Create: `apps/api/src/routes/tours.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create Zod schemas for tour endpoints**

Create `apps/api/src/schemas/tours.ts`:

```typescript
import { z } from 'zod';

/**
 * Path parameter schema for tour-specific endpoints.
 */
export const tourIdParamSchema = z.object({
	tourId: z.string().min(1, 'tourId is required'),
});

/**
 * Body schema for marking a tour as completed or skipped.
 */
export const completeTourBodySchema = z.object({
	status: z.enum(['completed', 'skipped']),
});

export type TourIdParam = z.infer<typeof tourIdParamSchema>;
export type CompleteTourBody = z.infer<typeof completeTourBodySchema>;
```

- [ ] **Step 2: Create the tour routes file**

Create `apps/api/src/routes/tours.ts`:

```typescript
import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { tourProgress } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { completeTourBodySchema, tourIdParamSchema } from '../schemas/tours.js';
import { resolveOrganizationId } from '../utils/organization.js';

/**
 * Tour progress routes for tracking guided tour completion.
 *
 * @module routes/tours
 */
export const tourRoutes = new Elysia({ prefix: '/tours' })
	.use(combinedAuthPlugin)

	/**
	 * Get all tour progress for the current user in the active organization.
	 *
	 * @route GET /tours/progress
	 */
	.get(
		'/progress',
		async ({
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const userId = authType === 'session' ? session!.userId : null;
			if (!userId) {
				set.status = 401;
				return buildErrorResponse('Session auth required', 401);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
			}

			const results = await db
				.select({
					tourId: tourProgress.tourId,
					status: tourProgress.status,
					completedAt: tourProgress.completedAt,
				})
				.from(tourProgress)
				.where(
					and(
						eq(tourProgress.userId, userId),
						eq(tourProgress.organizationId, organizationId),
					),
				);

			return { data: { tours: results } };
		},
	)

	/**
	 * Mark a tour as completed or skipped (upsert).
	 *
	 * @route POST /tours/:tourId/complete
	 */
	.post(
		'/:tourId/complete',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const userId = authType === 'session' ? session!.userId : null;
			if (!userId) {
				set.status = 401;
				return buildErrorResponse('Session auth required', 401);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
			}

			const { tourId } = params;
			const { status } = body;

			await db
				.insert(tourProgress)
				.values({
					userId,
					organizationId,
					tourId,
					status,
				})
				.onConflictDoUpdate({
					target: [tourProgress.userId, tourProgress.organizationId, tourProgress.tourId],
					set: {
						status,
						completedAt: new Date(),
					},
				});

			return { data: { tourId, status } };
		},
		{
			params: tourIdParamSchema,
			body: completeTourBodySchema,
		},
	)

	/**
	 * Reset a tour's progress (delete the record).
	 *
	 * @route DELETE /tours/:tourId/progress
	 */
	.delete(
		'/:tourId/progress',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const userId = authType === 'session' ? session!.userId : null;
			if (!userId) {
				set.status = 401;
				return buildErrorResponse('Session auth required', 401);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required', 400);
			}

			const { tourId } = params;

			await db
				.delete(tourProgress)
				.where(
					and(
						eq(tourProgress.userId, userId),
						eq(tourProgress.organizationId, organizationId),
						eq(tourProgress.tourId, tourId),
					),
				);

			return { data: { tourId, deleted: true } };
		},
		{
			params: tourIdParamSchema,
		},
	);
```

- [ ] **Step 3: Register tour routes in app.ts**

In `apps/api/src/app.ts`, add the import at the top with the other route imports:

```typescript
import { tourRoutes } from './routes/tours.js';
```

Then add `.use(tourRoutes)` inside `createProtectedRoutes()`, after the last `.use(...)` line (after `.use(incapacityRoutes)`):

```typescript
.use(incapacityRoutes)
.use(tourRoutes)
```

- [ ] **Step 4: Verify the API compiles**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api && bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/api/src/schemas/tours.ts apps/api/src/routes/tours.ts apps/api/src/app.ts
git commit -m "feat(api): add tour progress endpoints (GET/POST/DELETE)"
```

---

## Task 4: Add tour query keys and client functions (web)

**Files:**
- Modify: `apps/web/lib/query-keys.ts`
- Create: `apps/web/lib/tour-client-functions.ts`

- [ ] **Step 1: Add tour query keys**

In `apps/web/lib/query-keys.ts`, add after the `deviceAuth` entry in `queryKeys` (before the closing `} as const;`):

```typescript
	/**
	 * Query keys for guided tour progress.
	 */
	tours: {
		all: ['tours'] as const,
		progress: () => ['tours', 'progress'] as const,
	},
```

Add after the `deviceAuth` entry in `mutationKeys`:

```typescript
	tours: {
		complete: ['tours', 'complete'] as const,
		reset: ['tours', 'reset'] as const,
	},
```

- [ ] **Step 2: Create client functions for tour API**

Create `apps/web/lib/tour-client-functions.ts`:

```typescript
/**
 * Client-side API functions for guided tour progress.
 *
 * @module tour-client-functions
 */

import { api } from '@/lib/api';
import { getApiResponseData } from '@/lib/api-response';

/**
 * Shape of a single tour progress record from the API.
 */
export interface TourProgressRecord {
	tourId: string;
	status: string;
	completedAt: string;
}

/**
 * Fetches all tour progress for the current user in the active organization.
 *
 * @returns Array of tour progress records
 */
export async function fetchTourProgress(): Promise<TourProgressRecord[]> {
	const response = await api.tours.progress.get();
	const data = getApiResponseData(response);
	return data?.tours ?? [];
}

/**
 * Marks a tour as completed or skipped.
 *
 * @param tourId - The tour identifier
 * @param status - Whether the tour was completed or skipped
 */
export async function completeTour(
	tourId: string,
	status: 'completed' | 'skipped',
): Promise<void> {
	await api.tours({ tourId }).complete.post({ status });
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/lib/query-keys.ts apps/web/lib/tour-client-functions.ts
git commit -m "feat(web): add tour progress query keys and client functions"
```

---

## Task 5: Add i18n translations for tours

**Files:**
- Modify: `apps/web/messages/es.json`

- [ ] **Step 1: Add the Tours namespace**

Add a new `"Tours"` key to `apps/web/messages/es.json` (at the top level, alongside `"Common"`, `"Sidebar"`, etc.):

```json
"Tours": {
    "skipConfirmTitle": "Omitir tutorial?",
    "skipConfirmMessage": "Puedes repetirlo desde el botón de ayuda (?) en cualquier momento.",
    "skipConfirmButton": "Sí, omitir",
    "skipCancelButton": "Continuar tutorial",
    "completedMessage": "Tutorial completado! Puedes repetirlo desde el botón de ayuda.",
    "helpButtonTooltip": "Repetir tutorial de esta sección",
    "progressLabel": "Paso {current} de {total}",
    "nextButton": "Siguiente",
    "prevButton": "Anterior",
    "skipButton": "Omitir tutorial",
    "dashboard": {
        "step1": "Aquí puedes ver los contadores principales de tu organización: empleados, dispositivos, ubicaciones y puestos.",
        "step2": "Esta sección muestra los empleados presentes hoy con reconocimiento facial.",
        "step3": "El mapa te permite visualizar la ubicación de tus sucursales."
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/messages/es.json
git commit -m "feat(web): add Spanish i18n translations for guided tours"
```

---

## Task 6: Create tour types and dashboard tour definition

**Files:**
- Create: `apps/web/lib/tours/types.ts`
- Create: `apps/web/lib/tours/dashboard.ts`
- Create: `apps/web/lib/tours/registry.ts`

- [ ] **Step 1: Create tour types**

Create `apps/web/lib/tours/types.ts`:

```typescript
import type { Placement } from 'react-joyride';

/**
 * A single step in a guided tour.
 */
export interface TourStep {
	/** CSS selector for the element to highlight */
	target: string;
	/** i18n key within the Tours namespace (e.g., 'dashboard.step1') */
	contentKey: string;
	/** Tooltip placement relative to the target */
	placement: Placement;
}

/**
 * Configuration for a section's guided tour.
 */
export interface TourConfig {
	/** Unique tour identifier, used in tour_progress table */
	id: string;
	/** Route path prefix where this tour activates (e.g., '/dashboard') */
	section: string;
	/** Whether this tour is only for admin/owner/superuser roles */
	adminOnly: boolean;
	/** Ordered list of steps */
	steps: TourStep[];
}
```

- [ ] **Step 2: Create dashboard tour definition**

Create `apps/web/lib/tours/dashboard.ts`:

```typescript
import type { TourConfig } from './types';

/**
 * Guided tour for the main dashboard section.
 * Covers: KPI counters, present employees, and location map.
 */
export const dashboardTour: TourConfig = {
	id: 'dashboard',
	section: '/dashboard',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="dashboard-counters"]',
			contentKey: 'dashboard.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="dashboard-present"]',
			contentKey: 'dashboard.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="dashboard-map"]',
			contentKey: 'dashboard.step3',
			placement: 'top',
		},
	],
};
```

- [ ] **Step 3: Create the tour registry**

Create `apps/web/lib/tours/registry.ts`:

```typescript
import type { TourConfig } from './types';
import { dashboardTour } from './dashboard';

/**
 * Central registry of all section tours.
 * Maps tour ID → TourConfig for lookup by the TourProvider.
 */
const tours: TourConfig[] = [
	dashboardTour,
];

/**
 * Lookup a tour config by its ID.
 */
export function getTourById(tourId: string): TourConfig | undefined {
	return tours.find((t) => t.id === tourId);
}

/**
 * Lookup a tour config by route path.
 * Matches the longest prefix (e.g., '/employees/import' matches '/employees').
 */
export function getTourByPath(pathname: string): TourConfig | undefined {
	return tours
		.filter((t) => pathname.startsWith(t.section))
		.sort((a, b) => b.section.length - a.section.length)[0];
}

/**
 * Get all registered tour IDs.
 */
export function getAllTourIds(): string[] {
	return tours.map((t) => t.id);
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/lib/tours/
git commit -m "feat(web): add tour types, dashboard tour definition, and registry"
```

---

## Task 7: Create TourProvider and useTour hook

**Files:**
- Create: `apps/web/components/tour-provider.tsx`
- Create: `apps/web/hooks/use-tour.ts`

- [ ] **Step 1: Create the TourProvider**

Create `apps/web/components/tour-provider.tsx`:

```typescript
'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Joyride, { type CallBackProps, type Step, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { queryKeys } from '@/lib/query-keys';
import { fetchTourProgress, completeTour, type TourProgressRecord } from '@/lib/tour-client-functions';
import { getTourById } from '@/lib/tours/registry';
import type { TourStep } from '@/lib/tours/types';

interface TourContextValue {
	/** Whether any tour is currently running */
	isRunning: boolean;
	/** The tour ID currently running, or null */
	activeTourId: string | null;
	/** Start a tour by ID */
	startTour: (tourId: string) => void;
	/** Check if a tour has been completed or skipped */
	isTourDone: (tourId: string) => boolean;
	/** Tour progress data (loaded from API) */
	progress: TourProgressRecord[];
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

/**
 * Provides guided tour state and Joyride rendering for the entire dashboard.
 * Wrap this around the dashboard layout inside QueryClientProvider.
 */
export function TourProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const t = useTranslations('Tours');
	const queryClient = useQueryClient();

	const [isRunning, setIsRunning] = useState(false);
	const [activeTourId, setActiveTourId] = useState<string | null>(null);
	const [steps, setSteps] = useState<Step[]>([]);
	const [showSkipConfirm, setShowSkipConfirm] = useState(false);
	const joyrideCallbackRef = useRef<((proceed: boolean) => void) | null>(null);

	const { data: progress = [] } = useQuery({
		queryKey: queryKeys.tours.progress(),
		queryFn: fetchTourProgress,
		staleTime: 5 * 60 * 1000,
	});

	const completeMutation = useMutation({
		mutationFn: ({ tourId, status }: { tourId: string; status: 'completed' | 'skipped' }) =>
			completeTour(tourId, status),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });
		},
	});

	const isTourDone = useCallback(
		(tourId: string): boolean => {
			return progress.some((p) => p.tourId === tourId);
		},
		[progress],
	);

	const startTour = useCallback(
		(tourId: string) => {
			const config = getTourById(tourId);
			if (!config) return;

			const joyrideSteps: Step[] = config.steps.map((step: TourStep) => ({
				target: step.target,
				content: t(step.contentKey),
				placement: step.placement,
				disableBeacon: true,
			}));

			setSteps(joyrideSteps);
			setActiveTourId(tourId);
			setIsRunning(true);
		},
		[t],
	);

	const handleJoyrideCallback = useCallback(
		(data: CallBackProps) => {
			const { status, action, type } = data;

			if (status === STATUS.FINISHED) {
				setIsRunning(false);
				if (activeTourId) {
					completeMutation.mutate({ tourId: activeTourId, status: 'completed' });
				}
				setActiveTourId(null);
				return;
			}

			if (status === STATUS.SKIPPED || (type === EVENTS.STEP_AFTER && action === ACTIONS.SKIP)) {
				setIsRunning(false);
				if (activeTourId) {
					completeMutation.mutate({ tourId: activeTourId, status: 'skipped' });
				}
				setActiveTourId(null);
				return;
			}

			if (action === ACTIONS.CLOSE) {
				setIsRunning(false);
				setActiveTourId(null);
			}
		},
		[activeTourId, completeMutation],
	);

	const contextValue = useMemo<TourContextValue>(
		() => ({
			isRunning,
			activeTourId,
			startTour,
			isTourDone,
			progress,
		}),
		[isRunning, activeTourId, startTour, isTourDone, progress],
	);

	return (
		<TourContext.Provider value={contextValue}>
			{children}
			<Joyride
				steps={steps}
				run={isRunning}
				continuous
				showSkipButton
				showProgress
				callback={handleJoyrideCallback}
				locale={{
					next: t('nextButton'),
					back: t('prevButton'),
					skip: t('skipButton'),
					last: t('nextButton'),
				}}
				styles={{
					options: {
						zIndex: 10000,
						primaryColor: 'hsl(var(--primary))',
					},
				}}
			/>
		</TourContext.Provider>
	);
}

/**
 * Access the tour context. Must be used within TourProvider.
 */
export function useTourContext(): TourContextValue {
	const ctx = useContext(TourContext);
	if (!ctx) {
		throw new Error('useTourContext must be used within a TourProvider');
	}
	return ctx;
}
```

- [ ] **Step 2: Create the useTour hook**

Create `apps/web/hooks/use-tour.ts`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useTourContext } from '@/components/tour-provider';

/**
 * Hook for auto-launching a section's guided tour on first visit
 * and providing a restart function for the help button.
 *
 * @param tourId - The tour identifier (e.g., 'dashboard')
 */
export function useTour(tourId: string): {
	restartTour: () => void;
	isTourRunning: boolean;
} {
	const { startTour, isTourDone, isRunning, activeTourId } = useTourContext();
	const hasAutoLaunched = useRef(false);

	useEffect(() => {
		if (hasAutoLaunched.current) return;
		if (isTourDone(tourId)) return;
		if (isRunning) return;

		hasAutoLaunched.current = true;
		const timer = setTimeout(() => {
			startTour(tourId);
		}, 500);

		return () => clearTimeout(timer);
	}, [tourId, isTourDone, isRunning, startTour]);

	const restartTour = () => {
		startTour(tourId);
	};

	return {
		restartTour,
		isTourRunning: isRunning && activeTourId === tourId,
	};
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/components/tour-provider.tsx apps/web/hooks/use-tour.ts
git commit -m "feat(web): add TourProvider context and useTour hook"
```

---

## Task 8: Create TourHelpButton component

**Files:**
- Create: `apps/web/components/tour-help-button.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/tour-help-button.tsx`:

```typescript
'use client';

import React from 'react';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTour } from '@/hooks/use-tour';

interface TourHelpButtonProps {
	tourId: string;
}

/**
 * A help button that replays the guided tour for the current section.
 * Place this in each page's header, next to the title.
 */
export function TourHelpButton({ tourId }: TourHelpButtonProps): React.ReactElement {
	const { restartTour } = useTour(tourId);
	const t = useTranslations('Tours');

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={restartTour}
					className="h-8 w-8"
					aria-label={t('helpButtonTooltip')}
				>
					<CircleHelp className="h-4 w-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				<p>{t('helpButtonTooltip')}</p>
			</TooltipContent>
		</Tooltip>
	);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/components/tour-help-button.tsx
git commit -m "feat(web): add TourHelpButton component"
```

---

## Task 9: Integrate TourProvider into dashboard layout

**Files:**
- Modify: `apps/web/app/providers.tsx`

- [ ] **Step 1: Add TourProvider to the Providers component**

In `apps/web/app/providers.tsx`, add the import:

```typescript
import { TourProvider } from '@/components/tour-provider';
```

Then wrap `{children}` with `<TourProvider>` inside QueryClientProvider:

```typescript
export function Providers({ children }: ProvidersProps): React.ReactElement {
	const queryClient = getQueryClient();

	return (
		<ThemeProvider defaultTheme="system" enableSystem>
			<QueryClientProvider client={queryClient}>
				<TourProvider>
					{children}
				</TourProvider>
				{isDevelopment ? <ReactQueryDevtools initialIsOpen={false} /> : null}
			</QueryClientProvider>
		</ThemeProvider>
	);
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/app/providers.tsx
git commit -m "feat(web): integrate TourProvider into root providers"
```

---

## Task 10: Add tour data attributes and integrate into dashboard page

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Add `data-tour` attributes to key elements**

In `apps/web/app/(dashboard)/dashboard/dashboard-client.tsx`, add `data-tour` attributes to the target elements that the dashboard tour references. The exact elements depend on the current markup, but you need to add:

- `data-tour="dashboard-counters"` to the container wrapping the KPI counter cards (employees, devices, locations, job positions)
- `data-tour="dashboard-present"` to the container wrapping the "present employees" section
- `data-tour="dashboard-map"` to the container wrapping the map component

These are the same selectors referenced in `apps/web/lib/tours/dashboard.ts`.

- [ ] **Step 2: Add TourHelpButton to the dashboard page**

In the same file, add the import:

```typescript
import { TourHelpButton } from '@/components/tour-help-button';
```

Then add `<TourHelpButton tourId="dashboard" />` next to the page title/header area. The exact placement depends on the existing markup — place it inline with the main heading of the page.

- [ ] **Step 3: Verify the app compiles and the dev server runs**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Manual test in browser**

1. Start the dev server: `bun run dev` (from the repo root)
2. Log in to the web app
3. Navigate to `/dashboard`
4. The guided tour should auto-launch with 3 steps highlighting the counters, present employees, and map
5. Click through all steps — verify "completed" is persisted (tour doesn't re-launch on refresh)
6. Click the help (?) button — verify tour replays
7. On a fresh user/org, verify the "Skip" flow shows the confirmation and marks as skipped

- [ ] **Step 5: Commit**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/app/\(dashboard\)/dashboard/dashboard-client.tsx
git commit -m "feat(web): integrate guided tour into dashboard page"
```

---

## Task 11: Add remaining section tour definitions

**Files:**
- Create: `apps/web/lib/tours/employees.ts`
- Create: `apps/web/lib/tours/locations.ts`
- Create: `apps/web/lib/tours/devices.ts`
- Create: `apps/web/lib/tours/job-positions.ts`
- Create: `apps/web/lib/tours/attendance.ts`
- Create: `apps/web/lib/tours/schedules.ts`
- Create: `apps/web/lib/tours/vacations.ts`
- Create: `apps/web/lib/tours/incapacities.ts`
- Create: `apps/web/lib/tours/payroll.ts`
- Create: `apps/web/lib/tours/payroll-settings.ts`
- Create: `apps/web/lib/tours/users.ts`
- Modify: `apps/web/lib/tours/registry.ts`
- Modify: `apps/web/messages/es.json`

This task is intentionally high-level because the specific steps and selectors for each section depend on the actual UI elements on each page. For each section:

- [ ] **Step 1: Read the section's client component** to identify the key interactive elements that need `data-tour` attributes.

- [ ] **Step 2: Create the tour definition file** following the same pattern as `dashboard.ts`. Example for employees:

```typescript
// apps/web/lib/tours/employees.ts
import type { TourConfig } from './types';

export const employeesTour: TourConfig = {
	id: 'employees',
	section: '/employees',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="employees-table"]',
			contentKey: 'employees.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="employees-add-button"]',
			contentKey: 'employees.step2',
			placement: 'left',
		},
		// Add more steps as needed based on the page's UI
	],
};
```

- [ ] **Step 3: Add `data-tour` attributes** to the section's client component for each step target.

- [ ] **Step 4: Add i18n translations** for the section under `Tours.<sectionId>` in `apps/web/messages/es.json`.

- [ ] **Step 5: Register the tour** in `apps/web/lib/tours/registry.ts` by importing it and adding it to the `tours` array.

- [ ] **Step 6: Add `<TourHelpButton tourId="<sectionId>" />`** to the section's client component.

- [ ] **Step 7: Repeat** steps 1-6 for each section listed above.

- [ ] **Step 8: Commit all section tours**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add apps/web/lib/tours/ apps/web/messages/es.json apps/web/app/\(dashboard\)/
git commit -m "feat(web): add guided tour definitions for all dashboard sections"
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Run type check**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/web && bun run tsc --noEmit
```

- [ ] **Step 2: Run API build**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/apps/api && bun run build
```

- [ ] **Step 3: Run existing tests to check for regressions**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn && bun run test
```

- [ ] **Step 4: Manual E2E test**

Start the full stack (`bun run dev` from root) and verify:

1. **First visit auto-launch**: Log in as a new user → navigate to `/dashboard` → tour auto-launches
2. **Step navigation**: Click "Siguiente" through all steps → tour completes
3. **Completion persists**: Refresh `/dashboard` → tour does NOT re-launch
4. **Help button replay**: Click the (?) button → tour replays from step 1
5. **Skip flow**: Navigate to a section with an unseen tour → click "Omitir tutorial" → confirm → tour dismissed, doesn't re-launch on refresh
6. **Cross-section**: Navigate to `/employees` → employees tour auto-launches (independent of dashboard tour)
7. **Admin tours**: Log in as admin → navigate to `/payroll-settings` → admin tour launches
8. **Non-admin**: Log in as regular member → admin-only sections not accessible (existing gate), no admin tours fire

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
cd /Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn
git add -A
git commit -m "fix(web): address tour integration issues found during E2E testing"
```
