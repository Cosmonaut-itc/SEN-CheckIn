import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import { and, eq, isNull } from 'drizzle-orm';

type SpawnOptions = {
	cwd: string;
	env: NodeJS.ProcessEnv;
};

type TestUserSeed = {
	email: string;
	password: string;
	name: string;
	username: string;
	role: 'admin' | 'user';
	memberRole: 'admin' | 'member';
};

type SeedContext = {
	db: typeof import('../../src/db/index.js').default;
	schema: typeof import('../../src/db/schema.js');
	auth: typeof import('../../utils/auth.js').auth;
	organizationId: string;
};

const TEST_DB_NAME = 'sen_checkin_test';
const TEST_DB_USER = 'admin';
const TEST_DB_HOST = '127.0.0.1';
const TEST_DB_PORT = 5435;
const TEST_COMPOSE_PROJECT = 'sen-checkin-test';

const TEST_USERS: TestUserSeed[] = [
	{
		email: 'admin@sen-checkin.test',
		password: 'Admin123!Test',
		name: 'Admin de Pruebas',
		username: 'admin_test',
		role: 'admin',
		memberRole: 'admin',
	},
	{
		email: 'user@sen-checkin.test',
		password: 'User123!Test',
		name: 'Usuario de Pruebas',
		username: 'user_test',
		role: 'user',
		memberRole: 'member',
	},
];

/**
 * Runs a command using Bun.spawn and throws on failure.
 *
 * @param command - Executable name to run
 * @param args - Arguments to pass to the command
 * @param options - Spawn options including cwd and environment
 * @returns Promise that resolves when the command succeeds
 * @throws Error when the command exits with a non-zero status
 */
async function runCommand(command: string, args: string[], options: SpawnOptions): Promise<void> {
	const child = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: options.env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	const exitCode = await child.exited;
	if (exitCode !== 0) {
		throw new Error(`Command failed (${exitCode}): ${command} ${args.join(' ')}`);
	}
}

/**
 * Builds a Postgres connection string for the test database.
 *
 * @param password - Postgres password
 * @returns Connection string for the test database
 */
function buildTestDatabaseUrl(password: string): string {
	const encodedPassword = encodeURIComponent(password);
	return `postgresql://${TEST_DB_USER}:${encodedPassword}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`;
}

/**
 * Resolves the test database URL, ensuring it targets the test database.
 * Falls back to the test DB URL if SEN_DB_URL targets a non-test database.
 *
 * @returns Connection string for the test database
 * @throws Error when required environment variables are missing or invalid
 */
function resolveTestDatabaseUrl(): string {
	const providedUrl = process.env.SEN_DB_URL;
	let providedDatabaseName: string | null = null;
	if (providedUrl) {
		const parsed = new URL(providedUrl);
		providedDatabaseName = parsed.pathname.replace(/^\//, '');
		if (providedDatabaseName === TEST_DB_NAME) {
			return providedUrl;
		}
	}

	const password = process.env.SEN_CHECKIN_PG_PASSWORD;
	if (!password) {
		if (providedDatabaseName) {
			throw new Error(
				`SEN_DB_URL must target "${TEST_DB_NAME}" for tests. Received "${providedDatabaseName}".`,
			);
		}
		throw new Error('SEN_CHECKIN_PG_PASSWORD is required to build the test database URL.');
	}

	return buildTestDatabaseUrl(password);
}

/**
 * Waits until the Postgres database is available.
 *
 * @param connectionString - Postgres connection string
 * @param timeoutMs - Maximum wait time in milliseconds
 * @param intervalMs - Delay between attempts in milliseconds
 * @returns Promise that resolves when the database is reachable
 * @throws Error when the database is not reachable within the timeout
 */
async function waitForDatabase(
	connectionString: string,
	timeoutMs: number,
	intervalMs: number,
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const client = new Client({ connectionString });
		try {
			await client.connect();
			await client.query('SELECT 1');
			await client.end();
			return;
		} catch (error) {
			await client.end().catch(() => undefined);
			await setTimeout(intervalMs);
			void error;
		}
	}

	throw new Error('Timed out waiting for the test database to become available.');
}

/**
 * Resolves the seed organization ID for the primary test organization.
 *
 * @param context - Seed context with db and schema
 * @returns Organization ID
 * @throws Error when the organization cannot be found
 */
async function getSeedOrganizationId(context: SeedContext): Promise<string> {
	const { organization } = context.schema;
	const rows = await context.db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, 'sen-checkin'))
		.limit(1);

	const record = rows[0];
	if (!record) {
		throw new Error('Seed organization "sen-checkin" was not found.');
	}
	return record.id;
}

/**
 * Ensures a BetterAuth user exists and returns its userId.
 *
 * @param context - Seed context with db and auth
 * @param userSeed - User seed configuration
 * @returns User ID
 * @throws Error when the user cannot be created or resolved
 */
