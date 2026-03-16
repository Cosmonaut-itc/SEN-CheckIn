import type { JSX, PropsWithChildren } from 'react';
import { createContext, useMemo } from 'react';
import * as React from 'react';
import { Uniwind } from 'uniwind';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

type ThemeName = 'light' | 'dark';

type ThemeContextValue = {
	/** Active color scheme, defaults to light when unavailable */
	colorScheme: ThemeName;
	/** Convenience flag for dark mode checks */
	isDarkMode: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Provides the system color scheme to the component tree.
 * Falls back to light mode when the scheme is not yet resolved (e.g., during SSR/hydration).
 *
 * @param props - Provider props including children elements
 * @returns Provider that exposes the current theme values
 */
export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
	const systemScheme = useColorScheme();
	const colorScheme = (systemScheme ?? 'light') as ThemeName;

	useEffect(() => {
		Uniwind.setTheme(colorScheme);
	}, [colorScheme]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			colorScheme,
			isDarkMode: colorScheme === 'dark',
		}),
		[colorScheme],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access the current theme context.
 *
 * @returns Theme context value including color scheme and dark mode flag
 * @throws Error when invoked outside of ThemeProvider
 */
export function useTheme(): ThemeContextValue {
	const context = React.use(ThemeContext);

	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider');
	}

	return context;
}
