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
			<div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-slate-100 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-slate-950" />
			<BackgroundBeams className="opacity-70" />
			<div className="relative z-10 mx-auto w-full max-w-2xl space-y-6 rounded-3xl border border-emerald-200/60 bg-white/85 p-8 text-center shadow-xl shadow-emerald-500/10 backdrop-blur dark:border-emerald-500/20 dark:bg-zinc-950/80">
				<Badge className="mx-auto w-fit bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
					{t('badge')}
				</Badge>
				<div className="space-y-3">
					<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						{t('title')}
					</h1>
					<p className="text-sm text-muted-foreground sm:text-base">
						{t('subtitle')}
					</p>
				</div>
				<div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
					{t('notice')}
				</div>
				<div className="flex flex-wrap justify-center gap-3">
					<Button asChild size="lg">
						<Link href="/login">{t('actions.login')}</Link>
					</Button>
					<Button asChild size="lg" variant="outline">
						<Link href="/">{t('actions.home')}</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
