import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

mock.restore();

interface ResolveOrganizationIdArgs {
	requestedOrganizationId?: string | null;
}

interface AuthState {
	authType: 'session' | 'apiKey';
	session: null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
}

const authState: AuthState = {
	authType: 'apiKey',
	session: null,
	sessionOrganizationIds: [],
	apiKeyOrganizationId: null,
	apiKeyOrganizationIds: ['org-1', 'org-2'],
};

const resolveOrganizationIdCalls: ResolveOrganizationIdArgs[] = [];
const originalOpenWeatherApiKey = process.env.OPENWEATHERMAP_API_KEY;

/**
 * Builds a GET request for route testing.
 *
 * @param path - Route path with query string
 * @returns Request instance
 */
function createGetRequest(path: string): Request {
	return new Request(`http://localhost${path}`);
}

/**
 * Restores auth state and captured calls between tests.
 *
 * @returns Nothing
 */
function resetState(): void {
	authState.authType = 'apiKey';
	authState.session = null;
	authState.sessionOrganizationIds = [];
	authState.apiKeyOrganizationId = null;
	authState.apiKeyOrganizationIds = ['org-1', 'org-2'];
	resolveOrganizationIdCalls.length = 0;
	delete process.env.OPENWEATHERMAP_API_KEY;
}

mock.module('../db/index.js', () => ({
	default: {
		select: () => ({
			from: () => ({
				where: async () => [],
			}),
		}),
	},
}));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }).derive(
		{ as: 'scoped' },
		() => ({
			authType: authState.authType,
			session: authState.session,
			sessionOrganizationIds: authState.sessionOrganizationIds,
			apiKeyOrganizationId: authState.apiKeyOrganizationId,
			apiKeyOrganizationIds: authState.apiKeyOrganizationIds,
		}),
	),
}));
mock.module('../utils/error-response.js', () => ({
	buildErrorResponse: (message: string, status: number) => ({
		error: { message, code: status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST' },
	}),
}));
mock.module('../utils/organization.js', () => ({
	resolveOrganizationId: (args: ResolveOrganizationIdArgs) => {
		resolveOrganizationIdCalls.push(args);
		return args.requestedOrganizationId ?? null;
	},
}));

describe('weather route unit tests', () => {
	beforeEach(() => {
		resetState();
	});

	afterAll(() => {
		if (originalOpenWeatherApiKey === undefined) {
			delete process.env.OPENWEATHERMAP_API_KEY;
		} else {
			process.env.OPENWEATHERMAP_API_KEY = originalOpenWeatherApiKey;
		}
		mock.restore();
	});

	it('allows multi-org api keys to disambiguate organization on weather requests', async () => {
		const { weatherRoutes } = await import('./weather.js');
		const response = await weatherRoutes.handle(
			createGetRequest('/weather?organizationId=org-2'),
		);

		expect(response.status).toBe(200);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBe('org-2');
		const payload = (await response.json()) as { data: unknown[]; cachedAt: string | null };
		expect(payload).toEqual({
			data: [],
			cachedAt: null,
		});
	});

	it('rejects multi-org api key weather requests without organization disambiguation', async () => {
		const { weatherRoutes } = await import('./weather.js');
		const response = await weatherRoutes.handle(createGetRequest('/weather'));

		expect(response.status).toBe(403);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBeNull();
		const payload = (await response.json()) as { error: { message: string } };
		expect(payload.error.message).toBe('Organization is required or not permitted');
	});
});
