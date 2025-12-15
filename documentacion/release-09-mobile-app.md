# Release 09 - Mobile Device Authorization

## Highlights

- Added BetterAuth `deviceAuthorization` plugin to the API with 10-minute codes, 5-second polling guidance, and deep-link trusted origin `sen-checkin://`.
- Introduced `/device` verification experience in the web app (supports `/device?user_code=…` and `/device/[code]`) with approve/deny actions gated by authenticated admins.
- Wired the Expo mobile login screen to the device code flow (request code, poll `/device/token`, handle RFC 8628 errors, and auto-redirect on approval).

## API

- `apps/api/utils/auth.ts`: enabled `deviceAuthorization` plugin and updated trusted origins to include the mobile deep link.
- `apps/api/src/db/schema.ts`: added `device_code` table (deviceCode/userCode/status/pollingInterval/clientId/scope, PK id) with relations to `user` for approvals.

## Web

- `apps/web/lib/auth-client.ts`: registered `deviceAuthorizationClient` plugin.
- New verification UI under `/device` (`apps/web/app/(auth)/device/device-client.tsx`): code input + status badge, approve/deny buttons, and helper copy explaining the flow. Works with pre-filled codes via path or `user_code` query.

## Mobile

- `apps/mobile/lib/auth-client.ts`: added device authorization client plugin.
- `apps/mobile/app/(auth)/login.tsx`: real device-code login flow (requests code, shows verification URL, polls token endpoint, handles authorization_pending/slow_down/access_denied/expired_token, refresh button, dev bypass).
- Data layer: added fetchers for devices and attendance lists; expanded query params to support date filters.

### Mobile device-code architecture (current implementation)

- **Storage & auth**: BetterAuth Expo client uses SecureStore-backed storage adapter to keep session cookies; device client plugin handles `/device/*` endpoints.
- **Login flow**:
    1. Request device code via `authClient.device.code({ client_id: 'sen-checkin-mobile', scope: 'openid profile' })`.
    2. Display `user_code` (formatted as XXXX-XXXX) plus `verification_uri_complete` with deep link support.
    3. Poll `/device/token` using `grant_type = urn:ietf:params:oauth:grant-type:device_code`, respecting `interval` and `slow_down`.
    4. On approval, call `authClient.getSession()` and navigate to `(main)/scanner`.
    5. Handle terminal states: `access_denied` → restart flow; `expired_token` → refresh; `authorization_pending` → continue polling; `slow_down` → increase poll interval by 5s.
- **Local settings**: device context persists `deviceId`/name/location in SecureStore; login dev-bypass remains for offline development.

### Web device verification (for admins)

- Uses TanStack Query + BetterAuth client plugin; query key `queryKeys.deviceAuth.verify(userCode)` caches verification responses.
- Approve/Deny mutations invalidate `deviceAuth` cache scope; gated by authenticated session.
- Accepts codes via route param (`/device/[code]`) or query (`/device?user_code=...`); normalization strips dashes/whitespace.

## Pending / Follow-ups

- Run database migrations for the new `device_code` table (`bun run db:gen && bun run db:mig`) once env vars are available.
- Consider surfacing device metadata in the web approval UI when BetterAuth exposes it.
- Link approved device sessions to a specific kiosk/device record (current flow only delivers a user session).
