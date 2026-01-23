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
		<div
			key={`${stat.label}-${index}`}
			className="rounded-[22px] border border-black/10 bg-[color:var(--mk-paper)]/80 p-4 shadow-[0_18px_40px_-28px_rgba(12,24,28,0.45)] backdrop-blur dark:border-white/10 dark:bg-white/5"
		>
			<p className="font-[var(--font-display)] text-2xl font-semibold leading-none tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
				{stat.value}
			</p>
			<p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
				{stat.label}
			</p>
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
			<Card className="relative h-full overflow-hidden rounded-[28px] border border-black/10 bg-[color:var(--mk-paper)]/80 shadow-[0_24px_60px_-36px_rgba(12,24,28,0.45)] backdrop-blur dark:border-white/10 dark:bg-white/5">
				<div className="pointer-events-none absolute -right-12 top-6 h-24 w-24 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-copper-soft)_0%,transparent_70%)] opacity-60 dark:opacity-40" />
				<CardContent className="relative flex h-full flex-col gap-4 p-5">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/5 bg-[color:var(--mk-sea-soft)] text-[color:var(--mk-sea)] shadow-[0_10px_20px_-14px_rgba(31,111,107,0.6)] dark:border-white/10 dark:bg-[#10201f] dark:text-[#bfe8e1]">
						<Icon className="h-5 w-5" />
					</div>
					<div className="space-y-2">
						<h3 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{feature.title}
						</h3>
						<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
							{feature.description}
						</p>
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
			<div className="rounded-[24px] border border-dashed border-black/15 bg-[color:var(--mk-paper)]/70 p-5 shadow-[0_20px_40px_-30px_rgba(12,24,28,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/5">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-[color:var(--mk-copper-soft)] text-[color:var(--mk-copper)] shadow-[0_10px_20px_-14px_rgba(200,116,61,0.45)] dark:border-white/10 dark:bg-[#2a1b12] dark:text-[#f0b78a]">
						<Icon className="h-5 w-5" />
					</div>
					<h3 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
						{step.title}
					</h3>
				</div>
				<p className="mt-3 text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
					{step.description}
				</p>
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
			className="flex items-start gap-3 text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]"
		>
			<span className="mt-2 h-2.5 w-2.5 rounded-full bg-[color:var(--mk-copper)] shadow-[0_0_0_4px_rgba(200,116,61,0.18)]" />
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
			className="font-semibold text-[color:var(--mk-copper)] underline-offset-4 hover:underline dark:text-[#f0b78a]"
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
		'--mk-hero-glow': '#f1d7bf',
		'--mk-hero-water': '#d6efe8',
		'--mk-hero-ember': '#c8743d',
	} as CSSProperties;

	const privacyNote = t.rich('sections.security.note', {
		link: renderPrivacyLink,
	});

	return (
		<div style={themeStyle} className="relative overflow-hidden">
			<div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-glow)_0%,transparent_70%)] opacity-70 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-water)_0%,transparent_70%)] opacity-60 blur-3xl" />
			<div className="pointer-events-none absolute right-0 top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-ember)_0%,transparent_70%)] opacity-30 blur-3xl" />

			<section className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
				<Reveal className="space-y-6" delay={0.05}>
					<Badge className="w-fit rounded-full border border-black/10 bg-[color:var(--mk-copper-soft)]/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--mk-ink)] dark:border-white/10 dark:bg-[#2a1b12] dark:text-[#f0b78a]">
						{t('hero.kicker')}
					</Badge>
					<div className="space-y-4">
						<h1 className="font-[var(--font-display)] text-[clamp(2.6rem,5vw,4.6rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{t('hero.title')}
						</h1>
						<p className="max-w-xl text-base text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-lg">
							{t('hero.subtitle')}
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button
							asChild
							size="lg"
							className="rounded-full bg-[color:var(--mk-ink)] text-[color:var(--mk-cream)] shadow-[0_18px_45px_-28px_rgba(12,24,28,0.7)] hover:bg-[#0b1b1d] dark:bg-[#f4efe7] dark:text-[#0a1213] dark:hover:bg-white"
						>
							<Link href="/login">{t('hero.primaryCta')}</Link>
						</Button>
						<Button
							asChild
							size="lg"
							variant="outline"
							className="rounded-full border-black/20 text-[color:var(--mk-ink)] hover:bg-black/5 dark:border-white/20 dark:text-[#f4efe7] dark:hover:bg-white/10"
						>
							<Link href="/privacidad">{t('hero.secondaryCta')}</Link>
						</Button>
					</div>
					<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">{privacyNote}</p>
					<div className="grid gap-3 sm:grid-cols-3">{heroStats.map(renderHeroStat)}</div>
				</Reveal>

				<Reveal className="relative" delay={0.15}>
					<div className="relative rounded-[32px] border border-black/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.9)_0%,rgba(248,241,231,0.75)_100%)] p-6 shadow-[0_30px_80px_-50px_rgba(12,24,28,0.6)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(16,25,27,0.92)_0%,rgba(12,18,19,0.9)_100%)]">
						<div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[linear-gradient(120deg,rgba(200,116,61,0.12),transparent,rgba(31,111,107,0.12))] dark:opacity-70" />
						<div className="relative flex items-center justify-between">
							<p className="text-sm font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
								{t('hero.panel.title')}
							</p>
							<span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-[color:var(--mk-ink-soft)] dark:border-white/10 dark:bg-white/10 dark:text-[#cdd6cf]">
								{t('hero.panel.badge')}
							</span>
						</div>
						<div className="relative mt-6 grid gap-4">
							<div className="flex items-center justify-between rounded-[22px] border border-black/10 bg-white/90 p-4 shadow-[0_10px_25px_-18px_rgba(12,24,28,0.35)] dark:border-white/10 dark:bg-white/5">
								<div>
									<p className="text-xs uppercase tracking-[0.2em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
										{t('hero.panel.present.label')}
									</p>
									<p className="font-[var(--font-display)] text-2xl font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
										{t('hero.panel.present.value')}
									</p>
								</div>
								<span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
									{t('hero.panel.present.delta')}
								</span>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-[22px] border border-black/10 bg-white/90 p-4 dark:border-white/10 dark:bg-white/5">
									<p className="text-xs uppercase tracking-[0.2em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
										{t('hero.panel.devices.label')}
									</p>
									<p className="font-[var(--font-display)] text-lg font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
										{t('hero.panel.devices.value')}
									</p>
								</div>
								<div className="rounded-[22px] border border-black/10 bg-white/90 p-4 dark:border-white/10 dark:bg-white/5">
									<p className="text-xs uppercase tracking-[0.2em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
										{t('hero.panel.locations.label')}
									</p>
									<p className="font-[var(--font-display)] text-lg font-semibold text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
										{t('hero.panel.locations.value')}
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className="absolute -bottom-8 -left-8 hidden max-w-[220px] rounded-[24px] border border-black/10 bg-[color:var(--mk-paper)]/90 p-4 shadow-[0_20px_45px_-30px_rgba(12,24,28,0.6)] backdrop-blur dark:border-white/10 dark:bg-white/5 lg:block">
						<p className="text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('hero.pill.title')}
						</p>
						<p className="mt-2 text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
							{t('hero.pill.description')}
						</p>
					</div>
				</Reveal>
			</section>

			<section className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-16">
				<Reveal>
					<div className="space-y-3">
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('sections.web.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{t('sections.web.title')}
						</h2>
						<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
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
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-sea)] dark:text-[#7fe0d6]">
							{t('sections.mobile.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{t('sections.mobile.title')}
						</h2>
						<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
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
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('sections.how.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{t('sections.how.title')}
						</h2>
						<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
							{t('sections.how.subtitle')}
						</p>
					</div>
				</Reveal>
				<div className="grid gap-4 lg:grid-cols-3">{steps.map(renderStepCard)}</div>
			</section>

			<section className="mx-auto w-full max-w-6xl gap-10 px-4 pb-16 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
				<Reveal className="space-y-4">
					<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-sea)] dark:text-[#7fe0d6]">
						{t('sections.security.kicker')}
					</p>
					<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
						{t('sections.security.title')}
					</h2>
					<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
						{t('sections.security.subtitle')}
					</p>
					<ul className="space-y-3">{securityItems.map(renderSecurityItem)}</ul>
					<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">{privacyNote}</p>
				</Reveal>
				<Reveal className="mt-10 lg:mt-0" delay={0.1}>
					<CardStack items={testimonials} className="mx-auto lg:mx-0" />
				</Reveal>
			</section>

			<section className="mx-auto w-full max-w-6xl px-4 pb-20">
				<Reveal>
					<div className="rounded-[36px] border border-black/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.92)_0%,rgba(242,210,181,0.55)_45%,rgba(215,239,233,0.5)_100%)] p-8 shadow-[0_35px_80px_-50px_rgba(12,24,28,0.6)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(16,25,27,0.9)_0%,rgba(42,27,18,0.75)_45%,rgba(16,25,27,0.95)_100%)]">
						<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
							<div className="space-y-3">
								<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
									{t('cta.kicker')}
								</p>
								<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
									{t('cta.title')}
								</h2>
								<p className="text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
									{t('cta.subtitle')}
								</p>
							</div>
							<div className="flex flex-wrap gap-3 lg:justify-end">
								<Button
									asChild
									size="lg"
									className="rounded-full bg-[color:var(--mk-ink)] text-[color:var(--mk-cream)] shadow-[0_18px_45px_-28px_rgba(12,24,28,0.7)] hover:bg-[#0b1b1d] dark:bg-[#f4efe7] dark:text-[#0a1213] dark:hover:bg-white"
								>
									<Link href="/login">{t('cta.primary')}</Link>
								</Button>
								<Button
									asChild
									size="lg"
									variant="outline"
									className="rounded-full border-black/20 text-[color:var(--mk-ink)] hover:bg-black/5 dark:border-white/20 dark:text-[#f4efe7] dark:hover:bg-white/10"
								>
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
