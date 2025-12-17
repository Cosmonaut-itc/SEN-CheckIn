---
name: Mobile Dark Mode Implementation
overview: Implement proper light/dark mode support in the mobile app by configuring HeroUI Native provider with theme detection, updating StatusBar to adapt dynamically, adding dark mode CSS variables for Tailwind/uniwind, and refactoring hardcoded colors in StyleSheet-based components.
todos:
    - id: create-theme-provider
      content: Create ThemeProvider context in providers/theme-provider.tsx
      status: pending
    - id: update-root-layout
      content: Update _layout.tsx with HeroUI theme prop and dynamic StatusBar
      status: pending
      dependencies:
          - create-theme-provider
    - id: configure-css-variables
      content: Add dark mode CSS variables in global.css
      status: pending
    - id: update-scanner-styles
      content: Replace hardcoded colors in scanner.tsx StyleSheet with theme-aware styles
      status: pending
      dependencies:
          - create-theme-provider
    - id: extend-theme-constants
      content: Extend Colors object in constants/theme.ts with additional semantic colors
      status: pending
    - id: verify-all-screens
      content: Verify and fix any remaining hardcoded colors across all screens
      status: pending
      dependencies:
          - update-root-layout
          - configure-css-variables
---

# Mobile App Light/Dark Mode Implementation

## Problem Summary

The mobile app UI breaks in dark mode because:

1. `HeroUINativeProvider` doesn't receive theme configuration
2. `StatusBar` is hardcoded to "light" style
3. No CSS variables defined in `global.css` for dark mode
4. `scanner.tsx` uses hardcoded colors in StyleSheet that don't adapt to theme
5. Color scheme detection exists (`useColorScheme` hook) but isn't wired up to providers

## Implementation Plan

### 1. Create Theme Provider Context

Create a new theme provider that wraps the app and provides color scheme detection to all components:

**File:** [`apps/mobile/providers/theme-provider.tsx`](apps/mobile/providers/theme-provider.tsx) (new)

- Use `useColorScheme` from existing hooks to detect system preference
- Export context hook for child components to access current theme
- Memoize theme value to prevent unnecessary re-renders

### 2. Update Root Layout with Theme Support

**File:** [`apps/mobile/app/_layout.tsx`](apps/mobile/app/_layout.tsx)

Changes:

- Pass `theme` prop to `HeroUINativeProvider` based on color scheme
- Update `StatusBar` to use dynamic style (`"light"` for dark mode, `"dark"` for light mode)
- Wrap providers with the new `ThemeProvider`
- Add `colorScheme` attribute to root container for Tailwind dark mode class switching

### 3. Configure Dark Mode CSS Variables

**File:** [`apps/mobile/global.css`](apps/mobile/global.css)

Add CSS variables for dark mode that Tailwind/uniwind can use:

```css
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';

@source '../../node_modules/heroui-native/lib';

:root {
	--color-background: #ffffff;
	--color-foreground: #11181c;
	--color-foreground-500: #687076;
	--color-foreground-400: #9ba1a6;
	--color-content1: #f4f4f5;
	--color-content2: #e4e4e7;
	--color-default-200: #e4e4e7;
}

.dark,
[data-theme='dark'] {
	--color-background: #151718;
	--color-foreground: #ecedee;
	--color-foreground-500: #9ba1a6;
	--color-foreground-400: #71767a;
	--color-content1: #27272a;
	--color-content2: #3f3f46;
	--color-default-200: #3f3f46;
}
```

### 4. Update Scanner Screen Hardcoded Styles

**File:** [`apps/mobile/app/(main)/scanner.tsx`](<apps/mobile/app/(main)/scanner.tsx>)

- Replace hardcoded colors in `StyleSheet.create()` with theme-aware alternatives
- Use `useThemeColor` hook or CSS classes for dynamic styling
- Key areas to update:
    - `centeredContainer.backgroundColor`
    - `loadingText.color`
    - `permissionCard.backgroundColor`
    - `permissionTitle.color` and `permissionDescription.color`

### 5. Update Theme Constants

**File:** [`apps/mobile/constants/theme.ts`](apps/mobile/constants/theme.ts)

Extend the existing color definitions to include additional semantic colors needed for the app (content backgrounds, borders, etc.).

### 6. Update Existing Themed Components

**Files:**

- [`apps/mobile/components/themed-text.tsx`](apps/mobile/components/themed-text.tsx)
- [`apps/mobile/components/themed-view.tsx`](apps/mobile/components/themed-view.tsx)

These are already implemented correctly but ensure they're used where appropriate or deprecated in favor of Tailwind classes with dark mode support.

## Reference Documentation

### Expo Color Schemes Guide

- https://docs.expo.dev/guides/color-schemes/
- Covers `useColorScheme`, `userInterfaceStyle` in app.json (already set to "automatic"), and StatusBar configuration

### Tailwind CSS Dark Mode

- Uses `dark:` variant prefix for dark mode styles
- Can be configured with `class` or `media` strategy
- For uniwind/React Native, typically uses class-based dark mode switching

### HeroUI Native Provider

- The `HeroUINativeProvider` accepts a `theme` prop (`"light"` | `"dark"`)
- This controls the default color scheme for all HeroUI components (Button, Card, etc.)

## Testing Checklist

After implementation, verify on both iOS and Android:

- [ ] Toggle device dark mode and confirm UI updates
- [ ] Login screen text and backgrounds visible in both modes
- [ ] Device setup screen fully readable in dark mode
- [ ] Scanner screen overlays and cards adapt correctly
- [ ] Settings screen maintains readability
- [ ] StatusBar icon colors adapt appropriately
