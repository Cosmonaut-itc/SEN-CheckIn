'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

/**
 * Wraps next-themes provider to supply the `.dark` class on the root element.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps): React.ReactElement {
	return (
		<NextThemesProvider attribute="class" {...props}>
			{children}
		</NextThemesProvider>
	);
}
