import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureStorageStateFile } from '../e2e/storage-state';

const INITIAL_STORAGE_STATE_JSON = JSON.stringify({ cookies: [], origins: [] }, null, 2);

describe('ensureStorageStateFile', () => {
	it('creates the parent directory and initializes the storage state file when missing', async () => {
		const storageStateDirectory = mkdtempSync(join(tmpdir(), 'storage-state-helper-'));
		const storageStatePath = join(storageStateDirectory, 'nested', '.auth-state.json');

		await ensureStorageStateFile(storageStatePath);

		expect(existsSync(join(storageStateDirectory, 'nested'))).toBe(true);
		expect(readFileSync(storageStatePath, 'utf8')).toBe(INITIAL_STORAGE_STATE_JSON);
	});

	it('does not overwrite an existing storage state file', async () => {
		const storageStateDirectory = mkdtempSync(join(tmpdir(), 'storage-state-helper-'));
		const storageStatePath = join(storageStateDirectory, '.auth-state.json');
		const existingStorageState = JSON.stringify(
			{
				cookies: [{ name: 'session', value: 'abc123' }],
				origins: [{ origin: 'https://example.com', localStorage: [] }],
			},
			null,
			2,
		);

		mkdirSync(storageStateDirectory, { recursive: true });
		writeFileSync(storageStatePath, existingStorageState, 'utf8');

		await ensureStorageStateFile(storageStatePath);

		expect(readFileSync(storageStatePath, 'utf8')).toBe(existingStorageState);
	});

	it('throws when the storage state path exists as a directory', async () => {
		const storageStateDirectory = mkdtempSync(join(tmpdir(), 'storage-state-helper-'));
		const storageStatePath = join(storageStateDirectory, '.auth-state.json');

		mkdirSync(storageStatePath, { recursive: true });

		await expect(ensureStorageStateFile(storageStatePath)).rejects.toThrow(
			'Storage state path exists but is not a file',
		);
	});
});
