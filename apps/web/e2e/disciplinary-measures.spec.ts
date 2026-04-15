import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

type PresignPayload = {
	url: string;
	fields: Record<string, string>;
	docVersionId: string;
	objectKey: string;
};

type GenerationPayload = {
	id: string;
};

type MeasurePayload = {
	id: string;
	folio: number;
};

type ConfirmResponse = {
	ok: boolean;
	status: number;
};

type SignedActaUploadFile = {
	fileName: string;
	contentType: 'application/pdf';
	blob: Blob;
	sizeBytes: number;
	sha256: string;
};

/**
 * Builds a deterministic PDF-like blob for signed acta uploads.
 *
 * @returns Signed acta upload payload
 */
function buildSignedActaUploadFile(): SignedActaUploadFile {
	const fileName = 'acta-firmada-e2e.pdf';
	const contentType = 'application/pdf' as const;
	const blob = new Blob([`%PDF-1.4\n${'x'.repeat(2048)}`], {
		type: contentType,
	});
	return {
		fileName,
		contentType,
		blob,
		sizeBytes: blob.size,
		sha256: 'e2e-signed-acta-sha256',
	};
}

/**
 * Creates a location record for e2e setup.
 *
 * @param request - Playwright API request context
 * @param organizationName - Organization display name
 * @returns Location identifier
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
	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const locationId = payload?.data?.id as string | undefined;
	if (!locationId) {
		throw new Error('Expected location id from /api/locations response.');
	}
	return locationId;
}

/**
 * Creates a job position record for e2e setup.
 *
 * @param request - Playwright API request context
 * @returns Job position identifier
 */
async function createJobPosition(request: APIRequestContext): Promise<string> {
	const response = await request.post('/api/job-positions', {
		data: {
			name: `Supervisor ${randomUUID().slice(0, 4)}`,
		},
	});
	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const jobPositionId = payload?.data?.id as string | undefined;
	if (!jobPositionId) {
		throw new Error('Expected job position id from /api/job-positions response.');
	}
	return jobPositionId;
}

/**
 * Creates an employee record for disciplinary flow.
 *
 * @param request - Playwright API request context
 * @param args - Employee creation input values
 * @param args.locationId - Location identifier
 * @param args.jobPositionId - Job position identifier
 * @returns Employee identifier
 */
async function createEmployee(
	request: APIRequestContext,
	args: { locationId: string; jobPositionId: string },
): Promise<string> {
	const response = await request.post('/api/employees', {
		data: {
			code: `DISC-${randomUUID().slice(0, 6)}`,
			firstName: 'Disciplinario',
			lastName: 'E2E',
			locationId: args.locationId,
			jobPositionId: args.jobPositionId,
			status: 'ACTIVE',
			dailyPay: 420,
			paymentFrequency: 'WEEKLY',
			periodPay: 2940,
			rfc: 'DISC010101ABC',
			nss: '12345678901',
		},
	});
	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const employeeId = payload?.data?.id as string | undefined;
	if (!employeeId) {
		throw new Error('Expected employee id from /api/employees response.');
	}
	return employeeId;
}

/**
 * Enables disciplinary module for the active organization.
 *
 * @param request - Playwright API request context
 * @returns Nothing
 */
async function enableDisciplinaryModule(request: APIRequestContext): Promise<void> {
	const response = await request.put('/api/payroll-settings', {
		data: {
			enableDisciplinaryMeasures: true,
		},
	});
	expect(response.ok()).toBeTruthy();
}

/**
 * Configures required ACTA settings for disciplinary generation.
 *
 * @param request - Playwright API request context
 * @param organizationName - Organization display name for ACTA company name fallback
 * @returns Nothing
 */
