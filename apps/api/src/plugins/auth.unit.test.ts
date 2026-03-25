import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

type VerifyApiKeyResult = {
	valid: boolean;
	key: {
		id: string;
		name: string | null;
		userId: string;
		metadata?: unknown;
	} | null;
};

const verifyApiKeyMockState: {
	callCount: number;
	result: VerifyApiKeyResult;
} = {
	callCount: 0,
	result: {
		valid: false,
		key: null,
	},
};

mock.module('../../utils/auth.js', () => ({
	auth: {
		api: {
			verifyApiKey: async (): Promise<VerifyApiKeyResult> => {
				verifyApiKeyMockState.callCount += 1;
				return verifyApiKeyMockState.result;
			},
		},
	},
}));

mock.module('../db/index.js', () => ({
	default: {
		select: () => ({
			from: () => ({
				where: () => [],
			}),
		}),
	},
}));

mock.module('../db/schema.js', () => ({
	member: {
		userId: 'user_id',
		organizationId: 'organization_id',
	},
}));

mock.module('drizzle-orm', () => ({
	eq: (column: unknown, value: unknown) => ({ column, value }),
}));

describe('api key auth plugin', () => {
	beforeEach(() => {
		verifyApiKeyMockState.callCount = 0;
		verifyApiKeyMockState.result = {
			valid: false,
			key: null,
		};
	});

	it('returns a missing-credentials message when no API key is provided', async () => {
		const { errorHandlerPlugin } = await import('./error-handler.js');
		const { apiKeyAuthPlugin } = await import('./auth.js');
		const app = new Elysia()
			.use(errorHandlerPlugin)
			.use(apiKeyAuthPlugin)
			.get('/protected', ({ apiKeyId }) => ({ ok: true, apiKeyId }));

		const response = await app.handle(new Request('http://localhost/protected'));
		const payload = (await response.json()) as {
			error?: {
				message?: string;
			};
		};

		expect(response.status).toBe(401);
		expect(payload.error?.message).toBe('No API key provided');
		expect(verifyApiKeyMockState.callCount).toBe(0);
	});

	it('returns an invalid-credentials message when the API key is rejected', async () => {
		const { errorHandlerPlugin } = await import('./error-handler.js');
		const { apiKeyAuthPlugin } = await import('./auth.js');
		const app = new Elysia()
			.use(errorHandlerPlugin)
			.use(apiKeyAuthPlugin)
			.get('/protected', ({ apiKeyId }) => ({ ok: true, apiKeyId }));

		const response = await app.handle(
			new Request('http://localhost/protected', {
				headers: {
					'x-api-key': 'invalid-key',
				},
			}),
		);
		const payload = (await response.json()) as {
			error?: {
				message?: string;
			};
		};

		expect(response.status).toBe(401);
		expect(payload.error?.message).toBe('Invalid API key');
		expect(verifyApiKeyMockState.callCount).toBe(1);
	});
});
