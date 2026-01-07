import Link from 'next/link';
import React, { type CSSProperties, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
	Building2,
	Clock,
	Cpu,
	LayoutDashboard,
	MapPin,
	ShieldCheck,
	Smartphone,
	Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CardStack, type CardStackItem } from '@/components/aceternity/card-stack';
import { Reveal } from '@/components/marketing/reveal';

/**
 * Data model for hero metrics.
 */
interface HeroStat {
	/** Metric value */
	value: string;
	/** Metric label */
	label: string;
}

/**
 * Data model for a feature card.
 */
interface FeatureItem {
	/** Title of the feature */
	title: string;
	/** Description of the feature */
	description: string;
	/** Icon representing the feature */
	icon: LucideIcon;
}

/**
 * Data model for a step card.
 */
interface StepItem {
	/** Step title */
	title: string;
	/** Step description */
	description: string;
	/** Icon for the step */
	icon: LucideIcon;
}

/**
 * Render a hero metric with value and label.
 *
 * @param stat - Metric data to render
 * @param index - Index used for the React key
 * @returns The metric JSX element
 */
function renderHeroStat(stat: HeroStat, index: number): React.ReactElement {
	return (
		<div key={`${stat.label}-${index}`} className="space-y-1">
			<p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
				{stat.value}
			</p>
			<p className="text-xs text-muted-foreground">{stat.label}</p>
		</div>
	);
}

/**
 * Render a feature card with icon and copy.
 *
 * @param feature - Feature data to render
 * @param index - Index used for animation staggering
 * @returns The feature card JSX element
 */
function renderFeatureCard(feature: FeatureItem, index: number): React.ReactElement {
	const Icon = feature.icon;

	return (
		<Reveal key={`${feature.title}-${index}`} delay={index * 0.08}>
			<Card className="h-full border-zinc-200/80 bg-white/80 shadow-md shadow-zinc-900/5 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/60">
				<CardContent className="flex h-full flex-col gap-4">
					<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
						<Icon className="h-5 w-5" />
					</div>
					<div className="space-y-2">
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{feature.title}
						</h3>
						<p className="text-sm text-muted-foreground">{feature.description}</p>
					</div>
				</CardContent>
			</Card>
		</Reveal>
	);
}

/**
 * Render a step card for the "Cómo funciona" section.
 *
 * @param step - Step data to render
 * @param index - Index used for animation staggering
 * @returns The step card JSX element
 */
function renderStepCard(step: StepItem, index: number): React.ReactElement {
	const Icon = step.icon;

	return (
		<Reveal key={`${step.title}-${index}`} delay={index * 0.1}>
			<div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
						<Icon className="h-5 w-5" />
					</div>
					<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
						{step.title}
					</h3>
				</div>
				<p className="mt-3 text-sm text-muted-foreground">{step.description}</p>
			</div>
		</Reveal>
	);
}

/**
 * Render a list item for the security highlights list.
 *
 * @param item - Highlight text to render
 * @param index - Index used for the React key
 * @returns The list item JSX element
 */
function renderSecurityItem(item: string, index: number): React.ReactElement {
	return (
		<li
			key={`${item}-${index}`}
			className="flex items-start gap-3 text-sm text-muted-foreground"
		>
			<span className="mt-1 h-2 w-2 rounded-full bg-emerald-500/80" />
			<span>{item}</span>
		</li>
	);
}

/**
 * Render the privacy policy link for rich text translations.
 *
 * @param chunks - Translated text segments to wrap
 * @returns The linked text element
 */
function renderPrivacyLink(chunks: ReactNode): React.ReactElement {
	return (
		<Link
			href="/privacidad"
			className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
		>
			{chunks}
		</Link>
	);
}

/**
 * Landing page component for the public marketing site.
 *
 * @returns The landing page JSX element
 */