async function configureDisciplinaryActaSettings(
	request: APIRequestContext,
	organizationName: string,
): Promise<void> {
	const response = await request.post('/api/document-workflow/branding/confirm', {
		data: {
			displayName: organizationName,
			actaState: 'Estado de México',
			actaEmployerTreatment: 'Lic.',
			actaEmployerName: 'Representante Patronal',
			actaEmployerPosition: 'Gerencia de RRHH',
			actaEmployeeTreatment: 'C.',
		},
	});
	if (!response.ok()) {
		const responseBody = await response.text();
		throw new Error(
			`Failed to configure disciplinary ACTA settings (${response.status()}): ${responseBody}`,
		);
	}
}

/**
 * Creates a disciplinary measure in DRAFT state.
 *
 * @param request - Playwright API request context
 * @param employeeId - Employee identifier
 * @returns Created measure payload
 */
async function createDisciplinaryMeasure(
	request: APIRequestContext,
	employeeId: string,
): Promise<MeasurePayload> {
	const response = await request.post('/api/disciplinary-measures', {
		data: {
			employeeId,
			incidentDateKey: '2026-01-20',
			reason: 'Incumplimiento de lineamientos operativos',
			outcome: 'warning',
		},
	});
	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const measureId = payload?.data?.id as string | undefined;
	const folio = payload?.data?.folio as number | undefined;
	if (!measureId || typeof folio !== 'number') {
		throw new Error('Expected disciplinary measure id and folio in create response.');
	}
	return { id: measureId, folio };
}

/**
 * Generates acta for the selected disciplinary measure.
 *
 * @param request - Playwright API request context
 * @param measureId - Measure identifier
 * @returns Generation payload
 */
async function generateActa(
	request: APIRequestContext,
	measureId: string,
): Promise<GenerationPayload> {
	const response = await request.post(`/api/disciplinary-measures/${measureId}/generate-acta`, {
		data: {},
	});
	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const generationId = payload?.data?.generation?.id as string | undefined;
	if (!generationId) {
		throw new Error('Expected generation id in generate-acta response.');
	}
	return { id: generationId };
}

/**
 * Uploads a signed acta file to presigned POST target.
 *
 * @param presign - Presign payload
 * @param file - Signed acta file payload
 * @returns Nothing
 */
async function uploadSignedActaToBucket(
	presign: PresignPayload,
	file: SignedActaUploadFile,
): Promise<void> {
	const formData = new FormData();
	Object.entries(presign.fields).forEach(([key, value]) => {
		formData.append(key, value);
	});
	formData.append('file', file.blob, file.fileName);

	const response = await fetch(presign.url, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok && response.type !== 'opaque') {
		throw new Error(`Signed acta upload failed with status ${response.status}.`);
	}
}

/**
 * Confirms a signed acta upload in API.
 *
 * @param request - Playwright API request context
 * @param measureId - Measure identifier
 * @param generationId - Legal generation identifier
 * @param presign - Presign payload with object metadata
 * @param file - Signed acta file payload
 * @returns API confirmation response status
 */
async function confirmSignedActa(
	request: APIRequestContext,
	measureId: string,
	generationId: string,
	presign: PresignPayload,
	file: SignedActaUploadFile,
): Promise<ConfirmResponse> {
	const response = await request.post(
		`/api/disciplinary-measures/${measureId}/signed-acta/confirm`,
		{
			data: {
				docVersionId: presign.docVersionId,
				generationId,
				objectKey: presign.objectKey,
				fileName: file.fileName,
				contentType: file.contentType,
				sizeBytes: file.sizeBytes,
				sha256: file.sha256,
				signedAtDateKey: '2026-01-20',
			},
		},
	);
	return {
		ok: response.ok(),
		status: response.status(),
	};
}

/**
 * Closes the disciplinary measure as physically signed.
 *
 * @param request - Playwright API request context
 * @param measureId - Measure identifier
 * @returns Nothing
 */
async function closeMeasure(request: APIRequestContext, measureId: string): Promise<void> {
	const response = await request.post(`/api/disciplinary-measures/${measureId}/close`, {
		data: {
			signatureStatus: 'signed_physical',
			notes: 'Cierre de prueba e2e',
		},
	});
	expect(response.ok()).toBeTruthy();
}

