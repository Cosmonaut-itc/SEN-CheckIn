import Link from 'next/link';
import React, { type CSSProperties, type ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
	Building2,
	Cpu,
	LayoutDashboard,
	MapPin,
	ShieldCheck,
	Smartphone,
	Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardStack, type CardStackItem } from '@/components/aceternity/card-stack';
import { Marquee } from '@/components/marketing/marquee';
import { Reveal } from '@/components/marketing/reveal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HeroStat {
	value: string;
	label: string;
}

interface BentoCard {
	title: string;
	description: string;
	icon: LucideIcon;
	/** Tailwind col-span class */
	span: string;
}

interface StepItem {
	number: string;
	title: string;
	description: string;
}

/* ------------------------------------------------------------------ */
/*  Render helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render a gradient span for rich text translations.
 *
 * @param chunks - Text content to wrap with gradient styling
 * @returns Span element with gradient text effect
 */
function renderGradient(chunks: ReactNode): React.ReactElement {
	return (
		<span className="bg-[linear-gradient(90deg,var(--mk-copper),var(--mk-sea))] bg-clip-text text-transparent">
			{chunks}
		</span>
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
 * Render a hero metric pill with value and label.
 *
 * @param stat - Metric data to render
 * @param index - Index used for the React key
 * @returns The metric pill JSX element
 */
function renderHeroStat(stat: HeroStat, index: number): React.ReactElement {
	return (
		<div
			key={`${stat.label}-${index}`}
			className="rounded-full border border-black/10 bg-[color:var(--mk-paper)]/80 px-5 py-2.5 shadow-[0_12px_30px_-20px_rgba(12,24,28,0.4)] backdrop-blur dark:border-white/10 dark:bg-white/5"
		>
			<span className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
				{stat.value}
			</span>
			<span className="ml-2 text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
				{stat.label}
			</span>
		</div>
	);
}

/**
 * Render a feature card for the bento grid.
 *
 * @param card - Feature card data to render
 * @param index - Index used for animation staggering
 * @returns The bento card JSX element
 */
function renderBentoCard(card: BentoCard, index: number): React.ReactElement {
	const Icon = card.icon;

	return (
		<Reveal key={`${card.title}-${index}`} delay={index * 0.06}>
			<div
				className={`group relative h-full overflow-hidden rounded-[28px] border border-black/10 bg-[color:var(--mk-paper)]/80 p-6 shadow-[0_24px_60px_-36px_rgba(12,24,28,0.45)] backdrop-blur transition-shadow hover:shadow-[0_30px_70px_-30px_rgba(12,24,28,0.55)] dark:border-white/10 dark:bg-white/5`}
			>
				<div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-copper-soft)_0%,transparent_70%)] opacity-50 transition-opacity group-hover:opacity-80 dark:opacity-30 dark:group-hover:opacity-50" />

				<div className="relative flex h-full flex-col gap-4">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/5 bg-[color:var(--mk-sea-soft)] text-[color:var(--mk-sea)] shadow-[0_10px_20px_-14px_rgba(31,111,107,0.6)] dark:border-white/10 dark:bg-[#10201f] dark:text-[#bfe8e1]">
						<Icon className="h-5 w-5" />
					</div>
					<div className="space-y-2">
						<h3 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
							{card.title}
						</h3>
						<p className="text-sm leading-relaxed text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
							{card.description}
						</p>
					</div>
				</div>
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
			className="flex items-start gap-3 text-sm text-[#cdd6cf]"
		>
			<span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--mk-copper)] shadow-[0_0_0_4px_rgba(200,116,61,0.18)]" />
			<span>{item}</span>
		</li>
	);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

/**
 * Landing page component for the public marketing site.
 *
 * @returns The landing page JSX element
 */
