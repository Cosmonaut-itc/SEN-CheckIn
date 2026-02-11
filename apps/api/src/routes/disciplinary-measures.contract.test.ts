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
			const notFoundError = new Error('Object not found') as Error & {
				name: string;
				$metadata: { httpStatusCode: number };
			};
			notFoundError.name = 'NotFound';
			notFoundError.$metadata = { httpStatusCode: 404 };
			throw notFoundError;
		}
			return {
				ContentType: metadata.contentType,
				ContentLength: metadata.sizeBytes,
			};
		},
		putRailwayObject: async ({
			key,
			body,
			contentType,
		}: {
			key: string;
			body: string | Uint8Array;
			contentType?: string;
		}) => {
			const sizeBytes = typeof body === 'string' ? body.length : body.byteLength;
			mockedUploadedObjects.set(key, {
				contentType: contentType ?? 'application/octet-stream',
				sizeBytes,
			});
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
	const [{ default: db }, schema] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
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

	const latestVersionRows = await db
		.select({
			versionNumber: organizationLegalTemplate.versionNumber,
		})
		.from(organizationLegalTemplate)
		.where(
			and(
				eq(organizationLegalTemplate.organizationId, args.organizationId),
				eq(organizationLegalTemplate.kind, args.kind),
			),
		)
		.orderBy(desc(organizationLegalTemplate.versionNumber))
		.limit(1);
	const nextVersionNumber = (latestVersionRows[0]?.versionNumber ?? 0) + 1;

	await db.insert(organizationLegalTemplate).values({
		organizationId: args.organizationId,
		kind: args.kind,
		versionNumber: nextVersionNumber,
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
 * Ensures organization ACTA settings required for disciplinary generation are present.
 *
 * @param organizationId - Organization identifier
 * @returns Nothing
 */
async function ensureCompleteDisciplinaryActaSettings(organizationId: string): Promise<void> {
	ensureTestDatabaseUrl();
	const [{ default: db }, schema] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	const { organizationLegalBranding } = schema;
	const defaultSettings = {
		actaState: 'Estado de México',
		actaEmployerTreatment: 'Lic.',
		actaEmployerName: 'Patrón Demo',
		actaEmployerPosition: 'Gerente de RRHH',
		actaEmployeeTreatment: 'C.',
	};

	const existingRows = await db
		.select({ id: organizationLegalBranding.id })
		.from(organizationLegalBranding)
		.where(eq(organizationLegalBranding.organizationId, organizationId))
		.limit(1);

	if (existingRows[0]) {
		await db
			.update(organizationLegalBranding)
			.set(defaultSettings)
			.where(eq(organizationLegalBranding.organizationId, organizationId));
		return;
	}

	await db.insert(organizationLegalBranding).values({
		organizationId,
		...defaultSettings,
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
		await ensureCompleteDisciplinaryActaSettings(adminSession.organizationId);
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

	it('allows disciplinary requests when payroll settings row is missing', async () => {
		ensureTestDatabaseUrl();
		const [{ default: db }, schema] = await Promise.all([
			import('../db/index.js'),
			import('../db/schema.js'),
		]);
		const { payrollSetting } = schema;

		await db
			.delete(payrollSetting)
			.where(eq(payrollSetting.organizationId, adminSession.organizationId));

		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-11',
			reason: 'Validación sin fila de payroll settings',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		requireMeasurePayload(requireResponseData(createResponse));

		const restoreSettingsResponse = await client['payroll-settings'].put({
			weekStartDay: 1,
			enableDisciplinaryMeasures: true,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(restoreSettingsResponse.status).toBe(200);
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

	it('rejects suspension updates with incomplete date range', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-13',
			reason: 'Suspensión válida para validar edición parcial',
			outcome: 'suspension',
			suspensionStartDateKey: '2026-01-13',
			suspensionEndDateKey: '2026-01-15',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const updateResponse = await measureRoute.put({
			suspensionStartDateKey: null,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(updateResponse, 'incomplete suspension update');
		expect(errorPayload.error.message).toBe(
			'suspensionStartDateKey is required for suspension outcome',
		);
	});

	it('allows suspension date updates without resending suspension outcome', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-16',
			reason: 'Suspensión válida para validar edición de fechas',
			outcome: 'suspension',
			suspensionStartDateKey: '2026-01-16',
			suspensionEndDateKey: '2026-01-18',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const updateResponse = await measureRoute.put({
			suspensionStartDateKey: '2026-01-17',
			suspensionEndDateKey: '2026-01-19',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);
		const updatedPayload = requireResponseData(updateResponse) as {
			data?: {
				outcome?: string;
				suspensionStartDateKey?: string | null;
				suspensionEndDateKey?: string | null;
			};
		};
		expect(updatedPayload.data?.outcome).toBe('suspension');
		expect(updatedPayload.data?.suspensionStartDateKey).toBe('2026-01-17');
		expect(updatedPayload.data?.suspensionEndDateKey).toBe('2026-01-19');
	});

	it('rejects suspension dates when resulting outcome is non-suspension', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-16',
			reason: 'Amonestación para validar guard de suspensión',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const updateResponse = await measureRoute.put({
			suspensionStartDateKey: '2026-01-17',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(
			updateResponse,
			'non-suspension measure should reject suspension dates',
		);
		expect(errorPayload.error.message).toBe(
			'suspension date range can only be set for suspension outcome',
		);
	});

	it('bootstraps a published acta template when none exists', async () => {
		ensureTestDatabaseUrl();
		const [{ default: db }, schema] = await Promise.all([
			import('../db/index.js'),
			import('../db/schema.js'),
		]);
		const { organizationLegalTemplate } = schema;
		await ensureCompleteDisciplinaryActaSettings(adminSession.organizationId);

		await db
			.update(organizationLegalTemplate)
			.set({
				status: 'DRAFT',
			})
			.where(
				and(
					eq(organizationLegalTemplate.organizationId, adminSession.organizationId),
					eq(organizationLegalTemplate.kind, 'ACTA_ADMINISTRATIVA'),
				),
			);

		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-12',
			reason: 'Validar bootstrap automático de plantilla ACTA',
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
				template?: {
					id?: string;
					status?: string;
					kind?: string;
				};
			};
		};
		expect(generatePayload.data?.template?.id).toBeTruthy();
		expect(generatePayload.data?.template?.status).toBe('PUBLISHED');
		expect(generatePayload.data?.template?.kind).toBe('ACTA_ADMINISTRATIVA');
	});

	it('returns conflict when required ACTA settings are incomplete', async () => {
		ensureTestDatabaseUrl();
		const [{ default: db }, schema] = await Promise.all([
			import('../db/index.js'),
			import('../db/schema.js'),
		]);
		const { organizationLegalBranding } = schema;

			const brandingRows = await db
				.select({
					id: organizationLegalBranding.id,
					actaState: organizationLegalBranding.actaState,
					actaEmployerTreatment: organizationLegalBranding.actaEmployerTreatment,
					actaEmployerName: organizationLegalBranding.actaEmployerName,
					actaEmployerPosition: organizationLegalBranding.actaEmployerPosition,
					actaEmployeeTreatment: organizationLegalBranding.actaEmployeeTreatment,
				})
				.from(organizationLegalBranding)
				.where(eq(organizationLegalBranding.organizationId, adminSession.organizationId))
				.limit(1);
		const brandingRow = brandingRows[0];
		if (!brandingRow) {
			throw new Error('Expected legal branding row for disciplinary ACTA settings validation.');
		}

		await db
			.update(organizationLegalBranding)
			.set({
				actaState: null,
			})
			.where(eq(organizationLegalBranding.id, brandingRow.id));

		try {
			const createResponse = await client['disciplinary-measures'].post({
				employeeId: seed.employeeId,
				incidentDateKey: '2026-01-14',
				reason: 'Validación de settings incompletos para ACTA',
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
			expect(generateResponse.status).toBe(409);
			const errorPayload = requireErrorResponse(
				generateResponse,
				'acta generation should fail when acta settings are incomplete',
			);
			expect(errorPayload.error.code).toBe('DISCIPLINARY_ACTA_SETTINGS_INCOMPLETE');
		} finally {
				await db
					.update(organizationLegalBranding)
					.set({
						actaState: brandingRow.actaState,
						actaEmployerTreatment: brandingRow.actaEmployerTreatment,
						actaEmployerName: brandingRow.actaEmployerName,
						actaEmployerPosition: brandingRow.actaEmployerPosition,
						actaEmployeeTreatment: brandingRow.actaEmployeeTreatment,
					})
					.where(eq(organizationLegalBranding.id, brandingRow.id));
			}
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

	it('rejects signed acta confirm when generation belongs to a different measure', async () => {
		const firstCreateResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-17',
			reason: 'Validación de vínculo de acta 1',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstCreateResponse.status).toBe(201);
		const firstMeasure = requireMeasurePayload(requireResponseData(firstCreateResponse));
		const firstMeasureRoute = requireRoute(
			client['disciplinary-measures'][firstMeasure.id],
			'first disciplinary measure route',
		);

		const secondCreateResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-18',
			reason: 'Validación de vínculo de acta 2',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondCreateResponse.status).toBe(201);
		const secondMeasure = requireMeasurePayload(requireResponseData(secondCreateResponse));
		const secondMeasureRoute = requireRoute(
			client['disciplinary-measures'][secondMeasure.id],
			'second disciplinary measure route',
		);

		const firstGenerateResponse = await firstMeasureRoute['generate-acta'].post({
			templateId: undefined,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstGenerateResponse.status).toBe(200);

		const secondGenerateResponse = await secondMeasureRoute['generate-acta'].post({
			templateId: undefined,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondGenerateResponse.status).toBe(200);
		const secondGeneratePayload = requireResponseData(secondGenerateResponse) as {
			data?: {
				generation?: { id?: string };
			};
		};
		const secondGenerationId = secondGeneratePayload.data?.generation?.id;
		if (!secondGenerationId) {
			throw new Error('Expected second measure acta generation id.');
		}

		const firstPresignResponse = await firstMeasureRoute['signed-acta'].presign.post({
			fileName: 'acta-vinculo.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstPresignResponse.status).toBe(200);
		const firstPresignPayload = requireResponseData(firstPresignResponse) as {
			data?: {
				docVersionId?: string;
				objectKey?: string;
			};
		};
		const firstDocVersionId = firstPresignPayload.data?.docVersionId;
		const firstObjectKey = firstPresignPayload.data?.objectKey;
		if (!firstDocVersionId || !firstObjectKey) {
			throw new Error('Expected first measure signed acta presign payload.');
		}

		const confirmResponse = await firstMeasureRoute['signed-acta'].confirm.post({
			docVersionId: firstDocVersionId,
			generationId: secondGenerationId,
			objectKey: firstObjectKey,
			fileName: 'acta-vinculo.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'acta-vinculo-invalido',
			signedAtDateKey: '2026-01-17',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(400);
		const confirmError = requireErrorResponse(confirmResponse, 'mismatched acta generation');
		expect(confirmError.error.message).toBe('Invalid acta generation reference');
	});

	it('rejects signed acta confirm when object key does not match measure scope', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-21',
			reason: 'Validación de object key en confirmación de acta',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route for object key validation',
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
			throw new Error('Expected generation id for signed acta object key validation.');
		}

		const presignResponse = await measureRoute['signed-acta'].presign.post({
			fileName: 'acta-object-key.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(presignResponse.status).toBe(200);
		const presignPayload = requireResponseData(presignResponse) as {
			data?: {
				docVersionId?: string;
			};
		};
		const docVersionId = presignPayload.data?.docVersionId;
		if (!docVersionId) {
			throw new Error('Expected docVersionId for signed acta object key validation.');
		}

		const confirmResponse = await measureRoute['signed-acta'].confirm.post({
			docVersionId,
			generationId,
			objectKey: `org/${adminSession.organizationId}/employees/${seed.employeeId}/disciplinary/another-measure/documents/ACTA_ADMINISTRATIVA/${docVersionId}-tampered.pdf`,
			fileName: 'tampered.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'tampered-object-key',
			signedAtDateKey: '2026-01-21',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(400);
		const confirmError = requireErrorResponse(confirmResponse, 'tampered signed acta object key');
		expect(confirmError.error.message).toBe('Invalid signed acta object key');
	});

	it('returns 404 when signed acta object is missing in bucket', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-24',
			reason: 'Objeto faltante en confirmación de acta',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route for missing object validation',
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
			throw new Error('Expected generation id for missing object validation.');
		}

		const presignResponse = await measureRoute['signed-acta'].presign.post({
			fileName: 'acta-faltante.pdf',
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
			throw new Error('Expected signed acta presign payload for missing object validation.');
		}

		mockedUploadedObjects.delete(objectKey);

		const confirmResponse = await measureRoute['signed-acta'].confirm.post({
			docVersionId,
			generationId,
			objectKey,
			fileName: 'acta-faltante.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'missing-object-signed-acta',
			signedAtDateKey: '2026-01-24',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(404);
		const confirmError = requireErrorResponse(confirmResponse, 'missing signed acta object');
		expect(confirmError.error.message).toBe('Uploaded object not found');
	});

	it('rejects refusal confirm when object key does not match measure scope', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-22',
			reason: 'Validación de object key en confirmación de constancia',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary refusal object key validation route',
		);

		const generateResponse = await measureRoute.refusal.generate.post({
			refusalReason: 'Generación para validación de object key',
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
			throw new Error('Expected generation id for refusal object key validation.');
		}

		const presignResponse = await measureRoute.refusal.presign.post({
			fileName: 'constancia-object-key.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(presignResponse.status).toBe(200);
		const presignPayload = requireResponseData(presignResponse) as {
			data?: {
				docVersionId?: string;
			};
		};
		const docVersionId = presignPayload.data?.docVersionId;
		if (!docVersionId) {
			throw new Error('Expected docVersionId for refusal object key validation.');
		}

		const confirmResponse = await measureRoute.refusal.confirm.post({
			docVersionId,
			generationId,
			objectKey: `org/${adminSession.organizationId}/employees/${seed.employeeId}/disciplinary/another-measure/documents/CONSTANCIA_NEGATIVA_FIRMA/${docVersionId}-tampered.pdf`,
			fileName: 'tampered.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'tampered-refusal-object-key',
			signedAtDateKey: '2026-01-22',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(400);
		const confirmError = requireErrorResponse(confirmResponse, 'tampered refusal object key');
		expect(confirmError.error.message).toBe('Invalid refusal object key');
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
		const closeError = requireErrorResponse(
			closeWithoutRefusal,
			'close without refusal certificate',
		);
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
		const closePayload = requireResponseData(closeResponse) as {
			data?: { notes?: string | null };
		};
		expect(closePayload.data?.notes).toBe('Se cerró con constancia de negativa.');
	});

	it('rejects refusal confirm when generation belongs to a different measure', async () => {
		const firstCreateResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-19',
			reason: 'Validación de vínculo de constancia 1',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstCreateResponse.status).toBe(201);
		const firstMeasure = requireMeasurePayload(requireResponseData(firstCreateResponse));
		const firstMeasureRoute = requireRoute(
			client['disciplinary-measures'][firstMeasure.id],
			'first refusal measure route',
		);

		const secondCreateResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-20',
			reason: 'Validación de vínculo de constancia 2',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondCreateResponse.status).toBe(201);
		const secondMeasure = requireMeasurePayload(requireResponseData(secondCreateResponse));
		const secondMeasureRoute = requireRoute(
			client['disciplinary-measures'][secondMeasure.id],
			'second refusal measure route',
		);

		const firstGenerateResponse = await firstMeasureRoute.refusal.generate.post({
			refusalReason: 'Primera constancia para validar vínculo',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstGenerateResponse.status).toBe(200);

		const secondGenerateResponse = await secondMeasureRoute.refusal.generate.post({
			refusalReason: 'Segunda constancia para validar vínculo',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondGenerateResponse.status).toBe(200);
		const secondGeneratePayload = requireResponseData(secondGenerateResponse) as {
			data?: {
				generation?: { id?: string };
			};
		};
		const secondGenerationId = secondGeneratePayload.data?.generation?.id;
		if (!secondGenerationId) {
			throw new Error('Expected second measure refusal generation id.');
		}

		const firstPresignResponse = await firstMeasureRoute.refusal.presign.post({
			fileName: 'constancia-vinculo.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstPresignResponse.status).toBe(200);
		const firstPresignPayload = requireResponseData(firstPresignResponse) as {
			data?: {
				docVersionId?: string;
				objectKey?: string;
			};
		};
		const firstDocVersionId = firstPresignPayload.data?.docVersionId;
		const firstObjectKey = firstPresignPayload.data?.objectKey;
		if (!firstDocVersionId || !firstObjectKey) {
			throw new Error('Expected first measure refusal presign payload.');
		}

		const confirmResponse = await firstMeasureRoute.refusal.confirm.post({
			docVersionId: firstDocVersionId,
			generationId: secondGenerationId,
			objectKey: firstObjectKey,
			fileName: 'constancia-vinculo.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'constancia-vinculo-invalido',
			signedAtDateKey: '2026-01-19',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(400);
		const confirmError = requireErrorResponse(confirmResponse, 'mismatched refusal generation');
		expect(confirmError.error.message).toBe('Invalid refusal generation reference');
	});

	it('rejects attachment confirm when object key does not match measure scope', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-23',
			reason: 'Validación de object key en confirmación de evidencia',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary attachment object key validation route',
		);

		const presignResponse = await measureRoute.attachments.presign.post({
			fileName: 'evidencia-object-key.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(presignResponse.status).toBe(200);
		const presignPayload = requireResponseData(presignResponse) as {
			data?: {
				attachmentId?: string;
			};
		};
		const attachmentId = presignPayload.data?.attachmentId;
		if (!attachmentId) {
			throw new Error('Expected attachmentId for attachment object key validation.');
		}

		const confirmResponse = await measureRoute.attachments.confirm.post({
			attachmentId,
			objectKey: `org/${adminSession.organizationId}/employees/${seed.employeeId}/disciplinary/another-measure/attachments/${attachmentId}-tampered.pdf`,
			fileName: 'tampered.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'tampered-attachment-object-key',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(400);
		const confirmError = requireErrorResponse(confirmResponse, 'tampered attachment object key');
		expect(confirmError.error.message).toBe('Invalid attachment object key');
	});

	it('updates notes for mutable measures', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-24',
			reason: 'Actualización de notas en borrador',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const updateResponse = await measureRoute.put({
			notes: 'Nota de seguimiento previa al cierre.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse) as {
			data?: { notes?: string | null };
		};
		expect(updatePayload.data?.notes).toBe('Nota de seguimiento previa al cierre.');

		const detailResponse = await measureRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(detailResponse.status).toBe(200);
		const detailPayload = requireResponseData(detailResponse) as {
			data?: { notes?: string | null };
		};
		expect(detailPayload.data?.notes).toBe('Nota de seguimiento previa al cierre.');
	});

	it('preserves existing notes when close payload omits notes', async () => {
		const createResponse = await client['disciplinary-measures'].post({
			employeeId: seed.employeeId,
			incidentDateKey: '2026-01-25',
			reason: 'Cierre sin sobrescribir notas previas',
			outcome: 'warning',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const measure = requireMeasurePayload(requireResponseData(createResponse));
		const measureRoute = requireRoute(
			client['disciplinary-measures'][measure.id],
			'disciplinary measure route',
		);

		const updateResponse = await measureRoute.put({
			notes: 'Nota previa que debe mantenerse al cerrar.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);

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
			fileName: 'acta-preserve-notes.pdf',
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
			fileName: 'acta-preserve-notes.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			sha256: 'preserve-notes-close',
			signedAtDateKey: '2026-01-25',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(confirmResponse.status).toBe(200);

		const closeResponse = await measureRoute.close.post({
			signatureStatus: 'signed_physical',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(closeResponse.status).toBe(200);
		const closePayload = requireResponseData(closeResponse) as {
			data?: { notes?: string | null };
		};
		expect(closePayload.data?.notes).toBe('Nota previa que debe mantenerse al cerrar.');
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
		const closePayload = requireResponseData(closeResponse) as {
			data?: { notes?: string | null };
		};
		expect(closePayload.data?.notes).toBe('Cerrada para validar inmutabilidad.');

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
