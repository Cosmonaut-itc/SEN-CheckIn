'use client';

import React, { useEffect, useRef } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import { useTranslations } from 'next-intl';

import { Map, MapMarker, MarkerContent, MarkerLabel, useMap } from '@/components/ui/map';

const DEFAULT_MAP_CENTER = { lat: 19.4326, lng: -99.1332 };
const DEFAULT_MAP_ZOOM = 10;
const FOCUS_MAP_ZOOM = 14;

/**
 * Props for the location map picker component.
 */
export interface LocationMapPickerProps {
	/** Selected latitude or null when unset. */
	latitude: number | null;
	/** Selected longitude or null when unset. */
	longitude: number | null;
	/** Location name for the marker label. */
	name: string;
	/** Callback invoked when a map click selects coordinates. */
	onSelect: (coords: { latitude: number; longitude: number }) => void;
}

/**
 * Click handler that updates coordinates when the map is clicked.
 *
 * @param props - Component props with click handler.
 * @returns Null (binds to the map instance).
 */
function MapClickHandler({
	onSelect,
}: {
	onSelect: (coords: { latitude: number; longitude: number }) => void;
}): null {
	const { map, isLoaded } = useMap();

	useEffect(() => {
		if (!map || !isLoaded) return;

		const handleClick = (event: MapMouseEvent): void => {
			onSelect({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
		};

		map.on('click', handleClick);
		return () => {
			map.off('click', handleClick);
		};
	}, [map, isLoaded, onSelect]);

	return null;
}

/**
 * Keeps the map view centered on the selected coordinates.
 *
 * @param props - Component props containing coordinates and zoom levels.
 * @returns Null (binds to the map instance).
 */
function MapViewportSync({
	latitude,
	longitude,
}: {
	latitude: number | null;
	longitude: number | null;
}): null {
	const { map, isLoaded } = useMap();
	const lastCenterRef = useRef<string | null>(null);

	useEffect(() => {
		if (!map || !isLoaded) return;

		const hasCoords = latitude !== null && longitude !== null;
		const nextCenter = hasCoords
			? [longitude, latitude]
			: [DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat];
		const nextCenterKey = nextCenter.join(',');

		if (lastCenterRef.current === nextCenterKey) {
			return;
		}

		map.easeTo({
			center: nextCenter as [number, number],
			zoom: hasCoords ? FOCUS_MAP_ZOOM : DEFAULT_MAP_ZOOM,
			duration: 500,
		});

		lastCenterRef.current = nextCenterKey;
	}, [map, isLoaded, latitude, longitude]);

	return null;
}

/**
 * Location map picker used in the create/edit location dialog.
 *
 * @param props - Map picker props.
 * @returns The map picker element.
 */
export function LocationMapPicker({
	latitude,
	longitude,
	name,
	onSelect,
}: LocationMapPickerProps): React.ReactElement {
	const t = useTranslations('Locations');
	const hasCoordinates = latitude !== null && longitude !== null;

	return (
		<div className="relative h-56 w-full overflow-hidden rounded-md border bg-muted/20">
			<Map center={[DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat]} zoom={DEFAULT_MAP_ZOOM}>
				<MapViewportSync latitude={latitude} longitude={longitude} />
				<MapClickHandler onSelect={onSelect} />
				{hasCoordinates ? (
					<MapMarker
						longitude={longitude ?? DEFAULT_MAP_CENTER.lng}
						latitude={latitude ?? DEFAULT_MAP_CENTER.lat}
					>
						<MarkerContent>
							<div className="size-3 rounded-full border-2 border-white bg-primary shadow-md" />
							<MarkerLabel position="bottom">
								{name.trim() ? name : t('mapPicker.markerFallback')}
							</MarkerLabel>
						</MarkerContent>
					</MapMarker>
				) : null}
			</Map>
			{!hasCoordinates ? (
				<div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs text-muted-foreground">
					{t('mapPicker.empty')}
				</div>
			) : null}
		</div>
	);
}
