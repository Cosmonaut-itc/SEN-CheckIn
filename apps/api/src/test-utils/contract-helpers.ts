import { edenTreaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { parseSetCookieHeader } from 'better-auth/cookies';

import type { App } from '../app.js';

type SeedData = {
	organizationId: string;
	locationId: string;
	jobPositionId: string;
	employeeId: string;
	deviceId: string;
	scheduleTemplateId: string;
	vacationRequestId: string | null;
	payrollRunId: string | null;
};

type SessionContext = {
	cookieHeader: string;
	organizationId: string;
	userId: string;
};

type TestUserCredentials = {
	email: string;
	password: string;
};

const TEST_DB_NAME = 'sen_checkin_test';
const TEST_DB_USER = 'admin';
const TEST_DB_HOST = '127.0.0.1';
const TEST_DB_PORT = 5435;

const ADMIN_CREDENTIALS: TestUserCredentials = {
	email: 'admin@sen-checkin.test',
	password: 'Admin123!Test',
};

const USER_CREDENTIALS: TestUserCredentials = {
	email: 'user@sen-checkin.test',
	password: 'User123!Test',
};

let cachedApp: App | null = null;
let cachedAppPromise: Promise<App> | null = null;
let cachedSeedData: SeedData | null = null;
let cachedAdminSession: SessionContext | null = null;
let cachedUserSession: SessionContext | null = null;
let cachedApiKey: string | null = null;

/**
 * Builds a Postgres connection string for the test database.
 *
 * @param password - Postgres password
 * @returns Connection string for the test database
 */
function buildTestDatabaseUrl(password: string): string {
	const encodedPassword = encodeURIComponent(password);
	return `postgresql://${TEST_DB_USER}:${encodedPassword}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`;
}

/**
 * Ensures SEN_DB_URL points to the test database, deriving it when needed.
 * Falls back to the test DB URL if SEN_DB_URL targets a non-test database.
 *
 * @returns Test database connection string
 * @throws Error when required environment variables are missing or invalid
 */
export function ensureTestDatabaseUrl(): string {
	const providedUrl = process.env.SEN_DB_URL;
	let providedDatabaseName: string | null = null;
	if (providedUrl) {
		const parsed = new URL(providedUrl);
		providedDatabaseName = parsed.pathname.replace(/^\//, '');
		if (providedDatabaseName === TEST_DB_NAME) {
			return providedUrl;
		}
	}

	const password = process.env.SEN_CHECKIN_PG_PASSWORD;
	if (!password) {
		if (providedDatabaseName) {
			throw new Error(
				`SEN_DB_URL must target "${TEST_DB_NAME}" for tests. Received "${providedDatabaseName}".`,
			);
		}
		throw new Error('SEN_CHECKIN_PG_PASSWORD is required for API contract tests.');
	}

	const derivedUrl = buildTestDatabaseUrl(password);
	process.env.SEN_DB_URL = derivedUrl;
	return derivedUrl;
}

/**
 * Loads the Drizzle database instance and schema after ensuring env vars.
 *
 * @returns Database instance and schema module
 */
async function loadDatabase(): Promise<{
	db: typeof import('../db/index.js').default;
	schema: typeof import('../db/schema.js');
}> {
	ensureTestDatabaseUrl();
	const { default: db } = await import('../db/index.js');
	const schema = await import('../db/schema.js');
	return { db, schema };
}

/**
 * Loads the BetterAuth instance after ensuring env vars.
 *
 * @returns Auth instance
 */
async function loadAuth(): Promise<typeof import('../../utils/auth.js').auth> {
	ensureTestDatabaseUrl();
	const { auth } = await import('../../utils/auth.js');
	return auth;
}

/**
 * Builds a Request object from fetch inputs.
 *
 * @param input - Fetch request input
 * @param init - Optional fetch init overrides
 * @returns Request instance
 */
function buildRequest(input: RequestInfo | URL, init?: RequestInit): Request {
	const requestInput = input instanceof URL ? input.toString() : input;
	if (requestInput instanceof Request) {
		return init ? new Request(requestInput, init) : requestInput;
	}
	return new Request(requestInput, init);
}

/**
 * Builds a cookie header string from a Set-Cookie header.
 *
 * @param setCookieHeader - Set-Cookie header string
 * @returns Cookie header string
 * @throws Error when no cookies are present
 */
function buildCookieHeader(setCookieHeader: string): string {
	const parsed = parseSetCookieHeader(setCookieHeader);
	const pairs = Array.from(parsed.entries()).map(([name, value]) => `${name}=${value.value}`);
	if (pairs.length === 0) {
		throw new Error('No cookies found in Set-Cookie header.');
	}
	return pairs.join('; ');
}

/**
 * Merges Set-Cookie header values into an existing cookie header.
 *
 * @param cookieHeader - Existing cookie header string
 * @param setCookieHeader - Set-Cookie header string
 * @returns Updated cookie header string
 */
function mergeCookieHeader(cookieHeader: string, setCookieHeader: string | null): string {
	if (!setCookieHeader) {
		return cookieHeader;
	}
	const cookieMap = new Map<string, string>();
	cookieHeader
		.split(';')
		.map((cookie) => cookie.trim())
		.filter(Boolean)
		.forEach((cookie) => {
			const [name, ...valueParts] = cookie.split('=');
			const value = valueParts.join('=');
			if (name && value) {
				cookieMap.set(name, value);
			}
		});

	parseSetCookieHeader(setCookieHeader).forEach((value, name) => {
		cookieMap.set(name, value.value);
	});

	return Array.from(cookieMap.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join('; ');
}

/**
 * Creates or reuses the test app instance.
 *
 * @returns Promise resolving to the Elysia app instance
 */
export function getTestApp(): Promise<App> {
	if (cachedApp) {
		return Promise.resolve(cachedApp);
	}
	if (cachedAppPromise) {
		return cachedAppPromise;
	}
	cachedAppPromise = (async () => {
		ensureTestDatabaseUrl();
		const { createApp } = await import('../app.js');
		cachedApp = createApp();
		return cachedApp;
	})();
	return cachedAppPromise;
}

/**
 * Creates a typed Eden Treaty client that routes through the in-memory app.
 *
 * @returns Eden Treaty client
 */
export function createTestClient() {
	/**
	 * No-op preconnect implementation for test fetcher.
	 *
	 * @param url - URL to preconnect
	 * @param options - Optional preconnect options
	 * @returns Nothing
	 */
	const noopPreconnect: typeof fetch.preconnect = (_url, _options) => {
		void _url;
		void _options;
	};

	const fetcher = (async (input, init) => {
		const app = await getTestApp();
		const requestInput = input instanceof URL ? input.toString() : input;
		return app.handle(buildRequest(requestInput, init));
	}) as typeof fetch;

	fetcher.preconnect = fetch.preconnect
		? fetch.preconnect.bind(fetch)
		: noopPreconnect;

	return edenTreaty<App>('http://localhost', { fetcher });
}

/**
 * Ensures a response includes a data payload.
 *
 * @param response - Response object with optional data payload
 * @returns Data payload from the response
 * @throws Error when the response data is missing
 */
export function requireResponseData<T>(response: { data?: T | null }): T {
	if (response.data === undefined || response.data === null) {
		throw new Error('Expected response data to be defined.');
	}
	return response.data;
}

/**
 * Ensures a typed route accessor is available.
 *
 * @param route - Route accessor to validate
 * @param label - Label for error reporting
 * @returns Route accessor when defined
 * @throws Error when the route accessor is missing
 */
export function requireRoute<T>(route: T | undefined, label: string): T {
	if (!route) {
		throw new Error(`${label} is not available in the typed client.`);
	}
	return route;
}

/**
 * Loads the seeded organization and baseline entity IDs.
 *
 * @returns Seed data references for contract tests
 * @throws Error when required seed data is missing
 */
export async function getSeedData(): Promise<SeedData> {
	if (cachedSeedData) {
		return cachedSeedData;
	}

	const { db, schema } = await loadDatabase();
	const {
		organization,
		location,
		jobPosition,
		employee,
		device,
		scheduleTemplate,
		vacationRequest,
		payrollRun,
	} = schema;

	const orgRows = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, 'sen-checkin'))
		.limit(1);

	const organizationRow = orgRows[0];
	if (!organizationRow) {
		throw new Error('Seed organization "sen-checkin" was not found.');
	}

	const locationRow = (
		await db
			.select({ id: location.id })
			.from(location)
			.where(eq(location.organizationId, organizationRow.id))
			.limit(1)
	)[0];
	const jobPositionRow = (
		await db
			.select({ id: jobPosition.id })
			.from(jobPosition)
			.where(eq(jobPosition.organizationId, organizationRow.id))
			.limit(1)
	)[0];
	const employeeRow = (
		await db
			.select({ id: employee.id })
			.from(employee)
			.where(eq(employee.organizationId, organizationRow.id))
			.limit(1)
	)[0];
	const deviceRow = (
		await db
			.select({ id: device.id })
			.from(device)
			.where(eq(device.organizationId, organizationRow.id))
			.limit(1)
	)[0];
	const templateRow = (
		await db
			.select({ id: scheduleTemplate.id })
			.from(scheduleTemplate)
			.where(eq(scheduleTemplate.organizationId, organizationRow.id))
			.limit(1)
	)[0];

	if (!locationRow || !jobPositionRow || !employeeRow || !deviceRow || !templateRow) {
		throw new Error('Seed data is incomplete for contract tests.');
	}

	const vacationRow = (
		await db
			.select({ id: vacationRequest.id })
			.from(vacationRequest)
			.where(eq(vacationRequest.organizationId, organizationRow.id))
			.limit(1)
	)[0];
	const payrollRow = (
		await db
			.select({ id: payrollRun.id })
			.from(payrollRun)
			.where(eq(payrollRun.organizationId, organizationRow.id))
			.limit(1)
	)[0];

	cachedSeedData = {
		organizationId: organizationRow.id,
		locationId: locationRow.id,
		jobPositionId: jobPositionRow.id,
		employeeId: employeeRow.id,
		deviceId: deviceRow.id,
		scheduleTemplateId: templateRow.id,
		vacationRequestId: vacationRow?.id ?? null,
		payrollRunId: payrollRow?.id ?? null,
	};

	return cachedSeedData;
}

/**
 * Resolves a user ID from the auth user table.
 *
 * @param email - Email to look up
 * @returns User ID
 */
export async function getUserIdByEmail(email: string): Promise<string> {
	const { db, schema } = await loadDatabase();
	const { user } = schema;
	const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
	const record = rows[0];
	if (!record) {
		throw new Error(`User not found for email ${email}.`);
	}
	return record.id;
}

/**
 * Signs in a user and returns a session cookie header.
 *
 * @param credentials - User email and password
 * @returns Cookie header value
 */
async function signInWithCredentials(credentials: TestUserCredentials): Promise<string> {
	const auth = await loadAuth();
	const response = await auth.api.signInEmail({
		body: credentials,
		asResponse: true,
	});

	const setCookieHeader = response.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('Missing Set-Cookie header from sign-in response.');
	}

	return buildCookieHeader(setCookieHeader);
}

