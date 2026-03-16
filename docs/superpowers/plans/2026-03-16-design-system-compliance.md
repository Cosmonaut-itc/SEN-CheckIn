# Design System Compliance — "checa." Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the mobile app to full Paleta Michoacan DS compliance — colors, branding, accessibility, and all 15 pre-release checklist items.

**Architecture:** 5 epics with dependency gates. Epic 1 (Foundation) is blocking. Epics 2-4 run in parallel as subagents. Epic 5 validates everything with dual reviewer subagents. Each issue = 1 atomic commit on branch `feat/design-system-compliance`.

**Tech Stack:** Expo 54, React Native 0.81, HeroUI Native rc.4, Uniwind 1.2, Tailwind CSS v4, expo-splash-screen, sharp (asset generation), Jest + @testing-library/react-native, Playwright

**Spec:** `docs/superpowers/specs/2026-03-16-design-system-compliance-design.md`

**Required Skills:** `superpowers:test-driven-development`, `building-native-ui`, `heroui-native`, Context7 MCP for docs

**Simulators available:**
- iOS (iPhone 17 Pro): logged in, at `exp://192.168.0.106:8081`
- Android (Medium Phone API 36.1): not logged in (onboarding), at `exp://192.168.0.106:8081`

---

## Pre-flight: Create Branch

- [ ] **Step 1: Create feature branch from main**

```bash
cd /Users/felixddhs/VSCODE/REPOS/SEN-CheckIn
git checkout main && git pull
git checkout -b feat/design-system-compliance
```

---

## Chunk 1: Epic 1 — Foundation (BLOCKING)

This epic must complete before Epics 2-4 can start. It updates HeroUI Native, migrates the color system, eliminates the legacy theme file, and cleans up the theme provider.

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/mobile/package.json` | HeroUI Native version bump |
| Rewrite | `apps/mobile/global.css` | Michoacan color tokens (oklch) |
| Delete | `apps/mobile/constants/theme.ts` | Legacy color/font constants |
| Rewrite | `apps/mobile/hooks/use-theme-color.ts` | New hook reading CSS variables |
| Modify | `apps/mobile/providers/theme-provider.tsx` | Remove ThemeName import from deleted file |
| Modify | `apps/mobile/app/(auth)/_layout.tsx` | Migrate Colors usage |
| Modify | `apps/mobile/app/(main)/scanner.tsx` | Migrate Colors/themeColors usage |
| Modify | `apps/mobile/app/(auth)/login.tsx` | Migrate Colors import |
| Modify | `apps/mobile/components/ui/collapsible.tsx` | Migrate Colors import |
| Modify | `apps/mobile/components/themed-text.tsx` | Update useThemeColor import |
| Modify | `apps/mobile/components/themed-view.tsx` | Update useThemeColor import |
| Modify | `apps/mobile/components/parallax-scroll-view.tsx` | Update useThemeColor import |
| Create | `apps/mobile/constants/fonts.ts` | Extracted Fonts export |
| Modify | `apps/mobile/tests/auth-layout.test.tsx` | Update test imports |
| Create | `apps/mobile/tests/theme-migration.test.tsx` | Theme migration verification tests |

---

### Task 1: Update HeroUI Native to v1.0.0-rc.4

**Files:**
- Modify: `apps/mobile/package.json:51` (heroui-native version)
- Test: `apps/mobile/tests/heroui-upgrade.test.tsx`

- [ ] **Step 1: Write failing test for HeroUI rc.4**

```tsx
// apps/mobile/tests/heroui-upgrade.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { HeroUINativeProvider, Button } from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

