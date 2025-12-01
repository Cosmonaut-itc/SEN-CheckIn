# Release 04 - Query & Fetch Architecture

## Summary

This document explains the TanStack Query + React Server Components streaming architecture for the web app. The architecture enables server-side data prefetching with streaming support while maintaining authenticated requests through cookie forwarding.

## Goals

- Stream initial data from Server Components using React Query dehydration.
- Centralize query keys and fetchers so cache invalidation stays consistent.
- Keep mutations on the server (server actions) while letting clients drive them via `useMutation`.
- Preserve auth context by forwarding session cookies for all server-initiated requests.
- Support multi-tenant organization filtering across all data queries.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE LAYERS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐    ┌───────────────────────────────────────────┐ │
│  │   Server Component   │───▶│  prefetch* (server-functions.ts)          │ │
│  │      (page.tsx)      │    │  - Reads cookies from next/headers        │ │
│  └──────────────────────┘    │  - Calls server fetchers without await    │ │
│            │                 └───────────────────────────────────────────┘ │
│            │                               │                               │
│            ▼                               ▼                               │
│  ┌──────────────────────┐    ┌───────────────────────────────────────────┐ │
│  │  HydrationBoundary   │    │  Server Fetchers                          │ │
│  │  dehydrate(client)   │    │  (server-client-functions.ts)             │ │
│  └──────────────────────┘    │  - Accepts cookieHeader or Headers        │ │
│            │                 │  - Creates server API client              │ │
│            ▼                 └───────────────────────────────────────────┘ │
│  ┌──────────────────────┐                  │                               │
│  │   Client Component   │                  ▼                               │
│  │  (*-client.tsx)      │    ┌───────────────────────────────────────────┐ │
│  │  - useQuery          │    │  Server API Client (server-api.ts)        │ │
│  │  - useMutation       │    │  - createServerApiClient(cookieHeader)    │ │
│  └──────────────────────┘    │  - Injects Cookie header                  │ │
│            │                 └───────────────────────────────────────────┘ │
│            │                                                               │
│  ┌─────────┴─────────┐                                                     │
│  │                   │                                                     │
│  ▼                   ▼                                                     │
│ ┌────────────┐  ┌──────────────────┐    ┌────────────────────────────────┐ │
│ │ Client     │  │ Server Actions   │───▶│ Server API Client              │ │
│ │ Fetchers   │  │ (actions/*.ts)   │    │ (with forwarded cookies)       │ │
│ │ (browser)  │  │ 'use server'     │    └────────────────────────────────┘ │
│ └────────────┘  └──────────────────┘                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Query Client Configuration

**File:** `apps/web/lib/get-query-client.ts`

The query client is configured for SSR streaming with these key settings:

```typescript
import { isServer, QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';

const DEFAULT_STALE_TIME = 60 * 1000; // 1 minute

function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: DEFAULT_STALE_TIME,
			},
			dehydrate: {
				// Include pending queries in dehydration for streaming support
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
				shouldRedactErrors: () => {
					// Don't redact errors - Next.js needs them for dynamic page detection
					return false;
				},
			},
		},
	});
}

// Singleton for browser, new instance per request on server
let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient();
	} else {
		// Browser: return singleton to maintain cache
		if (!browserQueryClient) {
			browserQueryClient = makeQueryClient();
		}
		return browserQueryClient;
	}
}
```

**Key Points:**

- `staleTime: 60s` prevents immediate refetching on the client after hydration.
- `shouldDehydrateQuery` includes `'pending'` status for streaming support.
- `shouldRedactErrors: false` lets Next.js detect dynamic pages properly.
- Server creates a new client per request; browser uses a singleton.

---

## 2. Providers Setup

**File:** `apps/web/app/providers.tsx`

The providers wrap the application with `QueryClientProvider`:

```typescript
'use client';

import React, { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '@/components/theme-provider';
import { getQueryClient } from '@/lib/get-query-client';

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps): React.ReactElement {
	const queryClient = getQueryClient();

	return (
		<ThemeProvider defaultTheme="system" enableSystem>
			<QueryClientProvider client={queryClient}>
				{children}
				{process.env.NODE_ENV === 'development' && (
					<ReactQueryDevtools initialIsOpen={false} />
				)}
			</QueryClientProvider>
		</ThemeProvider>
	);
}
```

**Usage in root layout:**

```typescript
// apps/web/app/layout.tsx
export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
```

---

## 3. Query Keys

**File:** `apps/web/lib/query-keys.ts`

Centralized query key factories ensure consistent cache management:

### Query Parameter Types

```typescript
/** Base pagination parameters */
export interface ListQueryParams {
	limit?: number;
	offset?: number;
	search?: string;
	[key: string]: unknown;
}

/** Attendance-specific parameters */
export interface AttendanceQueryParams extends ListQueryParams {
	fromDate?: Date;
	toDate?: Date;
	type?: 'CHECK_IN' | 'CHECK_OUT';
}

/** Job position parameters with organization filter */
export interface JobPositionQueryParams extends ListQueryParams {
	organizationId?: string;
}

/** User list parameters */
export interface UsersQueryParams {
	limit?: number;
	offset?: number;
	[key: string]: unknown;
}
```

### Query Key Constructor

```typescript
/**
 * Constructs a query key array from a base key and optional parameters.
 */
export function queryKeyConstructor<
	TKey extends string | readonly string[],
	TParams extends Record<string, unknown> | undefined = undefined,
>(qk: TKey, params?: TParams): readonly unknown[] {
	const baseKey = typeof qk === 'string' ? [qk] : [...qk];
	if (params === undefined) {
		return baseKey as readonly unknown[];
	}
	return [...baseKey, params] as readonly unknown[];
}
```

### Query Keys Object

```typescript
export const queryKeys = {
	employees: {
		all: ['employees'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['employees', 'list'] as const, params),
		detail: (id: string) => ['employees', 'detail', id] as const,
	},

	devices: {
		all: ['devices'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['devices', 'list'] as const, params),
		detail: (id: string) => ['devices', 'detail', id] as const,
	},

	locations: {
		all: ['locations'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['locations', 'list'] as const, params),
		detail: (id: string) => ['locations', 'detail', id] as const,
	},

	jobPositions: {
		all: ['jobPositions'] as const,
		list: (params?: JobPositionQueryParams) =>
			queryKeyConstructor(['jobPositions', 'list'] as const, params),
		detail: (id: string) => ['jobPositions', 'detail', id] as const,
	},

	attendance: {
		all: ['attendance'] as const,
		list: (params?: AttendanceQueryParams) =>
			queryKeyConstructor(['attendance', 'list'] as const, params),
	},

	dashboard: {
		all: ['dashboard'] as const,
		counts: (organizationId?: string | null) =>
			queryKeyConstructor(['dashboard', 'counts'] as const, {
				organizationId: organizationId ?? undefined,
			}),
	},

	apiKeys: {
		all: ['apiKeys'] as const,
		list: () => ['apiKeys', 'list'] as const,
	},

	organizations: {
		all: ['organizations'] as const,
		list: () => ['organizations', 'list'] as const,
		detail: (id: string) => ['organizations', 'detail', id] as const,
	},

	users: {
		all: ['users'] as const,
		list: (params?: UsersQueryParams) =>
			queryKeyConstructor(['users', 'list'] as const, params),
		detail: (id: string) => ['users', 'detail', id] as const,
	},

	organizationMembers: {
		all: ['organizationMembers'] as const,
		list: (params?: OrganizationMembersQueryParams) =>
			queryKeyConstructor(['organizationMembers', 'list'] as const, params),
	},
} as const;
```

### Mutation Keys

```typescript
export const mutationKeys = {
	employees: {
		create: ['employees', 'create'] as const,
		update: ['employees', 'update'] as const,
		delete: ['employees', 'delete'] as const,
		createRekognitionUser: ['employees', 'createRekognitionUser'] as const,
		enrollFace: ['employees', 'enrollFace'] as const,
		deleteRekognitionUser: ['employees', 'deleteRekognitionUser'] as const,
		fullEnrollment: ['employees', 'fullEnrollment'] as const,
	},

	devices: {
		create: ['devices', 'create'] as const,
		update: ['devices', 'update'] as const,
		delete: ['devices', 'delete'] as const,
	},

	locations: {
		create: ['locations', 'create'] as const,
		update: ['locations', 'update'] as const,
		delete: ['locations', 'delete'] as const,
	},

	jobPositions: {
		create: ['jobPositions', 'create'] as const,
		update: ['jobPositions', 'update'] as const,
		delete: ['jobPositions', 'delete'] as const,
	},

	apiKeys: {
		create: ['apiKeys', 'create'] as const,
		delete: ['apiKeys', 'delete'] as const,
	},

	organizations: {
		create: ['organizations', 'create'] as const,
		update: ['organizations', 'update'] as const,
		delete: ['organizations', 'delete'] as const,
	},

	users: {
		setRole: ['users', 'setRole'] as const,
		ban: ['users', 'ban'] as const,
		unban: ['users', 'unban'] as const,
	},

	organizationMembers: {
		create: ['organizationMembers', 'create'] as const,
	},
} as const;
```

**Usage Examples:**

```typescript
// Get all employees keys (for broad invalidation)
queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });

