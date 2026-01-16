'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const GOOGLE_PLAY_INTERNAL_TEST_URL =
	'https://play.google.com/apps/internaltest/4701438061848106723';

/**
 * Build a QR-code image URL for a given value.
 *
 * Note: This uses a public QR generation endpoint to avoid adding new dependencies.
 *
 * @param value - The value to encode into the QR code
 * @param size - Pixel size for the QR image (square)
 * @returns A URL that renders a QR code image for the given value
 */
function buildQrImageUrl(value: string, size: number): string {
	const encoded = encodeURIComponent(value);
	return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}

/**
 * App Móvil page client component.
 * Renders a QR code that points to the Google Play internal test URL and a clickable link.
 *
 * @returns The App Móvil page JSX element
 */
export function AppMovilPageClient(): React.ReactElement {
	const t = useTranslations('MobileApp');
	const [isLoading, setIsLoading] = useState(true);
	const qrImageUrl = buildQrImageUrl(GOOGLE_PLAY_INTERNAL_TEST_URL, 220);

	return (
		<div className="space-y-6">
			<div className="space-y-1.5">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('subtitle')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('card.title')}</CardTitle>
					<CardDescription>{t('card.description')}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col items-center gap-4">
					<div
						className="relative rounded-xl bg-white p-4 shadow-sm"
						aria-label={t('qr.ariaLabel')}
					>
						{isLoading && (
							<Skeleton className="h-[220px] w-[220px] rounded-lg" />
						)}
						<Image
							src={qrImageUrl}
							width={220}
							height={220}
							alt={t('qr.alt')}
							className={cn(
								'h-[220px] w-[220px] transition-opacity duration-300',
								isLoading ? 'absolute opacity-0' : 'opacity-100'
							)}
							onLoad={() => setIsLoading(false)}
							sizes="220px"
							priority
						/>
					</div>
					<div className="w-full rounded-md border bg-muted/20 p-3 text-sm">
						<span className="text-muted-foreground">{t('link.label')} </span>
						<span className="break-all font-mono">
							{GOOGLE_PLAY_INTERNAL_TEST_URL}
						</span>
					</div>
				</CardContent>
				<CardFooter className="justify-end">
					<Button asChild variant="link" className="px-0">
						<a
							href={GOOGLE_PLAY_INTERNAL_TEST_URL}
							target="_blank"
							rel="noreferrer"
							aria-label={t('link.ariaLabel')}
						>
							{t('link.open')}
						</a>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