export default async function MarketingLandingPage(): Promise<React.ReactElement> {
	const t = await getTranslations('Landing');
	const heroStats: HeroStat[] = [
		{ value: t('hero.stats.enrollment.value'), label: t('hero.stats.enrollment.label') },
		{ value: t('hero.stats.coverage.value'), label: t('hero.stats.coverage.label') },
		{ value: t('hero.stats.flow.value'), label: t('hero.stats.flow.label') },
	];

	const webFeatures: FeatureItem[] = [
		{
			title: t('sections.web.features.dashboard.title'),
			description: t('sections.web.features.dashboard.description'),
			icon: LayoutDashboard,
		},
		{
			title: t('sections.web.features.employees.title'),
			description: t('sections.web.features.employees.description'),
			icon: Users,
		},
		{
			title: t('sections.web.features.locations.title'),
			description: t('sections.web.features.locations.description'),
			icon: MapPin,
		},
		{
			title: t('sections.web.features.audit.title'),
			description: t('sections.web.features.audit.description'),
			icon: ShieldCheck,
		},
	];

	const mobileFeatures: FeatureItem[] = [
		{
			title: t('sections.mobile.features.checkin.title'),
			description: t('sections.mobile.features.checkin.description'),
			icon: Smartphone,
		},
		{
			title: t('sections.mobile.features.devices.title'),
			description: t('sections.mobile.features.devices.description'),
			icon: Cpu,
		},
		{
			title: t('sections.mobile.features.locations.title'),
			description: t('sections.mobile.features.locations.description'),
			icon: Building2,
		},
	];

	const steps: StepItem[] = [
		{
			title: t('sections.how.steps.enroll.title'),
			description: t('sections.how.steps.enroll.description'),
			icon: Users,
		},
		{
			title: t('sections.how.steps.verify.title'),
			description: t('sections.how.steps.verify.description'),
			icon: Smartphone,
		},
		{
			title: t('sections.how.steps.record.title'),
			description: t('sections.how.steps.record.description'),
			icon: Clock,
		},
	];

	const securityItems = [
		t('sections.security.items.capture'),
		t('sections.security.items.processing'),
		t('sections.security.items.controls'),
	];

	const testimonials: CardStackItem[] = [
		{
			id: 1,
			name: t('sections.testimonials.cards.one.name'),
			designation: t('sections.testimonials.cards.one.role'),
			content: t('sections.testimonials.cards.one.quote'),
		},
		{
			id: 2,
			name: t('sections.testimonials.cards.two.name'),
			designation: t('sections.testimonials.cards.two.role'),
			content: t('sections.testimonials.cards.two.quote'),
		},
		{
			id: 3,
			name: t('sections.testimonials.cards.three.name'),
			designation: t('sections.testimonials.cards.three.role'),
			content: t('sections.testimonials.cards.three.quote'),
		},
	];

	const themeStyle = {
		'--landing-accent': '#0f766e',
		'--landing-accent-light': '#5eead4',
		'--landing-accent-soft': '#ecfeff',
	} as CSSProperties;

	const privacyNote = t.rich('sections.security.note', {
		link: renderPrivacyLink,
	});

	return (
		<div
			style={themeStyle}
			className="relative overflow-hidden bg-[radial-gradient(900px_circle_at_top,var(--landing-accent-soft)_0%,transparent_70%)]"
		>
			<div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,var(--landing-accent-light)_0%,transparent_70%)] opacity-30 blur-3xl" />
			<div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,var(--landing-accent)_0%,transparent_70%)] opacity-20 blur-3xl" />

			<section className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
				<Reveal className="space-y-6" delay={0.05}>
					<Badge className="w-fit bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
						{t('hero.kicker')}
					</Badge>
					<div className="space-y-4">
						<h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
							{t('hero.title')}
						</h1>
						<p className="text-base text-muted-foreground sm:text-lg">
							{t('hero.subtitle')}
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button asChild size="lg">
							<Link href="/login">{t('hero.primaryCta')}</Link>
						</Button>
						<Button asChild size="lg" variant="outline">
							<Link href="/privacidad">{t('hero.secondaryCta')}</Link>
						</Button>
					</div>
					<p className="text-sm text-muted-foreground">{privacyNote}</p>
					<div className="grid gap-4 sm:grid-cols-3">{heroStats.map(renderHeroStat)}</div>
				</Reveal>

				<Reveal className="relative" delay={0.15}>
					<div className="relative rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/60">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
								{t('hero.panel.title')}
							</p>
							<span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
								{t('hero.panel.badge')}
							</span>
						</div>
						<div className="mt-6 grid gap-4">
							<div className="flex items-center justify-between rounded-2xl border border-zinc-200/60 bg-white/90 p-4 dark:border-zinc-800/60 dark:bg-zinc-950/60">
								<div>
									<p className="text-xs text-muted-foreground">
										{t('hero.panel.present.label')}
									</p>
									<p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
										{t('hero.panel.present.value')}
									</p>
								</div>
								<span className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
									{t('hero.panel.present.delta')}
								</span>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-2xl border border-zinc-200/60 bg-white/90 p-4 dark:border-zinc-800/60 dark:bg-zinc-950/60">
									<p className="text-xs text-muted-foreground">
										{t('hero.panel.devices.label')}
									</p>
									<p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
										{t('hero.panel.devices.value')}
									</p>
								</div>
								<div className="rounded-2xl border border-zinc-200/60 bg-white/90 p-4 dark:border-zinc-800/60 dark:bg-zinc-950/60">
									<p className="text-xs text-muted-foreground">
										{t('hero.panel.locations.label')}
									</p>
									<p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
										{t('hero.panel.locations.value')}
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className="absolute -bottom-8 -left-8 hidden rounded-2xl border border-emerald-200/50 bg-white/90 p-4 shadow-xl shadow-emerald-500/15 backdrop-blur dark:border-emerald-500/30 dark:bg-zinc-950/70 lg:block">
						<p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
							{t('hero.pill.title')}
						</p>
						<p className="mt-2 text-sm text-muted-foreground">{t('hero.pill.description')}</p>
					</div>
				</Reveal>
			</section>

			<section className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16">
				<Reveal>
					<div className="space-y-3">
						<p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
							{t('sections.web.kicker')}
						</p>
						<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.web.title')}
						</h2>
						<p className="text-sm text-muted-foreground sm:text-base">
							{t('sections.web.subtitle')}
						</p>
					</div>
				</Reveal>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{webFeatures.map(renderFeatureCard)}
				</div>
			</section>

			<section className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16">
				<Reveal>
					<div className="space-y-3">
						<p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
							{t('sections.mobile.kicker')}
						</p>
						<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.mobile.title')}
						</h2>
						<p className="text-sm text-muted-foreground sm:text-base">
							{t('sections.mobile.subtitle')}
						</p>
					</div>
				</Reveal>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{mobileFeatures.map(renderFeatureCard)}
				</div>
			</section>

			<section className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16">
				<Reveal>
					<div className="space-y-3">
						<p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">
							{t('sections.how.kicker')}
						</p>
						<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.how.title')}
						</h2>
						<p className="text-sm text-muted-foreground sm:text-base">
							{t('sections.how.subtitle')}
						</p>
					</div>
				</Reveal>
				<div className="grid gap-4 lg:grid-cols-3">{steps.map(renderStepCard)}</div>
			</section>

			<section className="mx-auto w-full max-w-6xl gap-10 px-4 pb-16 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
				<Reveal className="space-y-4">
					<p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
						{t('sections.security.kicker')}
					</p>
					<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
						{t('sections.security.title')}
					</h2>
					<p className="text-sm text-muted-foreground sm:text-base">
						{t('sections.security.subtitle')}
					</p>
					<ul className="space-y-3">{securityItems.map(renderSecurityItem)}</ul>
					<p className="text-sm text-muted-foreground">{privacyNote}</p>
				</Reveal>
				<Reveal className="mt-10 lg:mt-0" delay={0.1}>
					<CardStack items={testimonials} className="mx-auto lg:mx-0" />
				</Reveal>
			</section>

			<section className="mx-auto w-full max-w-6xl px-4 pb-20">
				<Reveal>
					<div className="rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-8 shadow-xl shadow-emerald-500/10 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-zinc-950 dark:to-cyan-500/10">
						<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
							<div className="space-y-3">
								<p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
									{t('cta.kicker')}
								</p>
								<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
									{t('cta.title')}
								</h2>
								<p className="text-sm text-muted-foreground sm:text-base">
									{t('cta.subtitle')}
								</p>
							</div>
							<div className="flex flex-wrap gap-3 lg:justify-end">
								<Button asChild size="lg">
									<Link href="/login">{t('cta.primary')}</Link>
								</Button>
								<Button asChild size="lg" variant="outline">
									<Link href="/privacidad">{t('cta.secondary')}</Link>
								</Button>
							</div>
						</div>
					</div>
				</Reveal>
			</section>
		</div>
	);
}
