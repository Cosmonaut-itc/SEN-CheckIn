<!-- cc9ba8b0-e4c8-40b0-9a96-09bf3dc0b59e 000c4fdf-6c9c-4989-9b00-491391ae46c2 -->
# Dark Mode Integration Plan

## Current State

- Dark mode CSS variables already exist in [`globals.css`](apps/web/app/globals.css) (lines 81-113)
- `next-themes@0.4.6` is already installed but not configured
- shadcn/ui components use semantic tokens (`bg-background`, `text-foreground`) that auto-respond to `.dark` class
- Root `<html>` already has `suppressHydrationWarning` attribute

## Implementation Steps

### 1. Create ThemeProvider Component

Create [`apps/web/components/theme-provider.tsx`](apps/web/components/theme-provider.tsx):

- Wrap `next-themes` ThemeProvider with `attribute="class"` (matches `.dark` CSS selector)
- Export for use in providers

### 2. Update Providers

Modify [`apps/web/app/providers.tsx`](apps/web/app/providers.tsx):

- Import and wrap children with ThemeProvider
- Set `defaultTheme="system"` and `enableSystem={true}`

### 3. Create Theme Toggle Component

Create [`apps/web/components/theme-mode-toggle.tsx`](apps/web/components/theme-mode-toggle.tsx):

- Use existing `DropdownMenu` component from `@/components/ui/dropdown-menu`
- Three options: Light (Sun icon), Dark (Moon icon), System (Monitor icon)
- Use `useTheme()` hook from next-themes to get/set theme

### 4. Add Toggle to Dashboard Header

Modify [`apps/web/app/(dashboard)/layout.tsx`](apps/web/app/\\(dashboard)/layout.tsx):

- Import and place `ThemeModeToggle` in the header bar, to the right of the existing `SidebarTrigger`

### 5. (Optional) Add Toggle to Auth Pages

Add theme toggle to sign-in/sign-up pages if desired for consistency outside dashboard.

## Key Files

- `apps/web/components/theme-provider.tsx` (new)
- `apps/web/components/theme-mode-toggle.tsx` (new)
- `apps/web/app/providers.tsx` (modify)
- `apps/web/app/(dashboard)/layout.tsx` (modify)

### To-dos

- [ ] Create ThemeProvider component wrapping next-themes
- [ ] Add ThemeProvider to app/providers.tsx
- [ ] Create ThemeModeToggle dropdown component with Light/Dark/System options
- [ ] Add ThemeModeToggle to dashboard layout header
- [ ] (Optional) Add theme toggle to auth pages for consistency