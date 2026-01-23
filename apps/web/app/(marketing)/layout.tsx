import type { Metadata } from 'next';
import Link from 'next/link';
import React, { type CSSProperties, type ReactNode } from 'react';
import { Bricolage_Grotesque, Spline_Sans } from 'next/font/google';
import { getTranslations } from 'next-intl/server';
import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Button } from '@/components/ui/button';

const displayFont = Bricolage_Grotesque({
	subsets: ['latin'],
	weight: ['500', '600', '700', '800'],
	variable: '--font-display',
});

const bodyFont = Spline_Sans({
	subsets: ['latin'],
	weight: ['400', '500', '600'],
	variable: '--font-body',
});

const marketingTheme = {
	'--mk-ink': '#0e2226',
	'--mk-ink-soft': '#29373b',
	'--mk-cream': '#f8f1e7',
	'--mk-paper': '#fdf7ee',
	'--mk-copper': '#c8743d',
	'--mk-copper-soft': '#f2d2b5',
	'--mk-sea': '#1f6f6b',
	'--mk-sea-soft': '#d7efe9',
	'--mk-line': 'rgba(15, 25, 28, 0.12)',
	'--mk-shadow': 'rgba(12, 24, 28, 0.2)',
} as CSSProperties;

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
		<div
			style={marketingTheme}
			className={`${bodyFont.variable} ${displayFont.variable} relative flex min-h-screen flex-col overflow-hidden bg-[color:var(--mk-cream)] font-[var(--font-body)] text-[color:var(--mk-ink)] dark:bg-[#0a1213] dark:text-[#f4efe7]`}
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_circle_at_top_left,var(--mk-copper-soft)_0%,transparent_60%),radial-gradient(900px_circle_at_bottom_right,var(--mk-sea-soft)_0%,transparent_55%)] opacity-70 dark:opacity-40" />
			<div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(90deg,rgba(12,24,28,0.18)_1px,transparent_1px),linear-gradient(180deg,rgba(12,24,28,0.18)_1px,transparent_1px)] [background-size:140px_140px] dark:opacity-[0.12]" />

			<header className="relative z-20 border-b border-black/10 bg-[color:var(--mk-cream)]/85 backdrop-blur dark:border-white/10 dark:bg-[#0a1213]/85">
				<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
					<Link href="/" className="flex items-center gap-4">
						<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--mk-ink)] text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--mk-cream)] shadow-[0_12px_30px_-18px_rgba(12,24,28,0.8)] dark:bg-[#f4efe7] dark:text-[#0a1213]">
							{tApp('shortName')}
						</span>
						<div className="leading-tight">
							<p className="text-sm font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
								{tApp('name')}
							</p>
							<p className="text-xs uppercase tracking-[0.28em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
								{tLanding('header.tagline')}
							</p>
						</div>
					</Link>
					<div className="flex items-center gap-2 sm:gap-3">
						<Link
							href="/privacidad"
							className="hidden text-xs uppercase tracking-[0.3em] text-[color:var(--mk-ink-soft)] transition hover:text-[color:var(--mk-ink)] sm:inline-flex dark:text-[#cdd6cf] dark:hover:text-white"
						>
							{tLanding('nav.privacy')}
						</Link>
						<ThemeModeToggle />
						<Button
							asChild
							variant="outline"
							className="rounded-full border-black/20 bg-transparent text-[color:var(--mk-ink)] hover:bg-black/5 dark:border-white/20 dark:text-[#f4efe7] dark:hover:bg-white/10"
						>
							<Link href="/registrate">{tLanding('nav.signUp')}</Link>
						</Button>
						<Button
							asChild
							className="rounded-full bg-[color:var(--mk-ink)] text-[color:var(--mk-cream)] shadow-[0_16px_35px_-20px_rgba(12,24,28,0.8)] hover:bg-[#0b1b1d] dark:bg-[#f4efe7] dark:text-[#0a1213] dark:hover:bg-white"
						>
							<Link href="/login">{tLanding('nav.login')}</Link>
						</Button>
					</div>
				</div>
			</header>

			<main className="relative z-10 flex-1">{children}</main>

			<footer className="relative z-10 border-t border-black/10 bg-[color:var(--mk-cream)]/70 py-10 dark:border-white/10 dark:bg-[#0a1213]/70">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-2">
						<p className="text-sm font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{tApp('name')}
						</p>
						<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
							{tLanding('footer.tagline')}
						</p>
						<p className="text-xs text-[color:var(--mk-ink-soft)] dark:text-[#aeb8b2]">
							{tLanding('footer.copyright', { year: currentYear })}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.3em]">
						<Link
							href="/privacidad"
							className="text-[color:var(--mk-ink-soft)] transition hover:text-[color:var(--mk-ink)] dark:text-[#cdd6cf] dark:hover:text-white"
						>
							{tLanding('footer.links.privacy')}
						</Link>
						<Link
							href="/login"
							className="text-[color:var(--mk-ink-soft)] transition hover:text-[color:var(--mk-ink)] dark:text-[#cdd6cf] dark:hover:text-white"
						>
							{tLanding('footer.links.login')}
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
