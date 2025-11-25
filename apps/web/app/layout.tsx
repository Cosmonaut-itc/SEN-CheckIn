import type { Metadata } from 'next';
import React, { type ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

/**
 * Geist Sans font configuration for body text.
 */
const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

/**
 * Geist Mono font configuration for code/monospace text.
 */
const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

/**
 * Application metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
	title: 'SEN CheckIn - Admin Portal',
	description: 'Administration portal for SEN CheckIn attendance management system',
};

/**
 * Props for the RootLayout component.
 */
interface RootLayoutProps {
	/** Child components to render within the layout */
	children: ReactNode;
}

/**
 * Root layout component for the entire application.
 * Provides fonts, global styles, and the toast notification provider.
 *
 * @param props - Component props containing children
 * @returns The root layout JSX element
 */
export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
			>
				{children}
				<Toaster richColors position="top-right" />
			</body>
		</html>
	);
}
