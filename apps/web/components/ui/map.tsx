'use client';

import type {
	GeoJSONSource,
	Map as MapLibreMap,
	MapGeoJSONFeature,
	MapMouseEvent,
	MapOptions,
	Marker as MapLibreMarker,
	MarkerOptions,
	PopupOptions,
	StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { michoacanTokens } from '@sen-checkin/design-tokens';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import {
	createContext,
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Locate, Maximize, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

type MapLibreModule = typeof import('maplibre-gl');

let mapLibrePromise: Promise<MapLibreModule> | null = null;

/**
 * Lazily imports MapLibre to avoid bundling it on first load.
 *
 * @returns Promise resolving to the MapLibre module
 */
async function loadMapLibre(): Promise<MapLibreModule> {
	if (!mapLibrePromise) {
		mapLibrePromise = import('maplibre-gl');
	}
	return mapLibrePromise;
}

type MapContextValue = {
	map: MapLibreMap | null;
	isLoaded: boolean;
	maplibre: MapLibreModule | null;
};

const MapContext = createContext<MapContextValue | null>(null);

/**
 * Accesses the active map context.
 *
 * @returns The current map context values.
 * @throws Error when used outside of a Map provider.
 */
function useMap() {
	const context = useContext(MapContext);
	if (!context) {
		throw new Error('useMap must be used within a Map component');
	}
	return context;
}

const defaultStyles = {
	dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
	light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
const tokenFallbacks = {
	accentPrimary: michoacanTokens.light.colors.accent.primary,
	accentSecondary: michoacanTokens.light.colors.accent.secondary,
	accentTertiary: michoacanTokens.light.colors.accent.tertiary,
	textOnAccent: michoacanTokens.light.colors.text.onAccent,
};

/**
 * Resolves a CSS variable into a concrete color string for MapLibre paint properties.
 *
 * @param variableName - CSS custom property name (example: `--accent-primary`)
 * @param fallback - Color fallback when the CSS variable is unavailable
 * @returns Resolved color string ready for MapLibre
 */
function resolveCssColor(variableName: string, fallback: string): string {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const resolved = getComputedStyle(document.documentElement)
		.getPropertyValue(variableName)
		.trim();
	return resolved || fallback;
}

type MapStyleOption = string | StyleSpecification;

type MapProps = {
	children?: ReactNode;
	/** Custom map styles for light and dark themes. Overrides the default Carto styles. */
	styles?: {
		light?: MapStyleOption;
		dark?: MapStyleOption;
	};
} & Omit<MapOptions, 'container' | 'style'>;

type MapRef = MapLibreMap;

/**
 * Default loading indicator for map initialization.
 *
 * @returns The loading indicator element.
 */
const DefaultLoader = () => (
	<div className="absolute inset-0 flex items-center justify-center">
		<div className="flex gap-1">
			<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
			<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
			<span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
		</div>
	</div>
);

/**
 * Map container component that initializes a MapLibre instance.
 *
 * @param props - Map props including children and style overrides.
 * @param ref - Forwarded ref to access the map instance.
 * @returns The map container element.
 */
const Map = forwardRef<MapRef, MapProps>(function Map({ children, styles, ...props }, ref) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
	const [maplibre, setMapLibre] = useState<MapLibreModule | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);
	const [isStyleLoaded, setIsStyleLoaded] = useState(false);
	const { resolvedTheme } = useTheme();
	const currentStyleRef = useRef<MapStyleOption | null>(null);

	const mapStyles = useMemo(
		() => ({
			dark: styles?.dark ?? defaultStyles.dark,
			light: styles?.light ?? defaultStyles.light,
		}),
		[styles],
	);

	useImperativeHandle(ref, () => mapInstance as MapLibreMap, [mapInstance]);

	useEffect(() => {
		if (!containerRef.current) return;

		let isActive = true;
		let map: MapLibreMap | null = null;
		let loadHandler: (() => void) | null = null;
		let styleDataHandler: (() => void) | null = null;

		/**
		 * Initializes the map after MapLibre has been loaded.
		 *
		 * @returns Promise resolved when the map is initialized
		 */
		const initializeMap = async (): Promise<void> => {
			const maplibreModule = await loadMapLibre();
			if (!isActive || !containerRef.current) return;

			setMapLibre(maplibreModule);

			const initialStyle = resolvedTheme === 'dark' ? mapStyles.dark : mapStyles.light;
			currentStyleRef.current = initialStyle;

			const nextMap = new maplibreModule.Map({
				container: containerRef.current,
				style: initialStyle,
				renderWorldCopies: false,
				attributionControl: {
					compact: true,
				},
				...props,
			});

			loadHandler = () => setIsLoaded(true);
			styleDataHandler = () => setIsStyleLoaded(true);

			nextMap.on('load', loadHandler);
			nextMap.on('styledata', styleDataHandler);
			setMapInstance(nextMap);
			map = nextMap;
		};

		void initializeMap();

		return () => {
			isActive = false;
			if (map && loadHandler && styleDataHandler) {
				map.off('load', loadHandler);
				map.off('styledata', styleDataHandler);
			}
			map?.remove();
			setIsLoaded(false);
			setIsStyleLoaded(false);
			setMapInstance(null);
			setMapLibre(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!mapInstance || !resolvedTheme) return;

		const newStyle = resolvedTheme === 'dark' ? mapStyles.dark : mapStyles.light;

		if (currentStyleRef.current === newStyle) return;

		currentStyleRef.current = newStyle;
		setIsStyleLoaded(false);

		const frameId = requestAnimationFrame(() => {
			mapInstance.setStyle(newStyle, { diff: true });
		});

		return () => cancelAnimationFrame(frameId);
	}, [mapInstance, resolvedTheme, mapStyles]);

	const isLoading = !maplibre || !isLoaded || !isStyleLoaded;

	const contextValue = useMemo(
		() => ({
			map: mapInstance,
			isLoaded: isLoaded && isStyleLoaded,
			maplibre,
		}),
		[mapInstance, isLoaded, isStyleLoaded, maplibre],
	);

	return (
		<MapContext.Provider value={contextValue}>
			<div ref={containerRef} className="relative w-full h-full">
				{isLoading && <DefaultLoader />}
				{/* SSR-safe: children render only when map is loaded on client */}
				{mapInstance && children}
			</div>
		</MapContext.Provider>
	);
});

type MarkerContextValue = {
	marker: MapLibreMarker;
	map: MapLibreMap | null;
};

const MarkerContext = createContext<MarkerContextValue | null>(null);

/**
 * Accesses the active marker context.
 *
 * @returns The marker context values.
 * @throws Error when used outside of a MapMarker.
 */
function useMarkerContext() {
	const context = useContext(MarkerContext);
	if (!context) {
		throw new Error('Marker components must be used within MapMarker');
	}
	return context;
}

type MapMarkerProps = {
	/** Longitude coordinate for marker position */
	longitude: number;
	/** Latitude coordinate for marker position */
	latitude: number;
	/** Marker subcomponents (MarkerContent, MarkerPopup, MarkerTooltip, MarkerLabel) */
	children: ReactNode;
	/** Callback when marker is clicked */
	onClick?: (e: MouseEvent) => void;
	/** Callback when mouse enters marker */
	onMouseEnter?: (e: MouseEvent) => void;
	/** Callback when mouse leaves marker */
	onMouseLeave?: (e: MouseEvent) => void;
	/** Callback when marker drag starts (requires draggable: true) */
	onDragStart?: (lngLat: { lng: number; lat: number }) => void;
	/** Callback during marker drag (requires draggable: true) */
	onDrag?: (lngLat: { lng: number; lat: number }) => void;
	/** Callback when marker drag ends (requires draggable: true) */
	onDragEnd?: (lngLat: { lng: number; lat: number }) => void;
} & Omit<MarkerOptions, 'element'>;

/**
 * Renders a MapLibre marker and provides marker context to children.
 *
 * @param props - Marker configuration and child components.
 * @returns The marker context provider.
 */
function MapMarker({
	longitude,
	latitude,
	children,
	onClick,
	onMouseEnter,
	onMouseLeave,
	onDragStart,
	onDrag,
	onDragEnd,
	draggable = false,
	...markerOptions
}: MapMarkerProps) {
	const { map, maplibre } = useMap();
	const markerElement = useMemo(() => document.createElement('div'), []);
	const markerRef = useRef<MapLibreMarker | null>(null);
	const [marker, setMarker] = useState<MapLibreMarker | null>(null);

	useEffect(() => {
		if (!maplibre || markerRef.current) return;

		const markerInstance = new maplibre.Marker({
			...markerOptions,
			element: markerElement,
			draggable,
		}).setLngLat([longitude, latitude]);

		markerRef.current = markerInstance;
		setMarker(markerInstance);

		return () => {
			markerInstance.remove();
			markerRef.current = null;
			setMarker(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [maplibre]);

	useEffect(() => {
		if (!map || !marker) return;

		const handleClick = (e: MouseEvent) => onClick?.(e);
		const handleMouseEnter = (e: MouseEvent) => onMouseEnter?.(e);
		const handleMouseLeave = (e: MouseEvent) => onMouseLeave?.(e);

		const element = marker.getElement();
		if (element) {
			element.addEventListener('click', handleClick);
			element.addEventListener('mouseenter', handleMouseEnter);
			element.addEventListener('mouseleave', handleMouseLeave);
		}

		const handleDragStart = () => {
			const lngLat = marker.getLngLat();
			onDragStart?.({ lng: lngLat.lng, lat: lngLat.lat });
		};
		const handleDrag = () => {
			const lngLat = marker.getLngLat();
			onDrag?.({ lng: lngLat.lng, lat: lngLat.lat });
		};
		const handleDragEnd = () => {
			const lngLat = marker.getLngLat();
			onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
		};

		marker.on('dragstart', handleDragStart);
		marker.on('drag', handleDrag);
		marker.on('dragend', handleDragEnd);

		marker.addTo(map);

		return () => {
			if (element) {
				element.removeEventListener('click', handleClick);
				element.removeEventListener('mouseenter', handleMouseEnter);
				element.removeEventListener('mouseleave', handleMouseLeave);
			}
			marker.off('dragstart', handleDragStart);
			marker.off('drag', handleDrag);
			marker.off('dragend', handleDragEnd);
			marker.remove();
		};
	}, [map, marker, onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd]);

	if (!marker) {
		return null;
	}

	if (marker.getLngLat().lng !== longitude || marker.getLngLat().lat !== latitude) {
		marker.setLngLat([longitude, latitude]);
	}
	if (marker.isDraggable() !== draggable) {
		marker.setDraggable(draggable);
	}

	const currentOffset = marker.getOffset();
	const newOffset = markerOptions.offset ?? [0, 0];
	const [newOffsetX, newOffsetY] = Array.isArray(newOffset)
		? newOffset
		: [newOffset.x, newOffset.y];
	if (currentOffset.x !== newOffsetX || currentOffset.y !== newOffsetY) {
		marker.setOffset(newOffset);
	}

	if (marker.getRotation() !== markerOptions.rotation) {
		marker.setRotation(markerOptions.rotation ?? 0);
	}
	if (marker.getRotationAlignment() !== markerOptions.rotationAlignment) {
		marker.setRotationAlignment(markerOptions.rotationAlignment ?? 'auto');
	}
	if (marker.getPitchAlignment() !== markerOptions.pitchAlignment) {
		marker.setPitchAlignment(markerOptions.pitchAlignment ?? 'auto');
	}

	return <MarkerContext.Provider value={{ marker, map }}>{children}</MarkerContext.Provider>;
}

type MarkerContentProps = {
	/** Custom marker content. Defaults to a blue dot if not provided */
	children?: ReactNode;
	/** Additional CSS classes for the marker container */
	className?: string;
};

/**
 * Renders marker content into the marker DOM element.
 *
 * @param props - Marker content props.
 * @returns The portal rendering marker content.
 */
function MarkerContent({ children, className }: MarkerContentProps) {
	const { marker } = useMarkerContext();

	return createPortal(
		<div className={cn('relative cursor-pointer', className)}>
			{children || <DefaultMarkerIcon />}
		</div>,
		marker.getElement(),
	);
}

/**
 * Default marker visual when no custom content is provided.
 *
 * @returns The default marker element.
 */
function DefaultMarkerIcon() {
	return (
		<div className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
	);
}

type MarkerPopupProps = {
	/** Popup content */
	children: ReactNode;
	/** Additional CSS classes for the popup container */
	className?: string;
	/** Show a close button in the popup (default: false) */
	closeButton?: boolean;
} & Omit<PopupOptions, 'className' | 'closeButton'>;

/**
 * Renders a popup attached to a marker.
 *
 * @param props - Popup configuration and content.
 * @returns The portal rendering the popup content.
 */
function MarkerPopup({
	children,
	className,
	closeButton = false,
	...popupOptions
}: MarkerPopupProps) {
	const t = useTranslations('Map');
	const { marker, map } = useMarkerContext();
	const { maplibre } = useMap();
	const container = useMemo(() => document.createElement('div'), []);
	const prevPopupOptions = useRef(popupOptions);

	const popup = useMemo(() => {
		if (!maplibre) {
			return null;
		}

		const popupInstance = new maplibre.Popup({
			offset: 16,
			...popupOptions,
			closeButton: false,
		})
			.setMaxWidth('none')
			.setDOMContent(container);

		return popupInstance;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [maplibre]);

	useEffect(() => {
		if (!map || !popup) return;

		popup.setDOMContent(container);
		marker.setPopup(popup);

		return () => {
			marker.setPopup(null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map, popup]);

	if (!popup) {
		return null;
	}

	if (popup.isOpen()) {
		const prev = prevPopupOptions.current;

		if (prev.offset !== popupOptions.offset) {
			popup.setOffset(popupOptions.offset ?? 16);
		}
		if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
			popup.setMaxWidth(popupOptions.maxWidth ?? 'none');
		}

		prevPopupOptions.current = popupOptions;
	}

	const handleClose = () => popup.remove();

	return createPortal(
		<div
			className={cn(
				'relative rounded-md border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
				className,
			)}
		>
			{closeButton && (
				<button
					type="button"
					onClick={handleClose}
					className="absolute top-1 right-1 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
					aria-label={t('controls.closePopup')}
				>
					<X className="h-4 w-4" />
					<span className="sr-only">{t('controls.close')}</span>
				</button>
			)}
			{children}
		</div>,
		container,
	);
}

type MarkerTooltipProps = {
	/** Tooltip content */
	children: ReactNode;
	/** Additional CSS classes for the tooltip container */
	className?: string;
} & Omit<PopupOptions, 'className' | 'closeButton' | 'closeOnClick'>;

/**
 * Renders a tooltip that appears on marker hover.
 *
 * @param props - Tooltip configuration and content.
 * @returns The portal rendering the tooltip content.
 */
function MarkerTooltip({ children, className, ...popupOptions }: MarkerTooltipProps) {
	const { marker, map } = useMarkerContext();
	const { maplibre } = useMap();
	const container = useMemo(() => document.createElement('div'), []);
	const prevTooltipOptions = useRef(popupOptions);

	const tooltip = useMemo(() => {
		if (!maplibre) {
			return null;
		}

		const tooltipInstance = new maplibre.Popup({
			offset: 16,
			...popupOptions,
			closeOnClick: true,
			closeButton: false,
		}).setMaxWidth('none');

		return tooltipInstance;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [maplibre]);

	useEffect(() => {
		if (!map || !tooltip) return;

		tooltip.setDOMContent(container);

		const handleMouseEnter = () => {
			tooltip.setLngLat(marker.getLngLat()).addTo(map);
		};
		const handleMouseLeave = () => tooltip.remove();

		marker.getElement()?.addEventListener('mouseenter', handleMouseEnter);
		marker.getElement()?.addEventListener('mouseleave', handleMouseLeave);

		return () => {
			marker.getElement()?.removeEventListener('mouseenter', handleMouseEnter);
			marker.getElement()?.removeEventListener('mouseleave', handleMouseLeave);
			tooltip.remove();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map, tooltip]);

	if (!tooltip) {
		return null;
	}

	if (tooltip.isOpen()) {
		const prev = prevTooltipOptions.current;

		if (prev.offset !== popupOptions.offset) {
			tooltip.setOffset(popupOptions.offset ?? 16);
		}
		if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
			tooltip.setMaxWidth(popupOptions.maxWidth ?? 'none');
		}

		prevTooltipOptions.current = popupOptions;
	}

	return createPortal(
		<div
			className={cn(
				'rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95',
				className,
			)}
		>
			{children}
		</div>,
		container,
	);
}

type MarkerLabelProps = {
	/** Label text content */
	children: ReactNode;
	/** Additional CSS classes for the label */
	className?: string;
	/** Position of the label relative to the marker (default: "top") */
	position?: 'top' | 'bottom';
};

/**
 * Renders a label next to a marker.
 *
 * @param props - Label configuration and content.
 * @returns The marker label element.
 */
function MarkerLabel({ children, className, position = 'top' }: MarkerLabelProps) {
	const positionClasses = {
		top: 'bottom-full mb-1',
		bottom: 'top-full mt-1',
	};

	return (
		<div
			className={cn(
				'absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
				'text-[10px] font-medium text-foreground',
				positionClasses[position],
				className,
			)}
		>
			{children}
		</div>
	);
}

type MapControlsProps = {
	/** Position of the controls on the map (default: "bottom-right") */
	position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	/** Show zoom in/out buttons (default: true) */
	showZoom?: boolean;
	/** Show compass button to reset bearing (default: false) */
	showCompass?: boolean;
	/** Show locate button to find user's location (default: false) */
	showLocate?: boolean;
	/** Show fullscreen toggle button (default: false) */
	showFullscreen?: boolean;
	/** Additional CSS classes for the controls container */
	className?: string;
	/** Callback with user coordinates when located */
	onLocate?: (coords: { longitude: number; latitude: number }) => void;
};

const positionClasses = {
	'top-left': 'top-2 left-2',
	'top-right': 'top-2 right-2',
	'bottom-left': 'bottom-2 left-2',
	'bottom-right': 'bottom-10 right-2',
};

/**
 * Groups map control buttons into a styled container.
 *
 * @param props - Control group props.
 * @returns The control group element.
 */
function ControlGroup({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col rounded-md border border-border bg-background shadow-sm overflow-hidden [&>button:not(:last-child)]:border-b [&>button:not(:last-child)]:border-border">
			{children}
		</div>
	);
}

/**
 * Map control button used for zoom, locate, and other actions.
 *
 * @param props - Button props.
 * @returns The control button element.
 */
function ControlButton({
	onClick,
	label,
	children,
	disabled = false,
}: {
	onClick: () => void;
	label: string;
	children: ReactNode;
	disabled?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			aria-label={label}
			type="button"
			className={cn(
				'flex items-center justify-center size-8 hover:bg-accent dark:hover:bg-accent/40 transition-colors',
				disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
			)}
			disabled={disabled}
		>
			{children}
		</button>
	);
}

/**
 * Renders a collection of map interaction controls.
 *
 * @param props - Controls configuration.
 * @returns The map controls element or null when the map is not ready.
 */
function MapControls({
	position = 'bottom-right',
	showZoom = true,
	showCompass = false,
	showLocate = false,
	showFullscreen = false,
	className,
	onLocate,
}: MapControlsProps) {
	const t = useTranslations('Map');
	const { map, isLoaded } = useMap();
	const [waitingForLocation, setWaitingForLocation] = useState(false);

	const handleZoomIn = useCallback(() => {
		map?.zoomTo(map.getZoom() + 1, { duration: 300 });
	}, [map]);

	const handleZoomOut = useCallback(() => {
		map?.zoomTo(map.getZoom() - 1, { duration: 300 });
	}, [map]);

	const handleResetBearing = useCallback(() => {
		map?.resetNorthPitch({ duration: 300 });
	}, [map]);

	const handleLocate = useCallback(() => {
		setWaitingForLocation(true);
		if ('geolocation' in navigator) {
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					const coords = {
						longitude: pos.coords.longitude,
						latitude: pos.coords.latitude,
					};
					map?.flyTo({
						center: [coords.longitude, coords.latitude],
						zoom: 14,
						duration: 1500,
					});
					onLocate?.(coords);
					setWaitingForLocation(false);
				},
				(error) => {
					console.error('Error getting location:', error);
					setWaitingForLocation(false);
				},
			);
			return;
		}
		setWaitingForLocation(false);
	}, [map, onLocate]);

	const handleFullscreen = useCallback(() => {
		const container = map?.getContainer();
		if (!container) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			container.requestFullscreen();
		}
	}, [map]);

	if (!isLoaded) return null;

	return (
		<div
			className={cn(
				'absolute z-10 flex flex-col gap-1.5',
				positionClasses[position],
				className,
			)}
		>
			{showZoom && (
				<ControlGroup>
					<ControlButton onClick={handleZoomIn} label={t('controls.zoomIn')}>
						<Plus className="size-4" />
					</ControlButton>
					<ControlButton onClick={handleZoomOut} label={t('controls.zoomOut')}>
						<Minus className="size-4" />
					</ControlButton>
				</ControlGroup>
			)}
			{showCompass && (
				<ControlGroup>
					<CompassButton
						onClick={handleResetBearing}
						label={t('controls.resetBearing')}
					/>
				</ControlGroup>
			)}
			{showLocate && (
				<ControlGroup>
					<ControlButton
						onClick={handleLocate}
						label={t('controls.locate')}
						disabled={waitingForLocation}
					>
						{waitingForLocation ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Locate className="size-4" />
						)}
					</ControlButton>
				</ControlGroup>
			)}
			{showFullscreen && (
				<ControlGroup>
					<ControlButton onClick={handleFullscreen} label={t('controls.fullscreen')}>
						<Maximize className="size-4" />
					</ControlButton>
				</ControlGroup>
			)}
		</div>
	);
}

/**
 * Compass button that resets the map bearing.
 *
 * @param props - Compass button props.
 * @returns The compass control button.
 */
function CompassButton({ onClick, label }: { onClick: () => void; label: string }) {
	const { isLoaded, map } = useMap();
	const compassRef = useRef<SVGSVGElement>(null);

	useEffect(() => {
		if (!isLoaded || !map || !compassRef.current) return;

		const compass = compassRef.current;

		const updateRotation = () => {
			const bearing = map.getBearing();
			const pitch = map.getPitch();
			compass.style.transform = `rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
		};

		map.on('rotate', updateRotation);
		map.on('pitch', updateRotation);
		updateRotation();

		return () => {
			map.off('rotate', updateRotation);
			map.off('pitch', updateRotation);
		};
	}, [isLoaded, map]);

	return (
		<ControlButton onClick={onClick} label={label}>
			<svg
				ref={compassRef}
				viewBox="0 0 24 24"
				className="size-5 transition-transform duration-200"
				style={{ transformStyle: 'preserve-3d' }}
			>
				<path d="M12 2L16 12H12V2Z" className="fill-red-500" />
				<path d="M12 2L8 12H12V2Z" className="fill-red-300" />
				<path d="M12 22L16 12H12V22Z" className="fill-muted-foreground/60" />
				<path d="M12 22L8 12H12V22Z" className="fill-muted-foreground/30" />
			</svg>
		</ControlButton>
	);
}

type MapPopupProps = {
	/** Longitude coordinate for popup position */
	longitude: number;
	/** Latitude coordinate for popup position */
	latitude: number;
	/** Callback when popup is closed */
	onClose?: () => void;
	/** Popup content */
	children: ReactNode;
	/** Additional CSS classes for the popup container */
	className?: string;
	/** Show a close button in the popup (default: false) */
	closeButton?: boolean;
} & Omit<PopupOptions, 'className' | 'closeButton'>;

/**
 * Renders a standalone popup at the specified coordinates.
 *
 * @param props - Popup configuration and content.
 * @returns The portal rendering the popup content.
 */
function MapPopup({
	longitude,
	latitude,
	onClose,
	children,
	className,
	closeButton = false,
	...popupOptions
}: MapPopupProps) {
	const t = useTranslations('Map');
	const { map, maplibre } = useMap();
	const popupOptionsRef = useRef(popupOptions);
	const container = useMemo(() => document.createElement('div'), []);

	const popup = useMemo(() => {
		if (!maplibre) {
			return null;
		}

		const popupInstance = new maplibre.Popup({
			offset: 16,
			...popupOptions,
			closeButton: false,
		})
			.setMaxWidth('none')
			.setLngLat([longitude, latitude]);

		return popupInstance;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [maplibre]);

	useEffect(() => {
		if (!map || !popup) return;

		const onCloseProp = () => onClose?.();
		popup.on('close', onCloseProp);

		popup.setDOMContent(container);
		popup.addTo(map);

		return () => {
			popup.off('close', onCloseProp);
			if (popup.isOpen()) {
				popup.remove();
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map, popup]);

	if (!popup) {
		return null;
	}

	if (popup.isOpen()) {
		const prev = popupOptionsRef.current;

		if (popup.getLngLat().lng !== longitude || popup.getLngLat().lat !== latitude) {
			popup.setLngLat([longitude, latitude]);
		}

		if (prev.offset !== popupOptions.offset) {
			popup.setOffset(popupOptions.offset ?? 16);
		}
		if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
			popup.setMaxWidth(popupOptions.maxWidth ?? 'none');
		}
		popupOptionsRef.current = popupOptions;
	}

	const handleClose = () => {
		popup.remove();
		onClose?.();
	};

	return createPortal(
		<div
			className={cn(
				'relative rounded-md border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
				className,
			)}
		>
			{closeButton && (
				<button
					type="button"
					onClick={handleClose}
					className="absolute top-1 right-1 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
					aria-label={t('controls.closePopup')}
				>
					<X className="h-4 w-4" />
					<span className="sr-only">{t('controls.close')}</span>
				</button>
			)}
			{children}
		</div>,
		container,
	);
}

type MapRouteProps = {
	/** Optional unique identifier for the route layer */
	id?: string;
	/** Array of [longitude, latitude] coordinate pairs defining the route */
	coordinates: [number, number][];
	/** Line color as CSS color value (defaults to accent-primary token) */
	color?: string;
	/** Line width in pixels (default: 3) */
	width?: number;
	/** Line opacity from 0 to 1 (default: 0.8) */
	opacity?: number;
	/** Dash pattern [dash length, gap length] for dashed lines */
	dashArray?: [number, number];
	/** Callback when the route line is clicked */
	onClick?: () => void;
	/** Callback when mouse enters the route line */
	onMouseEnter?: () => void;
	/** Callback when mouse leaves the route line */
	onMouseLeave?: () => void;
	/** Whether the route is interactive - shows pointer cursor on hover (default: true) */
	interactive?: boolean;
};

/**
 * Draws a line route on the map using a GeoJSON source.
 *
 * @param props - Route configuration and event handlers.
 * @returns Null (renders into the map instance).
 */
function MapRoute({
	id,
	coordinates,
	color,
	width = 3,
	opacity = 0.8,
	dashArray,
	onClick,
	onMouseEnter,
	onMouseLeave,
	interactive = true,
}: MapRouteProps) {
	const { map, isLoaded } = useMap();
	const { resolvedTheme } = useTheme();
	const autoId = useId();
	const sourceId = id ?? `route-source-${autoId}`;
	const layerId = id ?? `route-layer-${autoId}`;
	const routeColor = useMemo(() => {
		void resolvedTheme;
		return color ?? resolveCssColor('--accent-primary', tokenFallbacks.accentPrimary);
	}, [color, resolvedTheme]);

	// Add source and layer on mount
	useEffect(() => {
		if (!isLoaded || !map) return;

		map.addSource(sourceId, {
			type: 'geojson',
			data: {
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: [] },
			},
		});

		map.addLayer({
			id: layerId,
			type: 'line',
			source: sourceId,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': routeColor,
				'line-width': width,
				'line-opacity': opacity,
				...(dashArray && { 'line-dasharray': dashArray }),
			},
		});

		return () => {
			try {
				if (map.getLayer(layerId)) map.removeLayer(layerId);
				if (map.getSource(sourceId)) map.removeSource(sourceId);
			} catch {
				// ignore
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoaded, map]);

	// When coordinates change, update the source data
	useEffect(() => {
		if (!isLoaded || !map || coordinates.length < 2) return;

		const source = map.getSource(sourceId) as GeoJSONSource;
		if (source) {
			source.setData({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates },
			});
		}
	}, [isLoaded, map, coordinates, sourceId]);

	useEffect(() => {
		if (!isLoaded || !map || !map.getLayer(layerId)) return;

		map.setPaintProperty(layerId, 'line-color', routeColor);
		map.setPaintProperty(layerId, 'line-width', width);
		map.setPaintProperty(layerId, 'line-opacity', opacity);
		if (dashArray) {
			map.setPaintProperty(layerId, 'line-dasharray', dashArray);
		}
	}, [isLoaded, map, layerId, routeColor, width, opacity, dashArray]);

	// Handle click and hover events
	useEffect(() => {
		if (!isLoaded || !map || !interactive) return;

		const handleClick = () => {
			onClick?.();
		};
		const handleMouseEnter = () => {
			map.getCanvas().style.cursor = 'pointer';
			onMouseEnter?.();
		};
		const handleMouseLeave = () => {
			map.getCanvas().style.cursor = '';
			onMouseLeave?.();
		};

		map.on('click', layerId, handleClick);
		map.on('mouseenter', layerId, handleMouseEnter);
		map.on('mouseleave', layerId, handleMouseLeave);

		return () => {
			map.off('click', layerId, handleClick);
			map.off('mouseenter', layerId, handleMouseEnter);
			map.off('mouseleave', layerId, handleMouseLeave);
		};
	}, [isLoaded, map, layerId, onClick, onMouseEnter, onMouseLeave, interactive]);

	return null;
}

type MapClusterLayerProps<P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties> = {
	/** GeoJSON FeatureCollection data or URL to fetch GeoJSON from */
	data: string | GeoJSON.FeatureCollection<GeoJSON.Point, P>;
	/** Maximum zoom level to cluster points on (default: 14) */
	clusterMaxZoom?: number;
	/** Radius of each cluster when clustering points in pixels (default: 50) */
	clusterRadius?: number;
	/** Colors for cluster circles: [small, medium, large]. Defaults use theme tokens. */
	clusterColors?: [string, string, string];
	/** Point count thresholds for color/size steps: [medium, large] (default: [100, 750]) */
	clusterThresholds?: [number, number];
	/** Color for unclustered individual points. Defaults to accent-primary token. */
	pointColor?: string;
	/** Callback when an unclustered point is clicked */
	onPointClick?: (
		feature: GeoJSON.Feature<GeoJSON.Point, P>,
		coordinates: [number, number],
	) => void;
	/** Callback when a cluster is clicked. If not provided, zooms into the cluster */
	onClusterClick?: (clusterId: number, coordinates: [number, number], pointCount: number) => void;
};

/**
 * Renders clustered point data on the map.
 *
 * @typeParam P - GeoJSON properties shape.
 * @param props - Cluster layer configuration and event handlers.
 * @returns Null (renders into the map instance).
 */
function MapClusterLayer<P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties>({
	data,
	clusterMaxZoom = 14,
	clusterRadius = 50,
	clusterColors,
	clusterThresholds = [100, 750],
	pointColor,
	onPointClick,
	onClusterClick,
}: MapClusterLayerProps<P>) {
	const { map, isLoaded } = useMap();
	const { resolvedTheme } = useTheme();
	const id = useId();
	const sourceId = `cluster-source-${id}`;
	const clusterLayerId = `clusters-${id}`;
	const clusterCountLayerId = `cluster-count-${id}`;
	const unclusteredLayerId = `unclustered-point-${id}`;
	const effectiveClusterColors = useMemo<[string, string, string]>(() => {
		void resolvedTheme;
		return (
			clusterColors ?? [
				resolveCssColor('--accent-secondary', tokenFallbacks.accentSecondary),
				resolveCssColor('--accent-primary', tokenFallbacks.accentPrimary),
				resolveCssColor('--accent-tertiary', tokenFallbacks.accentTertiary),
			]
		);
	}, [clusterColors, resolvedTheme]);
	const effectivePointColor = useMemo(() => {
		void resolvedTheme;
		return pointColor ?? resolveCssColor('--accent-primary', tokenFallbacks.accentPrimary);
	}, [pointColor, resolvedTheme]);
	const clusterTextColor = useMemo(() => {
		void resolvedTheme;
		return resolveCssColor('--text-on-accent', tokenFallbacks.textOnAccent);
	}, [resolvedTheme]);

	const stylePropsRef = useRef({
		clusterColors: effectiveClusterColors,
		clusterThresholds,
		pointColor: effectivePointColor,
	});

	// Add source and layers on mount
	useEffect(() => {
		if (!isLoaded || !map) return;

		// Add clustered GeoJSON source
		map.addSource(sourceId, {
			type: 'geojson',
			data,
			cluster: true,
			clusterMaxZoom,
			clusterRadius,
		});

		// Add cluster circles layer
		map.addLayer({
			id: clusterLayerId,
			type: 'circle',
			source: sourceId,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': [
					'step',
					['get', 'point_count'],
					effectiveClusterColors[0],
					clusterThresholds[0],
					effectiveClusterColors[1],
					clusterThresholds[1],
					effectiveClusterColors[2],
				],
				'circle-radius': [
					'step',
					['get', 'point_count'],
					20,
					clusterThresholds[0],
					30,
					clusterThresholds[1],
					40,
				],
			},
		});

		// Add cluster count text layer
		map.addLayer({
			id: clusterCountLayerId,
			type: 'symbol',
			source: sourceId,
			filter: ['has', 'point_count'],
			layout: {
				'text-field': '{point_count_abbreviated}',
				'text-size': 12,
			},
			paint: {
				'text-color': clusterTextColor,
			},
		});

		// Add unclustered point layer
		map.addLayer({
			id: unclusteredLayerId,
			type: 'circle',
			source: sourceId,
			filter: ['!', ['has', 'point_count']],
			paint: {
				'circle-color': effectivePointColor,
				'circle-radius': 6,
			},
		});

		return () => {
			try {
				if (map.getLayer(clusterCountLayerId)) map.removeLayer(clusterCountLayerId);
				if (map.getLayer(unclusteredLayerId)) map.removeLayer(unclusteredLayerId);
				if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId);
				if (map.getSource(sourceId)) map.removeSource(sourceId);
			} catch {
				// ignore
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoaded, map, sourceId]);

	// Update source data when data prop changes (only for non-URL data)
	useEffect(() => {
		if (!isLoaded || !map || typeof data === 'string') return;

		const source = map.getSource(sourceId) as GeoJSONSource;
		if (source) {
			source.setData(data);
		}
	}, [isLoaded, map, data, sourceId]);

	// Update layer styles when props change
	useEffect(() => {
		if (!isLoaded || !map) return;

		const prev = stylePropsRef.current;
		const colorsChanged =
			prev.clusterColors !== effectiveClusterColors ||
			prev.clusterThresholds !== clusterThresholds;

		// Update cluster layer colors and sizes
		if (map.getLayer(clusterLayerId) && colorsChanged) {
			map.setPaintProperty(clusterLayerId, 'circle-color', [
				'step',
				['get', 'point_count'],
				effectiveClusterColors[0],
				clusterThresholds[0],
				effectiveClusterColors[1],
				clusterThresholds[1],
				effectiveClusterColors[2],
			]);
			map.setPaintProperty(clusterLayerId, 'circle-radius', [
				'step',
				['get', 'point_count'],
				20,
				clusterThresholds[0],
				30,
				clusterThresholds[1],
				40,
			]);
		}

		// Update unclustered point layer color
		if (map.getLayer(unclusteredLayerId) && prev.pointColor !== effectivePointColor) {
			map.setPaintProperty(unclusteredLayerId, 'circle-color', effectivePointColor);
		}
		if (map.getLayer(clusterCountLayerId)) {
			map.setPaintProperty(clusterCountLayerId, 'text-color', clusterTextColor);
		}

		stylePropsRef.current = {
			clusterColors: effectiveClusterColors,
			clusterThresholds,
			pointColor: effectivePointColor,
		};
	}, [
		isLoaded,
		map,
		clusterLayerId,
		clusterCountLayerId,
		unclusteredLayerId,
		effectiveClusterColors,
		clusterThresholds,
		effectivePointColor,
		clusterTextColor,
	]);

	// Handle click events
	useEffect(() => {
		if (!isLoaded || !map) return;

		// Cluster click handler - zoom into cluster
		const handleClusterClick = async (
			e: MapMouseEvent & {
				features?: MapGeoJSONFeature[];
			},
		) => {
			const features = map.queryRenderedFeatures(e.point, {
				layers: [clusterLayerId],
			});
			if (!features.length) return;

			const feature = features[0];
			const clusterId = feature.properties?.cluster_id as number;
			const pointCount = feature.properties?.point_count as number;
			const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

			if (onClusterClick) {
				onClusterClick(clusterId, coordinates, pointCount);
			} else {
				// Default behavior: zoom to cluster expansion zoom
				const source = map.getSource(sourceId) as GeoJSONSource;
				const zoom = await source.getClusterExpansionZoom(clusterId);
				map.easeTo({
					center: coordinates,
					zoom,
				});
			}
		};

		// Unclustered point click handler
		const handlePointClick = (
			e: MapMouseEvent & {
				features?: MapGeoJSONFeature[];
			},
		) => {
			if (!onPointClick || !e.features?.length) return;

			const feature = e.features[0];
			const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [
				number,
				number,
			];

			// Handle world copies
			while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
				coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
			}

			onPointClick(feature as unknown as GeoJSON.Feature<GeoJSON.Point, P>, coordinates);
		};

		// Cursor style handlers
		const handleMouseEnterCluster = () => {
			map.getCanvas().style.cursor = 'pointer';
		};
		const handleMouseLeaveCluster = () => {
			map.getCanvas().style.cursor = '';
		};
		const handleMouseEnterPoint = () => {
			if (onPointClick) {
				map.getCanvas().style.cursor = 'pointer';
			}
		};
		const handleMouseLeavePoint = () => {
			map.getCanvas().style.cursor = '';
		};

		map.on('click', clusterLayerId, handleClusterClick);
		map.on('click', unclusteredLayerId, handlePointClick);
		map.on('mouseenter', clusterLayerId, handleMouseEnterCluster);
		map.on('mouseleave', clusterLayerId, handleMouseLeaveCluster);
		map.on('mouseenter', unclusteredLayerId, handleMouseEnterPoint);
		map.on('mouseleave', unclusteredLayerId, handleMouseLeavePoint);

		return () => {
			map.off('click', clusterLayerId, handleClusterClick);
			map.off('click', unclusteredLayerId, handlePointClick);
			map.off('mouseenter', clusterLayerId, handleMouseEnterCluster);
			map.off('mouseleave', clusterLayerId, handleMouseLeaveCluster);
			map.off('mouseenter', unclusteredLayerId, handleMouseEnterPoint);
			map.off('mouseleave', unclusteredLayerId, handleMouseLeavePoint);
		};
	}, [isLoaded, map, clusterLayerId, unclusteredLayerId, sourceId, onClusterClick, onPointClick]);

	return null;
}

export {
	Map,
	useMap,
	MapMarker,
	MarkerContent,
	MarkerPopup,
	MarkerTooltip,
	MarkerLabel,
	MapPopup,
	MapControls,
	MapRoute,
	MapClusterLayer,
};
