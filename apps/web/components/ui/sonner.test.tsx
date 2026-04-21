import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui/sonner';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const globalsCssContent = readFileSync(resolve(currentDirectory, '../../app/globals.css'), 'utf8');
const mockSonner = vi.fn();

vi.mock('next-themes', () => ({
	useTheme: () => ({
		theme: 'dark',
	}),
}));

vi.mock('sonner', () => ({
	Toaster: (props: unknown) => {
		mockSonner(props);
		return <div data-testid="mock-sonner" />;
	},
}));

describe('Toaster', () => {
	beforeEach(() => {
		mockSonner.mockReset();
	});

	it('passes the canonical large radius token to Sonner', () => {
		render(<Toaster />);

		const props = mockSonner.mock.calls[0]?.[0] as
			| { style?: Record<string, string> }
			| undefined;

		expect(props?.style?.['--border-radius']).toBe('var(--radius-lg)');
	});

	it('uses a radius token that exists in the web theme contract', () => {
		expect(globalsCssContent).toContain('--radius: 14px;');
		expect(globalsCssContent).toContain('--radius-lg: 14px;');
	});
});
