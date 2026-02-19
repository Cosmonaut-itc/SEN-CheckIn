import type { Metadata } from 'next';
import Script from 'next/script';
import React, { type ReactNode } from 'react';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { DeploymentUpdateToast } from '@/components/deployment-update-toast';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from './providers';
import './globals.css';

/**
 * DM Sans font configuration for body text.
 */
const dmSans = DM_Sans({
	variable: '--font-dm-sans',
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
});

/**
 * Playfair Display font configuration for display typography.
 */
const playfairDisplay = Playfair_Display({
	variable: '--font-playfair-display',
	subsets: ['latin'],
	weight: ['400', '700', '800'],
});

/**
 * JetBrains Mono font configuration for code/monospace text.
 */
const jetBrainsMono = JetBrains_Mono({
	variable: '--font-jetbrains-mono',
	subsets: ['latin'],
	weight: ['400', '500'],
});

/**
 * Application metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
	title: 'jale. by SEN - Portal de Administración',
	description: 'Portal de administración para el sistema de asistencia jale. by SEN',
	applicationName: 'jale. by SEN',
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
			<body
				className={`${dmSans.variable} ${playfairDisplay.variable} ${jetBrainsMono.variable} font-sans antialiased`}
			>
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
						<DeploymentUpdateToast />
						<Toaster richColors position="top-right" />
					</Providers>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
