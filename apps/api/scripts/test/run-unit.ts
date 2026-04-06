import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_DIRECTORY = process.cwd();
const UNIT_TEST_SUFFIX = '.unit.test.ts';

/**
 * Recursively collects unit test files under a directory.
 *
 * @param directory - Absolute directory path to scan
 * @returns Sorted list of relative unit test file paths
 */
function collectUnitTestFiles(directory: string): string[] {
	const entries = readdirSync(directory, {
		withFileTypes: true,
	});

	const files = entries.flatMap((entry) => {
		const absolutePath = join(directory, entry.name);

		if (entry.isDirectory()) {
			return collectUnitTestFiles(absolutePath);
		}

		if (!entry.isFile() || !entry.name.endsWith(UNIT_TEST_SUFFIX)) {
			return [];
		}

		return [relative(ROOT_DIRECTORY, absolutePath)];
	});

	return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Runs a single unit test file in an isolated Bun process.
 *
 * @param filePath - Relative path to the unit test file
 * @returns Exit status from the spawned Bun process
 */
async function runUnitTestFile(filePath: string): Promise<number> {
	console.log(`\n[unit] ${filePath}`);

	const child = Bun.spawn(['bun', 'test', filePath], {
		cwd: ROOT_DIRECTORY,
		env: process.env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});

	return await child.exited;
}

/**
 * Executes all API unit tests with per-file process isolation.
 *
 * @returns Promise that resolves when all files pass
 * @throws Error when one or more unit test files fail
 */
async function main(): Promise<void> {
	const unitTestFiles = collectUnitTestFiles(join(ROOT_DIRECTORY, 'src'));

	if (unitTestFiles.length === 0) {
		console.log('No unit test files found.');
		return;
	}

	const failedFiles: string[] = [];

	for (const unitTestFile of unitTestFiles) {
		const exitCode = await runUnitTestFile(unitTestFile);

		if (exitCode !== 0) {
			failedFiles.push(unitTestFile);
		}
	}

	if (failedFiles.length > 0) {
		throw new Error(`Unit test files failed:\n${failedFiles.join('\n')}`);
	}
}

await main();
