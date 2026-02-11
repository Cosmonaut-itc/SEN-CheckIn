import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import db from '../db/index.js';
import { employeeDocumentVersion } from '../db/schema.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getTestApp,
	getUserSession,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

/**
 * Creates an employee dedicated to document workflow contract tests.
 *
 * @param args - Employee seed references and admin cookie
 * @returns Created employee identifier
 */
async function createDocumentTestEmployee(args: {
	client: Awaited<ReturnType<typeof createTestClient>>;
	adminCookie: string;
	organizationId: string;
	locationId: string;
	jobPositionId: string;
	scheduleTemplateId: string;
}): Promise<string> {
	const response = await args.client.employees.post({
		code: `DOC-${randomUUID().slice(0, 8)}`,
		firstName: 'Documental',
		lastName: 'Contrato',
		email: `documental.${Date.now()}@example.com`,
		phone: '+52 55 9000 0000',
		jobPositionId: args.jobPositionId,
		locationId: args.locationId,
		organizationId: args.organizationId,
		scheduleTemplateId: args.scheduleTemplateId,
		status: 'ACTIVE',
		dailyPay: 420,
		paymentFrequency: 'BIWEEKLY',
		$headers: { cookie: args.adminCookie },
	});

	expect(response.status).toBe(201);
	const payload = requireResponseData(response);
	const employeeRecord = payload.data;
	if (!employeeRecord?.id) {
		throw new Error('Expected employee id for document workflow contract tests.');
	}

	return employeeRecord.id;
}

/**
 * Seeds a current document version directly in the database.
 *
 * @param args - Document seed parameters
 * @returns Inserted document version id
 */
async function seedEmployeeDocumentVersion(args: {
	organizationId: string;
	employeeId: string;
	uploadedByUserId: string;
	requirementKey:
		| 'IDENTIFICATION'
		| 'TAX_CONSTANCY'
		| 'PROOF_OF_ADDRESS'
		| 'SOCIAL_SECURITY_EVIDENCE'
		| 'EMPLOYMENT_PROFILE'
		| 'SIGNED_CONTRACT'
		| 'SIGNED_NDA';
	reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
	reviewComment?: string | null;
	source?: 'UPLOAD' | 'PHYSICAL_SIGNED_UPLOAD' | 'DIGITAL_SIGNATURE';
}): Promise<string> {
	const latest = await db
		.select({ versionNumber: employeeDocumentVersion.versionNumber })
		.from(employeeDocumentVersion)
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, args.organizationId),
				eq(employeeDocumentVersion.employeeId, args.employeeId),
				eq(employeeDocumentVersion.requirementKey, args.requirementKey),
			),
		)
		.orderBy(desc(employeeDocumentVersion.versionNumber))
		.limit(1);

	await db
		.update(employeeDocumentVersion)
		.set({ isCurrent: false })
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, args.organizationId),
				eq(employeeDocumentVersion.employeeId, args.employeeId),
				eq(employeeDocumentVersion.requirementKey, args.requirementKey),
				eq(employeeDocumentVersion.isCurrent, true),
			),
		);

	const id = randomUUID();
	const versionNumber = (latest[0]?.versionNumber ?? 0) + 1;
	const objectKey = `org/${args.organizationId}/employees/${args.employeeId}/documents/${args.requirementKey}/${id}.pdf`;
	await db.insert(employeeDocumentVersion).values({
		id,
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		requirementKey: args.requirementKey,
		versionNumber,
		isCurrent: true,
		reviewStatus: args.reviewStatus,
		reviewComment: args.reviewStatus === 'REJECTED' ? (args.reviewComment ?? 'Rechazado') : null,
		reviewedByUserId: args.reviewStatus === 'PENDING_REVIEW' ? null : args.uploadedByUserId,
		reviewedAt: args.reviewStatus === 'PENDING_REVIEW' ? null : new Date(),
		source: args.source ?? 'UPLOAD',
		bucket: 'contract-tests',
		objectKey,
		fileName: `${id}.pdf`,
		contentType: 'application/pdf',
		sizeBytes: 1024,
		sha256: randomUUID().replace(/-/g, ''),
		uploadedByUserId: args.uploadedByUserId,
		uploadedAt: new Date(),
		metadata: null,
	});

	return id;
}

/**
 * Executes a JSON request against the in-memory test app.
 *
 * @param args - Request parameters
 * @returns HTTP status and parsed JSON payload
 */