/**
 * Sets the active organization for a session and updates cookies.
 *
 * @param cookieHeader - Current cookie header value
 * @param organizationId - Organization identifier
 * @returns Updated cookie header value
 */
async function setActiveOrganization(
	cookieHeader: string,
	organizationId: string,
): Promise<string> {
	const auth = await loadAuth();
	const response = await auth.api.setActiveOrganization({
		body: { organizationId },
		headers: { cookie: cookieHeader },
		asResponse: true,
	});

	return mergeCookieHeader(cookieHeader, response.headers.get('set-cookie'));
}

/**
 * Loads a session context for the admin user.
 *
 * @returns Session context for admin user
 */
export async function getAdminSession(): Promise<SessionContext> {
	if (cachedAdminSession) {
		return cachedAdminSession;
	}
	const seedData = await getSeedData();
	const cookieHeader = await signInWithCredentials(ADMIN_CREDENTIALS);
	const updatedCookie = await setActiveOrganization(cookieHeader, seedData.organizationId);
	const userId = await getUserIdByEmail(ADMIN_CREDENTIALS.email);

	cachedAdminSession = {
		cookieHeader: updatedCookie,
		organizationId: seedData.organizationId,
		userId,
	};

	return cachedAdminSession;
}

/**
 * Loads a session context for the standard user.
 *
 * @returns Session context for member user
 */