// Get specific list query key with params
const key = queryKeys.employees.list({ search: 'john', limit: 10 });
// Result: ['employees', 'list', { search: 'john', limit: 10 }]

// Get detail query key
const detailKey = queryKeys.employees.detail('employee-id');
// Result: ['employees', 'detail', 'employee-id']
```

---

## 4. Browser API Client

**File:** `apps/web/lib/api.ts`

The browser-side Eden Treaty client used by client fetchers:

```typescript
import { createApiClient } from '@sen-checkin/api-contract';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Typed Eden Treaty client for communicating with the Sen CheckIn API.
 * Provides full type safety for all API endpoints.
 *
 * Configured with credentials: 'include' to ensure BetterAuth session cookies
 * are sent with cross-origin requests when the API runs on a different origin/port
 * than the Next.js admin UI.
 */
export const api = createApiClient(API_BASE_URL, {
	$fetch: {
		credentials: 'include',
		mode: 'cors',
	},
});

export { API_BASE_URL };
```

**Key Points:**

- Uses `@sen-checkin/api-contract` shared package for typed API calls via Eden Treaty.
- `credentials: 'include'` ensures cookies are sent with cross-origin requests (required when API and web app run on different ports).
- `mode: 'cors'` enables CORS requests to the API server.
- Exported `api` singleton is used by all client-side fetchers.
- `API_BASE_URL` comes from `NEXT_PUBLIC_API_URL` env var, defaults to `http://localhost:3000`.

