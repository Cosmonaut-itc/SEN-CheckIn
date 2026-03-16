# Design System Compliance — "checa." Mobile App

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Epicas paralelas con subagentes (Approach B)

## Context

The mobile app (`apps/mobile/`) uses a generic blue/gray color scheme that does NOT match the Paleta Michoacan design system (`design/SEN_Design_System_Mobile_Michoacan.html`). The app name has changed to "checa." and a new icon (`design/checa_icon.svg`) needs to be integrated. This spec covers full DS compliance including colors, assets, branding, accessibility, and quality.

### Canonical Color Source

The DS HTML contains multiple competing color sections. **The canonical source is the `:root` + `@theme` blocks (lines 9-35 and 1051-1128)**, which use the warm brown/caoba palette. The "Para agentes" sections (lines 1655-1768) contain a v4 variant with cool purple undertones that is NOT canonical.

Key implications:
- Foreground is `#2B1810` (warm caoba brown), NOT `#1B0F3B` (indigo)
- Dark mode background is `#110D0A` (warm dark), NOT `#0E0A1A` (cool indigo-dark)
- Status colors follow the `:root` block values

### Known DS Bug: Dark Mode Warning

The DS defines `--warning` in dark mode as `#C85A8A` (magenta), which is identical to `--accent`. This is a bug — warning should be amber/gold. This spec overrides dark mode warning to `#F0B840` (golden amber) to maintain visual distinction.

## Decisions

| Decision | Result |
|----------|--------|
| App name | "checa." (display name only, bundle IDs unchanged) |
| Typography | System fonts, apply DS weights/sizes only |
| Icon | Final SVG, generate PNGs with sharp |
| Splash screen | A — Classic Cobre (static), adaptive light/dark |
| Color format | Convert DS hex to oklch. **Fallback:** if oklch is unsupported by HeroUI Native/Uniwind at runtime, use hex values instead |
| Color source | `:root` + `@theme` blocks (warm caoba palette, lines 9-35 and 1051-1128) |
| Scope | Full DS compliance (visual + accessibility + all 15 pre-release checklist items) |
| Timeline | No deadline, quality over speed |
| constants/theme.ts | Eliminate, migrate to useThemeColor hook (verify API exists in rc.4 first; if not, create thin wrapper) |
| HeroUI Native | Update to v1.0.0-rc.4 |
| Validation | Tests + Playwright screenshots |
| Git base | Branch from main |
| Startup overlay | Update to DS colors |
| Skills | TDD + Expo skills mandatory |
| Subagents | Allowed, defined per epic |
| Git workflow | Branch, atomic commits per issue, push |
| Final review | 2 reviewer subagents, loop until 0 issues |
| Token naming | Use `--destructive` (not `--danger`) to match DS |

## Architecture: Epics & Dependencies

```
Epic 1: Foundation (BLOCKING)
    depends on: nothing
    blocks: Epic 2, Epic 3, Epic 4

Epic 2: Assets & Branding
    depends on: Epic 1
    blocks: Epic 5
    parallelizable with: Epic 3, Epic 4

Epic 3: Component Migration
    depends on: Epic 1
    blocks: Epic 5
    parallelizable with: Epic 2, Epic 4

Epic 4: Accessibility & DS Compliance
    depends on: Epic 1
    blocks: Epic 5
    parallelizable with: Epic 2, Epic 3

Epic 5: Final Validation
    depends on: Epic 2, Epic 3, Epic 4
```

## Subagent Strategy

| Phase | Subagents | Purpose |
|-------|-----------|---------|
| Epic 2 + 3 + 4 | Up to 3 parallel subagents | Each epic runs independently after Epic 1 completes |
| Epic 5.4 | 2 reviewer subagents | Reviewer A: visual DS compliance. Reviewer B: code quality, tests, a11y, security |
| Epic 5.5 | Main agent | Correction loop until both reviewers report 0 issues |

## Git Workflow

- Branch: `feat/design-system-compliance` from main
- Each issue (1.1, 1.2, 2.1, etc.) = 1 atomic commit
- Commit message format: `feat(mobile): [issue-id] description` for new work, `fix(mobile): [issue-id] description` for corrections
- Push after completing each epic
- Final review loop may add additional fix commits
- Verification-only issues (5.1, 5.3) produce no commits — they are quality gates only

## Required Skills

