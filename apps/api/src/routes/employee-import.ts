import crypto from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import db from '../db/index.js';
import { employee, jobPosition, location } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { createEmployeeSchema } from '../schemas/crud.js';
import {
	buildEmployeeAuditSnapshot,
	createEmployeeAuditEvent,
	resolveEmployeeAuditActor,
	setEmployeeAuditSkip,
} from '../services/employee-audit.js';
import { processDocument } from '../services/document-ai.js';
import { RateLimiter } from '../utils/rate-limit.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { validateMinimumWage } from './employees.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_BULK_EMPLOYEES = 500;
const BELOW_MINIMUM_WAGE_ROW_ERROR = 'El sueldo diario está por debajo del salario mínimo vigente.';
const ACCEPTED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/heic',
	'image/heif',
	'application/pdf',
]);

const importRateLimiter = new RateLimiter({
	maxRequests: 10,
	windowMs: 60 * 60 * 1000,
});

/**
 * Resets the employee import limiter for deterministic tests.
 *
 * @returns Nothing
 */
export function resetEmployeeImportRateLimiterForTests(): void {
	importRateLimiter.reset();
}

/**
 * Employee import routes for AI-assisted bulk import flows.
 */
export const employeeImportRoutes = new Elysia({ prefix: '/employees' })
	.use(combinedAuthPlugin)
	.post(
		'/import',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyId,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			apiKeyUserId,
			user,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const { file, defaultLocationId, defaultJobPositionId, defaultPaymentFrequency } = body;

			if (!file) {
				set.status = 400;
				return buildErrorResponse('No se proporcionó un archivo.', 400);
			}

			if (file.size > MAX_FILE_SIZE_BYTES) {
				set.status = 400;
				return buildErrorResponse('El archivo excede el tamaño máximo de 10MB.', 400);
			}

			if (!ACCEPTED_MIME_TYPES.has(file.type)) {
				set.status = 400;
				return buildErrorResponse('Formato no soportado. Usa JPG, PNG, HEIC o PDF.', 400);
			}

			const locationRow = (
				await db
					.select()
					.from(location)
					.where(eq(location.id, defaultLocationId))
					.limit(1)
			)[0];
			if (!locationRow || locationRow.organizationId !== organizationId) {
				set.status = 400;
				return buildErrorResponse('La ubicación por defecto no existe en tu organización.', 400);
			}

			const jobPositionRow = (
				await db
					.select()
					.from(jobPosition)
					.where(eq(jobPosition.id, defaultJobPositionId))
					.limit(1)
			)[0];
			if (!jobPositionRow || jobPositionRow.organizationId !== organizationId) {
				set.status = 400;
				return buildErrorResponse('El puesto por defecto no existe en tu organización.', 400);
			}

			try {
				const fileBuffer = Buffer.from(await file.arrayBuffer());
				const rateLimitKey = authType === 'apiKey' ? (apiKeyUserId ?? apiKeyId) : user.id;
				const rateLimitResult = importRateLimiter.check(rateLimitKey);
				if (!rateLimitResult.allowed) {
					set.status = 429;
					return buildErrorResponse(
						'Has alcanzado el límite de importaciones. Intenta más tarde.',
						429,
					);
				}

				const startedAt = Date.now();
				const result = await processDocument(fileBuffer, file.type);

				if (result.employees.length === 0) {
					set.status = 400;
					return buildErrorResponse('No se detectaron empleados en el documento.', 400);
				}

				return {
					employees: result.employees.map((employeeRow) => ({
						...employeeRow,
						locationId: defaultLocationId,
						jobPositionId: defaultJobPositionId,
						paymentFrequency: defaultPaymentFrequency,
					})),
					processingMeta: {
						pagesProcessed: result.pagesProcessed,
						totalEmployeesFound: result.employees.length,
						processingTimeMs: Date.now() - startedAt,
					},
				};
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.startsWith('El PDF excede el máximo permitido')
				) {
					set.status = 400;
					return buildErrorResponse(error.message, 400);
				}

				console.error('Failed to process employee import document', error);
				set.status = 500;
				return buildErrorResponse('Error procesando documento. Intenta de nuevo.', 500);
			}
		},
		{
			body: t.Object({
				file: t.Optional(t.File()),
				defaultLocationId: t.String(),
				defaultJobPositionId: t.String(),
				defaultPaymentFrequency: t.Union([
					t.Literal('WEEKLY'),
					t.Literal('BIWEEKLY'),
					t.Literal('MONTHLY'),
				]),
			}),
		},
	)
	.post(
		'/bulk',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const locationIds = [...new Set(body.employees.map((employeeInput) => employeeInput.locationId))];
			const jobPositionIds = [
				...new Set(body.employees.map((employeeInput) => employeeInput.jobPositionId)),
			];

			const [organizationLocations, organizationJobPositions] = await Promise.all([
				locationIds.length > 0
					? db
							.select({ id: location.id })
							.from(location)
							.where(
								and(
									eq(location.organizationId, organizationId),
									inArray(location.id, locationIds),
								),
							)
							.limit(locationIds.length)
					: Promise.resolve([]),
				jobPositionIds.length > 0
					? db
							.select({ id: jobPosition.id })
							.from(jobPosition)
							.where(
								and(
									eq(jobPosition.organizationId, organizationId),
									inArray(jobPosition.id, jobPositionIds),
								),
							)
							.limit(jobPositionIds.length)
					: Promise.resolve([]),
			]);

			if (organizationLocations.length !== locationIds.length) {
				set.status = 400;
				return buildErrorResponse(
					'Las ubicaciones seleccionadas no existen en tu organización.',
					400,
				);
			}

			if (organizationJobPositions.length !== jobPositionIds.length) {
				set.status = 400;
				return buildErrorResponse(
					'Los puestos seleccionados no existen en tu organización.',
					400,
				);
			}

			const batchId = crypto.randomUUID();
			const auditActor = resolveEmployeeAuditActor(authType, session);
			const results: Array<{
				index: number;
				success: boolean;
				employeeId?: string;
				error?: string;
				warnings?: Array<{
					code: 'BELOW_MINIMUM_WAGE';
					details: Record<string, unknown>;
				}>;
			}> = [];

			for (const [index, employeeInput] of body.employees.entries()) {
				const parsedEmployee = createEmployeeSchema.safeParse({
					...employeeInput,
					organizationId,
				});

				if (!parsedEmployee.success) {
					results.push({
						index,
						success: false,
						error: 'Datos inválidos para crear el empleado.',
					});
					continue;
				}

				const minWageValidation = await validateMinimumWage({
					organizationId,
					locationId: parsedEmployee.data.locationId,
					dailyPay: parsedEmployee.data.dailyPay,
				});

				if (!minWageValidation.isValid) {
					results.push({
						index,
						success: false,
						error: BELOW_MINIMUM_WAGE_ROW_ERROR,
					});
					continue;
				}

				const existingCode = (
					await db
						.select({ id: employee.id })
						.from(employee)
						.where(
							and(
								eq(employee.code, parsedEmployee.data.code),
								eq(employee.organizationId, organizationId),
							),
						)
						.limit(1)
				)[0];
				if (existingCode) {
					results.push({
						index,
						success: false,
						error: `Código "${parsedEmployee.data.code}" duplicado`,
					});
					continue;
				}

				const employeeId = crypto.randomUUID();
				try {
					await db.transaction(async (tx) => {
						await setEmployeeAuditSkip(tx);
						await tx.insert(employee).values({
							id: employeeId,
							code: parsedEmployee.data.code,
							firstName: parsedEmployee.data.firstName,
							lastName: parsedEmployee.data.lastName,
							dailyPay: parsedEmployee.data.dailyPay.toFixed(2),
							paymentFrequency: parsedEmployee.data.paymentFrequency,
							jobPositionId: parsedEmployee.data.jobPositionId,
							locationId: parsedEmployee.data.locationId,
							organizationId,
							importBatchId: batchId,
							status: parsedEmployee.data.status,
							employmentType: parsedEmployee.data.employmentType ?? 'PERMANENT',
							shiftType: parsedEmployee.data.shiftType ?? 'DIURNA',
						});

						const createdRows = await tx
							.select()
							.from(employee)
							.where(eq(employee.id, employeeId))
							.limit(1);
						const createdEmployee = createdRows[0];
						if (createdEmployee) {
							await createEmployeeAuditEvent(tx, {
								employeeId,
								organizationId: createdEmployee.organizationId,
								action: 'created',
								actorType: auditActor.actorType,
								actorUserId: auditActor.actorUserId,
								before: null,
								after: buildEmployeeAuditSnapshot(createdEmployee),
								changedFields: [],
							});
						}
					});
				} catch (error) {
					const isUniqueViolation = (error as { code?: string }).code === '23505';

					results.push({
						index,
						success: false,
						error: isUniqueViolation
							? `Código "${parsedEmployee.data.code}" duplicado`
							: 'Error interno al crear el empleado.',
					});
					continue;
				}

				results.push({
					index,
					success: true,
					employeeId,
					warnings: minWageValidation.warnings,
				});
			}

			const created = results.filter((result) => result.success).length;
			const failed = results.length - created;

			return {
				batchId,
				results,
				summary: {
					total: body.employees.length,
					created,
					failed,
				},
			};
		},
		{
			body: t.Object({
				employees: t.Array(
					t.Object({
						code: t.String(),
						firstName: t.String(),
						lastName: t.String(),
						dailyPay: t.Number(),
						paymentFrequency: t.Union([
							t.Literal('WEEKLY'),
							t.Literal('BIWEEKLY'),
							t.Literal('MONTHLY'),
						]),
						jobPositionId: t.String(),
						locationId: t.String(),
					}),
					{ maxItems: MAX_BULK_EMPLOYEES },
				),
			}),
		},
	)
	.delete(
		'/bulk/:batchId',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const { deleted } = await db.transaction(async (tx) => {
				const batchEmployees = await tx
					.select({ id: employee.id })
					.from(employee)
					.where(
						and(
							eq(employee.importBatchId, params.batchId),
							eq(employee.organizationId, organizationId),
						),
					)
					.limit(10_000);

				if (batchEmployees.length === 0) {
					return { deleted: 0 };
				}

				await tx
					.delete(employee)
					.where(
						and(
							eq(employee.importBatchId, params.batchId),
							eq(employee.organizationId, organizationId),
						),
					);

				return { deleted: batchEmployees.length };
			});

			if (deleted === 0) {
				set.status = 404;
				return buildErrorResponse('No se encontró el lote de importación.', 404);
			}

			return {
				deleted,
				batchId: params.batchId,
			};
		},
		{
			params: t.Object({
				batchId: t.String(),
			}),
		},
	);