**Usage in client fetchers:**

```typescript
// apps/web/lib/client-functions.ts
import { api } from '@/lib/api';

export async function fetchEmployeesList(params) {
	const response = await api.employees.get({ $query: { limit: 100, offset: 0 } });
	// ...
}
```

**Difference from Server API Client:**
| Aspect | Browser Client (`api.ts`) | Server Client (`server-api.ts`) |
|--------|---------------------------|----------------------------------|
| Cookies | Browser sends automatically | Must inject via `Cookie` header |
| Instance | Singleton export | Factory function per request |
| Usage | Client fetchers | Server actions & prefetch |

---

## 5. Server API Client Factory

**File:** `apps/web/lib/server-api.ts`

Creates an API client with forwarded cookies for server-side requests:

```typescript
import { createApiClient, type ApiClientOptions } from '@sen-checkin/api-contract';

const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Creates a server-side API client with forwarded cookies.
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @returns A typed Eden Treaty client with cookies attached
 */
export function createServerApiClient(cookieHeader: string): ReturnType<typeof createApiClient> {
	const options: ApiClientOptions = {
		$fetch: {
			credentials: 'include',
			mode: 'cors',
			headers: {
				Cookie: cookieHeader,
			},
		},
	};

	return createApiClient(API_BASE_URL, options);
}

export type ServerApiClient = ReturnType<typeof createServerApiClient>;
```

