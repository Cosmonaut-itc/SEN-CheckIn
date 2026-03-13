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
		expect(payload.data?.countSaturdayAsWorkedForSeventhDay).toBe(false);
		expect(typeof payload.data?.enableDisciplinaryMeasures).toBe('boolean');
		expect(payload.data?.autoDeductLunchBreak).toBe(false);
		expect(Number(payload.data?.lunchBreakMinutes)).toBe(60);
		expect(Number(payload.data?.lunchBreakThresholdHours)).toBe(6);
	});

	it('updates payroll settings for the active organization', async () => {
		const response = await client['payroll-settings'].put({
			weekStartDay: 2,
			overtimeEnforcement: 'WARN',
			enableSeventhDayPay: true,
			countSaturdayAsWorkedForSeventhDay: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 45,
			lunchBreakThresholdHours: 5.5,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data?.weekStartDay).toBe(2);
		expect(payload.data?.countSaturdayAsWorkedForSeventhDay).toBe(true);
		expect(payload.data?.enableDisciplinaryMeasures).toBe(true);
		expect(payload.data?.autoDeductLunchBreak).toBe(true);
		expect(Number(payload.data?.lunchBreakMinutes)).toBe(45);
		expect(Number(payload.data?.lunchBreakThresholdHours)).toBe(5.5);
	});

	it('preserves weekStartDay when omitted in updates', async () => {
		const initialResponse = await client['payroll-settings'].put({
			weekStartDay: 4,
			enableSeventhDayPay: false,
			countSaturdayAsWorkedForSeventhDay: true,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(initialResponse.status).toBe(200);

		const partialUpdateResponse = await client['payroll-settings'].put({
			enableDisciplinaryMeasures: false,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(partialUpdateResponse.status).toBe(200);

		const partialUpdatePayload = requireResponseData(partialUpdateResponse);
		expect(partialUpdatePayload.data?.weekStartDay).toBe(4);
		expect(partialUpdatePayload.data?.countSaturdayAsWorkedForSeventhDay).toBe(true);
		expect(partialUpdatePayload.data?.enableDisciplinaryMeasures).toBe(false);
	});

	it('rejects lunch break minutes outside the supported range', async () => {
		const response = await client['payroll-settings'].put({
			lunchBreakMinutes: 10,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'lunch break minutes validation');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('rejects lunch break threshold hours outside the supported range', async () => {
		const response = await client['payroll-settings'].put({
			lunchBreakThresholdHours: 3.5,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'lunch break threshold validation');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('rejects invalid calendar dates for additional mandatory rest days', async () => {
		const response = await client['payroll-settings'].put({
			weekStartDay: 1,
			additionalMandatoryRestDays: ['2026-02-30'],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'payroll settings validation');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
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
