<!-- 43fad91d-42d2-4bd7-a581-04542425744e 8931f588-807b-4531-b8d2-f1b0242bd3e8 -->
# Mobile App Implementation Plan

## Prerequisites and Documentation References

The agent implementing this plan MUST use Context7 MCP to fetch up-to-date documentation for:

- HeroUI Native (`/heroui-inc/heroui-native`)
- Uniwind (https://docs.uniwind.dev/quickstart)
- Better Auth Expo (`/better-auth/better-auth`, topic: expo)
- TanStack Query React Native (`/websites/tanstack_query`, topic: react native)
- TanStack Form (`/tanstack/form`)
- Expo Camera (`/expo/expo`, topic: expo-camera)

---

## Phase 1: Dependencies and Configuration

### 1.1 Install HeroUI Native and Dependencies

From [HeroUI Native README](https://github.com/heroui-inc/heroui-native):

```bash
# In apps/mobile
bun add heroui-native
bun add tailwind-variants@^3.1.0 tailwind-merge@^3.3.1 @gorhom/bottom-sheet@^5 react-native-svg@^15.12.1
```

Note: `react-native-screens`, `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, and `react-native-gesture-handler` are already installed.

### 1.2 Install Uniwind

Per https://docs.uniwind.dev/quickstart:

```bash
bun add uniwind @tailwindcss/postcss tailwindcss postcss
```

Create `apps/mobile/global.css`:

```css
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';
@source './node_modules/heroui-native/lib';
```

### 1.3 Install BetterAuth Expo Client

```bash
bun add @better-auth/expo expo-secure-store expo-crypto expo-linking
```

### 1.4 Install TanStack Query and Form

```bash
bun add @tanstack/react-query @tanstack/react-form @react-native-community/netinfo
```

### 1.5 Install Expo Camera

```bash
bunx expo install expo-camera
```

Update `apps/mobile/app.json` - add camera plugin configuration:

```json
{
  "plugins": [
    ["expo-camera", {
      "cameraPermission": "Allow SEN-CheckIn to access your camera for attendance verification"
    }]
  ]
}
```

### 1.6 Update app.json Scheme

Change `"scheme": "mobile"` to `"scheme": "sen-checkin"` for deep linking.

---

## Phase 2: Core Library Setup

### 2.1 Create API Client

File: `apps/mobile/lib/api.ts`

Mirror the web implementation from [apps/web/lib/api.ts](apps/web/lib/api.ts), using the shared `@sen-checkin/api-contract` package.

### 2.2 Create Auth Client

File: `apps/mobile/lib/auth-client.ts`

Configure BetterAuth with `expoClient` plugin and `expo-secure-store`. Reference the web's [auth-client.ts](apps/web/lib/auth-client.ts) for plugins (organization, username).

### 2.3 Create Query Client Provider

File: `apps/mobile/lib/query-client.ts`

Configure QueryClient with:

- React Native `onlineManager` using `@react-native-community/netinfo`
- React Native `focusManager` using `AppState`
- Appropriate `staleTime` (60s as per web)

File: `apps/mobile/providers/query-provider.tsx`

Wrap app with `QueryClientProvider`.

### 2.4 Create Query Keys

File: `apps/mobile/lib/query-keys.ts`

Copy relevant query keys from [apps/web/lib/query-keys.ts](apps/web/lib/query-keys.ts):

- `locations` (for settings dropdown)
- `devices` (for device registration)
- `attendance` (for recording check-ins)

Add mobile-specific keys:

- `deviceSettings` - for local device configuration

### 2.5 Create Client Functions

File: `apps/mobile/lib/client-functions.ts`

Create fetchers following the pattern from [apps/web/lib/client-functions.ts](apps/web/lib/client-functions.ts):

- `fetchLocationsList()` - for settings page location picker
- `fetchDeviceDetail()` - get device configuration
- `createAttendanceRecord()` - record face verification results

### 2.6 Create TanStack Form Setup

File: `apps/mobile/lib/forms.tsx`

Create mobile form toolkit following [release-06-form-architecture.md](documentacion/release-06-form-architecture.md):

- Use `createFormHookContexts` and `createFormHook`
- Create HeroUI Native-compatible field components (TextField using HeroUI `TextField`)
- Create SubmitButton component using HeroUI `Button`

---

## Phase 3: App Structure and Navigation

### 3.1 Update Root Layout

File: `apps/mobile/app/_layout.tsx`

- Wrap with `GestureHandlerRootView`
- Add `HeroUINativeProvider`
- Add `QueryClientProvider`
- Add `AuthProvider` context for session state
- Import `global.css` for Uniwind styles

### 3.2 Create Navigation Structure

Replace current `(tabs)` structure with stack navigation:

```
app/
  _layout.tsx          # Root with providers
  (auth)/
    _layout.tsx        # Auth group layout
    login.tsx          # Device code login screen
  (main)/
    _layout.tsx        # Main group layout (requires auth)
    scanner.tsx        # Face scanning screen (default)
    settings.tsx       # Device settings screen
```

Use Expo Router's `redirect` to handle auth state transitions.

---

## Phase 4: Authentication Flow (Device Code)

### 4.1 Backend Requirement (Note for API team)

The device code flow requires new API endpoints:

- `POST /api/auth/device-code` - Generate a new device code
- `GET /api/auth/device-code/:code/status` - Poll for authorization status
- `POST /api/auth/device-code/:code/authorize` (web admin) - Authorize a device code

If these don't exist, the agent should create placeholder UI with a TODO note.

### 4.2 Login Screen Implementation

File: `apps/mobile/app/(auth)/login.tsx`

UI Elements (HeroUI Native):

- Large device code display (6-8 character code)
- QR code containing authorization URL
- "Waiting for authorization..." status
- Refresh code button

Logic:

- On mount, generate device code via API
- Poll for authorization status
- On success, store session and redirect to scanner

---

## Phase 5: Face Scanning View

### 5.1 Scanner Screen

File: `apps/mobile/app/(main)/scanner.tsx`

Full-screen camera view with overlay:

```
+----------------------------------+
| [CHECK-IN v] ⚙️ Settings         |  <- Top bar overlay
|                                    |
|                                    |
|           [Camera Feed]            |
|                                    |
|        +----------------+          |
|        |  Face Outline  |          |  <- Face guide overlay
|        +----------------+          |
|                                    |
|    "Look at the camera"            |  <- Instruction text
+----------------------------------+
```

Components:

- `CameraView` from `expo-camera` (front-facing)
- Attendance type selector (top-left): HeroUI `Select` with CHECK_IN/CHECK_OUT options
- Settings button (top-right): HeroUI `Button` with icon, navigates to settings
- Face outline overlay: SVG or View with border
- Status text: Shows instructions or recognition result

Logic:

- Capture frame periodically or on button press
- Send to face verification endpoint
- Show success (employee name) or failure message
- Record attendance on successful verification

### 5.2 Face Verification Integration

Create helper: `apps/mobile/lib/face-recognition.ts`

- `verifyFace(imageBase64: string)` - Call API to verify face against Rekognition
- `recordAttendance(employeeId: string, type: 'CHECK_IN' | 'CHECK_OUT')` - Record attendance

---

## Phase 6: Settings View

### 6.1 Settings Screen

File: `apps/mobile/app/(main)/settings.tsx`

Form fields (using TanStack Form + HeroUI Native):

- Device Name (TextField)
- Location (Select - populated from API)
- Organization display (read-only, from session)

Actions:

- Save button - Updates device settings via API
- Sign out button - Clears session, returns to login

### 6.2 Device Settings Context

File: `apps/mobile/lib/device-context.tsx`

React context providing:

- Current device settings (name, locationId, organizationId)
- `updateSettings()` mutation
- Loading state

Settings are fetched from server on app start and cached locally.

---

## Phase 7: UX Optimizations for Attendance Verification

### 7.1 Visual Feedback

- Success: Green flash + haptic feedback + employee name display
- Failure: Red flash + shake animation + "Face not recognized" message
- Loading: Pulsing overlay during verification

### 7.2 Audio Feedback (optional)

- Success/failure sounds using `expo-av`

### 7.3 Accessibility

- Large, high-contrast UI elements
- Clear status announcements
- Works in various lighting conditions (camera exposure hints)

---

## Key Files Summary

| File | Purpose |

|------|---------|

| `apps/mobile/lib/api.ts` | Eden Treaty API client |

| `apps/mobile/lib/auth-client.ts` | BetterAuth Expo client |

| `apps/mobile/lib/query-client.ts` | TanStack Query client + RN config |

| `apps/mobile/lib/query-keys.ts` | Query key factories |

| `apps/mobile/lib/client-functions.ts` | API fetchers/mutations |

| `apps/mobile/lib/forms.tsx` | TanStack Form + HeroUI components |

| `apps/mobile/lib/face-recognition.ts` | Face verification helpers |

| `apps/mobile/lib/device-context.tsx` | Device settings context |

| `apps/mobile/providers/query-provider.tsx` | QueryClientProvider wrapper |

| `apps/mobile/app/_layout.tsx` | Root layout with all providers |

| `apps/mobile/app/(auth)/login.tsx` | Device code login |

| `apps/mobile/app/(main)/scanner.tsx` | Face scanning camera view |

| `apps/mobile/app/(main)/settings.tsx` | Device settings form |

| `apps/mobile/global.css` | Tailwind/Uniwind styles |

### To-dos

- [ ] Install all dependencies: HeroUI Native, Uniwind, BetterAuth Expo, TanStack Query/Form, expo-camera
- [ ] Configure Uniwind and global.css with HeroUI Native styles
- [ ] Create API client using @sen-checkin/api-contract
- [ ] Create BetterAuth Expo client with expoClient plugin and SecureStore
- [ ] Create QueryClient with React Native focus/online managers and provider
- [ ] Create query keys for locations, devices, attendance, deviceSettings
- [ ] Create client fetchers for locations, devices, attendance records
- [ ] Create TanStack Form toolkit with HeroUI Native field components
- [ ] Restructure app navigation: (auth)/login and (main)/scanner, settings
- [ ] Implement device code login screen with code display and polling
- [ ] Implement face scanning view with camera, attendance type selector, settings button
- [ ] Implement face verification API integration and attendance recording
- [ ] Implement settings screen with device name, location select, save/logout