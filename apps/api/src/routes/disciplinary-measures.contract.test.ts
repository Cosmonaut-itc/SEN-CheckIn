import { beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, desc, eq } from 'drizzle-orm';

import {
	createTestClient,
	ensureTestDatabaseUrl,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type UploadedObjectMetadata = {
	contentType: string;
	sizeBytes: number;
};

const mockedUploadedObjects = new Map<string, UploadedObjectMetadata>();

mock.module('../services/railway-bucket.js', () => ({
	getRailwayBucketConfig: () => ({
		bucket: 'sen-checkin-test-bucket',
		region: 'us-east-1',
		endpoint: 'https://example-bucket.local',
		forcePathStyle: true,
	}),
	createRailwayPresignedPost: async ({
		key,
		contentType,
	}: {
		key: string;
		contentType: string;
	}) => {
		mockedUploadedObjects.set(key, { contentType, sizeBytes: 1024 });
		return {
			url: 'https://example-upload.local',
			fields: {
				key,
				'Content-Type': contentType,
			},
		};
	},
	headRailwayObject: async ({ key }: { key: string }) => {
		const metadata = mockedUploadedObjects.get(key);
		if (!metadata) {
			return null;
		}
		return {
			ContentType: metadata.contentType,
			ContentLength: metadata.sizeBytes,
		};
	},
	createRailwayPresignedGetUrl: async ({ key }: { key: string }) =>
		`https://example-download.local/${encodeURIComponent(key)}`,
}));

type LegalTemplateKind = 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA';

type DisciplinaryMeasurePayload = {
	id: string;
	folio: number;
};

/**
 * Ensures a published legal template exists for the requested disciplinary kind.
 *
 * @param args - Template seed arguments
 * @param args.organizationId - Organization identifier
 * @param args.userId - User identifier used as creator/publisher
 * @param args.kind - Legal template kind
 * @returns Nothing
 */
async function ensurePublishedDisciplinaryTemplate(args: {
	organizationId: string;
	userId: string;
	kind: LegalTemplateKind;
}): Promise<void> {
	ensureTestDatabaseUrl();
	const [{ default: db }, schema] = await Promise.all([import('../db/index.js'), import('../db/schema.js')]);
	const { organizationLegalTemplate } = schema;

	const existing = await db
		.select({
			id: organizationLegalTemplate.id,
		})
		.from(organizationLegalTemplate)
		.where(
			and(
				eq(organizationLegalTemplate.organizationId, args.organizationId),
				eq(organizationLegalTemplate.kind, args.kind),
				eq(organizationLegalTemplate.status, 'PUBLISHED'),
			),
		)
		.orderBy(desc(organizationLegalTemplate.versionNumber))
		.limit(1);

	if (existing[0]) {
		return;
	}

	await db.insert(organizationLegalTemplate).values({
		organizationId: args.organizationId,
		kind: args.kind,
		versionNumber: 1,
		status: 'PUBLISHED',
		htmlContent:
			args.kind === 'ACTA_ADMINISTRATIVA'
				? '<h1>Acta Administrativa</h1><p>{{disciplinary.folio}}</p>'
				: '<h1>Constancia de Negativa</h1><p>{{disciplinary.folio}}</p>',
		variablesSchemaSnapshot: {},
		brandingSnapshot: null,
		createdByUserId: args.userId,
		publishedByUserId: args.userId,
		publishedAt: new Date(),
	});
}

/**
 * Extracts the disciplinary measure payload from a create response.
 *
 * @param responseData - API response data wrapper
 * @returns Parsed measure payload
 * @throws Error when payload shape is invalid
 */
function requireMeasurePayload(responseData: unknown): DisciplinaryMeasurePayload {
	if (!responseData || typeof responseData !== 'object') {
		throw new Error('Expected disciplinary measure response payload.');
	}
	const record = responseData as {
		data?: {
			id?: unknown;
			folio?: unknown;
		} | null;
	};

	if (!record.data || typeof record.data !== 'object') {
		throw new Error('Expected disciplinary measure data object.');
	}
	if (typeof record.data.id !== 'string' || !record.data.id) {
		throw new Error('Expected disciplinary measure id.');
	}
	if (typeof record.data.folio !== 'number') {
		throw new Error('Expected disciplinary measure folio number.');
	}

	return {
		id: record.data.id,
		folio: record.data.folio,
	};
}

describe('disciplinary measures routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();

		await client['payroll-settings'].put({
			weekStartDay: 1,
			enableDisciplinaryMeasures: true,
			$headers: { cookie: adminSession.cookieHeader },
		});

		await ensurePublishedDisciplinaryTemplate({
			organizationId: adminSession.organizationId,
			userId: adminSession.userId,
			kind: 'ACTA_ADMINISTRATIVA',
		});
		await ensurePublishedDisciplinaryTemplate({
			organizationId: adminSession.organizationId,
			userId: adminSession.userId,
			kind: 'CONSTANCIA_NEGATIVA_FIRMA',
		});
	});

	it('creates draft measures and increments folio per organization', async () => {
		const firstResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-10',
			reason: 'Incumplimiento de política interna',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstResponse.status).toBe(201);
		const firstPayload = requireMeasurePayload(requireResponseData(firstResponse));

		const secondResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-11',
			reason: 'Incumplimiento reiterado',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondResponse.status).toBe(201);
		const secondPayload = requireMeasurePayload(requireResponseData(secondResponse));

		expect(secondPayload.folio).toBeGreaterThan(firstPayload.folio);
	});

	it('rejects suspension ranges longer than 8 days', async () => {
		const response = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-12',
			reason: 'Prueba de suspensión inválida',
			outcome: 'suspension',
			suspensionStartDateKey: '2026-01-01',
			suspensionEndDateKey: '2026-01-10',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'invalid suspension range');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
		expect(errorPayload.error.message).toBe('Validation failed');
	});

	it('generates acta with a published template and confirms physical signed upload', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-13',
			reason: 'Falta administrativa con firma física',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const generateResponse = await measureRoute['generate-acta'].post({
			templateId: undefined,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(generateResponse.status).toBe(200);
		const generatePayload = requireResponseData(generateResponse) as {
			data?: {
				generation?: { id?: string };
			};
		};
		const generationId = generatePayload.data?.generation?.id;
		if (!generationId) {
			throw new Error('Expected generation id from generate-acta response.');
		}

		const presignResponse = await measureRoute['signed-acta'].presign.post({
			fileName: 'acta-firmada.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(presignResponse.status).toBe(200);
		const presignPayload = requireResponseData(presignResponse) as {
			data?: {
				docVersionId?: string;
				objectKey?: string;
			};
		};
		const docVersionId = presignPayload.data?.docVersionId;
		const objectKey = presignPayload.data?.objectKey;
		if (!docVersionId || !objectKey) {
			throw new Error('Expected docVersionId and objectKey in signed-acta presign response.');
		}

		const confirmResponse = await measureRoute['signed-acta'].confirm.post({
			docVersionId,
			generationId,
			objectKey,
			fileName: 'acta-firmada.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'abc123signedacta',
			signedAtDateKey: '2026-01-13',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(200);
		const confirmPayload = requireResponseData(confirmResponse) as {
			data?: { kind?: string };
		};
		expect(confirmPayload.data?.kind).toBe('ACTA_ADMINISTRATIVA');
	});

	it('requires refusal certificate before close when employee refused to sign', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-14',
			reason: 'Negativa de firma',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const closeWithoutRefusal = await measureRoute.close.post({
			signatureStatus: 'refused_to_sign',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(closeWithoutRefusal.status).toBe(400);
		const closeError = requireErrorResponse(closeWithoutRefusal, 'close without refusal certificate');
		expect(closeError.error.message).toContain('Refusal certificate is required');

		const generateRefusalResponse = await measureRoute.refusal.generate.post({
			refusalReason: 'El empleado se negó a firmar el documento',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(generateRefusalResponse.status).toBe(200);
		const refusalGenerationPayload = requireResponseData(generateRefusalResponse) as {
			data?: {
				generation?: { id?: string };
			};
		};
		const refusalGenerationId = refusalGenerationPayload.data?.generation?.id;
		if (!refusalGenerationId) {
			throw new Error('Expected refusal generation id.');
		}

		const refusalPresignResponse = await measureRoute.refusal.presign.post({
			fileName: 'constancia-negativa.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(refusalPresignResponse.status).toBe(200);
		const refusalPresignPayload = requireResponseData(refusalPresignResponse) as {
			data?: {
				docVersionId?: string;
				objectKey?: string;
			};
		};
		const refusalDocVersionId = refusalPresignPayload.data?.docVersionId;
		const refusalObjectKey = refusalPresignPayload.data?.objectKey;
		if (!refusalDocVersionId || !refusalObjectKey) {
			throw new Error('Expected refusal docVersionId and objectKey.');
		}

		const refusalConfirmResponse = await measureRoute.refusal.confirm.post({
			docVersionId: refusalDocVersionId,
			generationId: refusalGenerationId,
			objectKey: refusalObjectKey,
			fileName: 'constancia-negativa.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'def456refusal',
			signedAtDateKey: '2026-01-14',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(refusalConfirmResponse.status).toBe(200);

		const closeResponse = await measureRoute.close.post({
			signatureStatus: 'refused_to_sign',
			notes: 'Se cerró con constancia de negativa.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(closeResponse.status).toBe(200);
	});

	it('enforces immutability for closed measures', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-15',
			reason: 'Cierre e inmutabilidad',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const generateResponse = await measureRoute['generate-acta'].post({
			templateId: undefined,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(generateResponse.status).toBe(200);
		const generatePayload = requireResponseData(generateResponse) as {
			data?: {
				generation?: { id?: string };
			};
		};
		const generationId = generatePayload.data?.generation?.id;
		if (!generationId) {
			throw new Error('Expected acta generation id.');
		}

		const presignResponse = await measureRoute['signed-acta'].presign.post({
			fileName: 'acta-closed.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(presignResponse.status).toBe(200);
		const presignPayload = requireResponseData(presignResponse) as {
			data?: {
				docVersionId?: string;
				objectKey?: string;
			};
		};
		const docVersionId = presignPayload.data?.docVersionId;
		const objectKey = presignPayload.data?.objectKey;
		if (!docVersionId || !objectKey) {
			throw new Error('Expected signed acta presign fields.');
		}

		const confirmResponse = await measureRoute['signed-acta'].confirm.post({
			docVersionId,
			generationId,
			objectKey,
			fileName: 'acta-closed.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'closed123',
			signedAtDateKey: '2026-01-15',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(200);

		const closeResponse = await measureRoute.close.post({
			signatureStatus: 'signed_physical',
			notes: 'Cerrada para validar inmutabilidad.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(closeResponse.status).toBe(200);

		const updateAfterClose = await measureRoute.put({
			reason: 'Intento de edición posterior al cierre',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateAfterClose.status).toBe(409);
	});

	it('creates and cancels termination drafts when outcome changes', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-16',
			reason: 'Escalación a proceso de terminación',
			outcome: 'termination_process',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const detailResponse = await measureRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(detailResponse.status).toBe(200);
		const detailPayload = requireResponseData(detailResponse) as {
			data?: {
				terminationDraft?: { status?: string } | null;
			};
		};
		expect(detailPayload.data?.terminationDraft?.status).toBe('ACTIVE');

		const updateResponse = await measureRoute.put({
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);

		const updatedDetailResponse = await measureRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updatedDetailResponse.status).toBe(200);
		const updatedDetailPayload = requireResponseData(updatedDetailResponse) as {
			data?: {
				terminationDraft?: { status?: string } | null;
			};
		};
		expect(updatedDetailPayload.data?.terminationDraft?.status).toBe('CANCELLED');
	});
});