The executing agent MUST use:
- `superpowers:test-driven-development` for every issue (write test first, see it fail, implement, see it pass)
- `building-native-ui` for Expo/React Native component patterns
- `native-data-fetching` when touching API-related components
- `heroui-native` skill for HeroUI Native component documentation
- Context7 MCP for HeroUI Native and Uniwind documentation lookup

---

## Epic 1: Foundation (BLOCKING)

### Issue 1.1: Update HeroUI Native to v1.0.0-rc.4

**What:** Update `heroui-native` from `1.0.0-rc.1` to `1.0.0-rc.4` in `apps/mobile/package.json`

**Steps:**
1. Run `bun update heroui-native@1.0.0-rc.4` in `apps/mobile/`
2. Review changelog rc.1 -> rc.4 for breaking changes
3. Run `bun run check-types` to verify compatibility
4. Run existing tests to confirm no regressions

**TDD:** Test that imports HeroUI and renders a `<Button>` component successfully with the new version

**Commit:** `feat(mobile): [1.1] update heroui-native to v1.0.0-rc.4`

---

### Issue 1.2: Migrate global.css to oklch Michoacan Tokens

**What:** Rewrite `apps/mobile/global.css` to use Paleta Michoacan colors in oklch format, following HeroUI Native theming pattern (`@layer theme` + `@variant light/dark`)

**Source of truth:** `design/SEN_Design_System_Mobile_Michoacan.html` — `:root` + `@theme` blocks (lines 9-35 and 1051-1128)

**IMPORTANT:** The oklch values below are approximations. The implementing agent MUST compute exact oklch values programmatically (e.g., using the `culori` JS library: `import { oklch } from 'culori'; oklch('#B8602A')`) rather than relying on these manual approximations.

**Color mapping (hex -> oklch):**

Light mode (COMPLETE):
| Token | Hex | oklch (approximate) | Name |
|-------|-----|---------------------|------|
| --background | #FAF7F3 | oklch(0.97 0.01 70) | Warm cream |
| --foreground | #2B1810 | oklch(0.20 0.04 50) | Caoba Profundo |
| --primary | #B8602A | oklch(0.55 0.14 52) | Cobre Michoacano |
| --primary-hover | #9E4E1E | oklch(0.47 0.12 50) | Cobre hover |
| --primary-foreground | #FFFFFF | oklch(1.00 0 0) | White |
| --primary-bg | rgba(184, 96, 42, 0.08) | — | Primary background tint |
| --secondary | #4A7C3F | oklch(0.52 0.11 142) | Verde Aguacate |
| --secondary-bg | rgba(74, 124, 63, 0.08) | — | Secondary background tint |
| --accent | #8B2252 | oklch(0.38 0.12 340) | Guinda Patzcuaro |
| --accent-bg | rgba(139, 34, 82, 0.08) | — | Accent background tint |
| --muted | #F3EDE6 | oklch(0.94 0.01 60) | Light taupe |
| --muted-foreground | #7A6558 | oklch(0.50 0.04 50) | Warm brown gray |
| --muted-foreground-subtle | #A8978B | oklch(0.67 0.03 55) | Subtle warm |
| --card | #FFFFFF | oklch(1.00 0 0) | White |
| --card-foreground | #3D2B20 | oklch(0.28 0.05 50) | Warm dark brown |
| --popover | #FFFFFF | oklch(1.00 0 0) | White |
| --border | #E6DCD3 | oklch(0.90 0.02 50) | Rose-taupe |
| --input | #F0E8E1 | oklch(0.93 0.02 55) | Input background |
| --ring | #D1C2B6 | oklch(0.81 0.02 55) | Focus ring |
| --success | #2D8659 | oklch(0.55 0.12 160) | Darker teal |
| --success-bg | rgba(45, 134, 89, 0.10) | — | Success tint |
| --warning | #CC8A17 | oklch(0.63 0.14 75) | Golden orange |
| --warning-bg | rgba(204, 138, 23, 0.10) | — | Warning tint |
| --destructive | #C4302B | oklch(0.45 0.15 25) | Red |
| --destructive-bg | rgba(196, 48, 43, 0.10) | — | Destructive tint |
| --info | #4A7C3F | oklch(0.52 0.11 142) | Same as secondary |
| --info-bg | rgba(74, 124, 63, 0.10) | — | Info tint |

