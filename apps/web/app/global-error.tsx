'use client';

/* eslint-disable @next/next/no-html-link-for-pages */
// Note: global-error.tsx replaces the root layout, so we cannot use
// Next.js Link component as it requires the router context.

import type React from 'react';
import { useEffect } from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import messages from '@/messages/es.json';

/**
 * Props for the GlobalError component.
 */
interface GlobalErrorProps {
	/** The error that was thrown */
	error: Error & { digest?: string };
	/** Function to attempt recovery by re-rendering */
	reset: () => void;
}

/**
 * Global error boundary for the root layout.
 * Catches errors that occur in the root layout or template.
 * Must define its own html and body tags since it replaces the root layout.
 *
 * @param props - The component props
 * @returns The global error UI
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
	useEffect(() => {
		// Log the error to an error reporting service
		console.error('Global error:', error);
	}, [error]);

	return (
		<html lang="es">
			<body className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-sans antialiased">
				<NextIntlClientProvider locale="es" messages={messages}>
					<GlobalErrorContent error={error} reset={reset} />
				</NextIntlClientProvider>
			</body>
		</html>
	);
}

/**
 * Inner global error UI with translation access.
 *
 * @param props - Global error props
 * @returns Global error UI content
 */
function GlobalErrorContent({ error, reset }: GlobalErrorProps): React.ReactElement {
	const t = useTranslations('Errors.Global');

	return (
		<div className="w-full max-w-md space-y-6 text-center">
			{/* Error icon */}
			<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<svg
					className="h-8 w-8 text-destructive"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>

			{/* Error message */}
			<div className="space-y-2">
				<h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
				<p className="text-muted-foreground">{t('description')}</p>
				{error.digest && (
					<p className="text-xs text-muted-foreground">
						{t('errorId', { id: error.digest })}
					</p>
				)}
			</div>

			{/* Action buttons */}
			<div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
				<button
					onClick={reset}
					className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{t('tryAgain')}
				</button>
				<a
					href="/"
					className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{t('goHome')}
				</a>
			</div>
		</div>
	);
}
