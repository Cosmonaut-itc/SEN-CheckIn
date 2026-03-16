import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeModeToggle } from '@/components/theme-mode-toggle';

const setThemeMock = vi.fn();
let mockTheme: 'light' | 'dark' | 'system' | undefined;

vi.mock('next-themes', () => ({
	ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
	useTheme: () => ({
		setTheme: setThemeMock,
		theme: mockTheme,
	}),
}));

describe('ThemeModeToggle', () => {
	beforeEach(() => {
		mockTheme = undefined;
		setThemeMock.mockReset();
	});

	it('renders a static fallback during SSR', () => {
		const html = renderToString(<ThemeModeToggle />);

		expect(html).toContain('aria-label="toggleAriaLabel"');
		expect(html).not.toContain('data-slot="dropdown-menu-trigger"');
	});

	it('renders the interactive theme menu after mount', async () => {
		mockTheme = 'system';

		render(<ThemeModeToggle />);

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'toggleAriaLabel' })).toHaveAttribute(
				'data-slot',
				'dropdown-menu-trigger',
			);
		});
	});
});
