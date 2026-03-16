# Color Exceptions

This document tracks accepted Epic 3 color exceptions for the mobile surfaces owned in the
design-system compliance migration.

## Accepted exceptions

- `apps/mobile/app/(auth)/login.tsx`
  - `react-qr-code` still receives literal `bgColor="white"` because the library API expects a concrete background color string for QR generation. The foreground remains theme-driven through `fgColor={qrForeground}`.
- `apps/mobile/app/(main)/scanner.tsx`
  - The live camera overlay keeps contextual `white` text and guide accents so instructions remain legible over arbitrary camera content. These are not semantic surface colors and intentionally stay outside the DS token palette.