Dark mode (COMPLETE):
| Token | Hex | oklch (approximate) | Name |
|-------|-----|---------------------|------|
| --background | #110D0A | oklch(0.10 0.02 50) | Noche Moreliana (warm) |
| --foreground | #F0EAE4 | oklch(0.93 0.01 55) | Light warm beige |
| --primary | #D4835E | oklch(0.65 0.11 50) | Light copper |
| --primary-hover | #E09A78 | oklch(0.72 0.10 50) | Light copper hover |
| --primary-foreground | #FFFFFF | oklch(1.00 0 0) | White (inherited from root) |
| --primary-bg | rgba(212, 131, 94, 0.14) | — | Primary tint dark |
| --secondary | #7FB573 | oklch(0.70 0.10 145) | Light green |
| --secondary-bg | rgba(127, 181, 115, 0.14) | — | Secondary tint dark |
| --accent | #C85A8A | oklch(0.55 0.14 345) | Light burgundy |
| --accent-bg | rgba(200, 90, 138, 0.14) | — | Accent tint dark |
| --muted | #28201B | oklch(0.20 0.02 50) | Dark warm brown |
| --muted-foreground | #9A8B80 | oklch(0.62 0.03 55) | Warm muted |
| --muted-foreground-subtle | #665A50 | oklch(0.44 0.03 50) | Subtle warm dark |
| --card | #1C1613 | oklch(0.15 0.02 50) | Dark warm card |
| --card-foreground | #D6CCC3 | oklch(0.84 0.02 55) | Warm beige |
| --popover | #342A24 | oklch(0.25 0.03 50) | Dark warm popover |
| --border | #3D3028 | oklch(0.28 0.04 50) | Dark warm border |
| --input | #2D231C | oklch(0.21 0.03 50) | Dark input |
| --ring | #4D3F36 | oklch(0.34 0.03 50) | Dark focus ring |
| --success | #5CC98A | oklch(0.75 0.12 160) | Bright green |
| --success-bg | rgba(92, 201, 138, 0.14) | — | Success tint dark |
| --warning | #F0B840 | oklch(0.80 0.14 80) | Golden amber (DS BUG FIX: original was #C85A8A same as accent) |
| --warning-bg | rgba(240, 184, 64, 0.14) | — | Warning tint dark |
| --destructive | #E8605A | oklch(0.60 0.15 25) | Coral red |
| --destructive-bg | rgba(232, 96, 90, 0.14) | — | Destructive tint dark |
| --info | #7FB573 | oklch(0.70 0.10 145) | Same as secondary |
| --info-bg | rgba(127, 181, 115, 0.14) | — | Info tint dark |

**Pattern to follow (from HeroUI Native docs):**
```css
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';

@layer theme {
  @variant light {
    --background: oklch(...);
    --foreground: oklch(...);
    /* ... all light tokens */
  }
  @variant dark {
    --background: oklch(...);
    --foreground: oklch(...);
    /* ... all dark tokens */
  }
}

@theme inline static {
  --color-primary: var(--primary);
  --color-secondary: var(--secondary);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... complete mapping */
}
```

**IMPORTANT:** Agent MUST consult HeroUI Native and Uniwind docs via Context7 MCP before writing this file, to ensure the pattern matches the latest rc.4 documentation.

**TDD:** Test that CSS variables resolve correctly in both light and dark variants

**Commit:** `feat(mobile): [1.2] migrate global.css to oklch michoacan tokens`

---

### Issue 1.3: Eliminate constants/theme.ts and Migrate to useThemeColor

**What:** Remove `apps/mobile/constants/theme.ts` and migrate all consumers to `useThemeColor`

**IMPORTANT — API verification step:** Before starting migration, verify that `useThemeColor` exists in HeroUI Native rc.4 by checking the Context7 MCP docs. If `useThemeColor` is NOT exported by HeroUI Native, create a thin wrapper hook at `apps/mobile/hooks/useThemeColor.ts` that reads CSS variable values from the Uniwind theme system.

**Affected files:**
- `app/(main)/scanner.tsx` — heaviest consumer (~15 references to `Colors.light.*`/`Colors.dark.*`)
- `components/ui/collapsible.tsx` — uses `Colors.light.icon`/`Colors.dark.icon`
- `components/parallax-scroll-view.tsx` — uses `useThemeColor` already (verify)
- Any other files importing from `constants/theme` (grep for all imports)

