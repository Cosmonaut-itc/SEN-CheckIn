---
name: Device Setup Screen
overview: Add a device configuration step during mobile login when a device is newly registered without a location. Users must configure device name and select a location before proceeding to the scanner.
todos:
  - id: api-isNew-flag
    content: "Add isNew: boolean flag to POST /devices/register response body"
    status: pending
  - id: client-register-response
    content: Update registerDevice() to return { device, isNew }
    status: pending
  - id: device-setup-screen
    content: Create device-setup.tsx with name input and location picker
    status: pending
  - id: login-navigation
    content: Modify login.tsx to route to device-setup when isNew && !locationId
    status: pending
  - id: lint-types-check
    content: Run bun run lint and bun run check-types
    status: pending
---

# Device Setup Screen for Mobile Login

This adds a device configuration step during mobile login when a device is newly registered without a location.

**Trigger condition:** Device is newly created (API returns 201) AND has no locationId assigned.

---

## Already Implemented (from previous plan)

The following components are already in place in uncommitted changes:

| Component | File | Status |

|-----------|------|--------|

| Stable device ID generation | `device-context.tsx` | Done - `getStableDeviceCode()` |

| API register endpoint | `devices.ts` | Done - `POST /devices/register` with upsert |

| Register schema | `crud.ts` | Done - `registerDeviceSchema` |

| Client register function | `client-functions.ts` | Done - `registerDevice()` |

| Heartbeat mechanism | `device-context.tsx` | Done - 60s interval with app state tracking |

| Login registration flow | `login.tsx` | Done - `registerApprovedDevice()` callback |

| Web create device removed | `devices-client.tsx` | Done - Edit-only mode |

---

## Remaining Work

### Phase 1: API - Add `isNew` Flag to Response

Modify [`apps/api/src/routes/devices.ts`](apps/api/src/routes/devices.ts) `/register` endpoint to include `isNew` in response body:

```typescript
// For existing device (line ~256)
return { data: refreshed[0], isNew: false };

// For new device (line ~277)
return { data: newDevice, isNew: true };
```

---

### Phase 2: Client Function - Return `isNew` Flag

Update [`apps/mobile/lib/client-functions.ts`](apps/mobile/lib/client-functions.ts):

- Change `registerDevice()` return type to `{ device: DeviceDetail, isNew: boolean }`
- Parse `isNew` from API response

---

### Phase 3: Create Device Setup Screen

Create new file `apps/mobile/app/(auth)/device-setup.tsx`:

**UI Components:**

- Device name TextInput (pre-populated from `ExpoDevice.deviceName`, required)
- Location Picker/Select from `fetchLocationsList()` (required)
- Submit button

**Flow:**

1. Receive `deviceId` and `organizationId` via route params or context
2. Fetch locations on mount
3. On submit: call `updateDeviceSettings(deviceId, { name, locationId })`
4. Update device context with new settings
5. Navigate to `/(main)/scanner`

---

### Phase 4: Modify Login Flow Navigation

Update [`apps/mobile/app/(auth)/login.tsx`](apps/mobile/app/\\\(auth)/login.tsx):

Change `registerApprovedDevice()` to:

1. Check `isNew && !registered.locationId` from registration response
2. If needs setup: navigate to `/(auth)/device-setup` with device info
3. If already configured: proceed to `/(main)/scanner`

---

### Phase 5: Quality Checks

```bash
bun run lint
bun run check-types
```