async function ensureUser(context: SeedContext, userSeed: TestUserSeed): Promise<string> {
	const { user } = context.schema;
	const existing = await context.db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, userSeed.email))
		.limit(1);

	const existingId = existing[0]?.id ?? null;
	if (existingId) {
		// Recreate test users to guarantee deterministic credentials on each bootstrap run.
		await context.db.delete(user).where(eq(user.id, existingId));
	}

	const signUpResult = await context.auth.api.signUpEmail({
		body: {
			name: userSeed.name,
			email: userSeed.email,
			password: userSeed.password,
			username: userSeed.username,
		},
	});

	if ((signUpResult as { error?: unknown }).error) {
		throw new Error(`Failed to create test user ${userSeed.email}.`);
	}

	const created = await context.db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, userSeed.email))
		.limit(1);

	const userId = created[0]?.id ?? null;
	if (!userId) {
		throw new Error(`Unable to resolve user ID for ${userSeed.email}.`);
	}

	await context.db.update(user).set({ role: userSeed.role }).where(eq(user.id, userId));

	return userId;
}

/**
 * Ensures a membership exists for the user within the organization.
 *
 * @param context - Seed context with db and schema
 * @param userId - User identifier
 * @param role - Member role to enforce
 * @returns Promise that resolves when membership is ensured
 */
async function ensureMembership(
	context: SeedContext,
	userId: string,
	role: TestUserSeed['memberRole'],
): Promise<void> {
	const { member } = context.schema;
	const existing = await context.db
		.select({ id: member.id, role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, context.organizationId)))
		.limit(1);

	const membership = existing[0];
	if (!membership) {
		await context.db.insert(member).values({
			id: randomUUID(),
			userId,
			organizationId: context.organizationId,
			role,
		});
		return;
	}

	if (membership.role !== role) {
		await context.db.update(member).set({ role }).where(eq(member.id, membership.id));
	}
}

/**
 * Links the given user to an employee record for self-service endpoints.
 *
 * @param context - Seed context with db and schema
 * @param userId - User identifier to link
 * @returns Promise that resolves once the employee is linked
 * @throws Error when no employee is available to link
 */
async function linkEmployeeToUser(context: SeedContext, userId: string): Promise<void> {
	const { employee } = context.schema;
	const existing = await context.db
		.select({ id: employee.id })
		.from(employee)
		.where(
			and(eq(employee.organizationId, context.organizationId), eq(employee.userId, userId)),
		)
		.limit(1);

	if (existing[0]) {
		return;
	}

	const available = await context.db
		.select({ id: employee.id })
		.from(employee)
		.where(and(eq(employee.organizationId, context.organizationId), isNull(employee.userId)))
		.limit(1);

	const target = available[0]
		? available[0]
		: (
				await context.db
					.select({ id: employee.id })
					.from(employee)
					.where(eq(employee.organizationId, context.organizationId))
					.limit(1)
			)[0];

	if (!target) {
		throw new Error('No employee record available to link to the test user.');
	}

	await context.db.update(employee).set({ userId }).where(eq(employee.id, target.id));
}

/**
 * Main entry point to bootstrap the API test environment.
 *
 * @returns Promise that resolves when bootstrapping is complete
 * @throws Error when any step fails
 */
async function main(): Promise<void> {
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const apiRoot = resolve(scriptDir, '..', '..');
	const composePath = resolve(apiRoot, 'docker-compose.test.yaml');

	const testDatabaseUrl = resolveTestDatabaseUrl();
	process.env.SEN_DB_URL = testDatabaseUrl;
	process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

	console.log('[bootstrap] Starting test Postgres via Docker...');
	await runCommand(
		'docker',
		['compose', '--project-name', TEST_COMPOSE_PROJECT, '-f', composePath, 'up', '-d'],
		{
			cwd: apiRoot,
			env: process.env,
		},
	);

	console.log('[bootstrap] Waiting for database readiness...');
	await waitForDatabase(testDatabaseUrl, 30_000, 1_000);

	console.log('[bootstrap] Running migrations...');
	await runCommand('bun', ['run', 'db:mig'], { cwd: apiRoot, env: process.env });

	console.log('[bootstrap] Seeding domain data...');
	await runCommand('bun', ['run', 'db:reset'], { cwd: apiRoot, env: process.env });

	const { default: db } = await import('../../src/db/index.js');
	const schema = await import('../../src/db/schema.js');
	const { auth } = await import('../../utils/auth.js');

	const seedContext: SeedContext = {
		db,
		schema,
		auth,
		organizationId: '',
	};

	seedContext.organizationId = await getSeedOrganizationId(seedContext);

	console.log('[bootstrap] Ensuring test users and memberships...');
	for (const testUser of TEST_USERS) {
		const userId = await ensureUser(seedContext, testUser);
		await ensureMembership(seedContext, userId, testUser.memberRole);
		if (testUser.memberRole === 'member') {
			await linkEmployeeToUser(seedContext, userId);
		}
	}

	console.log('[bootstrap] Test environment ready.');
}

try {
	await main();
} catch (error) {
	console.error('[bootstrap] Failed to prepare test environment:', error);
	process.exitCode = 1;
}
