'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DeviceStatusRecord } from '@/lib/client-functions';

/**
 * Props for the DeviceStatusCard component.
 */
export interface DeviceStatusCardProps {
	/** Devices to display in the status list. */
	devices: DeviceStatusRecord[];
	/** Indicates whether the device summary is loading. */
	isLoading: boolean;
}

/**
 * Battery tone buckets used for the visual status bar.
 */
type BatteryTone = 'success' | 'warning' | 'destructive' | 'muted';

/**
 * Battery tone visual configuration.
 */
interface BatteryToneConfig {
	/** Tailwind class applied to the fill color. */
	fillClassName: string;
	/** Tailwind class applied to the icon container. */
	iconClassName: string;
}

const BATTERY_TONE_CLASSES: Record<BatteryTone, BatteryToneConfig> = {
	success: {
		fillClassName: 'bg-[var(--status-success)]',
		iconClassName: 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
	},
	warning: {
		fillClassName: 'bg-[var(--status-warning)]',
		iconClassName: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
	},
	destructive: {
		fillClassName: 'bg-[var(--status-error)]',
		iconClassName: 'bg-[var(--status-error-bg)] text-[var(--status-error)]',
	},
	muted: {
		fillClassName: 'bg-muted-foreground/45',
		iconClassName: 'bg-muted text-muted-foreground',
	},
} as const;

const SKELETON_ROW_INDICES = [0, 1, 2] as const;

/**
 * Returns the battery tone for a battery percentage.
 *
 * @param batteryLevel - Battery level percentage or null when unavailable.
 * @returns The battery tone bucket used for the UI.
 */
function getBatteryTone(batteryLevel: number | null): BatteryTone {
	if (batteryLevel === null) {
		return 'muted';
	}

	if (batteryLevel > 50) {
		return 'success';
	}

	if (batteryLevel >= 20) {
		return 'warning';
	}

	return 'destructive';
}

/**
 * Resolves the display label for the battery level.
 *
 * @param batteryLevel - Battery level percentage or null when unavailable.
 * @param notAvailableLabel - Localized fallback for unavailable battery data.
 * @returns A localized percentage label or the fallback label.
 */
function getBatteryLabel(
	batteryLevel: number | null,
	notAvailableLabel: string,
): string {
	return batteryLevel === null ? notAvailableLabel : `${Math.round(batteryLevel)}%`;
}

/**
 * Resolves the width used by the battery fill bar.
 *
 * @param batteryLevel - Battery level percentage or null when unavailable.
 * @returns Width percentage string for the fill bar.
 */
function getBatteryFillWidth(batteryLevel: number | null): string {
	if (batteryLevel === null) {
		return '0%';
	}

	const clampedLevel = Math.min(100, Math.max(0, batteryLevel));
	return `${clampedLevel}%`;
}

/**
 * Formats the relative sync age in Spanish.
 *
 * @param lastHeartbeat - ISO timestamp string or null.
 * @param noSyncLabel - Localized fallback when sync time is unavailable.
 * @returns A relative time string or the fallback label.
 */
function formatRelativeSync(lastHeartbeat: string | null, noSyncLabel: string): string {
	if (!lastHeartbeat) {
		return noSyncLabel;
	}

	const parsedHeartbeat = new Date(lastHeartbeat);
	if (Number.isNaN(parsedHeartbeat.getTime())) {
		return noSyncLabel;
	}

	return formatDistanceToNow(parsedHeartbeat, {
		addSuffix: false,
		locale: es,
	});
}

/**
 * Resolves the device label shown in the list.
 *
 * @param device - Device summary record.
 * @returns The device name or fallback code.
 */
function getDeviceLabel(device: DeviceStatusRecord): string {
	return device.name?.trim() || device.code;
}

/**
 * Creates a list row renderer for a device status record.
 *
 * @param noSyncLabel - Localized fallback shown when sync time is unavailable.
 * @param formatLastSyncLabel - Formatter that wraps a relative time in the card copy.
 * @returns A row renderer for the device list.
 */
