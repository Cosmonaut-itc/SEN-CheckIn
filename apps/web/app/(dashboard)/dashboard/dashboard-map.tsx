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
 * Fits the map to include all locations with coordinates.
 *
 * @param props - Component props with locations.
 * @returns Null (binds to the map instance).
 */
function MapAutoFit({ locations }: { locations: Location[] }): null {
	const { map, isLoaded } = useMap();
	const hasFitRef = useRef(false);

	useEffect(() => {
		hasFitRef.current = false;
	}, [locations]);

	useEffect(() => {
		if (!map || !isLoaded || hasFitRef.current || locations.length === 0) {
			return;
		}

		let minLng = Number.POSITIVE_INFINITY;
		let maxLng = Number.NEGATIVE_INFINITY;
		let minLat = Number.POSITIVE_INFINITY;
		let maxLat = Number.NEGATIVE_INFINITY;

		locations.forEach((location) => {
			if (location.latitude === null || location.longitude === null) return;
			minLng = Math.min(minLng, location.longitude);
			maxLng = Math.max(maxLng, location.longitude);
			minLat = Math.min(minLat, location.latitude);
			maxLat = Math.max(maxLat, location.latitude);
		});

		if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
			return;
		}

		map.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat],
			],
			{ padding: 80, maxZoom: 15, duration: 800 },
		);
		hasFitRef.current = true;
	}, [map, isLoaded, locations]);

	return null;
}

/**
 * Focuses the map on a selected location when available.
 *
 * @param props - Component props with the focused location.
 * @returns Null (binds to the map instance).
 */
function MapFocus({ location }: { location: Location | null }): null {
	const { map, isLoaded } = useMap();
	const lastLocationRef = useRef<string | null>(null);

	useEffect(() => {
		if (!map || !isLoaded || !location) return;
		if (location.latitude === null || location.longitude === null) return;
		if (lastLocationRef.current === location.id) return;

		map.easeTo({
			center: [location.longitude, location.latitude],
			zoom: FOCUS_MAP_ZOOM,
			duration: 700,
		});
		lastLocationRef.current = location.id;
	}, [map, isLoaded, location]);

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
	isMobileLayout = false,
}: DashboardMapProps): React.ReactElement {
	const t = useTranslations('Dashboard');

	return (
		<div className="absolute inset-0">
			<MapCanvas center={DEFAULT_MAP_CENTER} zoom={DEFAULT_MAP_ZOOM}>
				<MapAutoFit locations={locations} />
				<MapFocus location={focusedLocation} />
				<MapResizeController isMobileLayout={isMobileLayout} />
				{locations.map((location) => {
					// Skip rendering if coordinates are missing (defensive check)
					if (location.latitude === null || location.longitude === null) {
						return null;
					}
					const present = presentByLocationId.get(location.id) ?? [];
					const presentCount = present.length;
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
							<MarkerPopup className="p-0 w-72">
								<Card className="border-0 shadow-none">
									<CardContent className="space-y-3 p-3">
										<div>
											<p className="text-sm font-semibold">{location.name}</p>
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
													{present.map((record) => {
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
