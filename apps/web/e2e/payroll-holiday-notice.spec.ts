import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

type AuthOrganization = {
	id: string;
	slug?: string | null;
};

/**
 * Creates a location via API.
 *
 * @param request - Playwright API request context
 * @param organizationName - Organization display name for labeling
 * @returns Created location identifier
 */
async function createLocation(
	request: APIRequestContext,
	organizationName: string,
): Promise<string> {
	const response = await request.post('/api/locations', {
		data: {
			name: `${organizationName} HQ`,
			code: `LOC-${randomUUID().slice(0, 6)}`,
			timeZone: 'America/Mexico_City',
		},
	});

	if (!response.ok()) {
		const body = await response.text();
		throw new Error(`Failed to create location (${response.status()}): ${body}`);
	}

	const payload = (await response.json()) as { data?: { id?: string } };
	const locationId = payload.data?.id;
	if (!locationId) {
		throw new Error('Expected location id from /api/locations');
	}
	return locationId;
}

/**
 * Resolves an organization ID by slug from the authenticated Better Auth session.
 *
 * @param request - Playwright API request context
 * @param organizationSlug - Organization slug from test registration
 * @returns Resolved organization id
 */
async function resolveOrganizationId(
	request: APIRequestContext,
	organizationSlug: string,
): Promise<string> {
	const response = await request.get('/api/auth/organization/list');
	expect(response.ok()).toBeTruthy();

	const payload = (await response.json()) as unknown;
	const organizations = Array.isArray(payload)
		? (payload as AuthOrganization[])
		: ((payload as { organizations?: AuthOrganization[]; data?: AuthOrganization[] })
				.organizations ??
			(payload as { data?: AuthOrganization[] }).data ??
			[]);
	const organization = organizations.find((item) => item.slug === organizationSlug);
	if (!organization?.id) {
		throw new Error(`Expected organization id for slug "${organizationSlug}".`);
	}

	const setActiveResponse = await request.post('/api/auth/organization/set-active', {
		data: { organizationId: organization.id },
	});
	expect(setActiveResponse.ok()).toBeTruthy();
	return organization.id;
}

/**
 * Creates a job position via API.
 *
 * @param request - Playwright API request context
 * @returns Created job position identifier
 */
async function createJobPosition(request: APIRequestContext): Promise<string> {
	const response = await request.post('/api/job-positions', {
		data: {
			name: `Operador ${randomUUID().slice(0, 6)}`,
		},
	});
	if (!response.ok()) {
		const body = await response.text();
		throw new Error(`Failed to create job position (${response.status()}): ${body}`);
	}

	const payload = (await response.json()) as { data?: { id?: string } };
	const jobPositionId = payload.data?.id;
	if (!jobPositionId) {
		throw new Error('Expected job position id from /api/job-positions');
	}
	return jobPositionId;
}

/**
 * Creates an employee via API.
 *
 * @param request - Playwright API request context
 * @param jobPositionId - Job position identifier
 * @param locationId - Location identifier
 * @returns Created employee identifier
 */
async function createEmployee(
	request: APIRequestContext,
	jobPositionId: string,
	locationId: string,
): Promise<string> {
	const response = await request.post('/api/employees', {
		data: {
			code: `EMP-${randomUUID().slice(0, 6)}`,
			firstName: 'Holiday',
			lastName: 'Worker',
			jobPositionId,
			locationId,
			status: 'ACTIVE',
			hireDate: '2026-01-01',
			dailyPay: 650,
			paymentFrequency: 'WEEKLY',
		},
	});
	if (!response.ok()) {
		const body = await response.text();
		throw new Error(`Failed to create employee (${response.status()}): ${body}`);
	}

	const payload = (await response.json()) as { data?: { id?: string } };
	const employeeId = payload.data?.id;
	if (!employeeId) {
		throw new Error('Expected employee id from /api/employees');
	}
	return employeeId;
}

/**
 * Creates a device via API.
 *
 * @param request - Playwright API request context
 * @param locationId - Location identifier
 * @returns Created device identifier
 */
async function createDevice(request: APIRequestContext, locationId: string): Promise<string> {
	const response = await request.post('/api/devices', {
		data: {
			code: `KIOSK-${randomUUID().slice(0, 6)}`,
			name: 'Kiosco de pruebas',
			deviceType: 'KIOSK',
			status: 'ONLINE',
			locationId,
		},
	});
	if (!response.ok()) {
		const body = await response.text();
		throw new Error(`Failed to create device (${response.status()}): ${body}`);
	}

	const payload = (await response.json()) as { data?: { id?: string } };
	const deviceId = payload.data?.id;
	if (!deviceId) {
		throw new Error('Expected device id from /api/devices');
	}
	return deviceId;
}

/**
 * Creates a working attendance pair for a specific holiday date.
 *
 * @param request - Playwright API request context
 * @param employeeId - Employee identifier
 * @param deviceId - Device identifier
 * @param dateKey - Attendance date key
 * @returns Nothing
 */