function createDeviceRowRenderer(
	noSyncLabel: string,
	notAvailableLabel: string,
	batteryStatusLabel: string,
	formatLastSyncLabel: (time: string) => string,
): (device: DeviceStatusRecord) => React.ReactElement {
	/**
	 * Renders a single device row.
	 *
	 * @param device - Device summary record.
	 * @returns The rendered device row.
	 */
	return function renderDeviceRow(device: DeviceStatusRecord): React.ReactElement {
		const batteryTone = getBatteryTone(device.batteryLevel);
		const toneClasses = BATTERY_TONE_CLASSES[batteryTone];
		const batteryValueLabel = getBatteryLabel(device.batteryLevel, notAvailableLabel);
		const batteryFillWidth = getBatteryFillWidth(device.batteryLevel);
		const syncLabel = formatRelativeSync(device.lastHeartbeat, noSyncLabel);
		const hasRelativeSyncLabel = syncLabel !== noSyncLabel;
		const deviceLabel = getDeviceLabel(device);

		return (
			<li
				key={device.id}
				data-testid={`device-status-row-${device.id}`}
				className="flex items-center gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-background/80 px-4 py-3"
			>
				<div
					className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClasses.iconClassName}`}
					aria-hidden="true"
				>
					<Smartphone className="h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-foreground">{deviceLabel}</p>
					<p className="text-xs text-muted-foreground">
						{hasRelativeSyncLabel ? formatLastSyncLabel(syncLabel) : syncLabel}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<p className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
						{device.batteryLevel === null ? notAvailableLabel : batteryStatusLabel}
					</p>
					<div className="flex items-center gap-2">
						<div
							aria-label={`${deviceLabel} ${batteryValueLabel}`}
							className="relative h-3.5 w-16 overflow-hidden rounded-full border border-[color:var(--border-subtle)] bg-muted/50 p-0.5"
						>
							<div
								data-testid={`device-status-battery-fill-${device.id}`}
								className={`h-full rounded-full transition-[width,background-color] motion-reduce:transition-none ${toneClasses.fillClassName}`}
								style={{ width: batteryFillWidth }}
							/>
						</div>
						<span className="min-w-10 text-right text-sm font-semibold tabular-nums text-foreground">
							{batteryValueLabel}
						</span>
					</div>
				</div>
			</li>
		);
	};
}

/**
 * Renders a loading row placeholder.
 *
 * @param index - Stable index for the skeleton row.
 * @returns The rendered skeleton row.
 */
function renderSkeletonRow(index: number): React.ReactElement {
	return (
		<li
			key={index}
			data-testid="device-status-card-skeleton-row"
			className="flex items-center gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-background/80 px-4 py-3"
		>
			<Skeleton className="h-10 w-10 rounded-2xl" />
			<div className="min-w-0 flex-1 space-y-2">
				<Skeleton className="h-4 w-2/3 max-w-40" />
				<Skeleton className="h-3 w-1/2 max-w-32" />
			</div>
			<div className="flex shrink-0 flex-col items-end gap-2">
				<Skeleton className="h-3 w-16" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-16 rounded-full" />
					<Skeleton className="h-4 w-10" />
				</div>
			</div>
		</li>
	);
}

/**
 * Device status card for the dashboard.
 *
 * @param props - Component props.
 * @returns Rendered device status card.
 */
export function DeviceStatusCard({
	devices,
	isLoading,
}: DeviceStatusCardProps): React.ReactElement {
	const t = useTranslations('Dashboard');
	const tCommon = useTranslations('Common');
	const notAvailableLabel = tCommon('notAvailable');
	const batteryStatusLabel = t('devices.battery');
	const renderDeviceRow = createDeviceRowRenderer(
		notAvailableLabel,
		notAvailableLabel,
		batteryStatusLabel,
		(time: string) => t('devices.lastSync', { time }),
	);

	return (
		<Card data-testid="device-status-card" className="gap-0 overflow-hidden">
			<CardHeader className="gap-1 px-6 pb-4">
				<p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
					{t('devices.eyebrow')}
				</p>
				<CardTitle>{t('devices.title')}</CardTitle>
			</CardHeader>
			<CardContent className="px-6 pb-6 pt-0">
				{isLoading ? (
					<ul
						aria-label={t('devices.title')}
						className="space-y-3"
						data-testid="device-status-card-loading"
					>
						{SKELETON_ROW_INDICES.map(renderSkeletonRow)}
					</ul>
				) : devices.length === 0 ? (
					<div
						className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-muted/20 px-6 py-10 text-center"
						data-testid="device-status-card-empty"
					>
						<div className="flex max-w-sm flex-col items-center gap-3">
							<div
								className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
								aria-hidden="true"
							>
								<Smartphone className="h-5 w-5" />
							</div>
							<p className="text-sm font-medium text-foreground">{t('devices.empty')}</p>
						</div>
					</div>
				) : (
					<ul aria-label={t('devices.title')} className="space-y-3">
						{devices.map(renderDeviceRow)}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
