'use client';

import React, { useEffect, useRef } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Map as MapCanvas,
	MapMarker,
	MarkerContent,
	MarkerLabel,
	MarkerPopup,
	MarkerTooltip,
	useMap,
} from '@/components/ui/map';
import type { AttendancePresentRecord, Location } from '@/lib/client-functions';

const DEFAULT_MAP_CENTER: [number, number] = [-99.1332, 19.4326];
const DEFAULT_MAP_ZOOM = 10;
const FOCUS_MAP_ZOOM = 14;
const MAP_FIT_OPTIONS = { padding: 80, maxZoom: 15, duration: 800 } as const;

/**
 * Props for the dashboard map component.
 */
export interface DashboardMapProps {
	/** Locations with coordinates to plot on the map. */
	locations: Location[];
	/** Currently focused location, if any. */
	focusedLocation: Location | null;
	/** Attendance records grouped by location id. */
	presentByLocationId: Map<string, AttendancePresentRecord[]>;
	/** Active employee counts grouped by location id. */
	employeeCountByLocation?: Map<string, number>;
	/** Indicates when the map is rendered in the mobile hero layout. */
	isMobileLayout?: boolean;
}

/**
 * Builds a two-letter initials string for avatar fallbacks.
 *
 * @param name - Employee name or identifier.
 * @returns Uppercase initials string.
 */
function getEmployeeInitials(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return '';
	}
	const parts = trimmed.split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? '';
	const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
	return `${first}${second}`.toUpperCase();
}

/**
 * Returns the latest check-in date from the current presence records.
 *
 * @param presentRecords - Presence records for a location
 * @returns Latest check-in date or null when no records exist
 */
function getLatestCheckInAt(presentRecords: AttendancePresentRecord[]): Date | null {
	let latestCheckInAt: Date | null = null;

	for (const record of presentRecords) {
		if (!latestCheckInAt || record.checkedInAt > latestCheckInAt) {
			latestCheckInAt = record.checkedInAt;
		}
	}

	return latestCheckInAt;
}

/**
 * Returns a copy of the presence records sorted from newest to oldest check-in.
 *
 * @param presentRecords - Presence records for a location
 * @returns Presence records ordered by most recent activity first
 */
function getPresentRecordsNewestFirst(
	presentRecords: AttendancePresentRecord[],
): AttendancePresentRecord[] {
	return [...presentRecords].sort(
		(left, right) => right.checkedInAt.getTime() - left.checkedInAt.getTime(),
	);
}

/**
 * Calculates the presence percentage against assigned capacity.
 *
 * @param presentCount - Employees currently present
 * @param employeeCount - Employees assigned to the location
 * @returns Percentage clamped between 0 and 100
 */
function getCapacityPercent(presentCount: number, employeeCount: number): number {
	if (employeeCount <= 0) {
		return 0;
	}

	return Math.min(100, Math.max(0, (presentCount / employeeCount) * 100));
}

/**
 * Fits the map viewport to the provided location coordinates.
 *
 * @param map - Map instance from the map hook
 * @param locations - Locations with potential coordinates
 * @returns Whether the fit operation was applied
 */
function fitMapToLocations(
	map: {
		fitBounds: (
			bounds: [[number, number], [number, number]],
			options: typeof MAP_FIT_OPTIONS,
		) => void;
	},
	locations: Location[],
): boolean {
	let minLng = Number.POSITIVE_INFINITY;
	let maxLng = Number.NEGATIVE_INFINITY;
	let minLat = Number.POSITIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;

	for (const location of locations) {
		if (location.latitude === null || location.longitude === null) {
			continue;
		}

		minLng = Math.min(minLng, location.longitude);
		maxLng = Math.max(maxLng, location.longitude);
		minLat = Math.min(minLat, location.latitude);
		maxLat = Math.max(maxLat, location.latitude);
	}

	if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
		return false;
	}

	map.fitBounds(
		[
			[minLng, minLat],
			[maxLng, maxLat],
		],
		MAP_FIT_OPTIONS,
	);

	return true;
}