**Note on Fonts export:** `constants/theme.ts` also exports a `Fonts` object with platform-specific font family mappings. Before deleting the file, grep for all `Fonts` imports. If consumers exist, either migrate them to use system font constants inline or split `Fonts` into its own file `constants/fonts.ts`.

**Migration pattern:**
```tsx
// BEFORE
import { Colors } from '@/constants/theme';
const themeColors = isDarkMode ? Colors.dark : Colors.light;
const bgColor = themeColors.background;

// AFTER (if useThemeColor from heroui-native)
import { useThemeColor } from 'heroui-native';
const [background, success, warning, destructive, primary, foreground] =
  useThemeColor(['background', 'success', 'warning', 'destructive', 'primary', 'foreground']);

// AFTER (if custom hook needed)
import { useThemeColor } from '@/hooks/useThemeColor';
const { background, success, warning, destructive, primary, foreground } =
  useThemeColor(['background', 'success', 'warning', 'destructive', 'primary', 'foreground']);
```

**TDD:** Tests that verify components render correctly with both themes after migration

**Commit:** `feat(mobile): [1.3] eliminate constants/theme.ts, migrate to useThemeColor`

---

### Issue 1.4: Update theme-provider.tsx

**What:** Verify `apps/mobile/providers/theme-provider.tsx` works with Uniwind theme system. Clean up any legacy logic.

**Steps:**
1. Verify `Uniwind.setTheme()` syncs with system color scheme
2. Clean up any logic that references removed `constants/theme.ts`
3. Ensure the `useTheme()` hook still exposes `colorScheme` and `isDarkMode`

**TDD:** Test toggle between light/dark mode

**Commit:** `feat(mobile): [1.4] update theme-provider for uniwind integration`

---

## Epic 2: Assets & Branding

**Can run as subagent in parallel with Epic 3 and Epic 4 (after Epic 1 completes)**

### Issue 2.1: Create Icon Generation Script

**What:** Create `apps/mobile/scripts/generate-icons.mjs` using sharp to convert `design/checa_icon.svg` to required PNG assets

**Outputs:**
- `assets/images/icon.png` (1024x1024) — main app icon
- `assets/images/android-icon-foreground.png` (1024x1024) — clock+check on transparent
- `assets/images/android-icon-background.png` (1024x1024) — solid #B8602A background
- `assets/images/android-icon-monochrome.png` (1024x1024) — monochrome version
- `assets/images/favicon.png` (48x48)

**TDD:** Test that script generates PNGs with correct dimensions

**Commit:** `feat(mobile): [2.1] create icon generation script with sharp`

---

### Issue 2.2: Generate Splash Screen Assets

**What:** Generate splash screen icon for expo-splash-screen

