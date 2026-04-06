import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_DIRECTORY = process.cwd();
const CONTRACT_TEST_SUFFIX = '.contract.test.ts';

/**
 * Recursively collects contract test files under a directory.
 *
 * @param directory - Absolute directory path to scan
 * @returns Sorted list of relative contract test file paths
 */
function collectContractTestFiles(directory: string): string[] {
	const entries = readdirSync(directory, {
		withFileTypes: true,
	});

	const files = entries.flatMap((entry) => {
		const absolutePath = join(directory, entry.name);

		if (entry.isDirectory()) {
			return collectContractTestFiles(absolutePath);
		}

		if (!entry.isFile() || !entry.name.endsWith(CONTRACT_TEST_SUFFIX)) {
			return [];
		}

		return [relative(ROOT_DIRECTORY, absolutePath)];
	});

	return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Runs a command and inherits stdio for transparent test logs.
 *
 * @param command - Executable name to run
 * @param args - Arguments to pass to the command
 * @param env - Environment variables for the subprocess
 * @returns Exit status from the spawned process
 */
async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
	const child = Bun.spawn([command, ...args], {
		cwd: ROOT_DIRECTORY,
		env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});

	return await child.exited;
}

/**
 * Resolves the reachable contract test database URL.
 *
 * @returns Reachable test database connection string
 * @throws Error when the helper cannot resolve a working database URL
 */
async function resolveContractDatabaseUrl(): Promise<string> {
	const contractHelpersModule = await import('../../src/test-utils/contract-helpers.ts');
	return await contractHelpersModule.ensureReachableTestDatabaseUrl();
}

/**
 * Resets the contract database to a known seeded baseline.
 *
 * @param environment - Environment variables for the bootstrap process
 * @returns Promise that resolves when the bootstrap completes
 * @throws Error when the bootstrap command fails
 */
async function bootstrapContractDatabase(environment: NodeJS.ProcessEnv): Promise<void> {
	const exitCode = await runCommand('bun', ['run', 'scripts/test/bootstrap.ts'], environment);

	if (exitCode !== 0) {
		throw new Error(`Contract bootstrap failed with exit code ${exitCode}.`);
	}
}

/**
 * Runs a single contract test file against a freshly bootstrapped database.
 *
 * @param filePath - Relative path to the contract test file
 * @param databaseUrl - Reachable test database URL
 * @returns Exit status from the spawned Bun test process
 * @throws Error when the bootstrap command fails
 */
async function runContractTestFile(filePath: string, databaseUrl: string): Promise<number> {
	console.log(`\n[contract] ${filePath}`);

	const environment: NodeJS.ProcessEnv = {
		...process.env,
		SEN_DB_URL: databaseUrl,
	};

	await bootstrapContractDatabase(environment);

	return await runCommand('bun', ['test', '--timeout', '15000', filePath], environment);
}

/**
 * Executes all contract tests with per-file database isolation.
 *
 * @returns Promise that resolves when all contract files pass
 * @throws Error when one or more contract test files fail
 */
async function main(): Promise<void> {
	const contractTestFiles = collectContractTestFiles(join(ROOT_DIRECTORY, 'src'));

	if (contractTestFiles.length === 0) {
		console.log('No contract test files found.');
		return;
	}

	const databaseUrl = await resolveContractDatabaseUrl();
	const failedFiles: string[] = [];

	for (const contractTestFile of contractTestFiles) {
		const exitCode = await runContractTestFile(contractTestFile, databaseUrl);

		if (exitCode !== 0) {
			failedFiles.push(contractTestFile);
		}
	}

	if (failedFiles.length > 0) {
		throw new Error(`Contract test files failed:\n${failedFiles.join('\n')}`);
	}
}

await main();