async function requestJson(args: {
	method: 'GET' | 'POST' | 'PUT';
	path: string;
	cookieHeader: string;
	body?: Record<string, unknown>;
}): Promise<{ status: number; data: unknown }> {
	const app = await getTestApp();
	const response = await app.handle(
		new Request(`http://localhost${args.path}`, {
			method: args.method,
			headers: {
				'content-type': 'application/json',
				cookie: args.cookieHeader,
			},
			body: args.body ? JSON.stringify(args.body) : undefined,
		}),
	);

	const data = await response.json().catch(() => null);
	return { status: response.status, data };
}

describe('employee document workflow routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let employeeWithNoDocsId: string;
	let employeeWithBaseDocId: string;

	beforeAll(async () => {
		client = createTestClient();
		seed = await getSeedData();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();

		employeeWithNoDocsId = await createDocumentTestEmployee({
			client,
			adminCookie: adminSession.cookieHeader,
			organizationId: seed.organizationId,
			locationId: seed.locationId,
			jobPositionId: seed.jobPositionId,
			scheduleTemplateId: seed.scheduleTemplateId,
		});

		employeeWithBaseDocId = await createDocumentTestEmployee({
			client,
			adminCookie: adminSession.cookieHeader,
			organizationId: seed.organizationId,
			locationId: seed.locationId,
			jobPositionId: seed.jobPositionId,
			scheduleTemplateId: seed.scheduleTemplateId,
		});
	});

	afterAll(async () => {
		const employeeWithoutDocsRoute = requireRoute(
			client.employees[employeeWithNoDocsId],
			'Employee without docs route',
		);
		const employeeWithDocsRoute = requireRoute(
			client.employees[employeeWithBaseDocId],
			'Employee with docs route',
		);

		await employeeWithoutDocsRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
		await employeeWithDocsRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('returns and updates document workflow configuration', async () => {
		const workflowRoute = requireRoute(
			client['document-workflow'],
			'Document workflow route',
		);
		const configRoute = requireRoute(workflowRoute.config, 'Document workflow config route');

		const getResponse = await configRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(getResponse.status).toBe(200);
		const getPayload = requireResponseData(getResponse);
		expect(getPayload.data?.config?.organizationId).toBe(seed.organizationId);
		expect(Array.isArray(getPayload.data?.requirements)).toBe(true);

		const putResponse = await configRoute.put({
			baseApprovedThresholdForLegal: 1,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(putResponse.status).toBe(200);
		const putPayload = requireResponseData(putResponse);
		expect(putPayload.data?.config?.baseApprovedThresholdForLegal).toBe(1);
	});

	it('persists and returns extended ACTA branding fields', async () => {
		const confirmResponse = await requestJson({
			method: 'POST',
			path: '/document-workflow/branding/confirm',
			cookieHeader: adminSession.cookieHeader,
			body: {
				displayName: 'Comercializadora Demo',
				headerText: 'Encabezado legal de prueba',
				actaState: 'Estado de México',
				actaEmployerTreatment: 'Lic.',
				actaEmployerName: 'Patrón Prueba',
				actaEmployerPosition: 'Gerente de RRHH',
				actaEmployeeTreatment: 'C.',
			},
		});
		expect(confirmResponse.status).toBe(200);
		const confirmPayload = confirmResponse.data as
			| {
					data?: {
						actaState?: string | null;
						actaEmployerTreatment?: string | null;
						actaEmployerName?: string | null;
						actaEmployerPosition?: string | null;
						actaEmployeeTreatment?: string | null;
					} | null;
			  }
			| null;
		expect(confirmPayload?.data?.actaState).toBe('Estado de México');
		expect(confirmPayload?.data?.actaEmployerTreatment).toBe('Lic.');
		expect(confirmPayload?.data?.actaEmployerName).toBe('Patrón Prueba');
		expect(confirmPayload?.data?.actaEmployerPosition).toBe('Gerente de RRHH');
		expect(confirmPayload?.data?.actaEmployeeTreatment).toBe('C.');

		const brandingResponse = await requestJson({
			method: 'GET',
			path: '/document-workflow/branding/url',
			cookieHeader: adminSession.cookieHeader,
		});
		expect(brandingResponse.status).toBe(200);
		const brandingPayload = brandingResponse.data as
			| {
					data?: {
						branding?: {
							actaState?: string | null;
							actaEmployerTreatment?: string | null;
							actaEmployerName?: string | null;
							actaEmployerPosition?: string | null;
							actaEmployeeTreatment?: string | null;
						} | null;
					};
			  }
			| null;
		expect(brandingPayload?.data?.branding?.actaState).toBe('Estado de México');
		expect(brandingPayload?.data?.branding?.actaEmployerTreatment).toBe('Lic.');
		expect(brandingPayload?.data?.branding?.actaEmployerName).toBe('Patrón Prueba');
		expect(brandingPayload?.data?.branding?.actaEmployerPosition).toBe('Gerente de RRHH');
		expect(brandingPayload?.data?.branding?.actaEmployeeTreatment).toBe('C.');
	});

	it('returns summary and history payload for employee documents', async () => {
		const employeeRoute = requireRoute(
			client.employees[employeeWithNoDocsId],
			'Employee without docs route',
		);
		const documentsRoute = requireRoute(employeeRoute.documents, 'Employee documents route');
		const summaryRoute = requireRoute(documentsRoute.summary, 'Employee documents summary route');

		const summaryResponse = await summaryRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(summaryResponse.status).toBe(200);
		const summaryPayload = requireResponseData(summaryResponse);
		expect(summaryPayload.data?.employeeId).toBe(employeeWithNoDocsId);
		expect(typeof summaryPayload.data?.documentProgressPercent).toBe('number');
		expect(Array.isArray(summaryPayload.data?.requirements)).toBe(true);

		const historyResponse = await documentsRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 10, offset: 0 },
		});
		expect(historyResponse.status).toBe(200);
		const historyPayload = requireResponseData(historyResponse);
		expect(Array.isArray(historyPayload.data?.current)).toBe(true);
		expect(Array.isArray(historyPayload.data?.history)).toBe(true);
	});

	it('blocks member role from reading organization document workflow configuration', async () => {
		const workflowRoute = requireRoute(
			client['document-workflow'],
			'Document workflow route',
		);
		const configRoute = requireRoute(workflowRoute.config, 'Document workflow config route');

		const response = await configRoute.get({
			$headers: { cookie: memberSession.cookieHeader },
		});
		expect(response.status).toBe(403);
	});

	it('requires review comment when rejecting employee documents', async () => {
		const pendingDocId = await seedEmployeeDocumentVersion({
			organizationId: seed.organizationId,
			employeeId: employeeWithNoDocsId,
			uploadedByUserId: adminSession.userId,
			requirementKey: 'IDENTIFICATION',
			reviewStatus: 'PENDING_REVIEW',
		});

		const response = await requestJson({
			method: 'POST',
			path: `/employees/${employeeWithNoDocsId}/documents/${pendingDocId}/review`,
			cookieHeader: adminSession.cookieHeader,
			body: {
				reviewStatus: 'REJECTED',
			},
		});
		expect(response.status).toBe(400);
	});

	it('rejects DIGITAL_SIGNATURE source on generic confirm upload endpoint', async () => {
		const response = await requestJson({
			method: 'POST',
			path: `/employees/${employeeWithNoDocsId}/documents/TAX_CONSTANCY/confirm`,
			cookieHeader: memberSession.cookieHeader,
			body: {
				docVersionId: randomUUID(),
				objectKey: 'org/placeholder/tax-constancy.pdf',
				fileName: 'constancia-fiscal.pdf',
				contentType: 'application/pdf',
				sizeBytes: 1024,
				sha256: randomUUID().replace(/-/g, ''),
				source: 'DIGITAL_SIGNATURE',
			},
		});
		expect(response.status).toBe(400);
		const payload = response.data as { error?: { message?: string } } | null;
		expect(payload?.error?.message).toContain(
			'DIGITAL_SIGNATURE source is only allowed through legal sign-digital confirmation',
		);
	});

	it('rejects review requests for non-current document versions', async () => {
		const historicalDocId = await seedEmployeeDocumentVersion({
			organizationId: seed.organizationId,
			employeeId: employeeWithNoDocsId,
			uploadedByUserId: adminSession.userId,
			requirementKey: 'PROOF_OF_ADDRESS',
			reviewStatus: 'PENDING_REVIEW',
		});
		const currentDocId = await seedEmployeeDocumentVersion({
			organizationId: seed.organizationId,
			employeeId: employeeWithNoDocsId,
			uploadedByUserId: adminSession.userId,
			requirementKey: 'PROOF_OF_ADDRESS',
			reviewStatus: 'PENDING_REVIEW',
		});

		const reviewResponse = await requestJson({
			method: 'POST',
			path: `/employees/${employeeWithNoDocsId}/documents/${historicalDocId}/review`,
			cookieHeader: adminSession.cookieHeader,
			body: {
				reviewStatus: 'APPROVED',
			},
		});
		expect(reviewResponse.status).toBe(409);

		const rows = await db
			.select({
				id: employeeDocumentVersion.id,
				isCurrent: employeeDocumentVersion.isCurrent,
				reviewStatus: employeeDocumentVersion.reviewStatus,
			})
			.from(employeeDocumentVersion)
			.where(
				and(
					eq(employeeDocumentVersion.organizationId, seed.organizationId),
					eq(employeeDocumentVersion.employeeId, employeeWithNoDocsId),
					eq(employeeDocumentVersion.requirementKey, 'PROOF_OF_ADDRESS'),
				),
			)
			.orderBy(desc(employeeDocumentVersion.versionNumber))
			.limit(2);

		const currentRow = rows.find((row) => row.id === currentDocId);
		const historicalRow = rows.find((row) => row.id === historicalDocId);
		expect(currentRow?.isCurrent).toBe(true);
		expect(currentRow?.reviewStatus).toBe('PENDING_REVIEW');
		expect(historicalRow?.isCurrent).toBe(false);
		expect(historicalRow?.reviewStatus).toBe('PENDING_REVIEW');
	});

	it('blocks legal generation when legal gate is still locked', async () => {
		const draftResponse = await requestJson({
			method: 'POST',
			path: '/document-workflow/templates/CONTRACT/draft',
			cookieHeader: adminSession.cookieHeader,
			body: {
				htmlContent: '<p>Contrato {{employee.fullName}}</p>',
			},
		});
		expect(draftResponse.status).toBe(200);
		const draftData = draftResponse.data as
			| { data?: { id?: string } }
			| null;
		const templateId = draftData?.data?.id;
		if (!templateId) {
			throw new Error('Expected contract template id.');
		}

		const publishResponse = await requestJson({
			method: 'POST',
			path: `/document-workflow/templates/${templateId}/publish`,
			cookieHeader: adminSession.cookieHeader,
		});
		expect(publishResponse.status).toBe(200);

		const employeeRoute = requireRoute(
			client.employees[employeeWithNoDocsId],
			'Employee without docs route',
		);
		const legalDocumentsRoute = requireRoute(
			employeeRoute['legal-documents'],
			'Employee legal documents route',
		);
		const legalContractRoute = requireRoute(
			legalDocumentsRoute.CONTRACT,
			'Employee legal contract route',
		);
		const generationsRoute = requireRoute(
			legalContractRoute.generations,
			'Employee legal generations route',
		);

		const generationResponse = await generationsRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(generationResponse.status).toBe(409);
	});

	it('generates a legal contract after one approved base document exists', async () => {
		await seedEmployeeDocumentVersion({
			organizationId: seed.organizationId,
			employeeId: employeeWithBaseDocId,
			uploadedByUserId: adminSession.userId,
			requirementKey: 'IDENTIFICATION',
			reviewStatus: 'APPROVED',
		});

		const employeeRoute = requireRoute(
			client.employees[employeeWithBaseDocId],
			'Employee with docs route',
		);
		const legalDocumentsRoute = requireRoute(
			employeeRoute['legal-documents'],
			'Employee legal documents route',
		);
		const legalContractRoute = requireRoute(
			legalDocumentsRoute.CONTRACT,
			'Employee legal contract route',
		);
		const generationsRoute = requireRoute(
			legalContractRoute.generations,
			'Employee legal generations route',
		);

		const response = await generationsRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data?.generation?.kind).toBe('CONTRACT');
		expect(payload.data?.generation?.templateVersionNumber).toBeGreaterThan(0);
		expect(typeof payload.data?.generation?.generatedHtmlHash).toBe('string');
	});

	it('blocks member role from reviewing employee documents', async () => {
		const pendingDocId = await seedEmployeeDocumentVersion({
			organizationId: seed.organizationId,
			employeeId: employeeWithBaseDocId,
			uploadedByUserId: adminSession.userId,
			requirementKey: 'TAX_CONSTANCY',
			reviewStatus: 'PENDING_REVIEW',
		});

		const response = await requestJson({
			method: 'POST',
			path: `/employees/${employeeWithBaseDocId}/documents/${pendingDocId}/review`,
			cookieHeader: memberSession.cookieHeader,
			body: {
				reviewStatus: 'APPROVED',
			},
		});
		expect(response.status).toBe(403);
	});
});