**Light mode splash:**
- Background color: `#B8602A` (Cobre Michoacano)
- Icon: Clock with check badge in white (#FAF7F3), centered
- "checa." text below icon

**Dark mode splash:**
- Background color: `#110D0A` (Noche Moreliana — warm dark, per canonical `:root`)
- Icon: Clock with check badge in light copper (#D4835E)
- "checa." text below icon

**Output:** `assets/images/splash-icon.png` — icon content without background (expo-splash-screen applies backgroundColor)

**TDD:** Test that splash asset exists and has correct dimensions

**Commit:** `feat(mobile): [2.2] generate splash screen assets`

---

### Issue 2.3: Update app.json Configuration

**What:** Update `apps/mobile/app.json` with new name, icon references, and splash configuration

**Changes:**
- `name`: "SEN CheckIn" -> "checa."
- `icon`: point to new icon.png
- `splash.backgroundColor`: "#B8602A"
- `android.adaptiveIcon.backgroundColor`: "#B8602A"
- `android.adaptiveIcon.foregroundImage`: new foreground
- `android.adaptiveIcon.backgroundImage`: new background
- `android.adaptiveIcon.monochromeImage`: new monochrome
- Dark splash via expo-splash-screen plugin: `dark.backgroundColor: "#110D0A"`

**Keep unchanged:** slug, bundleIdentifier, package name, owner, projectId

**TDD:** Test that app.json is valid JSON and contains expected values

**Commit:** `feat(mobile): [2.3] update app.json with checa. branding`

---

### Issue 2.4: Update Startup Intro Overlay

**What:** Update `apps/mobile/components/startup/startup-intro-overlay.tsx` and any other files in `components/startup/` to use DS colors

**Steps:**
1. Grep `components/startup/` directory for any hardcoded color values
2. Replace `#000000`/`#ffffff` -> `useThemeColor(['background'])`
3. Spinner color -> `useThemeColor(['primary'])`
4. Light: background `#FAF7F3`, dark: background `#110D0A`

**TDD:** Test overlay renders with correct theme colors in both modes

**Commit:** `feat(mobile): [2.4] update startup overlay to DS colors`

---

## Epic 3: Component Migration

**Can run as subagent in parallel with Epic 2 and Epic 4 (after Epic 1 completes)**

### Issue 3.1: Migrate scanner.tsx

**What:** Replace all hardcoded colors in `apps/mobile/app/(main)/scanner.tsx`

**Specific changes (find by pattern, line numbers are approximate and may shift after Issue 1.3):**
- `neutralGuideColor` with `rgba(255, 255, 255, 0.8)` -> derive from foreground token with opacity
- `linkButtonBackground`/`linkButtonBorder` with rgba warning values -> derive from warning/primary tokens
- `linkButtonContentColor` with `#FCD34D`/`#92400E` -> semantic tokens
- `instructionText` style with `color: '#FFFFFF'` -> `text-white` class or foreground token
- `textShadowColor` with rgba values -> derive from background token
- Verify `themeColors` pattern fully replaced by `useThemeColor` hook (done in Issue 1.3)

**TDD:** Tests verifying scanner renders correctly in both themes with no hardcoded hex

**Commit:** `feat(mobile): [3.1] migrate scanner.tsx to semantic color tokens`

---

### Issue 3.2: Migrate face-enrollment.tsx

**What:** Replace hardcoded colors in `apps/mobile/app/(main)/face-enrollment.tsx`

**Specific changes (find by pattern, line numbers approximate):**
- Warning icon with `color="#f59e0b"` -> `color={warning}` via useThemeColor
- Success icon with `color="#22c55e"` -> `color={success}` via useThemeColor
- TextInput `placeholderTextColor="rgba(115,115,115,0.9)"` -> semantic token (muted-foreground)

**TDD:** Test that face enrollment renders with semantic colors

**Commit:** `feat(mobile): [3.2] migrate face-enrollment.tsx to semantic tokens`

---

### Issue 3.3: Migrate login.tsx

**What:** Replace hardcoded shadow in `apps/mobile/app/(auth)/login.tsx`

**Specific changes (find by pattern, line numbers approximate):**
- `boxShadow` with `rgba(15, 23, 42, 0.16)` -> DS shadow token (shadow-md)
- QR code `bgColor`/`fgColor` — document as acceptable exception (external library constraint)

**TDD:** Test login screen renders correctly

**Commit:** `feat(mobile): [3.3] migrate login.tsx shadow to DS token`

---

### Issue 3.4: Migrate forms.tsx

**What:** Replace hardcoded shadow in `apps/mobile/lib/forms.tsx`

**Specific changes (find by pattern, line numbers approximate):**
- `boxShadow` with `rgba(15, 23, 42, 0.2)` -> DS shadow token (shadow-lg)

**TDD:** Test form modals render correctly

**Commit:** `feat(mobile): [3.4] migrate forms.tsx shadow to DS token`

---

### Issue 3.5: Final Hex Audit

**What:** Recursive grep for any remaining hardcoded colors in component files

**Steps:**
1. Grep for `#[0-9a-fA-F]{3,8}` and `rgba?\(` patterns in .tsx/.ts files (excluding global.css, node_modules, scripts)
2. Classify each as: violation (must fix) or exception (document why)
3. Fix all violations
4. Create `docs/color-exceptions.md` documenting accepted exceptions

**TDD:** Lint rule or snapshot test that verifies 0 hardcoded hex values in component files (exceptions allowlisted)

**Commit:** `feat(mobile): [3.5] final hex audit, document color exceptions`

---

## Epic 4: Accessibility & DS Compliance

**Can run as subagent in parallel with Epic 2 and Epic 3 (after Epic 1 completes)**

### Issue 4.1: Accessibility Labels

**What:** Add `accessibilityLabel` to all interactive elements and meaningful images

**Audit scope:**
- All `<Button>`, `<Pressable>`, `<TouchableOpacity>` components
- All `<TextInput>` components (add `accessibilityLabel` + `accessibilityHint`)
- All images — descriptive label or `accessible={false}` if decorative
- Language: Spanish (e.g., "Registrar entrada", "Tomar foto", "Cerrar sesion")

**TDD:** Tests per component verifying accessibility labels exist via `getByLabelText`

**Commit:** `feat(mobile): [4.1] add accessibility labels to all interactive elements`

---

### Issue 4.2: Touch Targets

**What:** Verify and fix minimum touch target sizes per platform

**Requirements:**
- iOS: minimum 44x44pt
- Android: minimum 48x48dp
- Use `hitSlop` where visual element is smaller but needs larger touch area

**TDD:** Tests measuring interactive component dimensions

**Commit:** `feat(mobile): [4.2] ensure minimum touch targets per platform`

---

### Issue 4.3: Reduce Motion Support

**What:** Respect `accessibilityReduceMotion` system setting

**Steps:**
1. Import `useReducedMotion` from `react-native-reanimated`
2. Conditionally set animation duration to 0 when reduce motion is active
3. Apply to: screen transitions, bottom sheet animations, any Animated values

**TDD:** Tests verifying animations are disabled when reduce motion is active

**Commit:** `feat(mobile): [4.3] respect reduce motion accessibility setting`

---

### Issue 4.4: Haptic Feedback

**What:** Add haptic feedback on key user actions using `expo-haptics`

**Actions requiring haptics:**
- Check-in success -> `Haptics.notificationAsync(NotificationFeedbackType.Success)`
- Check-out success -> `Haptics.notificationAsync(NotificationFeedbackType.Success)`
- Face recognition error -> `Haptics.notificationAsync(NotificationFeedbackType.Error)`
- Bottom sheet option selection -> `Haptics.impactAsync(ImpactFeedbackStyle.Light)`

**TDD:** Tests with mocked expo-haptics verifying haptic calls at correct moments

**Commit:** `feat(mobile): [4.4] add haptic feedback on key actions`

---

### Issue 4.5: Empty States with CTAs

**What:** Add empty state components for screens that can be empty

**Screens to audit:**
- Scanner with no device configured
- Settings with no enrollment
- Any list views with no data

**Pattern:**
```tsx
<EmptyState
  icon={<ClockIcon />}
  title="Sin registros"
  description="Aun no tienes registros de asistencia"
  actionLabel="Configurar dispositivo"
  onAction={() => router.push('/device-setup')}
/>
```

**TDD:** Tests verifying empty state rendering

**Commit:** `feat(mobile): [4.5] add empty states with CTAs`

---

### Issue 4.6: Font Scaling Verification

**What:** Verify UI doesn't break at 200% font scaling

**Steps:**
1. HeroUI already configured with `maxFontSizeMultiplier: 1.5`
2. Take Playwright screenshots at different font scales
3. Fix any layout issues found

**TDD:** Snapshot tests at different font scale multipliers

**Commit:** `feat(mobile): [4.6] verify and fix font scaling at 200%`

---

### Issue 4.7: Platform Typography Sizes

**What:** Verify body text follows DS requirements: iOS = 17pt, Android = 16sp

**Steps:**
1. Verify that `text-base` resolves to platform-specific sizes via Uniwind platform variants
2. If not automatic, add `ios:text-[17px] android:text-[16px]` to body text components
3. Verify heading hierarchy follows DS scale

**TDD:** Tests verifying rendered text size per platform

**Commit:** `feat(mobile): [4.7] enforce platform-specific body text sizes`

---

### Issue 4.8: Safe Areas Compliance

**What:** Verify content does not overlap notch, home indicator, or navigation bar

**Steps:**
1. Audit all screens for `SafeAreaView` / `useSafeAreaInsets` usage
2. Verify no content renders behind system UI elements
3. `react-native-safe-area-context` is already installed — ensure proper usage

**TDD:** Tests verifying safe area insets are respected in layout

**Commit:** `feat(mobile): [4.8] verify safe area compliance on all screens`

---

### Issue 4.9: Keyboard Visibility

**What:** Verify inputs remain visible when the keyboard is open

**Steps:**
1. Audit all screens with `<TextInput>` for keyboard-aware behavior
2. Use `KeyboardAvoidingView` or scroll-into-view behavior as needed
3. Test login screen, face enrollment name input, device setup inputs

**TDD:** Tests verifying input visibility with keyboard

**Commit:** `feat(mobile): [4.9] ensure inputs visible with keyboard open`

---

### Issue 4.10: Platform Gesture Support

**What:** Verify iOS swipe-back and Android back button work correctly

**Steps:**
1. Verify Expo Router's default gesture handling is not disabled
2. Test navigation back from all screens
3. Verify `gestureEnabled` is not set to `false` anywhere unless intentional

**TDD:** Navigation tests verifying back gesture behavior

**Commit:** `feat(mobile): [4.10] verify platform gesture support`

---

### Issue 4.11: Platform Press Feedback

**What:** Verify iOS uses opacity fade and Android uses ripple on press

**Steps:**
1. HeroUI Native components should handle this by default — verify
2. For custom `<Pressable>` components, ensure platform-appropriate feedback
3. iOS: `opacity: 0.7` on press. Android: `android_ripple` prop

**TDD:** Tests verifying press feedback style per platform

**Commit:** `feat(mobile): [4.11] verify platform-specific press feedback`

---

### Issue 4.12: Voice & Tone (Voz SEN)

**What:** Verify all user-facing text follows SEN voice: tuteo, Mexican Spanish, no corporate jargon

**Steps:**
1. Audit `lib/translations/es.json` for tone compliance
2. Verify all hardcoded strings in components use informal "tu" form
3. Replace any formal "usted" or corporate language

**TDD:** Snapshot test of translation file verifying no formal address patterns

**Commit:** `feat(mobile): [4.12] audit and fix voz SEN compliance`

---

### Issue 4.13: Offline Functionality Verification

**What:** Verify "vista de personal funciona sin conexion" per DS checklist

**Steps:**
1. Verify existing offline queue (`@react-native-community/netinfo` + socket.io) works
2. Test attendance recording works without network
3. Verify UI shows offline indicator

**Note:** This is a verification issue. The offline system already exists — only fix regressions.

**TDD:** Tests verifying offline attendance recording

**Commit:** `feat(mobile): [4.13] verify offline functionality compliance`

---

## Epic 5: Final Validation

**Depends on: Epic 2, Epic 3, Epic 4 all complete**

### Issue 5.1: TDD Verification

**What:** Verify all TDD tests pass across all epics

**Steps:**
1. `bun run test` — all tests pass
2. Review test coverage for new code
3. Verify each issue has at least one test

**Commit:** Verification only — no code changes, no commit needed.

---

### Issue 5.2: Playwright Screenshots

**What:** Take screenshots of all screens in both light and dark modes

**Screens:**
- Login screen (light + dark)
- Scanner screen (light + dark)
- Face enrollment screen (light + dark)
- Settings screen (light + dark)
- Bottom sheet modals (light + dark)
- Empty states (light + dark)

**Output:** Save to `tests/screenshots/` for reference

**Commit:** `feat(mobile): [5.2] add playwright screenshots for visual verification`

---

### Issue 5.3: Quality Gates

**What:** Run all quality checks and verify clean pass

**Checks:**
- `bun run check-types` -> 0 errors
- `bun run lint` -> 0 errors
- `bun run test` -> all pass
- Hex audit grep -> 0 violations (only documented exceptions)

**Commit:** Verification only — no code changes, no commit needed. If fixes are needed, they go into relevant issue commits.

---

### Issue 5.4: Dual Subagent Review

**What:** Dispatch 2 reviewer subagents for comprehensive review

**Reviewer A — Visual DS Compliance:**
- Compare every screen against DS document
- Verify all color tokens match Paleta Michoacan
- Check spacing, border radius, shadows match DS specs
- Verify splash screens match approved design (Clasico Cobre)
- Verify icon matches checa_icon.svg

**Reviewer B — Code Quality & Accessibility:**
- Review all code changes for quality, patterns, security
- Verify accessibility labels are meaningful and in Spanish
- Verify touch targets meet platform minimums
- Verify reduce motion is respected
- Verify haptics fire at correct moments
- Verify no regressions in existing functionality

**Both reviewers report issues as a numbered list.**

---

### Issue 5.5: Correction Loop

**What:** Fix all issues from dual review, re-review until 0 issues

**Process:**
1. Collect issues from both Reviewer A and Reviewer B
2. Fix all issues
3. Re-dispatch both reviewers
4. Repeat until BOTH report 0 issues
5. Final commit, push

**Commit:** `fix(mobile): [5.5] address review feedback round N`

---

## Final Requirement

**When complete:** The agent MUST review changes with 2 subagents, correct any errors found, and repeat until no issues remain. This is non-negotiable and must be the last step before declaring work complete.