**Key Points:**

- Injects the `Cookie` header from the incoming request.
- Sets `credentials: 'include'` for cross-origin requests.
- Uses the shared `@sen-checkin/api-contract` for typed API calls.

---

## 6. Client Fetchers (Browser)

**File:** `apps/web/lib/client-functions.ts`

Client-side fetchers use the browser's Eden Treaty client:

### Type Definitions

```typescript
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT';

export interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	jobPositionName: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: Date | null;
	locationId: string | null;
	organizationId: string | null;
	rekognitionUserId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
	};
}
```

### Example Fetcher

```typescript
import { api } from '@/lib/api';

/**
 * Fetches a paginated list of employees from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated employees response
 * @throws Error if the API request fails
 */
export async function fetchEmployeesList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Employee>> {
	// Early return if no organization is selected
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
	// Eden Treaty converts undefined to string "undefined" which breaks search
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch employees:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch employees');
	}

	return {
		data: (response.data?.data ?? []) as Employee[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}
```

**Important:** Always strip `undefined` values from query objects—Eden Treaty converts them to the string `"undefined"`.

---

## 7. Server Fetchers (for Prefetch)

**File:** `apps/web/lib/server-client-functions.ts`

Server-side versions that accept forwarded cookies:

```typescript
import { createServerApiClient, type ServerApiClient } from '@/lib/server-api';
import { serverAuthClient } from '@/lib/server-auth-client';

/**
 * Fetches a paginated list of employees from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated employees response
 */
export async function fetchEmployeesListServer(
	cookieHeader: string,
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Employee>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	// Resolve organization ID from params or BetterAuth session
	let organizationId = params?.organizationId ?? null;
	if (!organizationId && cookieHeader) {
		const session = await serverAuthClient.getSession({
			fetchOptions: { headers: new Headers({ cookie: cookieHeader }) },
		});
		if (!session.error) {
			organizationId = session.data?.session?.activeOrganizationId ?? null;
		}
	}

	if (!organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.search) {
		query.search = params.search;
	}

	query.organizationId = organizationId;

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch employees:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch employees');
	}

	return {
		data: (response.data?.data ?? []) as Employee[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}
```

### BetterAuth Endpoints (API Keys, Organizations, Users)

For BetterAuth endpoints, forward the entire `Headers` object instead of just the cookie string:

```typescript
import { authClient } from '@/lib/auth-client';

/**
 * Fetches the list of API keys for the current user (server-side).
 *
 * @param headers - The headers object from the incoming request
 * @returns A promise resolving to the array of API keys
 */
export async function fetchApiKeysServer(headers: Headers): Promise<ApiKey[]> {
	const response = await authClient.apiKey.list({
		fetchOptions: {
			headers,
		},
	});

	if (response.error) {
		console.error('[Server] Failed to fetch API keys:', response.error);
		throw new Error('Failed to fetch API keys');
	}

	return (response.data ?? []) as ApiKey[];
}
```

**Key Difference:** BetterAuth inspects more than just the `Cookie` header, so forward the complete `Headers` object.

---

## 8. Prefetch Helpers (Server Components)

**File:** `apps/web/lib/server-functions.ts`

These functions are called from Server Components to initiate data fetching:

### Helper Functions

```typescript
import { headers } from 'next/headers';

/**
 * Retrieves the cookie header string from the incoming request.
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Retrieves the headers from the incoming request.
 */
async function getRequestHeaders(): Promise<Headers> {
	return await headers();
}
```

### Prefetch for Core API Endpoints

```typescript
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys, type ListQueryParams } from '@/lib/query-keys';
import { fetchEmployeesListServer } from '@/lib/server-client-functions';

/**
 * Prefetches the employees list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 */
export function prefetchEmployeesList(queryClient: QueryClient, params?: ListQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.employees.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchEmployeesListServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchEmployeesListServer(cookieHeader, params);
		},
	});
}
```

