import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(rootDir, '..', '..');
const nodeModulesRoot = resolve(repoRoot, 'node_modules');

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		clearMocks: true,
		include: ['**/*.test.ts', '**/*.test.tsx'],
		exclude: [...configDefaults.exclude, '**/e2e/**'],
		deps: {
			inline: [
				'react',
				'react-dom',
				'@testing-library/react',
				'@testing-library/jest-dom',
				'@radix-ui/react-accordion',
				'@radix-ui/react-avatar',
				'@radix-ui/react-dialog',
				'@radix-ui/react-dropdown-menu',
				'@radix-ui/react-label',
				'@radix-ui/react-popover',
				'@radix-ui/react-scroll-area',
				'@radix-ui/react-select',
				'@radix-ui/react-separator',
				'@radix-ui/react-slot',
				'@radix-ui/react-tabs',
				'@radix-ui/react-tooltip',
				'next-intl',
				'use-intl',
			],
		},
	},
	resolve: {
		alias: {
			'@': resolve(rootDir, '.'),
			'@sen-checkin/api-contract': resolve(repoRoot, 'packages/api-contract/src/index.ts'),
			'@sen-checkin/types': resolve(repoRoot, 'packages/types/src/index.ts'),
			'@sen-checkin/types/legal-template-defaults': resolve(
				repoRoot,
				'packages/types/src/legal-template-defaults.ts',
			),
			react: resolve(nodeModulesRoot, 'react'),
			'react-dom': resolve(nodeModulesRoot, 'react-dom'),
			'react-dom/client': resolve(nodeModulesRoot, 'react-dom/client'),
			'react-dom/test-utils': resolve(nodeModulesRoot, 'react-dom/test-utils'),
			'react/jsx-runtime': resolve(nodeModulesRoot, 'react/jsx-runtime'),
			'react/jsx-dev-runtime': resolve(nodeModulesRoot, 'react/jsx-dev-runtime'),
		},
		dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
		preserveSymlinks: false,
	},
});
