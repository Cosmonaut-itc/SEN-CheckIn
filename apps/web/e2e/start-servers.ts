import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type ServerProcess = {
	name: string;
	process: ChildProcess;
	exitPromise: Promise<number | null>;
};

const TEST_DB_NAME = 'sen_checkin_test';
const TEST_DB_USER = 'admin';
const TEST_DB_HOST = '127.0.0.1';
const TEST_DB_PORT = 5435;

/**
 * Loads environment variables from a .env file if they are not already set.
 *
 * @param envPath - Absolute path to the .env file
 * @returns Nothing
 */
function loadEnvFile(envPath: string): void {
	if (!existsSync(envPath)) {
		return;
	}

	const content = readFileSync(envPath, 'utf8');
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		const normalized = line.startsWith('export ') ? line.slice(7) : line;
		const separatorIndex = normalized.indexOf('=');
		if (separatorIndex <= 0) {
			continue;
		}

		const key = normalized.slice(0, separatorIndex).trim();
		if (!key || process.env[key] !== undefined) {
			continue;
		}

		const rawValue = normalized.slice(separatorIndex + 1).trim();
		const isQuoted =
			(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"));
		const unquotedValue = isQuoted ? rawValue.slice(1, -1) : rawValue;
		const commentIndex = isQuoted ? -1 : unquotedValue.search(/\s+#/);
		const value =
			commentIndex >= 0 ? unquotedValue.slice(0, commentIndex).trim() : unquotedValue;

		process.env[key] = value;
	}
}

/**
 * Builds a Postgres connection string for the test database.
 *
 * @param password - Postgres password
 * @returns Test database connection string
 */
function buildTestDatabaseUrl(password: string): string {
	const encodedPassword = encodeURIComponent(password);
	return `postgresql://${TEST_DB_USER}:${encodedPassword}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`;
}

/**
 * Resolves the test database URL, ensuring it points to the test database.
 * Falls back to the test DB URL if SEN_DB_URL targets a non-test database.
 *
 * @returns Connection string for the test database
 * @throws Error when the required password is missing or URL is invalid
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
		throw new Error('SEN_CHECKIN_PG_PASSWORD is required for Playwright servers.');
	}

	return buildTestDatabaseUrl(password);
}

/**
 * Waits for an HTTP endpoint to respond without throwing.
 *
 * @param url - URL to probe
 * @param timeoutMs - Maximum wait time in milliseconds
 * @param intervalMs - Polling interval in milliseconds
 * @returns Promise that resolves when the URL responds
 * @throws Error when the URL does not respond within the timeout
 */
async function waitForUrl(url: string, timeoutMs: number, intervalMs: number): Promise<void> {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url, { method: 'GET' });
			if (response) {
				return;
			}
		} catch {
			// Ignore errors until timeout
		}
		await setTimeout(intervalMs);
	}

	throw new Error(`Timed out waiting for ${url}`);
}

/**
 * Starts a Bun server process with inherited stdio.
 *
 * @param name - Human-friendly name for logging
 * @param cwd - Working directory for the process
 * @param env - Environment variables
 * @returns Started server process wrapper
 */
function startServer(name: string, cwd: string, env: NodeJS.ProcessEnv): ServerProcess {
	const childProcess = spawn('bun', ['run', 'dev'], {
		cwd,
		env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});

	const exitPromise = new Promise<number | null>((resolvePromise) => {
		childProcess.on('close', (exitCode) => {
			resolvePromise(exitCode);
		});

		childProcess.on('error', () => {
			resolvePromise(1);
		});
	});

	return { name, process: childProcess, exitPromise };
}

/**
 * Stops all running server processes.
 *
 * @param servers - Server process list
 * @returns Nothing
 */
function stopServers(servers: ServerProcess[]): void {
	for (const server of servers) {
		server.process.kill();
	}
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..');
const apiRoot = resolve(repoRoot, 'apps', 'api');
const webRoot = resolve(repoRoot, 'apps', 'web');

loadEnvFile(resolve(repoRoot, '.env'));

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

const testDatabaseUrl = resolveTestDatabaseUrl();

const apiProcess = startServer('api', apiRoot, {
	...process.env,
	SEN_DB_URL: testDatabaseUrl,
	NODE_ENV: process.env.NODE_ENV ?? 'test',
});

const webProcess = startServer('web', webRoot, {
	...process.env,
	NEXT_PUBLIC_API_URL: apiUrl,
	NEXT_PUBLIC_WEB_URL: webUrl,
	NODE_ENV: process.env.NODE_ENV ?? 'test',
});

const servers = [apiProcess, webProcess];

process.on('SIGINT', () => {
	stopServers(servers);
	process.exit(0);
});

process.on('SIGTERM', () => {
	stopServers(servers);
	process.exit(0);
});

await Promise.all([
	waitForUrl(`${apiUrl}/api/auth/session`, 60_000, 1_000),
	waitForUrl(webUrl, 60_000, 1_000),
]);

const exitResult = await Promise.race(
	servers.map(async (server) => ({ name: server.name, code: await server.exitPromise })),
);

stopServers(servers);
throw new Error(`${exitResult.name} server exited with code ${exitResult.code ?? 0}`);
