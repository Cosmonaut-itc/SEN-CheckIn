import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001',
		trace: 'on-first-retry',
	},
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		command: 'bun run test:e2e:servers',
		url: 'http://localhost:3001',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