### Prefetch for BetterAuth Endpoints

```typescript
import { fetchApiKeysServer } from '@/lib/server-client-functions';

/**
 * Prefetches the API keys list for server-side streaming.
 *
 * Headers are forwarded from the incoming request to authenticate
 * with the BetterAuth API.
 */
export function prefetchApiKeys(queryClient: QueryClient): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.apiKeys.list(),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchApiKeysServer>>> => {
			const requestHeaders: Headers = await getRequestHeaders();
			return fetchApiKeysServer(requestHeaders);
		},
	});
}
```

**Critical:** Do NOT `await` the prefetch call—this enables streaming.

---

## 9. Organization Context

**File:** `apps/web/lib/organization-context.ts`

Resolves the active organization from the BetterAuth session:

```typescript
import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

export interface ActiveOrganizationContext {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
}

/**
 * Resolves the active organization from the BetterAuth session.
 */
export async function getActiveOrganizationContext(): Promise<ActiveOrganizationContext> {
	const fetchOptions = await getServerFetchOptions();
	const sessionResult = await serverAuthClient.getSession({ fetchOptions });

	const organizationId = sessionResult.error
		? null
		: (sessionResult.data?.session?.activeOrganizationId ?? null);

	if (!organizationId) {
		return { organizationId: null, organizationSlug: null, organizationName: null };
	}

	const organizations = await serverAuthClient.organization.list({ fetchOptions });
	const activeOrg = organizations.data?.find((org) => org.id === organizationId);

	return {
		organizationId,
		organizationSlug: activeOrg?.slug ?? null,
		organizationName: activeOrg?.name ?? null,
	};
}
```

**File:** `apps/web/lib/org-client-context.tsx`

Client-side React context for organization data:

```typescript
'use client';

import React, { createContext, useContext } from 'react';

export interface OrgContextValue {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({
	value,
	children,
}: {
	value: OrgContextValue;
	children: React.ReactNode;
}): React.ReactElement {
	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
	const ctx = useContext(OrgContext);
	if (!ctx) {
		throw new Error('useOrgContext must be used within an OrgProvider');
	}
	return ctx;
}
```

---

## 10. Server Actions (Mutations)

**File:** `apps/web/actions/employees.ts`

Server actions handle mutations with proper authentication:

```typescript
'use server';

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';
import type { EmployeeStatus } from '@/lib/client-functions';

/**
 * Input data for creating a new employee.
 */
export interface CreateEmployeeInput {
	code: string;
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	jobPositionId: string;
	department?: string;
	status: EmployeeStatus;
}

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Creates a new employee.
 *
 * @param input - The employee data to create
 * @returns A promise resolving to the mutation result
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees.post({
			code: input.code,
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email || undefined,
			phone: input.phone || undefined,
			jobPositionId: input.jobPositionId,
			department: input.department || undefined,
			status: input.status,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create employee',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create employee:', error);
		return {
			success: false,
			error: 'Failed to create employee',
		};
	}
}

/**
 * Updates an existing employee.
 */
export async function updateEmployee(input: UpdateEmployeeInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[input.id].put({
			code: input.code,
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email || undefined,
			phone: input.phone || undefined,
			jobPositionId: input.jobPositionId || undefined,
			department: input.department || undefined,
			status: input.status,
		});

		if (response.error) {
			return { success: false, error: 'Failed to update employee' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update employee:', error);
		return { success: false, error: 'Failed to update employee' };
	}
}

/**
 * Deletes an employee.
 */
export async function deleteEmployee(id: string): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[id].delete();

		if (response.error) {
			return { success: false, error: 'Failed to delete employee' };
		}

		return { success: true };
	} catch (error) {
		console.error('Failed to delete employee:', error);
		return { success: false, error: 'Failed to delete employee' };
	}
}
```

**Pattern:**

1. Mark file with `'use server'`
2. Get headers using `await headers()`
3. Extract cookie: `requestHeaders.get('cookie') ?? ''`
4. Create server client: `createServerApiClient(cookieHeader)`
5. Return `{ success, data?, error? }` for consistent handling

