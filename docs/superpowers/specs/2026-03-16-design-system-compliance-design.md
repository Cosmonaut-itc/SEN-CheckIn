# Design System Compliance — "checa." Mobile App

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Epicas paralelas con subagentes (Approach B)

## Context

The mobile app (`apps/mobile/`) uses a generic blue/gray color scheme that does NOT match the Paleta Michoacan v4.0 design system (`design/SEN_Design_System_Mobile_Michoacan.html`). The app name has changed to "checa." and a new icon (`design/checa_icon.svg`) needs to be integrated. This spec covers full DS compliance including colors, assets, branding, accessibility, and quality.

## Decisions

| Decision | Result |
|----------|--------|
| App name | "checa." (display name only, bundle IDs unchanged) |
| Typography | System fonts, apply DS weights/sizes only |
| Icon | Final SVG, generate PNGs with sharp |
| Splash screen | A — Classic Cobre (static), adaptive light/dark |
| Color format | Convert DS hex values to oklch per HeroUI Native recommendation |
| Scope | Full DS compliance (visual + accessibility + pre-release checklist) |
| Timeline | No deadline, quality over speed |
| constants/theme.ts | Eliminate, migrate to useThemeColor hook |
| HeroUI Native | Update to v1.0.0-rc.4 |
| Validation | Tests + Playwright screenshots |
| Git base | Branch from main |
| Startup overlay | Update to DS colors |
| Skills | TDD + Expo skills mandatory |
| Subagents | Allowed, defined per epic |
| Git workflow | Branch, atomic commits per issue, push |
| Final review | 2 reviewer subagents, loop until 0 issues |

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
- Commit message format: `feat(mobile): [issue-id] description`
- Push after completing each epic
- Final review loop may add additional fix commits

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

**Source of truth:** `design/SEN_Design_System_Mobile_Michoacan.html`

**Color mapping (hex -> oklch):**

Light mode:
| Token | Hex | oklch (approximate) | Name |
|-------|-----|---------------------|------|
| --background | #FBF7F2 | oklch(0.97 0.01 70) | Warm cream |
| --foreground | #1B0F3B | oklch(0.18 0.04 280) | Caoba Profundo |
| --primary | #B8602A | oklch(0.55 0.13 50) | Cobre Michoacano |
| --primary-foreground | #FAF7F3 | oklch(0.97 0.01 70) | Light cream |
| --secondary | #4A7C3F | oklch(0.52 0.10 140) | Verde Aguacate |
| --accent | #8B2252 | oklch(0.38 0.12 340) | Guinda Patzcuaro |
| --muted | #F5EDE5 | oklch(0.95 0.02 60) | Light taupe |
| --muted-foreground | #687076 | oklch(0.50 0.01 240) | Gray |
| --card | #FFFFFF | oklch(1.00 0 0) | White |
| --card-foreground | #1B0F3B | oklch(0.18 0.04 280) | Same as foreground |
| --border | #E8DDD4 | oklch(0.90 0.02 50) | Rose-taupe |
| --success | #2D8659 | oklch(0.55 0.12 160) | Darker teal |
| --warning | #CC8A17 | oklch(0.63 0.14 75) | Golden orange |
| --danger | #C4302B | oklch(0.45 0.15 25) | Red |

Dark mode:
| Token | Hex | oklch (approximate) | Name |
|-------|-----|---------------------|------|
| --background | #0E0A1A | oklch(0.12 0.03 280) | Noche Moreliana |
| --foreground | #F2EDE7 | oklch(0.94 0.01 60) | Light beige |
| --primary | #D4835E | oklch(0.65 0.11 50) | Light copper |
| --secondary | #7FB573 | oklch(0.70 0.10 145) | Light green |
| --accent | #C85A8A | oklch(0.55 0.14 345) | Light burgundy |
| --card | #171228 | oklch(0.16 0.04 275) | Dark blue-purple |
| --success | #5CC98A | oklch(0.75 0.12 160) | Bright green |
| --warning | #C85A8A | oklch(0.55 0.14 345) | Magenta |
| --danger | #E8605A | oklch(0.60 0.15 25) | Coral red |

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

**What:** Remove `apps/mobile/constants/theme.ts` and migrate all consumers to `useThemeColor` from HeroUI Native