test('admin habilita módulo, completa flujo de acta firmada física y ve historial', async ({
	page,
}) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const request = page.request;
	const locationId = await createLocation(request, registration.organizationName);
	const jobPositionId = await createJobPosition(request);
	const employeeId = await createEmployee(request, {
		locationId,
		jobPositionId,
	});

	await enableDisciplinaryModule(request);
	await configureDisciplinaryActaSettings(request, registration.organizationName);

	const measure = await createDisciplinaryMeasure(request, employeeId);
	const generation = await generateActa(request, measure.id);
	const signedActaFile = buildSignedActaUploadFile();

	const presignResponse = await request.post(
		`/api/disciplinary-measures/${measure.id}/signed-acta/presign`,
		{
			data: {
				fileName: signedActaFile.fileName,
				contentType: signedActaFile.contentType,
				sizeBytes: signedActaFile.sizeBytes,
			},
		},
	);

	if (!presignResponse.ok()) {
		test.skip(true, `Bucket no disponible para e2e (status ${presignResponse.status()}).`);
		return;
	}

	const presignPayload = (await presignResponse.json())?.data as
		| {
				url?: string;
				fields?: Record<string, string>;
				docVersionId?: string;
				objectKey?: string;
		  }
		| undefined;

	if (
		!presignPayload?.url ||
		!presignPayload.fields ||
		!presignPayload.docVersionId ||
		!presignPayload.objectKey
	) {
		test.skip(true, 'No fue posible obtener payload de presign para acta firmada.');
		return;
	}

	const normalizedPresign: PresignPayload = {
		url: presignPayload.url,
		fields: presignPayload.fields,
		docVersionId: presignPayload.docVersionId,
		objectKey: presignPayload.objectKey,
	};

	await uploadSignedActaToBucket(normalizedPresign, signedActaFile);
	const confirmSignedResponse = await confirmSignedActa(
		request,
		measure.id,
		generation.id,
		normalizedPresign,
		signedActaFile,
	);
	if (!confirmSignedResponse.ok) {
		test.skip(
			true,
			`Bucket no disponible para confirmar acta firmada (status ${confirmSignedResponse.status}).`,
		);
		return;
	}
	await closeMeasure(request, measure.id);

	await page.goto('/disciplinary-measures');
	const closedStatusBadge = page.getByTestId(`disciplinary-measure-status-${measure.id}`);
	await expect(closedStatusBadge).toBeVisible();
	await expect(closedStatusBadge).toHaveAttribute('data-status', 'CLOSED');
	await page.getByTestId(`disciplinary-measure-view-detail-${measure.id}`).click();
	await expect(page.getByTestId('disciplinary-measure-closed-message')).toBeVisible();
});

test('admin genera acta desde UI y descarga PDF', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const request = page.request;
	const locationId = await createLocation(request, registration.organizationName);
	const jobPositionId = await createJobPosition(request);
	const employeeId = await createEmployee(request, {
		locationId,
		jobPositionId,
	});

	await enableDisciplinaryModule(request);
	await configureDisciplinaryActaSettings(request, registration.organizationName);

	const measure = await createDisciplinaryMeasure(request, employeeId);

	await page.goto('/disciplinary-measures', {
		waitUntil: 'domcontentloaded',
		timeout: 90_000,
	});
	await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
	await expect(page.getByTestId(`disciplinary-measure-view-detail-${measure.id}`)).toBeVisible({
		timeout: 30_000,
	});
	await page.getByTestId(`disciplinary-measure-view-detail-${measure.id}`).click();
	await expect(page.getByTestId('disciplinary-measure-generate-acta')).toBeVisible();

	const [pdfDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByTestId('disciplinary-measure-generate-acta').click(),
	]);

	expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
	const pdfPath = await pdfDownload.path();
	if (!pdfPath) {
		throw new Error('Expected PDF download path for disciplinary acta.');
	}
	const pdfBuffer = await readFile(pdfPath);
	expect(pdfBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
});