---

## 11. Page Components

### Server Component (page.tsx)

**File:** `apps/web/app/(dashboard)/employees/page.tsx`

```typescript
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchEmployeesList } from '@/lib/server-functions';
import { EmployeesPageClient } from './employees-client';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Employees page server component.
 */
export default async function EmployeesPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	// Prefetch without await for streaming support
	prefetchEmployeesList(queryClient, {
		limit: 100,
		offset: 0,
		organizationId: orgContext.organizationId,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<EmployeesPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
```

**Key Points:**

- `export const dynamic = 'force-dynamic'` ensures cookies are available.
- `getQueryClient()` creates a new client on the server.
- `prefetchEmployeesList()` called WITHOUT `await` enables streaming.
- `HydrationBoundary` transfers cache state to the client.
- `OrgProvider` passes organization context to client components.

### Client Component (\*-client.tsx)

**File:** `apps/web/app/(dashboard)/employees/employees-client.tsx`

```typescript
'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchEmployeesList, type Employee } from '@/lib/client-functions';
import { createEmployee, updateEmployee, deleteEmployee } from '@/actions/employees';
import { useOrgContext } from '@/lib/org-client-context';

export function EmployeesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const [search, setSearch] = useState<string>('');

	// Build query params - only include search if it has a value
	const baseParams = { limit: 100, offset: 0, organizationId };
	const queryParams = search ? { ...baseParams, search } : baseParams;

	const isOrgSelected = Boolean(organizationId);

	// Query for employees list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.employees.list(queryParams),
		queryFn: () => fetchEmployeesList(queryParams),
		enabled: isOrgSelected,
	});

	const employees = data?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.employees.create,
		mutationFn: createEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee created successfully');
				// Invalidate ALL employees queries to refresh any filter combination
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to create employee');
			}
		},
		onError: () => {
			toast.error('Failed to create employee');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.employees.update,
		mutationFn: updateEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee updated successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to update employee');
			}
		},
		onError: () => {
			toast.error('Failed to update employee');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.employees.delete,
		mutationFn: deleteEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee deleted successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to delete employee');
			}
		},
		onError: () => {
			toast.error('Failed to delete employee');
		},
	});

	// Show empty state if no organization selected
	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">Employees</h1>
				<p className="text-muted-foreground">
					Select an active organization to manage employees.
				</p>
			</div>
		);
	}

	// Render loading skeletons while fetching
	if (isFetching) {
		return <EmployeesTableSkeleton />;
	}

	return (
		<div className="space-y-6">
			{/* Search, Table, Dialogs, etc. */}
		</div>
	);
}
```

**Key Points:**

- Use `useOrgContext()` to get organization ID from context.
- Query key includes all params: `queryKeys.employees.list(queryParams)`.
- Enabled only when organization is selected: `enabled: isOrgSelected`.
- Invalidate with `.all` key to refresh all filter combinations.
- Show skeletons using `isFetching` state.

---

## 12. Complete Data Flow Example

### 1. User navigates to `/employees`

### 2. Server Component Executes

```typescript
// page.tsx
export default async function EmployeesPage() {
	const queryClient = getQueryClient();                    // New client per request
	const orgContext = await getActiveOrganizationContext(); // Get active org from session

	prefetchEmployeesList(queryClient, {                     // Start fetch (no await)
		limit: 100,
		offset: 0,
		organizationId: orgContext.organizationId,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>   // Transfer cache state
			<OrgProvider value={orgContext}>                   // Provide org context
				<EmployeesPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
```

### 3. Prefetch Initiates Server Fetch

```typescript
// server-functions.ts
export function prefetchEmployeesList(queryClient, params) {
	queryClient.prefetchQuery({
		queryKey: queryKeys.employees.list(params),
		queryFn: async () => {
			const cookieHeader = await getCookieHeader(); // Get cookies from request
			return fetchEmployeesListServer(cookieHeader, params);
		},
	});
}
```

