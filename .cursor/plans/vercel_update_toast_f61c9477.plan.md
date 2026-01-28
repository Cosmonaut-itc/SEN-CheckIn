---
name: Vercel update toast
overview: Add a production-only “update available” toast that appears when Vercel serves a newer deployment than the one the user currently has loaded, with a button that reloads the page to pick up the latest build.
todos:
    - id: add-version-endpoint
      content: "Create `apps/web/app/api/version/route.ts` that returns deployment/version info with `dynamic='force-dynamic'` and `Cache-Control: no-store`."
      status: pending
    - id: add-update-listener
      content: Add a client component that polls `/api/version`, detects deployment changes (accounting for `__vdpl` skew-protection pinning), and shows a persistent Sonner toast with a reload action.
      status: pending
    - id: mount-and-i18n
      content: Mount the listener in `apps/web/app/layout.tsx` and add Spanish translation keys in `apps/web/messages/es.json`.
      status: pending
    - id: vercel-settings-and-verify
      content: Verify Vercel project setting “Automatically expose System Environment Variables” is enabled; then validate behavior across two production deployments.
      status: pending
---

# Vercel “update available” toast (Next.js + Sonner)

## Goal

- Show a toast when a **new production deployment is live on Vercel** while the user is still browsing an older loaded build.
- Toast should prompt the user to **reload the page** (via a toast button) and also implicitly allow using the browser refresh button.
- Must integrate cleanly with existing Next.js App Router + `next-intl` + Sonner setup in:
    - [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx) (Toaster already mounted)
    - [`apps/web/components/ui/sonner.tsx`](apps/web/components/ui/sonner.tsx) (Sonner wrapper)
    - [`apps/web/messages/es.json`](apps/web/messages/es.json) (Spanish strings)

## References (Context7)

- **Vercel deployment identity**: `VERCEL_DEPLOYMENT_ID` and `VERCEL_SKEW_PROTECTION_ENABLED`, plus `__vdpl` cookie / `dpl` query param patterns (Skew Protection docs).
- **Sonner toast action + persistence**: `toast(..., { action: { label, onClick }, duration: Infinity })` and `toast.dismiss(id)`.
- **Next.js Route Handlers**: `app/api/**/route.ts`, `export const dynamic = 'force-dynamic'`, plus explicit `Cache-Control: no-store`.

## High-level approach

1. Add a tiny **version endpoint** in the web app that returns the current deployment’s identifiers (deployment ID, optional Git SHA, Vercel environment).
2. Add a **client-side listener** mounted near the root that:
    - Captures the _currently loaded_ deployment ID (important when Skew Protection pins users to an older deployment).
    - Periodically checks the **latest production deployment**.
    - When the IDs differ, shows a **persistent toast** with an “Actualizar / Recargar” button that calls `window.location.reload()`.

## Implementation details

### 1) Add a deployment/version endpoint

- **New file**: [`apps/web/app/api/version/route.ts`](apps/web/app/api/version/route.ts)
- Behavior:
    - Return JSON like:
        - `deploymentId: string | null` (from `process.env.VERCEL_DEPLOYMENT_ID`)
        - `gitSha: string | null` (e.g. from `process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` if present)
        - `vercelEnv: 'production' | 'preview' | 'development' | null` (from `process.env.VERCEL_ENV`)
    - Force **dynamic** execution and disable caching:
        - `export const dynamic = 'force-dynamic'`
        - Response header `Cache-Control: 'no-store, max-age=0'`
- Rationale:
    - When Vercel production alias switches to a new deployment, the same origin’s `/api/version` will start returning a different `deploymentId`.

### 2) Client-side polling + toast

- **New client component** (suggested): [`apps/web/components/deployment-update-toast.tsx`](apps/web/components/deployment-update-toast.tsx)
- Responsibilities:
    - Use `next-intl` `useTranslations` for strings (no hardcoded UI copy).
    - On mount:
        - Fetch “current” deployment via `/api/version` **with default credentials** (`credentials: 'same-origin'`) to respect any `__vdpl` pinning.
    - Poll every N minutes (sensible default: 2–5 minutes) and also re-check on tab focus/visibility change:
        - Fetch “latest” deployment via `/api/version` with `credentials: 'omit'` and `cache: 'no-store'` to **avoid sending the HttpOnly `__vdpl` cookie** (so you can see the currently live production deployment even if the user is pinned to an older one).
    - Compare `current.deploymentId` vs `latest.deploymentId`.
    - When different:
        - Show a Sonner toast with:
            - `duration: Infinity`
            - `action: { label: t('action'), onClick: () => window.location.reload() }`
            - An explicit message like “Hay una actualización disponible…”
        - Stop further polling (or keep polling but ensure toast is not duplicated using a stable toast id).
- TypeScript + docs:
    - Strongly type the version payload (e.g. `type DeploymentVersion = { ... }`).
    - Add JSDoc for helper functions (fetchers, comparators).

### 3) Mount the listener near the root

- Update [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx) to render the new client component somewhere inside the existing providers, alongside `<Toaster ... />`.
    - Current relevant area:

```74:78:apps/web/app/layout.tsx
<Providers>
	{children}
	<Toaster richColors position="top-right" />
</Providers>
```

### 4) Add i18n keys (Spanish)

- Update [`apps/web/messages/es.json`](apps/web/messages/es.json) with a new section, e.g.:
    - `"UpdateToast": { "title": "…", "description": "…", "action": "Recargar" }`

### 5) Vercel configuration note (required for best results)

- Ensure the Vercel project has **“Automatically expose System Environment Variables”** enabled; otherwise `VERCEL_DEPLOYMENT_ID` may be unavailable and detection becomes unreliable.
- If Skew Protection is enabled, the plan explicitly accounts for it by using **cookie-less** checks for “latest”.

## Data flow (runtime)

```mermaid
flowchart TD
	clientLoaded[Client_has_loaded_build] --> fetchCurrent[GET_/api/version_(credentials:same-origin)]
	fetchCurrent --> currentId[store_current_deploymentId]
	clientLoaded --> poll[setInterval_or_onFocus]
	poll --> fetchLatest[GET_/api/version_(credentials:omit)]
	fetchLatest --> compare[compare_latest_vs_current]
	compare -->|same| poll
	compare -->|different| showToast[Sonner_toast_duration_Infinity_action_reload]
	showToast --> reload[window.location.reload()]
```

## Validation / test plan

- Manual:
    - Deploy production build A, open site.
    - Deploy production build B.
    - Without refreshing, confirm toast appears within polling interval.
    - Click toast button → page reloads → toast no longer appears.
- Dev/CI checks (when implemented):
    - `bun run lint:web`
    - `bun run check-types:web`
    - (Optional) add a small unit test for the “compare + toast once” logic.
