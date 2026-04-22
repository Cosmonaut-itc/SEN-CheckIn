'use client';

import React, { useMemo } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Location data rendered in the rail.
 */
interface LocationRailLocation {
	id: string;
	name: string;
	code: string;
	latitude: number | null;
	longitude: number | null;
	presentCount: number;
	employeeCount: number;
}

/**
 * Props for the LocationRail component.
 */
export interface LocationRailProps {
	locations: LocationRailLocation[];
	activeLocationId: string | null;
	hoveredLocationId: string | null;
	onLocationClick: (id: string) => void;
	onLocationHover: (id: string | null) => void;
	isLoading: boolean;
	search: string;
	onSearchChange: (value: string) => void;
	className?: string;
}

/**
 * Filters locations by name or code using a normalized search string.
 *
 * @param locations - Location list to filter.
 * @param search - Raw search input value.
 * @returns Filtered location list.
 */
function filterLocations(locations: LocationRailLocation[], search: string): LocationRailLocation[] {
	const normalizedSearch = search.trim().toLowerCase();

	if (!normalizedSearch) {
		return locations;
	}

	return locations.filter((location) => {
		return (
			location.name.toLowerCase().includes(normalizedSearch) ||
			location.code.toLowerCase().includes(normalizedSearch)
		);
	});
}

/**
 * Determines whether a location card is visually active.
 *
 * @param activeLocationId - Selected location identifier.
 * @param locationId - Current location identifier.
 * @returns True when the location is active.
 */
function isLocationActive(activeLocationId: string | null, locationId: string): boolean {
	return activeLocationId === locationId;
}

/**
 * Determines whether a location card is currently hovered.
 *
 * @param hoveredLocationId - Hovered location identifier.
 * @param locationId - Current location identifier.
 * @returns True when the location is hovered.
 */
function isLocationHovered(hoveredLocationId: string | null, locationId: string): boolean {
	return hoveredLocationId === locationId;
}

/**
 * Determines whether a blur event is moving focus to another location card.
 *
 * @param nextFocusedElement - Related target from the blur event.
 * @returns True when the next focused element is another rail item.
 */
function shouldKeepHoveredLocation(nextFocusedElement: EventTarget | null): boolean {
	return (
		nextFocusedElement instanceof HTMLElement &&
		nextFocusedElement.closest('[data-location-rail-item="true"]') !== null
	);
}

/**
 * Dashboard location rail with search, scrollable cards and selection state.
 *
 * @param props - Component props.
 * @returns The location rail element.
 */
