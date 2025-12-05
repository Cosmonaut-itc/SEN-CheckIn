---
name: Device Auto-Registration Fix
overview: Fix the device validation error by implementing automatic device registration during OAuth 2.0 device code flow, generating stable reproducible device IDs, and implementing dynamic online/offline status updates. Issue 2 (delete Rekognition/employee) is already fully implemented.
todos:
  - id: stable-device-id
    content: Generate stable reproducible device ID using expo-application/expo-device
    status: pending
  - id: api-register-endpoint
    content: Add POST /devices/register API endpoint with upsert logic
    status: pending
  - id: remove-web-device-create
    content: Remove device creation UI from web client (devices-client.tsx)
    status: pending
  - id: mobile-register-flow
    content: Call device registration from login.tsx after OAuth approval
    status: pending
  - id: heartbeat-impl
    content: Implement periodic heartbeat calls for online status
    status: pending
  - id: verify-issue2
    content: "Browser test: verify delete employee and delete Rekognition work"
    status: pending
  - id: lint-types
    content: Run bun run lint and bun run check-types
    status: pending
---

# Device Auto-Registration and Status Tracking

This plan addresses the device validation error and implements automatic device registration. Note: Issue 2 (delete Rekognition user and employee) is **already fully implemented** in the codebase.

**Key files to modify:**

- [`apps/api/src/routes/devices.ts`](apps/api/src/routes/devices.ts) - Add auto-register endpoint
- [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts) - Add register schema
- [`apps/mobile/lib/device-context.tsx`](apps/mobile/lib/device-context.tsx) - Add device registration
- [`apps/mobile/app/(auth)/login.tsx`](apps/mobile/app/\\\\(auth)/login.tsx) - Register device on approval
- [`apps/mobile/lib/client-functions.ts`](apps/mobile/lib/client-functions.ts) - Add registration function
- [`apps/web/app/(dashboard)/devices/devices-client.tsx`](apps/web/app/\\\\(dashboard)/devices/devices-client.tsx) - Remove create device UI

---

## Phase 1: Generate Stable Device ID (Mobile)

Use expo-application or expo-device to generate a reproducible unique identifier:

- Combine device model, OS version, and installation ID
- Store in SecureStore for persistence across app restarts
- Fallback to UUID if hardware info unavailable

**Agent must follow [AGENTS.md](AGENTS.md) guidelines:**

- Use JSDoc documentation for all functions
- Strong TypeScript typing throughout
- Use date-fns for any date manipulation

---

## Phase 2: API Device Registration Endpoint

Add `POST /devices/register` endpoint that:

- Accepts device code (stable ID) and optional metadata (name, type, platform)
- Uses upsert logic: creates new device or returns existing one with same code
- Requires valid session/token (from device authorization)
- Associates device with the authenticated user's organization

Update [`apps/api/src/schemas/crud.ts`](apps/api/src/schemas/crud.ts) with `registerDeviceSchema`.

---

## Phase 3: Remove Device Creation from Web Client

Devices should ONLY be created via mobile app registration during OAuth device code flow.

In [`apps/web/app/(dashboard)/devices/devices-client.tsx`](apps/web/app/\\\\(dashboard)/devices/devices-client.tsx):

- Remove "Add Device" button and create dialog
- Remove `createDevice` mutation and related form handling
- Keep device listing, editing, and deletion functionality
- Add informational text explaining devices are registered via mobile app

---

## Phase 4: Mobile Device Registration Flow

In [`apps/mobile/app/(auth)/login.tsx`](apps/mobile/app/\\\\(auth)/login.tsx):

1. After successful device authorization (when access token is received)
2. Generate stable device ID
3. Call `POST /devices/register` with device info
4. Store returned device UUID in DeviceContext
5. Use this UUID for all subsequent attendance records

---

## Phase 5: Heartbeat and Online Status

Implement heartbeat mechanism in mobile app:

- Call `POST /devices/:id/heartbeat` periodically (every 60s when app is active)
- API already sets status to ONLINE on heartbeat
- Consider background task for offline transition tracking

---

## Clarification: Delete Employee vs Delete Rekognition

Issue 2 is already implemented with **two separate actions**:

| Action | Endpoint | Effect |

|--------|----------|--------|

| **Delete Employee** | `DELETE /employees/:id` | Removes employee + auto-cleans Rekognition data |

| **Remove Face Enrollment** | `DELETE /employees/:id/rekognition-user` | Only removes Rekognition data, employee remains |

Both have confirmation dialogs in the web UI. "Remove face enrollment" is useful for re-enrollment without losing the employee record.

---

## Documentation References

Use Context7 MCP for:

- expo-application/expo-device API for stable device identifiers
- BetterAuth device authorization flow documentation
- Elysia.js route and validation patterns

---

## Quality Checks

Run at the end:

```bash
bun run lint
bun run check-types
```