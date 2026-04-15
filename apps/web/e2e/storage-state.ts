import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const INITIAL_STORAGE_STATE = JSON.stringify({ cookies: [], origins: [] }, null, 2);

/**
 * Ensures a Playwright `storageState` file exists without overwriting an existing file.
 *
 * @param storageStatePath - Absolute or relative path where the storage state JSON should live.
 * @returns A promise that resolves when the directory and file are ready.
 * @throws If the path exists but is not a file, or if filesystem operations fail for another reason.
 */
export async function ensureStorageStateFile(storageStatePath: string): Promise<void> {
	await mkdir(dirname(storageStatePath), { recursive: true });

	try {
		await writeFile(storageStatePath, INITIAL_STORAGE_STATE, {
			encoding: 'utf8',
			flag: 'wx',
		});
		return;
	} catch (error: unknown) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code?: string }).code === 'EEXIST'
		) {
			const storageStateStats = await stat(storageStatePath);

			if (storageStateStats.isFile()) {
				return;
			}

			throw new Error(`Storage state path exists but is not a file: ${storageStatePath}`);
		}

		throw error;
	}
}
