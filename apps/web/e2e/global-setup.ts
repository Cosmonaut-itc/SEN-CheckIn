import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type SpawnOptions = {
	cwd: string;
	env: NodeJS.ProcessEnv;
};

/**
 * Runs a command and throws on non-zero exit codes.
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Spawn options
 * @returns Promise that resolves when the command succeeds
 * @throws Error when the command exits with a non-zero status
 */
async function runCommand(command: string, args: string[], options: SpawnOptions): Promise<void> {
	await new Promise<void>((resolvePromise, rejectPromise) => {
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
 * @returns Promise that resolves when the bootstrap completes
 */
export default async function globalSetup(): Promise<void> {
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(scriptDir, '..', '..', '..');
	const apiRoot = resolve(repoRoot, 'apps', 'api');

	await runCommand('bun', ['run', 'scripts/test/bootstrap.ts'], {
		cwd: apiRoot,
		env: process.env,
	});
}
