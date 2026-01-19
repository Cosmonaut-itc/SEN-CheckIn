# apps/web UI review (Web Interface Guidelines)

## Top fixes
- apps/web/components/app-sidebar.tsx:303 - Avatar image missing alt text (add alt or alt="").
- apps/web/components/app-sidebar.tsx:325 - Icon-only sign-out button lacks aria-label (title is not a label).
- apps/web/components/face-enrollment-dialog.tsx:1005 - Icon-only clear-image button lacks aria-label/sr-only text.
- apps/web/components/face-enrollment-dialog.tsx:1119 - Range input missing programmatic label (aria-label/aria-labelledby).
- apps/web/app/(auth)/sign-in/page.tsx:104 - Async error message missing aria-live/role="alert".
- apps/web/app/(dashboard)/devices/devices-client.tsx:319 - Icon-only edit button missing aria-label/sr-only.
- apps/web/app/(dashboard)/devices/devices-client.tsx:333 - Icon-only delete button missing aria-label/sr-only.
- apps/web/app/(dashboard)/locations/locations-client.tsx:629 - Icon-only edit button missing aria-label/sr-only.
- apps/web/app/(dashboard)/locations/locations-client.tsx:643 - Icon-only delete button missing aria-label/sr-only.
- apps/web/app/(dashboard)/organizations/organizations-client.tsx:356 - Icon-only edit button missing aria-label/sr-only.
- apps/web/app/(dashboard)/organizations/organizations-client.tsx:370 - Icon-only delete button missing aria-label/sr-only.
- apps/web/app/(dashboard)/job-positions/job-positions-client.tsx:418 - Icon-only edit button missing aria-label/sr-only.
- apps/web/app/(dashboard)/job-positions/job-positions-client.tsx:432 - Icon-only delete button missing aria-label/sr-only.
- apps/web/app/(dashboard)/api-keys/api-keys-client.tsx:215 - Icon-only visibility toggle missing aria-label/sr-only.
- apps/web/app/(dashboard)/api-keys/api-keys-client.tsx:281 - Icon-only delete button missing aria-label/sr-only.
- apps/web/app/(dashboard)/schedules/components/schedule-exceptions-tab.tsx:319 - Icon-only edit button missing aria-label/sr-only (title not enough).
- apps/web/app/(dashboard)/schedules/components/schedule-exceptions-tab.tsx:330 - Icon-only delete button missing aria-label/sr-only (title not enough).
- apps/web/app/(dashboard)/schedules/components/schedule-templates-tab.tsx:278 - Icon-only edit button missing aria-label/sr-only (title not enough).
- apps/web/app/(dashboard)/schedules/components/schedule-templates-tab.tsx:286 - Icon-only delete button missing aria-label/sr-only (title not enough).
- apps/web/app/(dashboard)/schedules/components/schedule-templates-tab.tsx:296 - Icon-only assign button missing aria-label/sr-only (title not enough).
- apps/web/components/marketing/reveal.tsx:34 - Motion ignores prefers-reduced-motion.
- apps/web/components/ui/sidebar.tsx:276 - Clickable sidebar rail removed from tab order (tabIndex=-1).

## Quick wins
- apps/web/app/(auth)/sign-in/page.tsx:120 - Email/password fields missing autocomplete + spellCheck={false} for credentials.
- apps/web/components/ui/sidebar.tsx:285 - transition-all used; list properties explicitly.
- apps/web/components/ui/button.tsx:8 - transition-all used; list properties explicitly.
- apps/web/components/ui/accordion.tsx:64 - transition-all used; list properties explicitly.
- apps/web/components/theme-mode-toggle.tsx:41 - transition-all used; list properties explicitly.
- apps/web/app/globals.css:46 - Missing color-scheme for dark mode (use `color-scheme: dark` or `light dark`).
