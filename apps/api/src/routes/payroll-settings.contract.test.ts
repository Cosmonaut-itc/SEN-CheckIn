import { beforeAll, describe, expect, it } from 'bun:test';
import {
	createTestClient,
	getAdminSession,
	getTestApiKey,
	requireErrorResponse,
	requireResponseData,
} from '../test-utils/contract-helpers.js';

describe('payroll settings routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let apiKey: string;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		apiKey = await getTestApiKey();
	});

	it('returns payroll settings for the active organization', async () => {
		const response = await client['payroll-settings'].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data?.organizationId).toBeDefined();
	});

	it('updates payroll settings for the active organization', async () => {
		const response = await client['payroll-settings'].put({
			weekStartDay: 2,
			overtimeEnforcement: 'WARN',
			enableSeventhDayPay: true,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data?.weekStartDay).toBe(2);
	});

	it('rejects payroll settings updates for unauthorized organizations', async () => {
		const response = await client['payroll-settings'].put({
			weekStartDay: 1,
			organizationId: '00000000-0000-0000-0000-000000000000',
			$headers: { 'x-api-key': apiKey },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'payroll settings org check');
		expect(errorPayload.error.message).toBe('Organization is required or not permitted');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});
});
