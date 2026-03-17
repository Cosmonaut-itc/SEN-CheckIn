import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import React from 'react';
import { Uniwind } from 'uniwind';

import { ThemeProvider, useTheme } from '@/providers/theme-provider';

const mockUseColorScheme = jest.fn();

jest.mock('@/hooks/use-color-scheme', () => ({
	useColorScheme: () => mockUseColorScheme(),
}));

jest.mock('uniwind', () => ({
	Uniwind: {
		setTheme: jest.fn(),
	},
}));

describe('ThemeProvider', () => {
	beforeEach(() => {
		mockUseColorScheme.mockReset();
		jest.clearAllMocks();
	});

	it('falls back to light mode when the system color scheme is unavailable', () => {
		mockUseColorScheme.mockReturnValue(null);

		const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => (
			<ThemeProvider>{children}</ThemeProvider>
		);
		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.colorScheme).toBe('light');
		expect(result.current.isDarkMode).toBe(false);
	});

	it('syncs the resolved theme with Uniwind', () => {
		mockUseColorScheme.mockReturnValue('dark');

		const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => (
			<ThemeProvider>{children}</ThemeProvider>
		);
		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.colorScheme).toBe('dark');
		expect(result.current.isDarkMode).toBe(true);
		expect(Uniwind.setTheme).toHaveBeenCalledWith('dark');
	});

	it('throws when used outside the provider', () => {
		expect(() => renderHook(() => useTheme())).toThrow(
			'useTheme must be used within ThemeProvider',
		);
	});
});
