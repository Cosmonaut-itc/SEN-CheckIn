import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('staffing requirement routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('creates, lists, updates, and deletes a staffing requirement', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const createResponse = await staffingRequirementRoutes.post({
			organizationId: seed.organizationId,
			locationId: seed.locationId,
			jobPositionId: seed.jobPositionId,
			minimumRequired: 3,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdRequirement = createPayload.data;
		if (!createdRequirement) {
			throw new Error('Expected staffing requirement record in create response.');
		}
		expect(createdRequirement.organizationId).toBe(seed.organizationId);
		expect(createdRequirement.locationId).toBe(seed.locationId);
		expect(createdRequirement.jobPositionId).toBe(seed.jobPositionId);
		expect(createdRequirement.minimumRequired).toBe(3);

		const listResponse = await staffingRequirementRoutes.get({
			$query: {
				organizationId: seed.organizationId,
				locationId: seed.locationId,
				jobPositionId: seed.jobPositionId,
				limit: 10,
				offset: 0,
			},
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(listResponse.status).toBe(200);
		const listPayload = requireResponseData(listResponse);
		expect(listPayload.data.some((record) => record.id === createdRequirement.id)).toBe(true);

		const requirementRoutes = requireRoute(
			staffingRequirementRoutes[createdRequirement.id],
			'Staffing requirement detail route',
		);
		const updateResponse = await requirementRoutes.put({
			minimumRequired: 5,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		expect(updatePayload.data?.minimumRequired).toBe(5);

		const deleteResponse = await requirementRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);

		const getResponse = await requirementRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(404);
	});

	it('rejects duplicate staffing requirements for the same organization, location, and position', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const locationCode = `SR-${randomUUID().slice(0, 8)}`;
		const locationResponse = await client.locations.post({
			name: `Sucursal cobertura ${locationCode}`,
			code: locationCode,
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(locationResponse.status).toBe(201);
		const locationPayload = requireResponseData(locationResponse);
		const locationId = locationPayload.data?.id;
		if (!locationId) {
			throw new Error('Expected location ID for duplicate staffing requirement test.');
		}

		const jobPositionResponse = await client['job-positions'].post({
			name: `Puesto cobertura ${randomUUID().slice(0, 8)}`,
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(jobPositionResponse.status).toBe(201);
		const jobPositionPayload = requireResponseData(jobPositionResponse);
		const jobPositionId = jobPositionPayload.data?.id;
		if (!jobPositionId) {
			throw new Error('Expected job position ID for duplicate staffing requirement test.');
		}

		const body = {
			organizationId: seed.organizationId,
			locationId,
			jobPositionId,
			minimumRequired: 2,
			$headers: { cookie: adminSession.cookieHeader },
		};
		const firstResponse = await staffingRequirementRoutes.post(body);
		expect(firstResponse.status).toBe(201);

		const secondResponse = await staffingRequirementRoutes.post(body);
		expect(secondResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(secondResponse, 'duplicate staffing requirement');
		expect(errorPayload.error.message).toBe('Staffing requirement already exists');
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('maps concurrent duplicate staffing requirement creates to conflicts', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const locationCode = `SRC-${randomUUID().slice(0, 8)}`;
		const locationResponse = await client.locations.post({
			name: `Sucursal concurrencia ${locationCode}`,
			code: locationCode,
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(locationResponse.status).toBe(201);
		const locationPayload = requireResponseData(locationResponse);
		const locationId = locationPayload.data?.id;
		if (!locationId) {
			throw new Error('Expected location ID for concurrent duplicate test.');
		}

		const jobPositionResponse = await client['job-positions'].post({
			name: `Puesto concurrencia ${randomUUID().slice(0, 8)}`,
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(jobPositionResponse.status).toBe(201);
		const jobPositionPayload = requireResponseData(jobPositionResponse);
		const jobPositionId = jobPositionPayload.data?.id;
		if (!jobPositionId) {
			throw new Error('Expected job position ID for concurrent duplicate test.');
		}

		const responses = await Promise.all(
			Array.from({ length: 8 }, () =>
				staffingRequirementRoutes.post({
					organizationId: seed.organizationId,
					locationId,
					jobPositionId,
					minimumRequired: 2,
					$headers: { cookie: adminSession.cookieHeader },
				}),
			),
		);

		const statuses = responses.map((response) => response.status).sort();
		expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
	});

	it('rejects a location from another organization', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const otherOrganizationId = `org-${randomUUID()}`;
		const otherLocationId = randomUUID();
		const [{ default: db }, { location, organization }] = await Promise.all([
			import('../db/index.js'),
			import('../db/schema.js'),
		]);
		await db.insert(organization).values({
			id: otherOrganizationId,
			name: 'Organizacion externa',
			slug: `org-ext-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(location).values({
			id: otherLocationId,
			name: 'Sucursal fuera de alcance',
			code: `EXT-${randomUUID().slice(0, 8)}`,
			organizationId: otherOrganizationId,
		});

		const createResponse = await staffingRequirementRoutes.post({
			organizationId: seed.organizationId,
			locationId: otherLocationId,
			jobPositionId: seed.jobPositionId,
			minimumRequired: 1,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(
			createResponse,
			'invalid staffing requirement scope',
		);
		expect(errorPayload.error.message).toBe('Location not found for organization');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('rejects a job position from another organization', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const otherOrganizationId = `org-${randomUUID()}`;
		const otherJobPositionId = randomUUID();
		const [{ default: db }, { jobPosition, organization }] = await Promise.all([
			import('../db/index.js'),
			import('../db/schema.js'),
		]);
		await db.insert(organization).values({
			id: otherOrganizationId,
			name: 'Organizacion puesto externo',
			slug: `org-pos-ext-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(jobPosition).values({
			id: otherJobPositionId,
			name: 'Puesto fuera de alcance',
			organizationId: otherOrganizationId,
		});

		const createResponse = await staffingRequirementRoutes.post({
			organizationId: seed.organizationId,
			locationId: seed.locationId,
			jobPositionId: otherJobPositionId,
			minimumRequired: 1,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(400);
		const errorPayload = requireErrorResponse(
			createResponse,
			'invalid staffing requirement job position scope',
		);
		expect(errorPayload.error.message).toBe('Job position not found for organization');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('scopes list results to the caller organization', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const [{ default: db }, { jobPosition, location, organization, staffingRequirement }] =
			await Promise.all([import('../db/index.js'), import('../db/schema.js')]);
		const otherOrganizationId = `org-${randomUUID()}`;
		const otherLocationId = randomUUID();
		const otherJobPositionId = randomUUID();
		const otherRequirementId = randomUUID();
		await db.insert(organization).values({
			id: otherOrganizationId,
			name: 'Organizacion lista externa',
			slug: `org-list-ext-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(location).values({
			id: otherLocationId,
			name: 'Sucursal lista externa',
			code: `LST-${randomUUID().slice(0, 8)}`,
			organizationId: otherOrganizationId,
		});
		await db.insert(jobPosition).values({
			id: otherJobPositionId,
			name: 'Puesto lista externa',
			organizationId: otherOrganizationId,
		});
		await db.insert(staffingRequirement).values({
			id: otherRequirementId,
			organizationId: otherOrganizationId,
			locationId: otherLocationId,
			jobPositionId: otherJobPositionId,
			minimumRequired: 4,
		});

		const listResponse = await staffingRequirementRoutes.get({
			$query: { limit: 100, offset: 0 },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(listResponse.status).toBe(200);
		const listPayload = requireResponseData(listResponse);
		expect(listPayload.data.every((record) => record.organizationId === seed.organizationId)).toBe(
			true,
		);
		expect(listPayload.data.some((record) => record.id === otherRequirementId)).toBe(false);
	});

	it('rejects detail mutations for staffing requirements outside the caller organization', async () => {
		const staffingRequirementRoutes = requireRoute(
			client['staffing-requirements'],
			'Staffing requirement route',
		);
		const [{ default: db }, { jobPosition, location, organization, staffingRequirement }] =
			await Promise.all([import('../db/index.js'), import('../db/schema.js')]);
		const otherOrganizationId = `org-${randomUUID()}`;
		const otherLocationId = randomUUID();
		const otherJobPositionId = randomUUID();
		const otherRequirementId = randomUUID();
		await db.insert(organization).values({
			id: otherOrganizationId,
			name: 'Organizacion detalle externa',
			slug: `org-detail-ext-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(location).values({
			id: otherLocationId,
			name: 'Sucursal detalle externa',
			code: `DET-${randomUUID().slice(0, 8)}`,
			organizationId: otherOrganizationId,
		});
		await db.insert(jobPosition).values({
			id: otherJobPositionId,
			name: 'Puesto detalle externo',
			organizationId: otherOrganizationId,
		});
		await db.insert(staffingRequirement).values({
			id: otherRequirementId,
			organizationId: otherOrganizationId,
			locationId: otherLocationId,
			jobPositionId: otherJobPositionId,
			minimumRequired: 2,
		});

		const detailRoutes = requireRoute(
			staffingRequirementRoutes[otherRequirementId],
			'Foreign staffing requirement route',
		);
		const getResponse = await detailRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		const updateResponse = await detailRoutes.put({
			minimumRequired: 7,
			$headers: { cookie: adminSession.cookieHeader },
		});
		const deleteResponse = await detailRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(403);
		expect(updateResponse.status).toBe(403);
		expect(deleteResponse.status).toBe(403);
	});

	it('allows the database to generate staffing requirement IDs', async () => {
		const [{ default: db }, { sql }, { jobPosition, location }] = await Promise.all([
			import('../db/index.js'),
			import('drizzle-orm'),
			import('../db/schema.js'),
		]);
		const locationId = randomUUID();
		const jobPositionId = randomUUID();
		await db.insert(location).values({
			id: locationId,
			name: 'Sucursal default ID',
			code: `DID-${randomUUID().slice(0, 8)}`,
			organizationId: seed.organizationId,
		});
		await db.insert(jobPosition).values({
			id: jobPositionId,
			name: `Puesto default ID ${randomUUID().slice(0, 8)}`,
			organizationId: seed.organizationId,
		});
		const insertResult = await db.execute<{
			id: string;
		}>(sql`
			INSERT INTO staffing_requirement (
				organization_id,
				location_id,
				job_position_id,
				minimum_required
			)
			VALUES (
				${seed.organizationId},
				${locationId},
				${jobPositionId},
				0
			)
			RETURNING id
		`);

		expect(insertResult.rows[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});
});