/**
 * Fits the map to include all locations with coordinates.
 *
 * @param props - Component props with locations.
 * @returns Null (binds to the map instance).
 */
function MapAutoFit({ locations }: { locations: Location[] }): null {
	const { map, isLoaded } = useMap();
	const hasFitRef = useRef(false);
	const locationSignature = locations
		.map((location) => {
			return `${location.id}:${location.latitude ?? 'null'}:${location.longitude ?? 'null'}`;
		})
		.sort()
		.join('|');

	useEffect(() => {
		hasFitRef.current = false;
	}, [locationSignature]);

	useEffect(() => {
		if (!map || !isLoaded || hasFitRef.current || locations.length === 0) {
			return;
		}

		hasFitRef.current = fitMapToLocations(map, locations);
	}, [isLoaded, locationSignature, locations, map]);

	return null;
}

/**
 * Focuses the map on a selected location when available.
 *
 * @param props - Component props with the focused location.
 * @returns Null (binds to the map instance).
 */
function MapFocus({
	location,
	locations,
}: {
	location: Location | null;
	locations: Location[];
}): null {
	const { map, isLoaded } = useMap();
	const lastLocationRef = useRef<string | null>(null);

	useEffect(() => {
		if (!map || !isLoaded) {
			return;
		}

		if (!location) {
			if (lastLocationRef.current === null) {
				return;
			}

			const didRefit = fitMapToLocations(map, locations);
			lastLocationRef.current = didRefit ? null : lastLocationRef.current;
			return;
		}

		if (location.latitude === null || location.longitude === null) {
			return;
		}

		if (lastLocationRef.current === location.id) {
			return;
		}

		map.easeTo({
			center: [location.longitude, location.latitude],
			zoom: FOCUS_MAP_ZOOM,
			duration: 700,
		});
		lastLocationRef.current = location.id;
	}, [map, isLoaded, location, locations]);

	return null;
}

/**
 * Keeps the MapLibre canvas in sync with responsive container changes.
 *
 * @param props - Layout mode used to trigger a resize pass.
 * @returns Null (binds to the map instance).
 */
function MapResizeController({ isMobileLayout }: { isMobileLayout: boolean }): null {
	const { map, isLoaded } = useMap();

	useEffect(() => {
		if (!map || !isLoaded) {
			return;
		}

		let frameId = 0;

		/**
		 * Schedules a safe map resize on the next animation frame.
		 *
		 * @returns void
		 */
		const scheduleResize = (): void => {
			cancelAnimationFrame(frameId);
			frameId = window.requestAnimationFrame(() => {
				map.resize();
			});
		};

		scheduleResize();
		window.addEventListener('resize', scheduleResize);
		window.addEventListener('orientationchange', scheduleResize);

		return () => {
			cancelAnimationFrame(frameId);
			window.removeEventListener('resize', scheduleResize);
			window.removeEventListener('orientationchange', scheduleResize);
		};
	}, [isLoaded, isMobileLayout, map]);

	return null;
}

/**
 * Dashboard map section rendered inside the dashboard page.
 *
 * @param props - Map data and selection state.
 * @returns The dashboard map JSX element.
 */
