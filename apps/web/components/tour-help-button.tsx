'use client';

import React from 'react';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTour } from '@/hooks/use-tour';

/**
 * Props for the TourHelpButton component.
 */
interface TourHelpButtonProps {
	/** Tour identifier to restart when the button is pressed. */
	tourId: string;
}

/**
 * Renders a compact help button that restarts the current section tour.
 *
 * @param props - Component props
 * @returns Help button with tooltip affordance
 */
export function TourHelpButton({ tourId }: TourHelpButtonProps): React.ReactElement {
	const { restartTour } = useTour(tourId);
	const t = useTranslations('Tours');

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={restartTour}
					aria-label={t('helpButtonTooltip')}
					className="shrink-0 rounded-md border border-transparent hover:border-[color:var(--border-subtle)]"
				>
					<CircleHelp className="h-4 w-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent sideOffset={8}>
				<p>{t('helpButtonTooltip')}</p>
			</TooltipContent>
		</Tooltip>
	);
}