export default async function MarketingLandingPage(): Promise<React.ReactElement> {
	const t = await getTranslations('Landing');

	/* ---- Data ---- */

	const heroStats: HeroStat[] = [
		{ value: t('hero.stats.enrollment.value'), label: t('hero.stats.enrollment.label') },
		{ value: t('hero.stats.coverage.value'), label: t('hero.stats.coverage.label') },
		{ value: t('hero.stats.flow.value'), label: t('hero.stats.flow.label') },
	];

	const marqueeItems = [
		t('marquee.items.facial'),
		t('marquee.items.attendance'),
		t('marquee.items.dashboard'),
		t('marquee.items.biometric'),
		t('marquee.items.multisite'),
		t('marquee.items.roles'),
		t('marquee.items.mobile'),
	];

	const bentoCards: BentoCard[] = [
		{
			title: t('sections.web.features.dashboard.title'),
			description: t('sections.web.features.dashboard.description'),
			icon: LayoutDashboard,
			span: 'sm:col-span-2',
		},
		{
			title: t('sections.web.features.employees.title'),
			description: t('sections.web.features.employees.description'),
			icon: Users,
			span: '',
		},
		{
			title: t('sections.mobile.features.checkin.title'),
			description: t('sections.mobile.features.checkin.description'),
			icon: Smartphone,
			span: '',
		},
		{
			title: t('sections.web.features.locations.title'),
			description: t('sections.web.features.locations.description'),
			icon: MapPin,
			span: '',
		},
		{
			title: t('sections.mobile.features.devices.title'),
			description: t('sections.mobile.features.devices.description'),
			icon: Cpu,
			span: '',
		},
		{
			title: t('sections.web.features.audit.title'),
			description: t('sections.web.features.audit.description'),
			icon: ShieldCheck,
			span: '',
		},
		{
			title: t('sections.mobile.features.locations.title'),
			description: t('sections.mobile.features.locations.description'),
			icon: Building2,
			span: 'sm:col-span-2',
		},
	];

	const steps: StepItem[] = [
		{
			number: '01',
			title: t('sections.how.steps.enroll.title'),
			description: t('sections.how.steps.enroll.description'),
		},
		{
			number: '02',
			title: t('sections.how.steps.verify.title'),
			description: t('sections.how.steps.verify.description'),
		},
		{
			number: '03',
			title: t('sections.how.steps.record.title'),
			description: t('sections.how.steps.record.description'),
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

	const heroTitle = t.rich('hero.title', { gradient: renderGradient });
	const privacyNote = t.rich('sections.security.note', { link: renderPrivacyLink });

	const themeStyle = {
		'--mk-hero-glow': '#f1d7bf',
		'--mk-hero-water': '#d6efe8',
		'--mk-hero-ember': '#c8743d',
	} as CSSProperties;

	/* ---- Render ---- */

	return (
		<div style={themeStyle} className="relative overflow-hidden">
			{/* Ambient glows */}
			<div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-glow)_0%,transparent_70%)] opacity-70 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-water)_0%,transparent_70%)] opacity-60 blur-3xl" />
			<div className="pointer-events-none absolute right-0 top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,var(--mk-hero-ember)_0%,transparent_70%)] opacity-30 blur-3xl" />

			{/* ─── HERO ─── */}
			<section className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-24 text-center">
				<Reveal delay={0.05}>
					<p className="mx-auto mb-6 w-fit rounded-full border border-black/10 bg-[color:var(--mk-copper-soft)]/70 px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--mk-ink)] dark:border-white/10 dark:bg-[#2a1b12] dark:text-[#f0b78a]">
						{t('hero.kicker')}
					</p>
				</Reveal>

				<Reveal delay={0.1}>
					<h1 className="mx-auto max-w-4xl font-[var(--font-display)] text-[clamp(3rem,7vw,5.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
						{heroTitle}
					</h1>
				</Reveal>

				<Reveal delay={0.15}>
					<p className="mx-auto mt-6 max-w-2xl text-base text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-lg">
						{t('hero.subtitle')}
					</p>
				</Reveal>

				<Reveal delay={0.2}>
					<div className="mt-8 flex flex-wrap justify-center gap-3">
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
				</Reveal>

				<Reveal delay={0.25}>
					<div className="mt-10 flex flex-wrap justify-center gap-3">
						{heroStats.map(renderHeroStat)}
					</div>
				</Reveal>
			</section>

			{/* ─── MARQUEE STRIP ─── */}
			<section className="border-y border-black/10 bg-[color:var(--mk-paper)]/60 py-4 dark:border-white/10 dark:bg-white/[0.02]">
				<Marquee duration={35} pauseOnHover>
					{marqueeItems.map((item, i) => (
						<span key={`${item}-${i}`} className="flex items-center">
							<span className="px-6 text-sm font-semibold uppercase tracking-[0.3em] text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
								{item}
							</span>
							<span className="h-1.5 w-1.5 rounded-full bg-[color:var(--mk-copper)] opacity-60" />
						</span>
					))}
				</Marquee>
			</section>

			{/* ─── BENTO GRID ─── */}
			<section className="mx-auto w-full max-w-6xl space-y-10 px-4 py-20">
				<Reveal>
					<div className="space-y-3 text-center">
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('sections.bento.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7] sm:text-4xl">
							{t('sections.bento.title')}
						</h2>
						<p className="mx-auto max-w-xl text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
							{t('sections.bento.subtitle')}
						</p>
					</div>
				</Reveal>

				<div className="grid gap-4 sm:grid-cols-3">
					{bentoCards.map((card, i) => (
						<div key={`${card.title}-wrapper-${i}`} className={card.span}>
							{renderBentoCard(card, i)}
						</div>
					))}
				</div>
			</section>

			{/* ─── HOW IT WORKS ─── */}
			<section className="mx-auto w-full max-w-6xl space-y-12 px-4 pb-20">
				<Reveal>
					<div className="space-y-3 text-center">
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('sections.how.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7] sm:text-4xl">
							{t('sections.how.title')}
						</h2>
						<p className="mx-auto max-w-xl text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
							{t('sections.how.subtitle')}
						</p>
					</div>
				</Reveal>

				<div className="relative grid gap-8 lg:grid-cols-3">
					{/* Connecting dashed line */}
					<div className="pointer-events-none absolute left-0 right-0 top-16 hidden h-px border-t-2 border-dashed border-black/10 dark:border-white/10 lg:block" />

					{steps.map((step, i) => (
						<Reveal key={`step-${step.number}`} delay={i * 0.1}>
							<div className="relative text-center">
								<p className="font-[var(--font-display)] text-[5rem] font-bold leading-none tracking-[-0.04em] text-[color:var(--mk-copper-soft)] dark:text-[#2a1b12]">
									{step.number}
								</p>
								<div className="relative -mt-4 space-y-3">
									<h3 className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7]">
										{step.title}
									</h3>
									<p className="mx-auto max-w-xs text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf]">
										{step.description}
									</p>
								</div>
							</div>
						</Reveal>
					))}
				</div>
			</section>

			{/* ─── DARK TRUST SECTION ─── */}
			<section className="relative overflow-hidden bg-[#0e2226] py-20 dark:bg-[#080f11]">
				<div className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(31,111,107,0.25)_0%,transparent_70%)] blur-3xl" />
				<div className="pointer-events-none absolute -right-20 bottom-0 h-60 w-60 rounded-full bg-[radial-gradient(circle_at_center,rgba(200,116,61,0.2)_0%,transparent_70%)] blur-3xl" />

				<div className="relative mx-auto w-full max-w-6xl gap-12 px-4 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<Reveal className="space-y-5">
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#7fe0d6]">
							{t('sections.security.kicker')}
						</p>
						<h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[#f4efe7] sm:text-4xl">
							{t('sections.security.title')}
						</h2>
						<p className="text-sm text-[#cdd6cf] sm:text-base">
							{t('sections.security.subtitle')}
						</p>
						<ul className="space-y-3 pt-2">{securityItems.map(renderSecurityItem)}</ul>
						<p className="text-sm text-[#cdd6cf]">{privacyNote}</p>
					</Reveal>

					<Reveal className="mt-12 lg:mt-0" delay={0.1}>
						<CardStack items={testimonials} className="mx-auto lg:mx-0" />
					</Reveal>
				</div>
			</section>

			{/* ─── CTA ─── */}
			<section className="relative overflow-hidden">
				<div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(242,210,181,0.55)_0%,rgba(215,239,233,0.5)_50%,rgba(248,241,231,0.9)_100%)] dark:bg-[linear-gradient(135deg,rgba(42,27,18,0.75)_0%,rgba(16,25,27,0.95)_50%,rgba(16,25,27,0.9)_100%)]" />
				<div className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center">
					<Reveal>
						<p className="text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mk-copper)] dark:text-[#f0b78a]">
							{t('cta.kicker')}
						</p>
						<h2 className="mx-auto mt-4 max-w-3xl font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[color:var(--mk-ink)] dark:text-[#f4efe7] sm:text-4xl lg:text-5xl">
							{t('cta.title')}
						</h2>
						<p className="mx-auto mt-4 max-w-xl text-sm text-[color:var(--mk-ink-soft)] dark:text-[#cdd6cf] sm:text-base">
							{t('cta.subtitle')}
						</p>
						<div className="mt-8 flex flex-wrap justify-center gap-3">
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
					</Reveal>
				</div>
			</section>
		</div>
	);
}