async function createAttendancePair(
	request: APIRequestContext,
	employeeId: string,
	deviceId: string,
	dateKey: string,
): Promise<void> {
	const checkInResponse = await request.post('/api/attendance', {
		data: {
			employeeId,
			deviceId,
			timestamp: `${dateKey}T14:00:00.000Z`,
			type: 'CHECK_IN',
		},
	});
	if (!checkInResponse.ok()) {
		const body = await checkInResponse.text();
		throw new Error(`Failed to create CHECK_IN (${checkInResponse.status()}): ${body}`);
	}

	const checkOutResponse = await request.post('/api/attendance', {
		data: {
			employeeId,
			deviceId,
			timestamp: `${dateKey}T22:00:00.000Z`,
			type: 'CHECK_OUT',
		},
	});
	if (!checkOutResponse.ok()) {
		const body = await checkOutResponse.text();
		throw new Error(`Failed to create CHECK_OUT (${checkOutResponse.status()}): ${body}`);
	}
}

/**
 * Creates a custom mandatory holiday through the API.
 *
 * @param request - Playwright API request context
 * @param organizationId - Organization id used by holidays API
 * @param dateKey - Holiday date key
 * @returns Nothing
 */
async function createMandatoryHoliday(
	request: APIRequestContext,
	organizationId: string,
	dateKey: string,
): Promise<void> {
	const response = await request.post('/api/payroll-settings/holidays/custom', {
		data: {
			organizationId,
			dateKey,
			name: `Feriado nómina ${dateKey}`,
			kind: 'MANDATORY',
			recurrence: 'ONE_TIME',
			legalReference: 'LFT Art. 74',
		},
	});

	if (!response.ok()) {
		const body = await response.text();
		throw new Error(
			`Failed to create mandatory holiday (${response.status()}) at ${response.url()}: ${body}`,
		);
	}
}

/**
 * Processes payroll for a selected date range.
 *
 * @param request - Playwright API request context
 * @param organizationId - Organization id used by payroll process API
 * @param startDateKey - Start date key
 * @param endDateKey - End date key
 * @returns Nothing
 */
async function processPayroll(
	request: APIRequestContext,
	organizationId: string,
	startDateKey: string,
	endDateKey: string,
): Promise<void> {
	const response = await request.post('/api/payroll/process', {
		data: {
			organizationId,
			periodStartDateKey: startDateKey,
			periodEndDateKey: endDateKey,
			paymentFrequency: 'WEEKLY',
		},
	});

	if (!response.ok()) {
		const body = await response.text();
		throw new Error(
			`Failed to process payroll (${response.status()}) at ${response.url()}: ${body}`,
		);
	}
}

/**
 * Asserts that the latest payroll run includes at least one holiday notice.
 *
 * @param request - Playwright API request context
 * @returns Nothing
 */
async function assertLatestRunHasHolidayNotice(request: APIRequestContext): Promise<void> {
	const response = await request.get('/api/payroll/runs?limit=1&offset=0');
	if (!response.ok()) {
		const body = await response.text();
		throw new Error(`Failed to fetch payroll runs (${response.status()}): ${body}`);
	}

	const payload = (await response.json()) as {
		data?: Array<{
			holidayNotices?: Array<unknown> | null;
		}>;
	};
	const latestRun = payload.data?.[0];
	const notices = latestRun?.holidayNotices ?? [];
	expect(Array.isArray(notices)).toBe(true);
	expect(notices.length).toBeGreaterThan(0);
}

test('payroll notice is rendered and persisted in run history', async ({ page }) => {
	test.setTimeout(120_000);
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const todayKey = new Date().toISOString().slice(0, 10);
	const periodStartDateKey = todayKey;
	const periodEndDateKey = todayKey;
	const organizationId = await resolveOrganizationId(page.request, registration.organizationSlug);
	const locationId = await createLocation(page.request, registration.organizationName);
	const jobPositionId = await createJobPosition(page.request);
	const employeeId = await createEmployee(page.request, jobPositionId, locationId);
	const deviceId = await createDevice(page.request, locationId);

	await createMandatoryHoliday(page.request, organizationId, todayKey);
	await createAttendancePair(page.request, employeeId, deviceId, todayKey);
	await processPayroll(page.request, organizationId, periodStartDateKey, periodEndDateKey);
	await assertLatestRunHasHolidayNotice(page.request);

	await page.goto('/payroll', { waitUntil: 'domcontentloaded', timeout: 90_000 });
	const noticeButton = page
		.locator('[data-testid^="payroll-run-holiday-notice-trigger-"]')
		.first();
	await expect(noticeButton).toBeVisible();
	await noticeButton.click();
	await expect(page.getByTestId('payroll-holiday-notice-dialog-title')).toBeVisible();
});
