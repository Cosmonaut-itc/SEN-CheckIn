import type { Metadata } from 'next';
import Script from 'next/script';
import React, { type ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from './providers';
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
	title: 'SEN CheckIn - Portal de Administración',
	description: 'Portal de administración para el sistema de asistencia SEN CheckIn',
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
export default async function RootLayout({
	children,
}: RootLayoutProps): Promise<React.ReactElement> {
	const messages = await getMessages();

	return (
		<html lang="es" suppressHydrationWarning>
			<body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
				{process.env.NODE_ENV === 'development' && (
					<Script id="strip-cursor-element-ids" strategy="beforeInteractive">
						{`
							(() => {
								try {
									const attr = 'data-cursor-element-id';
									document.querySelectorAll('[' + attr + ']').forEach((el) => {
										el.removeAttribute(attr);
									});
								} catch {
									// no-op
								}
							})();
						`}
					</Script>
				)}
				<NextIntlClientProvider locale="es" messages={messages}>
					<Providers>
						{children}
						<Toaster richColors position="top-right" />
					</Providers>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
