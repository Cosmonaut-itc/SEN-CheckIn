## Visual Verification Artifacts

- `ios-scanner-light.png`: scanner screen on iPhone 17 Pro (light mode)
- `ios-settings-light.png`: settings screen on iPhone 17 Pro (light mode)
- `ios-face-enrollment-light.png`: face enrollment empty/config-required state on iPhone 17 Pro (light mode)
- `ios-device-setup-light.png`: device setup screen on iPhone 17 Pro (light mode)

## Capture Attempts on 2026-03-16

- Playwright MCP could not be used against the native Expo Go URL because the tool blocks the `exp://` protocol and only allows `http:`, `https:`, `about:`, and `data:`.
- The booted iOS simulator (`iPhone 17 Pro`) was available, but it was no longer in the state described by the plan. It opened on the unauthenticated login screen instead of the logged-in scanner/settings/face-enrollment flow required for the missing dark-mode screenshots.
- Direct iOS deep-link attempts to `/(main)/scanner`, `/(main)/settings`, and `/(main)/face-enrollment` did not yield stable capture targets because the app redirected away from the protected stack without an active session.
- The previous `/(auth)/device-setup` deep-link crash was fixed in this branch, but without a stable device context the route still redirected to the login flow, so it could not produce a reproducible screenshot target for the requested capture set.
- Android capture could not proceed because the local emulator process was not attached to `adb`; the SDK tool returned `no devices/emulators found`, so no reliable Android screenshot capture path was available from this workspace.

## Coverage Status

- Per the audit plan fallback, documenting simulator/tooling blockers in this README is the required substitute when the requested simulator captures are not reproducible from the workspace.
- Valid artifacts remain limited to the 4 iOS light-mode screenshots above.
- Missing artifacts due to the environment limitations listed here:
  iOS dark mode for scanner, settings, and face enrollment
  Android login and device setup
  Additional empty-state and bottom-sheet captures
- The blocked states still have automated coverage through the mobile test suite in this branch.
