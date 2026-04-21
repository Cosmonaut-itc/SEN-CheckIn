'use client';

import React from 'react';
import { Cloud, CloudRain, CloudSun, SunMedium } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { WeatherRecord } from '@/lib/client-functions';

type WeatherIconComponent = React.ComponentType<{ className?: string }>;

/**
 * Props for the WeatherCard component.
 */
interface WeatherCardProps {
	weather: WeatherRecord[];
	isLoading: boolean;
}

/**
 * Icon configuration for a normalized weather condition.
 */
interface WeatherIconConfig {
	icon: WeatherIconComponent;
	iconClassName: string;
	testId: string;
}

const PARTLY_CLOUDY_PATTERNS: readonly string[] = [
	'parcial',
	'interval',
	'mezcl',
	'nubes y sol',
	'clouds and sun',
	'sun and clouds',
	'partly',
	'sunny intervals',
	'sol y nube',
];

const SUN_PATTERNS: readonly string[] = ['sol', 'sun'];

const CLEAR_PATTERNS: readonly string[] = ['cielo claro', 'despej', 'solead', 'sunny', 'clear'];

const CLOUD_PATTERNS: readonly string[] = ['nubl', 'cloud', 'nube'];

/**
 * Normalizes a weather condition string for matching.
 *
 * @param condition - Raw weather condition string
 * @returns Lowercased, trimmed condition value
 */
function normalizeCondition(condition: string): string {
	return condition.trim().toLowerCase();
}

/**
 * Determines whether a normalized condition includes any matching pattern.
 *
 * @param normalizedCondition - Lowercased, trimmed weather condition string
 * @param patterns - Condition fragments to match against
 * @returns Whether any pattern is present in the condition
 */
function includesAnyPattern(normalizedCondition: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) => normalizedCondition.includes(pattern));
}

/**
 * Selects the most appropriate icon for a weather condition.
 *
 * @param condition - Raw weather condition string
 * @returns Weather icon configuration
 */
function getWeatherIconConfig(condition: string): WeatherIconConfig {
	const normalizedCondition = normalizeCondition(condition);
	const hasSunTerms = includesAnyPattern(normalizedCondition, SUN_PATTERNS);
	const hasCloudTerms = includesAnyPattern(normalizedCondition, CLOUD_PATTERNS);

	if (
		normalizedCondition.includes('lluv') ||
		normalizedCondition.includes('rain') ||
		normalizedCondition.includes('chubasc')
	) {
		return {
			icon: CloudRain,
			iconClassName: 'text-sky-500',
			testId: 'weather-icon-lluvia',
		};
	}

	if (includesAnyPattern(normalizedCondition, PARTLY_CLOUDY_PATTERNS)) {
		return {
			icon: CloudSun,
			iconClassName: 'text-amber-500',
			testId: 'weather-icon-parcialmente-nublado',
		};
	}

	if ((hasSunTerms && hasCloudTerms) || (includesAnyPattern(normalizedCondition, CLEAR_PATTERNS) && hasCloudTerms)) {
		return {
			icon: CloudSun,
			iconClassName: 'text-amber-500',
			testId: 'weather-icon-parcialmente-nublado',
		};
	}

	if (includesAnyPattern(normalizedCondition, CLEAR_PATTERNS)) {
		return {
			icon: SunMedium,
			iconClassName: 'text-amber-500',
			testId: 'weather-icon-cielo-claro',
		};
	}

	if (hasCloudTerms) {
		return {
			icon: Cloud,
			iconClassName: 'text-slate-500',
			testId: 'weather-icon-nubes',
		};
	}

	return {
		icon: Cloud,
		iconClassName: 'text-slate-500',
		testId: 'weather-icon-nubes',
	};
}

/**
 * Formats the weather range for display.
 *
 * @param low - Daily low temperature
 * @param high - Daily high temperature
 * @returns Human-readable min-max range
 */
function formatWeatherRange(low: number, high: number): string {
	return `${low}° - ${high}°`;
}

/**
 * Weather summary card for dashboard locations.
 *
 * @param props - Weather card props
 * @returns Rendered weather card
 */
export function WeatherCard({ weather, isLoading }: WeatherCardProps): React.ReactElement {
	const t = useTranslations('Dashboard');

	return (
		<Card className="gap-4 border-[color:var(--border-subtle)] py-0">
			<CardHeader className="gap-1 px-5 pt-5">
				<p className="text-[0.72rem] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
					{t('weather.eyebrow')}
				</p>
				<CardTitle>{t('weather.title')}</CardTitle>
			</CardHeader>
			<CardContent className="px-5 pb-5">
				{isLoading ? (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<div
								key={`weather-skeleton-${index}`}
								className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-4"
							>
								<Skeleton className="h-16 w-full" />
							</div>
						))}
					</div>
				) : weather.length === 0 ? (
					<div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--bg-tertiary)] px-4 py-6 text-sm text-muted-foreground">
						{t('weather.empty')}
					</div>
				) : (
					<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list">
						{weather.map((record) => {
							const iconConfig = getWeatherIconConfig(record.condition);
							const Icon = iconConfig.icon;

							return (
								<li
									key={record.locationId}
									className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-4 shadow-[var(--shadow-sm)]"
								>
									<div className="flex items-start gap-3">
										<span
											data-testid={iconConfig.testId}
											className={cn(
												'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg-tertiary)]',
												iconConfig.iconClassName,
											)}
										>
											<Icon
												data-testid={`${iconConfig.testId}-svg`}
												className="h-5 w-5"
											/>
										</span>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-foreground">
												{record.locationName}
											</p>
											<p className="mt-1 font-mono text-xs text-muted-foreground">
											{formatWeatherRange(record.low, record.high)}
											</p>
										</div>
										<p className="font-mono text-[16px] font-medium leading-none tabular-nums text-foreground">
											{record.temperature}°C
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