export async function getUserSession(): Promise<SessionContext> {
	if (cachedUserSession) {
		return cachedUserSession;
	}
	const seedData = await getSeedData();
	const cookieHeader = await signInWithCredentials(USER_CREDENTIALS);
	const updatedCookie = await setActiveOrganization(cookieHeader, seedData.organizationId);
	const userId = await getUserIdByEmail(USER_CREDENTIALS.email);

	cachedUserSession = {
		cookieHeader: updatedCookie,
		organizationId: seedData.organizationId,
		userId,
	};

	return cachedUserSession;
}

/**
 * Creates a reusable API key for contract tests.
 *
 * @returns API key string
 */
export async function getTestApiKey(): Promise<string> {
	if (cachedApiKey) {
		return cachedApiKey;
	}
	const auth = await loadAuth();
	const adminSession = await getAdminSession();
	const response = await auth.api.createApiKey({
		body: {
			name: 'contract-tests',
			metadata: {
				organizationId: adminSession.organizationId,
			},
		},
		headers: { cookie: adminSession.cookieHeader },
		asResponse: true,
	});

	const payload = (await response.json()) as { key?: string };
	if (!payload.key) {
		throw new Error('API key was not returned by BetterAuth.');
	}

	cachedApiKey = payload.key;
	return cachedApiKey;
}
