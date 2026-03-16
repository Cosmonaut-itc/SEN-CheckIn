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
		<div className="relative flex min-h-screen flex-col overflow-hidden bg-[color:var(--bg-primary)] font-sans text-[color:var(--text-primary)]">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_circle_at_top_left,var(--accent-primary-light)_0%,transparent_60%),radial-gradient(900px_circle_at_bottom_right,var(--accent-secondary-light)_0%,transparent_55%)] opacity-70 dark:opacity-40" />
			<div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(90deg,rgba(12,24,28,0.18)_1px,transparent_1px),linear-gradient(180deg,rgba(12,24,28,0.18)_1px,transparent_1px)] [background-size:140px_140px] dark:opacity-[0.12]" />

			<header className="relative z-20 border-b border-black/10 bg-[color:var(--bg-primary)]/80 backdrop-blur-lg dark:border-[color:var(--border-default)]/40 dark:bg-[color:var(--bg-primary)]/80">
				<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-14 sm:gap-0">
					<Link href="/" className="flex min-w-0 items-center gap-3 sm:flex-none sm:gap-4">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--text-primary)] text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--bg-primary)] shadow-[0_12px_30px_-18px_rgba(12,24,28,0.8)] dark:bg-[color:var(--bg-inverse)] dark:text-[color:var(--text-inverse)]">
							{tApp('shortName')}
						</span>
						<div className="hidden min-w-0 leading-tight sm:block">
							<p className="truncate text-sm font-semibold text-[color:var(--text-primary)] dark:text-[color:var(--text-primary)]">
								{tApp('name')}
							</p>
							<p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-tertiary)] dark:text-[color:var(--text-tertiary)]">
								{tLanding('header.tagline')}
							</p>
						</div>
					</Link>
					<div className="ml-auto flex items-center justify-end gap-2 sm:flex-none sm:gap-3">
						<Link
							href="/privacidad"
							className="hidden text-xs uppercase tracking-[0.3em] text-[color:var(--text-tertiary)] transition hover:text-[color:var(--text-primary)] sm:inline-flex dark:text-[color:var(--text-tertiary)] dark:hover:text-white"
						>
							{tLanding('nav.privacy')}
						</Link>
						<ThemeModeToggle />
						<Button
							asChild
							variant="outline"
							data-testid="marketing-nav-sign-up"
							className="min-h-11 rounded-full border-black/20 bg-transparent px-3 text-[color:var(--text-primary)] hover:bg-black/5 sm:px-4 dark:border-white/20 dark:text-[color:var(--text-primary)] dark:hover:bg-[color:var(--bg-secondary)]/10"
						>
							<Link href="/registrate">{tLanding('nav.signUp')}</Link>
						</Button>
						<Button
							asChild
							data-testid="marketing-nav-login"
							className="min-h-11 rounded-full bg-[color:var(--text-primary)] px-3 text-[color:var(--bg-primary)] shadow-[0_16px_35px_-20px_rgba(12,24,28,0.8)] hover:bg-[color:var(--bg-inverse)] sm:px-4 dark:bg-[color:var(--bg-inverse)] dark:text-[color:var(--text-inverse)] dark:hover:bg-[color:var(--bg-secondary)]"
						>
							<Link href="/login">{tLanding('nav.login')}</Link>
						</Button>
					</div>
				</div>
			</header>

			<main className="relative z-10 flex-1">{children}</main>

			<footer className="relative z-10 border-t border-black/10 bg-[color:var(--bg-primary)]/70 py-10 dark:border-[color:var(--border-default)]/40 dark:bg-[color:var(--bg-primary)]/70">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-2">
						<p className="text-sm font-semibold text-[color:var(--text-primary)] dark:text-[color:var(--text-primary)]">
							{tApp('name')}
						</p>
						<p className="text-sm text-[color:var(--text-tertiary)] dark:text-[color:var(--text-tertiary)]">
							{tLanding('footer.tagline')}
						</p>
						<p className="text-xs text-[color:var(--text-tertiary)] dark:text-[color:var(--text-muted)]">
							{tLanding('footer.copyright', { year: currentYear })}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.3em]">
						<Link
							href="/privacidad"
							className="text-[color:var(--text-tertiary)] transition hover:text-[color:var(--text-primary)] dark:text-[color:var(--text-tertiary)] dark:hover:text-white"
						>
							{tLanding('footer.links.privacy')}
						</Link>
						<Link
							href="/login"
							className="text-[color:var(--text-tertiary)] transition hover:text-[color:var(--text-primary)] dark:text-[color:var(--text-tertiary)] dark:hover:text-white"
						>
							{tLanding('footer.links.login')}
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
