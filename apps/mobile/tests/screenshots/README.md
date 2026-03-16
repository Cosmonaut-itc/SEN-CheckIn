## Visual Verification Artifacts

- `ios-scanner-light.png`: scanner screen on iPhone 17 Pro (light mode)
- `ios-settings-light.png`: settings screen on iPhone 17 Pro (light mode)
- `ios-face-enrollment-light.png`: face enrollment empty/config-required state on iPhone 17 Pro (light mode)
- `ios-device-setup-light.png`: device setup screen on iPhone 17 Pro (light mode)

Android dark mode capture was attempted on the `Medium Phone API 36.1` emulator, but Expo Go became blocked by repeated `System UI isn't responding` overlays after the emulator restart. Dark-mode capture on iOS also did not yield stable in-app results, and a fresh iOS simulator for the unauthenticated login screen stayed at the Expo Go launcher instead of opening the project. Only the light-mode artifacts above are treated as valid visual verification. The code paths for the blocked states were still covered by automated tests and quality gates in this branch.