### 4. Server Fetcher Makes Authenticated Request

```typescript
// server-client-functions.ts
export async function fetchEmployeesListServer(cookieHeader, params) {
	const api = createServerApiClient(cookieHeader); // Create client with cookies
	const response = await api.employees.get({ $query: query });
	return { data: response.data.data, pagination: response.data.pagination };
}
```

### 5. Client Component Hydrates

```typescript
// employees-client.tsx
const { data, isFetching } = useQuery({
	queryKey: queryKeys.employees.list(queryParams), // Same key as prefetch
	queryFn: () => fetchEmployeesList(queryParams), // Client fetcher (won't run initially)
	enabled: isOrgSelected,
});
// Data is immediately available from hydrated cache
```

### 6. User Triggers Mutation

```typescript
// employees-client.tsx
const createMutation = useMutation({
	mutationKey: mutationKeys.employees.create,
	mutationFn: createEmployee, // Server action
	onSuccess: (result) => {
		if (result.success) {
			queryClient.invalidateQueries({
				queryKey: queryKeys.employees.all, // Invalidate all employee queries
			});
		}
	},
});
```

### 7. Server Action Executes

```typescript
// actions/employees.ts
export async function createEmployee(input) {
	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';
	const api = createServerApiClient(cookieHeader);

	const response = await api.employees.post({ ... });
	return { success: !response.error, data: response.data };
}
```

---

## Caveats and Best Practices

### Cookie Forwarding

- **Use `headers().get('cookie')`** — Not `cookies().toString()` which produces `[object ReadonlyRequestCookies]`.
- **BetterAuth requires full Headers** — Forward the entire `Headers` object for auth endpoints.

### Dynamic Rendering

- **Always export `dynamic = 'force-dynamic'`** on authenticated pages.
- Without this, Next.js may cache the route and strip cookies.

### Cache Invalidation

- **Use `.all` keys for broad invalidation** — `queryKeys.employees.all` covers all filter combinations.
- Query keys include the params object; exact key match only invalidates that specific filter set.

### Error Handling

- `shouldRedactErrors: false` lets Next.js properly detect dynamic pages.
- Errors surface to `app/(dashboard)/error.tsx` error boundary.

### Eden Treaty Quirk

- **Strip undefined values from query objects** — Eden converts `undefined` to the string `"undefined"`.

### Streaming Support

- **Do NOT await prefetch calls** — Awaiting defeats the purpose of streaming.
- Pending queries are dehydrated because `shouldDehydrateQuery` includes `'pending'` status.

---

## Adding a New Entity

### Step 1: Define Query/Mutation Keys

```typescript
// apps/web/lib/query-keys.ts
export const queryKeys = {
	// ... existing keys
	newEntity: {
		all: ['newEntity'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['newEntity', 'list'] as const, params),
		detail: (id: string) => ['newEntity', 'detail', id] as const,
	},
};

export const mutationKeys = {
	// ... existing keys
	newEntity: {
		create: ['newEntity', 'create'] as const,
		update: ['newEntity', 'update'] as const,
		delete: ['newEntity', 'delete'] as const,
	},
};
```

### Step 2: Add Client Fetcher

```typescript
// apps/web/lib/client-functions.ts
export async function fetchNewEntityList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<NewEntity>> {
	if (params?.organizationId === null) {
		return { data: [], pagination: { total: 0, limit: 100, offset: 0 } };
	}

	const query = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		...(params?.organizationId && { organizationId: params.organizationId }),
		...(params?.search && { search: params.search }),
	};

	const response = await api['new-entity'].get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch new entities');
	}

	return {
		data: (response.data?.data ?? []) as NewEntity[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}
```

### Step 3: Add Server Fetcher

```typescript
// apps/web/lib/server-client-functions.ts
export async function fetchNewEntityListServer(
	cookieHeader: string,
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<NewEntity>> {
	const api = createServerApiClient(cookieHeader);

	if (params?.organizationId === null) {
		return { data: [], pagination: { total: 0, limit: 100, offset: 0 } };
	}

	const query = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		...(params?.organizationId && { organizationId: params.organizationId }),
		...(params?.search && { search: params.search }),
	};

	const response = await api['new-entity'].get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch new entities');
	}

	return {
		data: (response.data?.data ?? []) as NewEntity[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}
```

