import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs a command and throws on non-zero exit codes.
 *
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {{ cwd: string, env: NodeJS.ProcessEnv }} options - Spawn options
 * @returns {Promise<void>} Promise that resolves when the command succeeds
 * @throws {Error} When the command exits with a non-zero status
 */
async function runCommand(command, args, options) {
	await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'inherit', 'inherit'],
		});

		child.on('error', (error) => {
			rejectPromise(error);
		});

		child.on('close', (exitCode) => {
			if (exitCode === 0) {
				resolvePromise();
				return;
			}

			rejectPromise(
				new Error(`Command failed (${exitCode ?? 0}): ${command} ${args.join(' ')}`),
			);
		});
	});
}

/**
 * Bootstraps the API test database for Playwright.
 *
 * @returns {Promise<void>} Promise that resolves when the bootstrap completes
 */
export default async function globalSetup() {
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(scriptDir, '..', '..', '..');
	const apiRoot = resolve(repoRoot, 'apps', 'api');

	await runCommand('bun', ['run', 'scripts/test/bootstrap.ts'], {
		cwd: apiRoot,
		env: process.env,
	});
}
