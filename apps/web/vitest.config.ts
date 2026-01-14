import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		clearMocks: true,
	},
	resolve: {
		alias: {
			'@': resolve(rootDir, '.'),
		},
	},
});