**Affected files:**
- `app/(main)/scanner.tsx` — heaviest consumer (~15 references to `Colors.light.*`/`Colors.dark.*`)
- `components/ui/collapsible.tsx` — uses `Colors.light.icon`/`Colors.dark.icon`
- `components/parallax-scroll-view.tsx` — uses `useThemeColor` already (verify)
- Any other files importing from `constants/theme`

**Migration pattern:**
```tsx
// BEFORE
import { Colors } from '@/constants/theme';
const themeColors = isDarkMode ? Colors.dark : Colors.light;
const bgColor = themeColors.background;

// AFTER
import { useThemeColor } from 'heroui-native';
const [background, success, warning, danger, primary, foreground] =
  useThemeColor(['background', 'success', 'warning', 'danger', 'primary', 'foreground']);
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
- Background color: `#0E0A1A` (Noche Moreliana)
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
- Dark splash via expo-splash-screen plugin: `dark.backgroundColor: "#0E0A1A"`

**Keep unchanged:** slug, bundleIdentifier, package name, owner, projectId

**TDD:** Test that app.json is valid JSON and contains expected values

**Commit:** `feat(mobile): [2.3] update app.json with checa. branding`

---

### Issue 2.4: Update Startup Intro Overlay

**What:** Update `apps/mobile/components/startup/startup-intro-overlay.tsx` to use DS colors

**Changes:**
- Replace `#000000`/`#ffffff` -> `useThemeColor(['background'])`
- Spinner color -> `useThemeColor(['primary'])`
- Light: background `#FBF7F2`, dark: background `#0E0A1A`

**TDD:** Test overlay renders with correct theme colors in both modes

**Commit:** `feat(mobile): [2.4] update startup overlay to DS colors`

---

## Epic 3: Component Migration

**Can run as subagent in parallel with Epic 2 and Epic 4 (after Epic 1 completes)**

### Issue 3.1: Migrate scanner.tsx

**What:** Replace all hardcoded colors in `apps/mobile/app/(main)/scanner.tsx`

**Specific changes:**
- Line 174: `rgba(255, 255, 255, 0.8)` -> derive from foreground token with opacity
- Lines 177-178: 4x rgba link button values -> derive from warning/primary tokens
- Line 179: `#FCD34D`/`#92400E` -> semantic tokens
- Line 1000: `#FFFFFF` -> `text-white` class or foreground token
- Line 1002: textShadow rgba values -> derive from background token
- Replace entire `themeColors` pattern with `useThemeColor` hook (done in Issue 1.3, verify no remnants)

**TDD:** Tests verifying scanner renders correctly in both themes with no hardcoded hex

**Commit:** `feat(mobile): [3.1] migrate scanner.tsx to semantic color tokens`

---

### Issue 3.2: Migrate face-enrollment.tsx

**What:** Replace hardcoded colors in `apps/mobile/app/(main)/face-enrollment.tsx`

**Specific changes:**
- Line 339: `color="#f59e0b"` -> `color={warning}` via useThemeColor
- Line 361: `color="#22c55e"` -> `color={success}` via useThemeColor
- Line 410: `placeholderTextColor="rgba(115,115,115,0.9)"` -> semantic token (muted-foreground)

**TDD:** Test that face enrollment renders with semantic colors

**Commit:** `feat(mobile): [3.2] migrate face-enrollment.tsx to semantic tokens`

---

### Issue 3.3: Migrate login.tsx

**What:** Replace hardcoded shadow in `apps/mobile/app/(auth)/login.tsx`

**Specific changes:**
- Line 748: `boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16)'` -> DS shadow token (shadow-md)
- Lines 755-756: QR code `bgColor`/`fgColor` — document as acceptable exception (external library constraint)

**TDD:** Test login screen renders correctly

**Commit:** `feat(mobile): [3.3] migrate login.tsx shadow to DS token`

---

### Issue 3.4: Migrate forms.tsx

**What:** Replace hardcoded shadow in `apps/mobile/lib/forms.tsx`

**Specific changes:**
- Line 163: `boxShadow: '0 12px 28px rgba(15, 23, 42, 0.2)'` -> DS shadow token (shadow-lg)

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

## Epic 5: Final Validation

**Depends on: Epic 2, Epic 3, Epic 4 all complete**

### Issue 5.1: TDD Verification

**What:** Verify all TDD tests pass across all epics

**Steps:**
1. `bun run test` — all tests pass
2. Review test coverage for new code
3. Verify each issue has at least one test

**Commit:** No separate commit (tests are committed with each issue)

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

**Commit:** No separate commit (fixes go to relevant issue commits)

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
