import type { Metadata } from 'next';
import Link from 'next/link';
import React, { type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Button } from '@/components/ui/button';

/**
 * Props for the MarketingLayout component.
 */
interface MarketingLayoutProps {
	/** Child components to render within the marketing layout */
	children: ReactNode;
}

/**
 * Generate metadata for the marketing pages.
 *
 * @returns Metadata for the marketing layout
 */
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Landing');

	return {
		title: t('metadata.title'),
		description: t('metadata.description'),
	};
}

/**
 * Layout component for marketing pages.
 * Provides a public header/footer and wraps the landing content.
 *
 * @param props - Component props containing children
 * @returns The marketing layout JSX element
 */
export default async function MarketingLayout({
	children,
}: MarketingLayoutProps): Promise<React.ReactElement> {
	const tApp = await getTranslations('App');
	const tLanding = await getTranslations('Landing');
	const currentYear = new Date().getFullYear();

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
			<header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
				<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
					<Link href="/" className="flex items-center gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white shadow-lg shadow-zinc-900/20 dark:bg-zinc-100 dark:text-zinc-900">
							{tApp('shortName')}
						</span>
						<div className="leading-tight">
							<p className="text-sm font-semibold">{tApp('name')}</p>
							<p className="text-xs text-muted-foreground">{tLanding('header.tagline')}</p>
						</div>
					</Link>
					<div className="flex items-center gap-2 sm:gap-3">
						<Link
							href="/privacidad"
							className="hidden text-sm text-muted-foreground transition hover:text-foreground sm:inline-flex"
						>
							{tLanding('nav.privacy')}
						</Link>
						<ThemeModeToggle />
						<Button asChild variant="outline">
							<Link href="/registrate">{tLanding('nav.signUp')}</Link>
						</Button>
						<Button asChild>
							<Link href="/login">{tLanding('nav.login')}</Link>
						</Button>
					</div>
				</div>
			</header>
			<main className="flex-1">{children}</main>
			<footer className="border-t border-zinc-200/70 bg-white/70 py-10 dark:border-zinc-800/70 dark:bg-zinc-950/70">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-2">
						<p className="text-sm font-semibold">{tApp('name')}</p>
						<p className="text-sm text-muted-foreground">{tLanding('footer.tagline')}</p>
						<p className="text-xs text-muted-foreground">
							{tLanding('footer.copyright', { year: currentYear })}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<Link
							href="/privacidad"
							className="text-muted-foreground transition hover:text-foreground"
						>
							{tLanding('footer.links.privacy')}
						</Link>
						<Link
							href="/login"
							className="text-muted-foreground transition hover:text-foreground"
						>
							{tLanding('footer.links.login')}
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