### Step 4: Add Prefetch Helper

```typescript
// apps/web/lib/server-functions.ts
export function prefetchNewEntityList(queryClient: QueryClient, params?: ListQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.newEntity.list(params),
		queryFn: async () => {
			const cookieHeader = await getCookieHeader();
			return fetchNewEntityListServer(cookieHeader, params);
		},
	});
}
```

### Step 5: Create Server Action

```typescript
// apps/web/actions/new-entity.ts
'use server';

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

export interface CreateNewEntityInput {
	name: string;
	// ... other fields
}

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export async function createNewEntity(input: CreateNewEntityInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api['new-entity'].post({
			name: input.name,
			// ... other fields
		});

		if (response.error) {
			return { success: false, error: 'Failed to create new entity' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create new entity:', error);
		return { success: false, error: 'Failed to create new entity' };
	}
}
```

### Step 6: Export from Actions Index

```typescript
// apps/web/actions/index.ts
export * from './new-entity';
```

### Step 7: Create Server Component

```typescript
// apps/web/app/(dashboard)/new-entity/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchNewEntityList } from '@/lib/server-functions';
import { NewEntityPageClient } from './new-entity-client';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

export const dynamic = 'force-dynamic';

export default async function NewEntityPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	prefetchNewEntityList(queryClient, {
		limit: 100,
		offset: 0,
		organizationId: orgContext.organizationId,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<NewEntityPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
```

### Step 8: Create Client Component

```typescript
// apps/web/app/(dashboard)/new-entity/new-entity-client.tsx
'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchNewEntityList } from '@/lib/client-functions';
import { createNewEntity, updateNewEntity, deleteNewEntity } from '@/actions/new-entity';
import { useOrgContext } from '@/lib/org-client-context';

export function NewEntityPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const [search, setSearch] = useState('');

	const baseParams = { limit: 100, offset: 0, organizationId };
	const queryParams = search ? { ...baseParams, search } : baseParams;

	const isOrgSelected = Boolean(organizationId);

	const { data, isFetching } = useQuery({
		queryKey: queryKeys.newEntity.list(queryParams),
		queryFn: () => fetchNewEntityList(queryParams),
		enabled: isOrgSelected,
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.newEntity.create,
		mutationFn: createNewEntity,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Created successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.newEntity.all });
			} else {
				toast.error(result.error ?? 'Failed to create');
			}
		},
	});

	// ... rest of component
}
```

---

## File Reference

| File                             | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `lib/get-query-client.ts`        | QueryClient factory (server/browser)                  |
| `app/providers.tsx`              | QueryClientProvider wrapper                           |
| `lib/query-keys.ts`              | Query key factories                                   |
| `lib/api.ts`                     | Browser Eden Treaty client (`credentials: 'include'`) |
| `lib/server-api.ts`              | Server API client factory (injects Cookie header)     |
| `lib/client-functions.ts`        | Browser fetchers (use `lib/api.ts`)                   |
| `lib/server-client-functions.ts` | Server fetchers (use `lib/server-api.ts`)             |
| `lib/server-functions.ts`        | Prefetch helpers for RSC (call server fetchers)       |
| `lib/organization-context.ts`    | Server-side org resolution from BetterAuth            |
| `lib/org-client-context.tsx`     | Client-side React context for org data                |
| `lib/auth-client.ts`             | BetterAuth browser client                             |
| `lib/server-auth-client.ts`      | BetterAuth server client with header forwarding       |
| `actions/*.ts`                   | Server actions for mutations (`'use server'`)         |
| `app/(dashboard)/*/page.tsx`     | Server components (prefetch + HydrationBoundary)      |
| `app/(dashboard)/*/*-client.tsx` | Client components (useQuery + useMutation)            |
