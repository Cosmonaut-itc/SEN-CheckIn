import type { Metadata } from 'next';
import Link from 'next/link';
import React from 'react';
import { getTranslations } from 'next-intl/server';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Generate metadata for the registration page.
 *
 * @returns Metadata for the registration page
 */
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Registration');

	return {
		title: t('metadata.title'),
		description: t('metadata.description'),
	};
}

/**
 * Registration placeholder page.
 * Shows an informational message while sign-ups are unavailable.
 *
 * @returns The registration page JSX element
 */
export default async function RegistrationPage(): Promise<React.ReactElement> {
	const t = await getTranslations('Registration');

	return (
		<section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-20">
			<div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_top_left,var(--accent-primary-light)_0%,transparent_60%),radial-gradient(900px_circle_at_bottom_right,var(--accent-secondary-light)_0%,transparent_55%)] opacity-70 dark:opacity-40" />
			<BackgroundBeams className="opacity-55" />
			<div className="relative z-10 mx-auto w-full max-w-2xl space-y-6 rounded-[36px] border border-black/10 bg-[color:var(--bg-secondary)]/85 p-8 text-center shadow-[0_35px_80px_-50px_rgba(12,24,28,0.6)] backdrop-blur dark:border-[color:var(--border-default)]/40 dark:bg-[color:var(--bg-elevated)]/60">
				<Badge className="mx-auto w-fit rounded-full border border-black/10 bg-[color:var(--accent-primary-light)]/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--text-primary)] dark:border-[color:var(--border-default)]/40 dark:bg-[var(--accent-primary-bg)] dark:text-[color:var(--accent-primary-light)]">
					{t('badge')}
				</Badge>
				<div className="space-y-3">
					<h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--text-primary)] dark:text-[color:var(--text-primary)] sm:text-4xl">
						{t('title')}
					</h1>
					<p className="text-sm text-[color:var(--text-tertiary)] dark:text-[color:var(--text-tertiary)] sm:text-base">
						{t('subtitle')}
					</p>
				</div>
				<div className="rounded-[24px] border border-black/10 bg-[color:var(--accent-primary-light)]/60 p-4 text-sm text-[color:var(--text-primary)] dark:border-[color:var(--border-default)]/40 dark:bg-[var(--accent-primary-bg)] dark:text-[color:var(--text-primary)]">
					{t('notice')}
				</div>
				<div className="flex flex-wrap justify-center gap-3">
					<Button
						asChild
						size="lg"
						className="rounded-full bg-[color:var(--text-primary)] text-[color:var(--bg-primary)] shadow-[0_18px_45px_-28px_rgba(12,24,28,0.7)] hover:bg-[color:var(--bg-inverse)] dark:bg-[color:var(--bg-inverse)] dark:text-[color:var(--text-inverse)] dark:hover:bg-[color:var(--bg-secondary)]"
					>
						<Link href="/login">{t('actions.login')}</Link>
					</Button>
					<Button
						asChild
						size="lg"
						variant="outline"
						className="rounded-full border-black/20 text-[color:var(--text-primary)] hover:bg-black/5 dark:border-white/20 dark:text-[color:var(--text-primary)] dark:hover:bg-[color:var(--bg-secondary)]/10"
					>
						<Link href="/">{t('actions.home')}</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