describe('HeroUI Native rc.4', () => {
  it('renders a Button without crashing', () => {
    const { getByText } = render(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <HeroUINativeProvider>
          <Button>
            <Button.Label>Test</Button.Label>
          </Button>
        </HeroUINativeProvider>
      </GestureHandlerRootView>,
    );
    expect(getByText('Test')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes with current rc.1**

```bash
cd apps/mobile && bun run test -- --testPathPattern=heroui-upgrade
```

Expected: PASS (Button should render with rc.1 too — this is a regression guard)

- [ ] **Step 3: Update HeroUI Native**

```bash
cd apps/mobile && bun add heroui-native@1.0.0-rc.4
```

- [ ] **Step 4: Check for breaking changes**

```bash
cd apps/mobile && bun run check-types
```

Expected: 0 errors. If errors appear, fix type issues before proceeding.

- [ ] **Step 5: Run test again to confirm no regression**

```bash
cd apps/mobile && bun run test -- --testPathPattern=heroui-upgrade
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd apps/mobile && bun run test
```

Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/bun.lock apps/mobile/tests/heroui-upgrade.test.tsx
git commit -m "feat(mobile): [1.1] update heroui-native to v1.0.0-rc.4"
```

---

### Task 2: Migrate global.css to oklch Michoacan Tokens

**Files:**
- Rewrite: `apps/mobile/global.css`
- Test: `apps/mobile/tests/theme-tokens.test.tsx`

- [ ] **Step 1: Consult HeroUI Native rc.4 docs via Context7 MCP**

Use Context7 MCP to query HeroUI Native documentation for the exact theming pattern in rc.4. Specifically check:
- Whether `@layer theme` + `@variant light/dark` is still the correct pattern
- Whether oklch is supported in CSS variables
- What token names HeroUI Native expects (is it `--danger` or `--destructive`? is `--accent` the same as `--primary`?)
- The `@source` path for heroui-native/lib

Also query Uniwind docs for the `@theme inline static` pattern and any rc.4-specific changes.

**If oklch is NOT supported:** Use hex values instead. The spec allows this as a fallback.

- [ ] **Step 2: Write failing test for new token values**

```tsx
// apps/mobile/tests/theme-tokens.test.tsx
/**
 * These tests verify the COLOR DECISIONS, not CSS runtime.
 * They check that our token mapping file contains the correct values
 * from the canonical DS source (:root block).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Michoacan theme tokens', () => {
  const cssContent = readFileSync(
    resolve(__dirname, '../global.css'),
    'utf-8',
  );

  it('contains light mode background token from DS', () => {
    // Canonical value: #FAF7F3
    // Either oklch equivalent or hex
    expect(
      cssContent.includes('#FAF7F3') ||
      cssContent.includes('faf7f3') ||
      cssContent.includes('oklch(')
    ).toBe(true);
  });

  it('contains primary Cobre Michoacano', () => {
    // #B8602A must appear (either as hex or in a comment)
    expect(cssContent.toLowerCase()).toContain('b8602a');
  });

  it('uses --destructive not --danger for red status', () => {
    expect(cssContent).toContain('--destructive');
    // --danger should NOT appear as a token definition
    // (it may appear in HeroUI compatibility aliases)
    const dangerDefinitions = cssContent.match(/--danger\s*:/g);
    // If HeroUI needs --danger, it should be aliased from --destructive
    // The canonical token name must be --destructive
  });

  it('dark mode warning is NOT same as accent', () => {
    // The DS bug: dark --warning was #C85A8A same as --accent
    // We fixed it to #F0B840 (golden amber)
    // Verify the dark variant does NOT use C85A8A for warning
    const darkSection = cssContent.split('@variant dark')[1] || '';
    if (darkSection.includes('--warning')) {
      expect(darkSection.toLowerCase()).not.toContain('c85a8a');
    }
  });

  it('contains all required light mode tokens', () => {
    const requiredTokens = [
      '--background', '--foreground', '--primary', '--secondary',
      '--accent', '--muted', '--card', '--border', '--success',
      '--warning', '--destructive',
    ];
    for (const token of requiredTokens) {
      expect(cssContent).toContain(token);
    }
  });

  it('has both light and dark variants', () => {
    expect(cssContent).toContain('@variant light');
    expect(cssContent).toContain('@variant dark');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-tokens
```

Expected: FAIL (current global.css uses old blue/gray tokens, no #FAF7F3 or #B8602A)

- [ ] **Step 4: Compute exact oklch values**

Create a temporary script to compute exact oklch values from hex. Install culori as a dev dependency:

```bash
cd apps/mobile && bun add -d culori
```

Then run this one-liner to generate all oklch values:

```bash
node -e "
const { oklch, parse } = require('culori');
const colors = {
  // Light mode
  'background-light': '#FAF7F3',
  'foreground-light': '#2B1810',
  'primary': '#B8602A',
  'primary-hover': '#9E4E1E',
  'secondary': '#4A7C3F',
  'accent': '#8B2252',
  'muted-light': '#F3EDE6',
  'muted-fg-light': '#7A6558',
  'muted-fg-subtle-light': '#A8978B',
  'card-fg-light': '#3D2B20',
  'border-light': '#E6DCD3',
  'input-light': '#F0E8E1',
  'ring-light': '#D1C2B6',
  'success-light': '#2D8659',
  'warning-light': '#CC8A17',
  'destructive-light': '#C4302B',
  // Dark mode
  'background-dark': '#110D0A',
  'foreground-dark': '#F0EAE4',
  'primary-dark': '#D4835E',
  'primary-hover-dark': '#E09A78',
  'secondary-dark': '#7FB573',
  'accent-dark': '#C85A8A',
  'muted-dark': '#28201B',
  'muted-fg-dark': '#9A8B80',
  'muted-fg-subtle-dark': '#665A50',
  'card-dark': '#1C1613',
  'card-fg-dark': '#D6CCC3',
  'popover-dark': '#342A24',
  'border-dark': '#3D3028',
  'input-dark': '#2D231C',
  'ring-dark': '#4D3F36',
  'success-dark': '#5CC98A',
  'warning-dark': '#F0B840',
  'destructive-dark': '#E8605A',
};
for (const [name, hex] of Object.entries(colors)) {
  const c = oklch(parse(hex));
  if (c) {
    console.log(name + ': oklch(' + c.l.toFixed(4) + ' ' + c.c.toFixed(4) + ' ' + (c.h || 0).toFixed(2) + ')');
  }
}
"
```

Save the output. These are the exact values to use in global.css.

- [ ] **Step 5: Rewrite global.css with Michoacan tokens**

Rewrite `apps/mobile/global.css` using the exact oklch values from Step 4 and the pattern confirmed from Context7 docs in Step 1. Use the hex values from the spec as comments for reference.

The file structure must be:
```css
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';

@source '../../node_modules/heroui-native/lib';

@layer theme {
  @variant light {
    /* All light tokens with oklch values and hex comments */
  }
  @variant dark {
    /* All dark tokens with oklch values and hex comments */
  }
}

@theme inline static {
  /* Map semantic tokens to Tailwind --color-* namespace */
  /* Include HeroUI Native compatibility aliases */
}
```

**Key mapping decisions:**
- `--color-primary` should map to `--primary` (Cobre #B8602A), NOT `--accent`
- `--color-danger` should map to `--destructive` (HeroUI uses `color="danger"` but our CSS token is `--destructive`)
- Keep HeroUI compatibility aliases (`--color-content1`, `--color-content2`, etc.) mapped to the new Michoacan surface tokens
- Keep `--foreground-500` and `--foreground-400` mapped to `--muted-foreground` and `--muted-foreground-subtle`

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-tokens
```

Expected: PASS

- [ ] **Step 7: Run type-check to verify no CSS issues**

```bash
cd apps/mobile && bun run check-types
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/global.css apps/mobile/tests/theme-tokens.test.tsx apps/mobile/package.json
git commit -m "feat(mobile): [1.2] migrate global.css to oklch michoacan tokens"
```

---

### Task 3: Eliminate constants/theme.ts and Migrate to useThemeColor

**Files:**
- Delete: `apps/mobile/constants/theme.ts`
- Create: `apps/mobile/constants/fonts.ts` (extract Fonts only)
- Rewrite: `apps/mobile/hooks/use-theme-color.ts`
- Modify: `apps/mobile/providers/theme-provider.tsx:6` (remove ThemeName import)
- Modify: `apps/mobile/app/(auth)/_layout.tsx:5,26` (replace Colors usage)
- Modify: `apps/mobile/app/(main)/scanner.tsx:22,33` (replace Colors/themeColors)
- Modify: `apps/mobile/app/(auth)/login.tsx:11-12` (replace Colors import)
- Modify: `apps/mobile/components/ui/collapsible.tsx:8` (replace Colors import)
- Modify: `apps/mobile/components/themed-text.tsx:4` (update import path)
- Modify: `apps/mobile/components/themed-view.tsx:4` (update import path)
- Modify: `apps/mobile/components/parallax-scroll-view.tsx:12` (update import path)
- Modify: `apps/mobile/tests/auth-layout.test.tsx:4` (update test import)
- Create: `apps/mobile/tests/theme-migration.test.tsx`

- [ ] **Step 1: Verify useThemeColor API in HeroUI Native rc.4**

Use Context7 MCP to check if `useThemeColor` is exported from `heroui-native`. Look for the exact API signature.

**If it exists:** Use it directly — skip creating a custom hook.
**If it does NOT exist:** We'll create our own hook (next step).

- [ ] **Step 2: Write failing migration test**

```tsx
// apps/mobile/tests/theme-migration.test.tsx
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { globSync } from 'glob';

describe('Theme migration', () => {
  const mobileRoot = resolve(__dirname, '..');

  it('constants/theme.ts should not exist', () => {
    expect(existsSync(resolve(mobileRoot, 'constants/theme.ts'))).toBe(false);
  });

  it('constants/fonts.ts should exist with Fonts export', () => {
    const fontsPath = resolve(mobileRoot, 'constants/fonts.ts');
    expect(existsSync(fontsPath)).toBe(true);
    const content = readFileSync(fontsPath, 'utf-8');
    expect(content).toContain('export const Fonts');
  });

  it('no component imports from constants/theme', () => {
    const files = globSync('**/*.{ts,tsx}', {
      cwd: mobileRoot,
      ignore: ['node_modules/**', 'tests/**', 'constants/fonts.ts'],
    });
    for (const file of files) {
      const content = readFileSync(resolve(mobileRoot, file), 'utf-8');
      expect(content).not.toContain("from '@/constants/theme'");
      expect(content).not.toContain('from "@/constants/theme"');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-migration
```

Expected: FAIL (constants/theme.ts still exists, components still import from it)

- [ ] **Step 4: Extract Fonts to constants/fonts.ts**

```ts
// apps/mobile/constants/fonts.ts
const PLATFORM = process.env.EXPO_OS ?? 'unknown';

export const Fonts =
  PLATFORM === 'ios'
    ? {
        sans: 'system-ui',
        serif: 'ui-serif',
        rounded: 'ui-rounded',
        mono: 'ui-monospace',
      }
    : PLATFORM === 'web'
      ? {
          sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          serif: "Georgia, 'Times New Roman', serif",
          rounded:
            "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
          mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        }
      : {
          sans: 'normal',
          serif: 'serif',
          rounded: 'normal',
          mono: 'monospace',
        };
```

- [ ] **Step 5: Rewrite hooks/use-theme-color.ts**

If HeroUI Native exports `useThemeColor`, rewrite as a thin re-export:

```ts
// apps/mobile/hooks/use-theme-color.ts
export { useThemeColor } from 'heroui-native';
```

If HeroUI Native does NOT export it, create a hook that reads from Uniwind:

```ts
// apps/mobile/hooks/use-theme-color.ts
import { useUniwind } from 'uniwind';

/**
 * Read resolved theme color values from Uniwind CSS variables.
 *
 * @param tokens - Array of CSS variable names (without --)
 * @returns Array of resolved color strings in the same order
 */
export function useThemeColor(tokens: string[]): string[] {
  const { resolveColor } = useUniwind();
  return tokens.map((token) => resolveColor(token));
}
```

**NOTE:** The exact API depends on what Uniwind exposes. Check Context7 MCP for the correct Uniwind API to resolve CSS variables at runtime. The pattern may use `useUniwind().getVariable()` or a different accessor.

- [ ] **Step 6: Update providers/theme-provider.tsx**

Remove the `ThemeName` import from the deleted file. Use a local type:

```tsx
// Replace line 6
// BEFORE: import type { ThemeName } from '@/constants/theme';
// AFTER:
type ThemeName = 'light' | 'dark';
```

- [ ] **Step 7: Migrate app/(auth)/_layout.tsx**

Replace `Colors[colorScheme]` pattern with `useThemeColor`:

```tsx
// BEFORE (line 5): import { Colors } from '@/constants/theme';
// BEFORE (line 26): const themeColors = Colors[colorScheme];

// AFTER: Remove Colors import. Add useThemeColor:
import { useThemeColor } from '@/hooks/use-theme-color';

// Inside the component, replace themeColors usage:
const [background, foreground] = useThemeColor(['background', 'foreground']);

// In Stack screenOptions:
headerStyle: { backgroundColor: background },
headerTintColor: foreground,
headerTitleStyle: { color: foreground },
```

- [ ] **Step 8: Migrate app/(main)/scanner.tsx**

This is the heaviest consumer. Replace the `Colors` import and all `themeColors.*` references:

```tsx
// BEFORE (line 22): import { Colors, type ThemeColors } from '@/constants/theme';
// BEFORE: const themeColors = isDarkMode ? Colors.dark : Colors.light;

// AFTER:
import { useThemeColor } from '@/hooks/use-theme-color';
// In component body:
const [background, foreground, success, warning, destructive, primary, border, surface] =
  useThemeColor(['background', 'foreground', 'success', 'warning', 'destructive', 'primary', 'border', 'surface']);

// Then replace all themeColors.X references with the destructured variables
// themeColors.background -> background
// themeColors.success -> success
// themeColors.warning -> warning
// themeColors.error -> destructive
// etc.
```

**IMPORTANT:** scanner.tsx has ~15+ themeColors references scattered throughout. Grep for all `themeColors.` occurrences and replace each one. Also check for `Colors.light` and `Colors.dark` direct references.

- [ ] **Step 9: Migrate app/(auth)/login.tsx**

```tsx
// BEFORE (line 11): import { Colors } from '@/constants/theme';
// Uses Colors.light.text for QR foreground
// AFTER: Use useThemeColor to get foreground color
```

- [ ] **Step 10: Migrate components/ui/collapsible.tsx**

```tsx
// BEFORE (line 8): import { Colors } from '@/constants/theme';
// Uses Colors.light.icon / Colors.dark.icon
// AFTER: Use useThemeColor to get icon/muted-foreground color
```

- [ ] **Step 11: Update themed-text.tsx, themed-view.tsx, parallax-scroll-view.tsx**

These already use `useThemeColor` from `@/hooks/use-theme-color`. Verify the new hook signature is compatible. If the old hook had a different signature `(props, colorName)`, update the call sites.

The old signature was: `useThemeColor(props: {light?: string, dark?: string}, colorName: string)`
The new signature is: `useThemeColor(tokens: string[]): string[]`

Update all call sites:

```tsx
// BEFORE: const color = useThemeColor({}, 'background');
// AFTER: const [color] = useThemeColor(['background']);
```

- [ ] **Step 12: Update tests/auth-layout.test.tsx**

```tsx
// BEFORE (line 4): import { Colors } from '@/constants/theme';
// Replace with whatever the test actually needs
```

- [ ] **Step 13: Delete constants/theme.ts**

```bash
rm apps/mobile/constants/theme.ts
```

- [ ] **Step 14: Run migration test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-migration
```

Expected: PASS

- [ ] **Step 15: Run full test suite + type-check**

```bash
cd apps/mobile && bun run check-types && bun run test
```

Expected: 0 type errors, all tests pass

- [ ] **Step 16: Commit**

```bash
git add -A apps/mobile/constants/ apps/mobile/hooks/use-theme-color.ts apps/mobile/providers/theme-provider.tsx apps/mobile/app/ apps/mobile/components/ apps/mobile/tests/
git commit -m "feat(mobile): [1.3] eliminate constants/theme.ts, migrate to useThemeColor"
```

---

### Task 4: Update theme-provider.tsx

**Files:**
- Modify: `apps/mobile/providers/theme-provider.tsx`
- Test: `apps/mobile/tests/theme-provider.test.tsx`

- [ ] **Step 1: Write test for theme provider**

```tsx
// apps/mobile/tests/theme-provider.test.tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';

describe('ThemeProvider', () => {
  it('provides colorScheme and isDarkMode', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colorScheme).toBe('light');
    expect(result.current.isDarkMode).toBe(false);
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within ThemeProvider');
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-provider
```

Expected: PASS (provider should already work since Task 3 fixed the import)

- [ ] **Step 3: Verify Uniwind.setTheme integration**

Check if `providers/theme-provider.tsx` needs to call `Uniwind.setTheme()` to sync the CSS variant with the system color scheme. Check Context7 MCP Uniwind docs for the correct API.

If needed, add sync logic:
```tsx
import { Uniwind } from 'uniwind';
// In ThemeProvider:
useEffect(() => {
  Uniwind.setTheme(colorScheme);
}, [colorScheme]);
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && bun run test -- --testPathPattern=theme-provider
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/providers/theme-provider.tsx apps/mobile/tests/theme-provider.test.tsx
git commit -m "feat(mobile): [1.4] update theme-provider for uniwind integration"
```

- [ ] **Step 6: Push Epic 1**

```bash
git push -u origin feat/design-system-compliance
```

---

## Chunk 2: Epic 2 — Assets & Branding

**Can run as subagent in parallel with Chunks 3 and 4.**

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/mobile/scripts/generate-icons.mjs` | SVG->PNG conversion script |
| Replace | `apps/mobile/assets/images/icon.png` | New checa. app icon |
| Replace | `apps/mobile/assets/images/android-icon-foreground.png` | New adaptive foreground |
| Replace | `apps/mobile/assets/images/android-icon-background.png` | New adaptive background |
| Replace | `apps/mobile/assets/images/android-icon-monochrome.png` | New monochrome icon |
| Replace | `apps/mobile/assets/images/splash-icon.png` | New splash icon |
| Replace | `apps/mobile/assets/images/favicon.png` | New favicon |
| Modify | `apps/mobile/app.json` | Name, icon refs, splash config |
| Modify | `apps/mobile/components/startup/startup-intro-overlay.tsx` | DS colors |

---

### Task 5: Create Icon Generation Script & Generate Assets

**Files:**
- Create: `apps/mobile/scripts/generate-icons.mjs`
- Replace: `apps/mobile/assets/images/icon.png`
- Replace: `apps/mobile/assets/images/android-icon-*.png`
- Replace: `apps/mobile/assets/images/favicon.png`
- Test: `apps/mobile/tests/icon-assets.test.tsx`

- [ ] **Step 1: Install sharp as dev dependency**

```bash
cd apps/mobile && bun add -d sharp
```

- [ ] **Step 2: Write failing test for icon assets**

```tsx
// apps/mobile/tests/icon-assets.test.tsx
import { existsSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

const assetsDir = resolve(__dirname, '../assets/images');

describe('Icon assets', () => {
  it('icon.png exists and is 1024x1024', async () => {
    const path = resolve(assetsDir, 'icon.png');
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(path).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it('android-icon-foreground.png exists and is 1024x1024', async () => {
    const path = resolve(assetsDir, 'android-icon-foreground.png');
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(path).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it('android-icon-background.png exists and is 1024x1024', async () => {
    const path = resolve(assetsDir, 'android-icon-background.png');
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(path).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it('favicon.png exists and is 48x48', async () => {
    const path = resolve(assetsDir, 'favicon.png');
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(path).metadata();
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(48);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=icon-assets
```

Expected: FAIL (current icons are wrong dimensions — 1728x1728 for icon.png, 333x333 for android icons)

- [ ] **Step 4: Create the icon generation script**

Create `apps/mobile/scripts/generate-icons.mjs`:

The script should:
1. Read `../../design/checa_icon.svg` (the SVG is at repo root `design/checa_icon.svg`)
2. Use sharp to convert SVG -> PNG at various sizes
3. For `icon.png`: render full SVG at 1024x1024
4. For `android-icon-foreground.png`: render the SVG clock+check elements on transparent background at 1024x1024 (the SVG has a solid #B8602A rect as first element — remove it for foreground)
5. For `android-icon-background.png`: solid #B8602A at 1024x1024
6. For `android-icon-monochrome.png`: grayscale version at 1024x1024
7. For `favicon.png`: full SVG at 48x48

- [ ] **Step 5: Run the script**

```bash
cd apps/mobile && node scripts/generate-icons.mjs
```

- [ ] **Step 6: Run test to verify assets**

```bash
cd apps/mobile && bun run test -- --testPathPattern=icon-assets
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/scripts/generate-icons.mjs apps/mobile/assets/images/ apps/mobile/tests/icon-assets.test.tsx apps/mobile/package.json
git commit -m "feat(mobile): [2.1] create icon generation script with sharp"
```

---

### Task 6: Generate Splash Screen Assets

**Files:**
- Replace: `apps/mobile/assets/images/splash-icon.png`
- Test: `apps/mobile/tests/splash-assets.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/splash-assets.test.tsx
import { existsSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

describe('Splash assets', () => {
  it('splash-icon.png exists and has reasonable dimensions', async () => {
    const path = resolve(__dirname, '../assets/images/splash-icon.png');
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(path).metadata();
    // Should be a reasonable splash size (at least 200x200)
    expect(meta.width).toBeGreaterThanOrEqual(200);
    expect(meta.height).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Generate splash icon**

The splash icon should be the checa. clock+check symbol on transparent background (expo-splash-screen will apply the backgroundColor). Generate from the SVG, stripping the background rect:

Add splash generation to `scripts/generate-icons.mjs` or create a separate step.

- [ ] **Step 3: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=splash-assets
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/assets/images/splash-icon.png apps/mobile/tests/splash-assets.test.tsx
git commit -m "feat(mobile): [2.2] generate splash screen assets"
```

---

### Task 7: Update app.json Configuration

**Files:**
- Modify: `apps/mobile/app.json`
- Test: `apps/mobile/tests/app-config.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/app-config.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('app.json configuration', () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../app.json'), 'utf-8'),
  );
  const expo = config.expo;

  it('app name is checa.', () => {
    expect(expo.name).toBe('checa.');
  });

  it('splash backgroundColor is Cobre Michoacano', () => {
    const splashPlugin = expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    );
    expect(splashPlugin).toBeDefined();
    const splashConfig = splashPlugin[1];
    expect(splashConfig.backgroundColor).toBe('#B8602A');
  });

  it('dark splash backgroundColor is Noche Moreliana', () => {
    const splashPlugin = expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    );
    const splashConfig = splashPlugin[1];
    expect(splashConfig.dark.backgroundColor).toBe('#110D0A');
  });

  it('android adaptiveIcon backgroundColor is Cobre', () => {
    expect(expo.android.adaptiveIcon.backgroundColor).toBe('#B8602A');
  });

  it('slug is unchanged', () => {
    expect(expo.slug).toBe('sen-checkin');
  });

  it('bundleIdentifier is unchanged', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.senapps.sencheckin');
  });

  it('camera permission text references checa.', () => {
    const cameraPlugin = expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-camera',
    );
    expect(cameraPlugin[1].cameraPermission).toContain('checa.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=app-config
```

Expected: FAIL (name is "SEN CheckIn", backgroundColor is "#ffffff")

- [ ] **Step 3: Update app.json**

Apply these changes to `apps/mobile/app.json`:
- `expo.name`: `"SEN CheckIn"` -> `"checa."`
- `expo-splash-screen` plugin config: `backgroundColor: "#B8602A"`, `dark.backgroundColor: "#110D0A"`
- `android.adaptiveIcon.backgroundColor`: `"#E6F4FE"` -> `"#B8602A"`
- `expo-camera` permission text: replace "SEN CheckIn" with "checa."

**Keep unchanged:** slug, bundleIdentifier, package, owner, projectId, versionCode

- [ ] **Step 4: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=app-config
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/tests/app-config.test.tsx
git commit -m "feat(mobile): [2.3] update app.json with checa. branding"
```

---

### Task 8: Update Startup Intro Overlay

**Files:**
- Modify: `apps/mobile/components/startup/startup-intro-overlay.tsx:46-57`
- Test: `apps/mobile/tests/startup-overlay.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/startup-overlay.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Startup intro overlay', () => {
  const content = readFileSync(
    resolve(__dirname, '../components/startup/startup-intro-overlay.tsx'),
    'utf-8',
  );

  it('does not contain hardcoded #000000', () => {
    // Old overlay background for dark mode
    expect(content).not.toContain('#000000');
  });

  it('does not contain hardcoded #ffffff', () => {
    // Old overlay background for light mode
    expect(content).not.toContain('#ffffff');
  });

  it('does not contain hardcoded #0f172a', () => {
    // Old spinner color
    expect(content).not.toContain('#0f172a');
  });

  it('uses useThemeColor hook', () => {
    expect(content).toContain('useThemeColor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=startup-overlay
```

Expected: FAIL (overlay has #000000, #ffffff, #0f172a hardcoded)

- [ ] **Step 3: Update startup-intro-overlay.tsx**

Replace the `getOverlayBackgroundColor` and `getSpinnerColor` functions. The component currently receives `isDarkMode` as a prop. Replace the hardcoded colors with `useThemeColor`:

```tsx
// At top of file, add import:
import { useThemeColor } from '@/hooks/use-theme-color';

// Replace getOverlayBackgroundColor function:
// DELETE the function entirely

// Replace getSpinnerColor function:
// DELETE the function entirely

// In the component body, replace:
// const backgroundColor = getOverlayBackgroundColor(isDarkMode);
// const spinnerColor = getSpinnerColor(isDarkMode);
// WITH:
const [backgroundColor, spinnerColor] = useThemeColor(['background', 'primary']);
```

**NOTE:** The component receives `isDarkMode` as a prop but the hook reads from the theme context. This should work because `StartupIntroOverlay` is rendered inside `ThemeProvider` in `_layout.tsx`. The `isDarkMode` prop is still used for other logic — keep it.

- [ ] **Step 4: Also grep components/startup/ for other files with hardcoded colors**

```bash
grep -rn '#[0-9a-fA-F]\{6\}' apps/mobile/components/startup/ --include='*.tsx' --include='*.ts'
```

Fix any other hardcoded colors found in this directory.

- [ ] **Step 5: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=startup-overlay
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/startup/ apps/mobile/tests/startup-overlay.test.tsx
git commit -m "feat(mobile): [2.4] update startup overlay to DS colors"
```

- [ ] **Step 7: Push Epic 2**

```bash
git push
```

---

## Chunk 3: Epic 3 — Component Migration

**Can run as subagent in parallel with Chunks 2 and 4.**

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/mobile/app/(main)/scanner.tsx` | Replace hardcoded hex/rgba |
| Modify | `apps/mobile/app/(main)/face-enrollment.tsx` | Replace hardcoded icon colors |
| Modify | `apps/mobile/app/(auth)/login.tsx` | Replace hardcoded shadow |
| Modify | `apps/mobile/lib/forms.tsx` | Replace hardcoded shadow |
| Create | `apps/mobile/color-exceptions.md` | Document acceptable exceptions |

---

### Task 9: Migrate scanner.tsx Hardcoded Colors

**Files:**
- Modify: `apps/mobile/app/(main)/scanner.tsx`
- Test: `apps/mobile/tests/scanner-colors.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/scanner-colors.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Scanner color migration', () => {
  const content = readFileSync(
    resolve(__dirname, '../app/(main)/scanner.tsx'),
    'utf-8',
  );

  it('does not contain hardcoded non-white/black hex colors', () => {
    // Match hex colors that aren't #fff, #000, #FFFFFF, #000000
    const hexMatches = content.match(/#[0-9a-fA-F]{6}/g) || [];
    const allowed = ['#FFFFFF', '#ffffff', '#000000', '#000000'];
    const violations = hexMatches.filter(
      (h) => !allowed.includes(h) && !allowed.includes(h.toUpperCase()),
    );
    expect(violations).toEqual([]);
  });

  it('does not reference Colors from constants/theme', () => {
    expect(content).not.toContain("from '@/constants/theme'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=scanner-colors
```

Expected: FAIL (scanner has #FCD34D, #92400E, etc.)

- [ ] **Step 3: Replace all hardcoded colors in scanner.tsx**

Find these patterns and replace:
- `neutralGuideColor`: `rgba(255, 255, 255, 0.8)` -> derive from foreground-dark or keep as `rgba(255,255,255,0.8)` (white with opacity is universally acceptable)
- `linkButtonBackground`: rgba warning values -> use `warning` token with opacity modifier
- `linkButtonBorder`: rgba values -> use `warning`/`primary` tokens with opacity
- `linkButtonContentColor`: `#FCD34D`/`#92400E` -> use `warning` token
- `instructionText` `color: '#FFFFFF'` -> can keep as white (text over camera feed)
- `textShadowColor`: rgba -> derive from `background` token

For each: determine if the hardcoded value is truly semantic (should use a DS token) or contextual (white text over camera feed is fine). Document decisions in the commit message.

- [ ] **Step 4: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=scanner-colors
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(main\)/scanner.tsx apps/mobile/tests/scanner-colors.test.tsx
git commit -m "feat(mobile): [3.1] migrate scanner.tsx to semantic color tokens"
```

---

### Task 10: Migrate face-enrollment.tsx

**Files:**
- Modify: `apps/mobile/app/(main)/face-enrollment.tsx`
- Test: `apps/mobile/tests/face-enrollment-colors.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/face-enrollment-colors.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Face enrollment color migration', () => {
  const content = readFileSync(
    resolve(__dirname, '../app/(main)/face-enrollment.tsx'),
    'utf-8',
  );

  it('does not contain #f59e0b (old warning)', () => {
    expect(content).not.toContain('#f59e0b');
  });

  it('does not contain #22c55e (old success)', () => {
    expect(content).not.toContain('#22c55e');
  });

  it('does not contain hardcoded placeholder rgba', () => {
    expect(content).not.toContain('rgba(115,115,115');
  });
});
```

- [ ] **Step 2: Run test, verify fail, implement, verify pass**

Replace:
- `color="#f59e0b"` -> `color={warning}` via `useThemeColor(['warning'])`
- `color="#22c55e"` -> `color={success}` via `useThemeColor(['success'])`
- `placeholderTextColor="rgba(115,115,115,0.9)"` -> `placeholderTextColor={mutedForeground}` via `useThemeColor(['muted-foreground'])`

- [ ] **Step 3: Run test**

```bash
cd apps/mobile && bun run test -- --testPathPattern=face-enrollment-colors
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(main\)/face-enrollment.tsx apps/mobile/tests/face-enrollment-colors.test.tsx
git commit -m "feat(mobile): [3.2] migrate face-enrollment.tsx to semantic tokens"
```

---

### Task 11: Migrate login.tsx Shadow

**Files:**
- Modify: `apps/mobile/app/(auth)/login.tsx`
- Test: `apps/mobile/tests/login-colors.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/login-colors.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Login color migration', () => {
  const content = readFileSync(
    resolve(__dirname, '../app/(auth)/login.tsx'),
    'utf-8',
  );

  it('does not contain hardcoded shadow rgba(15, 23, 42)', () => {
    expect(content).not.toContain('rgba(15, 23, 42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=login-colors
```

Expected: FAIL

- [ ] **Step 3: Replace boxShadow rgba with DS shadow class**

Find `boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16)'` and replace with the DS shadow-md Tailwind class or a CSS variable-based shadow.

Document QR code bgColor/fgColor as an acceptable exception (external library `react-qr-code` requires literal color strings).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && bun run test -- --testPathPattern=login-colors
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/login.tsx apps/mobile/tests/login-colors.test.tsx
git commit -m "feat(mobile): [3.3] migrate login.tsx shadow to DS token"
```

---

### Task 12: Migrate forms.tsx Shadow

**Files:**
- Modify: `apps/mobile/lib/forms.tsx`
- Test: `apps/mobile/tests/forms-colors.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/tests/forms-colors.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Forms color migration', () => {
  const content = readFileSync(
    resolve(__dirname, '../lib/forms.tsx'),
    'utf-8',
  );

  it('does not contain hardcoded shadow rgba(15, 23, 42)', () => {
    expect(content).not.toContain('rgba(15, 23, 42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && bun run test -- --testPathPattern=forms-colors
```

Expected: FAIL

- [ ] **Step 3: Replace boxShadow rgba with DS shadow class**

Find `boxShadow: '0 12px 28px rgba(15, 23, 42, 0.2)'` and replace with shadow-lg class or CSS variable.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && bun run test -- --testPathPattern=forms-colors
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/forms.tsx apps/mobile/tests/forms-colors.test.tsx
git commit -m "feat(mobile): [3.4] migrate forms.tsx shadow to DS token"
```

---

### Task 13: Final Hex Audit

**Files:**
- Create: `apps/mobile/color-exceptions.md`
- Test: `apps/mobile/tests/hex-audit.test.tsx`

- [ ] **Step 1: Write hex audit test**

```tsx
// apps/mobile/tests/hex-audit.test.tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { globSync } from 'glob';

const ALLOWED_HEX = [
  '#FFFFFF', '#ffffff', '#000000', '#000000', '#fff', '#000',
];

// Files where hardcoded hex is acceptable (document why)
const EXCEPTION_FILES = [
  'global.css', // Theme definitions
  'scripts/', // Build scripts
  'tests/', // Test assertions
];

describe('Hex color audit', () => {
  const mobileRoot = resolve(__dirname, '..');
  const files = globSync('**/*.{ts,tsx}', {
    cwd: mobileRoot,
    ignore: ['node_modules/**', 'scripts/**', 'tests/**', '*.test.*'],
  });

  it('no hardcoded hex colors in component/lib files', () => {
    const violations: string[] = [];

    for (const file of files) {
      if (file === 'global.css') continue;
      const content = readFileSync(resolve(mobileRoot, file), 'utf-8');
      const hexMatches = content.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      const badHex = hexMatches.filter(
        (h) => !ALLOWED_HEX.includes(h) && !ALLOWED_HEX.includes(h.toUpperCase()),
      );
      if (badHex.length > 0) {
        violations.push(`${file}: ${badHex.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, fix any remaining violations**

```bash
cd apps/mobile && bun run test -- --testPathPattern=hex-audit
```

Fix any remaining hardcoded hex values found.

- [ ] **Step 3: Document exceptions**

Create `apps/mobile/color-exceptions.md` listing acceptable hardcoded colors:
- QR code in login.tsx (external library constraint)
- Camera overlay white text (contextual — text over live camera feed)
- Any others discovered during audit

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/tests/hex-audit.test.tsx apps/mobile/color-exceptions.md
git commit -m "feat(mobile): [3.5] final hex audit, document color exceptions"
```

- [ ] **Step 5: Push Epic 3**

```bash
git push
```

---

## Chunk 4: Epic 4 — Accessibility & DS Compliance

**Can run as subagent in parallel with Chunks 2 and 3.**

This chunk covers all 13 accessibility/compliance issues (4.1-4.13). Each task is a verify-and-fix pattern.

**TDD NOTE for all Epic 4 tasks:** Each task MUST follow TDD. Write a failing test first (file-content assertion, rendering test, or snapshot), then implement the fix, then verify the test passes. Even for "verification" tasks, write a test that asserts the expected state. All tests go in `apps/mobile/tests/`.

**Git staging NOTE:** Every commit must include explicit `git add` of changed files before `git commit`.

### Task 14: Accessibility Labels (Issue 4.1)

- [ ] **Step 1: Audit all interactive elements for accessibilityLabel**

```bash
# Find all Button, Pressable, TouchableOpacity without accessibilityLabel
cd apps/mobile && grep -rn '<Button\|<Pressable\|<TouchableOpacity\|<TextInput' app/ components/ --include='*.tsx' | grep -v 'accessibilityLabel'
```

- [ ] **Step 2: Add missing labels in Spanish**

For each element found without a label, add `accessibilityLabel="descriptive text in Spanish"`.

- [ ] **Step 3: Write test verifying labels**

Test each screen's interactive elements have labels via `getByLabelText`.

- [ ] **Step 4: Run tests, commit**

```bash
git add apps/mobile/app/ apps/mobile/components/ apps/mobile/tests/
git commit -m "feat(mobile): [4.1] add accessibility labels to all interactive elements"
```

### Task 15: Touch Targets (Issue 4.2)

- [ ] **Step 1: Audit touch target sizes**
- [ ] **Step 2: Add hitSlop or minHeight/minWidth where needed**
- [ ] **Step 3: Test and commit**

```bash
git commit -m "feat(mobile): [4.2] ensure minimum touch targets per platform"
```

### Task 16: Reduce Motion (Issue 4.3)

- [ ] **Step 1: Check if startup-intro-overlay.tsx already handles reduce motion** (it does — verify)
- [ ] **Step 2: Audit other animations (screen transitions, bottom sheet)**
- [ ] **Step 3: Add useReducedMotion where missing**
- [ ] **Step 4: Test and commit**

```bash
git commit -m "feat(mobile): [4.3] respect reduce motion accessibility setting"
```

### Task 17: Haptic Feedback (Issue 4.4)

- [ ] **Step 1: Identify check-in/check-out success handlers in scanner.tsx**
- [ ] **Step 2: Add `Haptics.notificationAsync(NotificationFeedbackType.Success)` to success paths**
- [ ] **Step 3: Add `Haptics.notificationAsync(NotificationFeedbackType.Error)` to face recognition error**
- [ ] **Step 4: Add `Haptics.impactAsync(ImpactFeedbackStyle.Light)` to bottom sheet selections**
- [ ] **Step 5: Write test with mocked expo-haptics, commit**

```bash
git commit -m "feat(mobile): [4.4] add haptic feedback on key actions"
```

### Task 18: Empty States (Issue 4.5)

- [ ] **Step 1: Identify screens that can be empty**
- [ ] **Step 2: Create EmptyState component if not exists**
- [ ] **Step 3: Add empty states with CTAs in Spanish**
- [ ] **Step 4: Test and commit**

```bash
git commit -m "feat(mobile): [4.5] add empty states with CTAs"
```

### Task 19: Font Scaling (Issue 4.6)

- [ ] **Step 1: Verify maxFontSizeMultiplier is set in HeroUI config**
- [ ] **Step 2: Take Playwright screenshots at different scales**
- [ ] **Step 3: Fix any layout issues found**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): [4.6] verify and fix font scaling at 200%"
```

### Task 20: Platform Typography (Issue 4.7)

- [ ] **Step 1: Check if text-base maps to platform-specific sizes**
- [ ] **Step 2: Add `ios:text-[17px] android:text-[16px]` if needed**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.7] enforce platform-specific body text sizes"
```

### Task 21: Safe Areas (Issue 4.8)

- [ ] **Step 1: Audit screens for SafeAreaView/useSafeAreaInsets**
- [ ] **Step 2: Fix any content overlapping system UI**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.8] verify safe area compliance on all screens"
```

### Task 22: Keyboard Visibility (Issue 4.9)

- [ ] **Step 1: Audit TextInput screens for keyboard handling**
- [ ] **Step 2: Add KeyboardAvoidingView if needed**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.9] ensure inputs visible with keyboard open"
```

### Task 23: Platform Gestures (Issue 4.10)

- [ ] **Step 1: Grep for `gestureEnabled: false`**
- [ ] **Step 2: Verify back navigation works on all screens**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.10] verify platform gesture support"
```

### Task 24: Platform Press Feedback (Issue 4.11)

- [ ] **Step 1: Verify HeroUI Native buttons have platform feedback**
- [ ] **Step 2: Check custom Pressable components for platform feedback**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.11] verify platform-specific press feedback"
```

### Task 25: Voice & Tone (Issue 4.12)

- [ ] **Step 1: Read lib/translations/es.json**
- [ ] **Step 2: Audit for formal "usted" form — replace with "tu" form**
- [ ] **Step 3: Check hardcoded strings in components for tone**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): [4.12] audit and fix voz SEN compliance"
```

### Task 26: Offline Verification (Issue 4.13)

- [ ] **Step 1: Verify offline queue exists and is functional**
- [ ] **Step 2: Write test for offline attendance recording**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): [4.13] verify offline functionality compliance"
```

- [ ] **Push Epic 4**

```bash
git push
```

---

## Chunk 5: Epic 5 — Final Validation

**Depends on: Epics 2, 3, and 4 all complete.**

### Task 27: TDD Verification (Issue 5.1)

- [ ] **Step 1: Run full test suite**

```bash
cd apps/mobile && bun run test
```

Expected: ALL PASS

- [ ] **Step 2: Review test coverage**

Verify each task (1-26) has at least one associated test.

(No commit — verification only)

---

### Task 28: Playwright Screenshots (Issue 5.2)

- [ ] **Step 1: Take screenshots of all screens**

Use Playwright MCP tools to navigate to each screen on both simulators and take screenshots:

**iOS (logged in, light mode):**
- Scanner screen
- Face enrollment screen
- Settings screen
- Bottom sheet modals

**Android (not logged in, dark mode):**
- Login screen
- Device setup screen
- Any empty states

- [ ] **Step 2: Save screenshots**

```bash
mkdir -p apps/mobile/tests/screenshots
# Save screenshots to apps/mobile/tests/screenshots/
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/tests/screenshots/
git commit -m "feat(mobile): [5.2] add playwright screenshots for visual verification"
```

---

### Task 29: Quality Gates (Issue 5.3)

- [ ] **Step 1: Run all quality checks**

```bash
cd apps/mobile && bun run check-types && bun run lint && bun run test
```

Expected: 0 errors across all checks

- [ ] **Step 2: Run hex audit**

```bash
cd apps/mobile && bun run test -- --testPathPattern=hex-audit
```

Expected: PASS

(No commit — verification only)

---

### Task 30: Dual Subagent Review (Issues 5.4 + 5.5)

- [ ] **Step 1: Dispatch 2 reviewer subagents in parallel**

**Reviewer A — Visual DS Compliance:**
- Read the DS document at `design/SEN_Design_System_Mobile_Michoacan.html`
- Read the updated `global.css`
- Verify all color tokens match Paleta Michoacan `:root` block
- Check Playwright screenshots against DS expectations
- Verify splash screens, icons match approved designs
- Report issues as numbered list

**Reviewer B — Code Quality & Accessibility:**
- Review all changed files for code quality
- Verify accessibility labels exist and are meaningful in Spanish
- Verify touch targets, reduce motion, haptics
- Run `bun run check-types`, `bun run lint`, `bun run test`
- Verify no regressions
- Report issues as numbered list

- [ ] **Step 2: Collect issues from both reviewers**

- [ ] **Step 3: Fix all reported issues**

- [ ] **Step 4: Re-dispatch both reviewers**

Repeat Steps 1-3 until BOTH reviewers report 0 issues.

- [ ] **Step 5: Final commit and push**

```bash
git add -A apps/mobile/
git commit -m "fix(mobile): [5.5] address review feedback round N"
git push
```

---

## Done

All 5 epics complete. Branch `feat/design-system-compliance` is ready for PR.
