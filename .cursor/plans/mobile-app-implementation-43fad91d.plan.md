<!-- 43fad91d-42d2-4bd7-a581-04542425744e 86c0584d-3295-483c-bd61-5e4ecc5336f8 -->

# Device Code Authentication Flow Implementation

## Overview

BetterAuth provides a built-in `deviceAuthorization` plugin implementing OAuth 2.0 Device Authorization Grant (RFC 8628). This plan integrates the plugin into the existing API and Web app infrastructure.

---

## Reference Documentation

The agent MUST consult these sources using Context7 MCP:

| Library | Context7 ID | Topics |

|---------|-------------|--------|

| Better Auth | `/better-auth/better-auth` | device authorization, deviceAuthorization plugin |

### Key BetterAuth Device Authorization Endpoints

| Endpoint | Method | Description |

|----------|--------|-------------|

| `/api/auth/device/code` | POST | Request device code and user code |

| `/api/auth/device` | GET | Verify user code validity |

| `/api/auth/device/token` | POST | Poll for access token |

| `/api/auth/device/approve` | POST | Approve device (requires auth) |

| `/api/auth/device/deny` | POST | Deny device (requires auth) |

---

## Phase 1: API Configuration

### 1.1 Add deviceAuthorization Plugin

File: `apps/api/utils/auth.ts`

```typescript
import { deviceAuthorization } from 'better-auth/plugins';

export const auth = betterAuth({
	// ... existing config
	plugins: [
		apiKey(),
		admin({ defaultRole: 'user', adminRoles: ['admin'] }),
		organization({ allowUserToCreateOrganization: true }),
		username(),
		// ADD: Device Authorization plugin
		deviceAuthorization({
			verificationUri: '/device', // Web app route for verification
			expiresIn: '10m', // Device code valid for 10 minutes
			interval: '5s', // Polling interval
			userCodeLength: 8, // User-friendly code length
		}),
	],
});
```

### 1.2 Update Trusted Origins

Add mobile app deep link scheme to trusted origins:

```typescript
trustedOrigins: [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'sen-checkin://',  // Mobile app deep link
].filter(Boolean),
```

### 1.3 Generate Database Migration (if needed)

Check if `deviceAuthorization` plugin requires additional tables. If so:

```bash
bun run drizzle:generate
bun run drizzle:migrate
```

---

## Phase 2: Web Admin Client Configuration

### 2.1 Add deviceAuthorizationClient Plugin

File: `apps/web/lib/auth-client.ts`

```typescript
import { deviceAuthorizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	baseURL: API_BASE_URL,
	plugins: [
		apiKeyClient(),
		adminClient(),
		organizationClient(),
		usernameClient(),
		// ADD: Device Authorization client plugin
		deviceAuthorizationClient(),
	],
});
```

---

## Phase 3: Web Device Verification Page

### 3.1 Create Device Verification Route

File: `apps/web/app/(auth)/device/[code]/page.tsx`

Server component that renders the device verification UI:

```
URL: /device/XXXX-XXXX (optional pre-filled code)
```

Features:

- Input field for user code (8 characters, formatted as XXXX-XXXX)
- "Verify Code" button to check code validity
- On valid code: Show device info and approve/deny buttons
- On invalid code: Show error message

### 3.2 Create Device Verification Client Component

File: `apps/web/app/(auth)/device/device-client.tsx`

UI Flow:

1. User enters code (or uses pre-filled from URL)
2. Call `authClient.device()` to verify code
3. If valid: Show approval screen with device details
4. User clicks "Approve" → `authClient.device.approve(deviceCode)`
5. User clicks "Deny" → `authClient.device.deny(deviceCode)`
6. Show success/error message and redirect

### 3.3 Add Navigation Link (Optional)

Add "Authorize Device" link to dashboard sidebar for easy access.

---

## Phase 4: Update Mobile Plan Integration

The mobile app plan already references device code authentication. With BetterAuth's plugin:

### Mobile Auth Client Configuration

File: `apps/mobile/lib/auth-client.ts`

```typescript
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { deviceAuthorizationClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

export const authClient = createAuthClient({
	baseURL: 'https://your-api.com',
	plugins: [
		expoClient({
			scheme: 'sen-checkin',
			storagePrefix: 'sen-checkin',
			storage: SecureStore,
		}),
		deviceAuthorizationClient(),
	],
});
```

### Mobile Login Flow

```typescript
// 1. Request device code
const { data } = await authClient.device.code({
	client_id: 'sen-checkin-mobile',
	scope: 'openid profile',
});

// 2. Display to user
console.log(`Code: ${data.user_code}`);
console.log(`URL: ${data.verification_uri_complete}`);

// 3. Poll for authorization
const tokenResult = await pollForToken(data.device_code, data.interval);
```

---

## Phase 5: Database Schema Update

### 5.1 Check Plugin Schema Requirements

The `deviceAuthorization` plugin may require a `device_code` table. Check BetterAuth docs:

```typescript
// Expected schema (if auto-generated by plugin)
export const deviceCode = pgTable('device_code', {
	id: text('id').primaryKey(),
	deviceCode: text('device_code').notNull().unique(),
	userCode: text('user_code').notNull().unique(),
	clientId: text('client_id').notNull(),
	scope: text('scope'),
	userId: text('user_id').references(() => user.id),
	status: text('status').default('pending'), // pending, approved, denied, expired
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

If plugin auto-manages schema, no action needed. Otherwise, add to `apps/api/auth-schema.ts`.

---

## Key Files Summary

| File | Changes |

|------|---------|

| `apps/api/utils/auth.ts` | Add `deviceAuthorization` plugin |

| `apps/web/lib/auth-client.ts` | Add `deviceAuthorizationClient` plugin |

| `apps/web/app/(auth)/device/page.tsx` | New - Device verification page |

| `apps/web/app/(auth)/device/device-client.tsx` | New - Verification UI component |

| `apps/api/auth-schema.ts` | Possibly add `deviceCode` table |

---

## Post-Implementation Validation

After completing all implementation tasks:

```bash
# From project root
bun run lint          # Verify ESLint passes
bun run check-types   # Verify TypeScript compilation
```

Fix any errors before considering the implementation complete.

---

## Documentation Requirements

Upon completion, update or create documentation:

**File**: `documentacion/release-09-mobile-app.md` (update existing plan file)

Add section documenting:

- Device code authentication flow
- BetterAuth plugin configuration
- Web verification page usage
- Mobile integration details

---

## Testing Checklist

1. API: `POST /api/auth/device/code` returns device_code and user_code
2. Web: `/device` page loads and accepts user codes
3. Web: Approve button successfully authorizes device
4. Web: Deny button rejects device authorization
5. API: Token polling returns tokens after approval
6. API: Token polling returns error after denial

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
- [ ] Run bun run lint and bun run check-types, fix any errors
- [ ] Create documentacion/release-09-mobile-app.md with implementation details and pending work