export function DashboardMap({
	locations,
	focusedLocation,
	presentByLocationId,
	employeeCountByLocation = new Map<string, number>(),
	isMobileLayout = false,
}: DashboardMapProps): React.ReactElement {
	const t = useTranslations('Dashboard');

	return (
		<div className="absolute inset-0">
			<MapCanvas center={DEFAULT_MAP_CENTER} zoom={DEFAULT_MAP_ZOOM}>
				<MapAutoFit locations={locations} />
				<MapFocus location={focusedLocation} locations={locations} />
				<MapResizeController isMobileLayout={isMobileLayout} />
				{locations.map((location) => {
					// Skip rendering if coordinates are missing (defensive check)
					if (location.latitude === null || location.longitude === null) {
						return null;
					}
					const present = presentByLocationId.get(location.id) ?? [];
					const sortedPresent = getPresentRecordsNewestFirst(present);
					const presentCount = present.length;
					const employeeCount = employeeCountByLocation.get(location.id) ?? 0;
					const latestCheckInAt = getLatestCheckInAt(present);
					const capacityPercent = getCapacityPercent(presentCount, employeeCount);
					const capacityLabel =
						employeeCount > 0
							? t('map.popup.capacity', {
									present: presentCount,
									total: employeeCount,
								})
							: t('map.popup.capacityPresentOnly', {
									present: presentCount,
								});
					const latestCheckInLabel = latestCheckInAt
						? t('map.popup.lastCheckIn', {
								time: formatDistanceToNowStrict(latestCheckInAt, {
									addSuffix: true,
									locale: es,
								}),
							})
						: t('map.popup.lastCheckInEmpty');
					return (
						<MapMarker
							key={location.id}
							longitude={location.longitude}
							latitude={location.latitude}
						>
							<MarkerContent>
								<div className="relative">
									<div className="size-4 rounded-full border-2 border-white bg-primary shadow-md" />
									<MarkerLabel>{location.name}</MarkerLabel>
								</div>
							</MarkerContent>
							<MarkerTooltip>
								{t('map.tooltip', { count: presentCount })}
							</MarkerTooltip>
							<MarkerPopup className="w-80 rounded-xl p-0 shadow-lg">
								<Card className="overflow-hidden border-[color:var(--border-subtle)] shadow-none">
									<CardContent className="space-y-4 p-4">
										<div className="space-y-3">
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<p className="truncate text-sm font-semibold">
														{location.name}
													</p>
													<p className="mt-1 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
														{location.code}
													</p>
												</div>
												<span className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-foreground">
													{capacityLabel}
												</span>
											</div>
											{employeeCount > 0 ? (
												<div className="space-y-2">
													<div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
														<span>{t('map.popup.capacityLabel')}</span>
														<span>{capacityLabel}</span>
													</div>
													<div
														role="progressbar"
														aria-label={t('map.popup.capacityLabel')}
														aria-valuemin={0}
														aria-valuenow={presentCount}
														aria-valuemax={employeeCount}
														data-testid={`dashboard-map-capacity-progress-${location.id}`}
														className="h-2 overflow-hidden rounded-full bg-[color:var(--bg-tertiary)]"
													>
														<div
															className="h-full rounded-full bg-[color:var(--accent-primary)] transition-[width]"
															style={{ width: `${capacityPercent}%` }}
														/>
													</div>
												</div>
											) : null}
											<p className="text-xs text-muted-foreground">
												{latestCheckInLabel}
											</p>
											<p className="text-xs text-muted-foreground">
												{t('map.popup.presentCount', {
													count: presentCount,
												})}
											</p>
										</div>
										{presentCount === 0 ? (
											<p className="text-xs text-muted-foreground">
												{t('map.popup.empty')}
											</p>
										) : (
											<ScrollArea className="max-h-48">
												<div className="space-y-3">
													{sortedPresent.map((record) => {
														const displayName =
															record.employeeName ||
															record.employeeCode;
														const initials =
															getEmployeeInitials(displayName);
														const relativeTime =
															formatDistanceToNowStrict(
																new Date(record.checkedInAt),
																{
																	addSuffix: false,
																	locale: es,
																},
															);
														return (
															<div
																key={`${record.employeeId}-${record.checkedInAt}`}
																className="flex items-center justify-between"
															>
																<div className="flex items-center gap-3">
																	<Avatar className="h-8 w-8">
																		<AvatarFallback>
																			{initials ||
																				t(
																					'map.popup.fallbackInitials',
																				)}
																		</AvatarFallback>
																	</Avatar>
																	<div>
																		<p className="text-sm font-medium">
																			{displayName}
																		</p>
																		<p className="text-xs text-muted-foreground">
																			{record.employeeCode}
																		</p>
																	</div>
																</div>
																<span className="text-xs text-muted-foreground">
																	{t('map.popup.timeAgo', {
																		time: relativeTime,
																	})}
																</span>
															</div>
														);
													})}
												</div>
											</ScrollArea>
										)}
									</CardContent>
								</Card>
							</MarkerPopup>
						</MapMarker>
					);
				})}
			</MapCanvas>
		</div>
	);
}