export function LocationRail({
	locations,
	activeLocationId,
	hoveredLocationId,
	onLocationClick,
	onLocationHover,
	isLoading,
	search,
	onSearchChange,
	className,
}: LocationRailProps): React.ReactElement {
	const t = useTranslations('Dashboard');
	const tCommon = useTranslations('Common');
	const tDataTable = useTranslations('DataTable');

	const filteredLocations = useMemo(
		() => filterLocations(locations, search),
		[locations, search],
	);

	const isEmptyState = !isLoading && filteredLocations.length === 0;

	return (
		<Card
			data-testid="location-rail"
			className={cn(
				'flex min-h-0 flex-col overflow-hidden border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,var(--bg-primary)_0%,var(--bg-secondary)_100%)] py-0 shadow-[var(--shadow-sm)]',
				className,
			)}
		>
			<CardHeader className="space-y-4 border-b border-[color:var(--border-subtle)] px-5 py-5">
				<div className="space-y-1">
					<p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--accent-primary)]">
						{t('locationRail.eyebrow')}
					</p>
					<CardTitle className="text-xl">{t('locationRail.title')}</CardTitle>
				</div>

				<div className="relative">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label={tCommon('search')}
						placeholder={t('locationRail.searchPlaceholder')}
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						className="min-h-11 pl-9"
					/>
				</div>
			</CardHeader>

			<CardContent className="min-h-0 flex-1 p-0">
				<div className="h-full min-h-0 overflow-y-auto">
					<div className="space-y-3 p-4">
						{isLoading ? (
							<div
								data-testid="location-rail-loading"
								aria-busy="true"
								aria-live="polite"
								className="space-y-3"
							>
								<span className="sr-only">{tCommon('loading')}</span>
								{Array.from({ length: 4 }).map((_, index) => (
									<div
										key={`location-rail-skeleton-${index}`}
										data-testid="location-rail-skeleton-card"
										className="rounded-2xl border border-[color:var(--border-subtle)] bg-background/80 p-4"
									>
										<div className="flex items-start gap-4">
											<div className="min-w-[5.5rem] space-y-2">
												<Skeleton className="h-9 w-20" />
												<Skeleton className="h-3 w-14" />
											</div>
											<div className="min-w-0 flex-1 space-y-3">
												<Skeleton className="h-5 w-3/5" />
												<div className="flex items-center gap-2">
													<Skeleton className="h-5 w-14 rounded-full" />
													<Skeleton className="h-5 w-24 rounded-full" />
												</div>
											</div>
											<Skeleton className="h-5 w-5 rounded-full" />
										</div>
									</div>
								))}
							</div>
						) : isEmptyState ? (
							<div
								data-testid="location-rail-empty"
								className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]/50 p-6 text-center"
							>
								<p className="text-sm text-muted-foreground">{tDataTable('empty')}</p>
							</div>
						) : (
							<ul className="space-y-3">
								{filteredLocations.map((location) => {
									const isActive = isLocationActive(activeLocationId, location.id);
									const isHovered = isLocationHovered(hoveredLocationId, location.id);
									const statusLabel =
										location.presentCount > 0
											? t('locationRail.active')
											: t('locationRail.idle');

									return (
										<li key={location.id}>
											<button
												type="button"
												data-testid={`location-rail-item-${location.id}`}
												data-location-rail-item="true"
												aria-pressed={isActive}
												onClick={() => onLocationClick(location.id)}
												onMouseEnter={() => onLocationHover(location.id)}
												onMouseLeave={(event) => {
													if (shouldKeepHoveredLocation(event.relatedTarget)) {
														return;
													}

													onLocationHover(null);
												}}
												onFocus={() => onLocationHover(location.id)}
												onBlur={(event) => {
													if (shouldKeepHoveredLocation(event.relatedTarget)) {
														return;
													}

													onLocationHover(null);
												}}
												className={cn(
													'group w-full rounded-2xl border border-[color:var(--border-subtle)] bg-background/80 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)]/30',
													!isActive &&
														!isHovered &&
														'hover:-translate-y-0.5 hover:bg-[color:var(--bg-secondary)] hover:shadow-[var(--shadow-sm)]',
													isHovered &&
														'bg-[color:var(--bg-secondary)] shadow-[var(--shadow-sm)]',
													isActive &&
														'border-[color:var(--accent-primary)]/35 bg-[var(--accent-primary-bg)] shadow-[var(--shadow-sm)]',
												)}
											>
												<div className="flex items-start gap-4">
													<div className="min-w-[5.5rem] space-y-1">
														<p className="text-3xl font-semibold leading-none tabular-nums text-foreground">
															{t('locationRail.capacity', {
																present: location.presentCount,
																total: location.employeeCount,
															})}
														</p>
													</div>

													<div className="min-w-0 flex-1 space-y-2">
														<div className="flex min-w-0 items-start justify-between gap-3">
															<div className="min-w-0 space-y-1">
																<p className="truncate text-base font-semibold">
																	{location.name}
																</p>
																<Badge
																	variant="outline"
																	className="w-fit"
																>
																	{location.code}
																</Badge>
															</div>

															<Badge
																variant={
																	location.presentCount > 0
																		? 'success'
																		: 'neutral'
																}
															>
																{statusLabel}
															</Badge>
														</div>
													</div>

													<ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
												</div>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
