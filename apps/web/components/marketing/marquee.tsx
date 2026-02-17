'use client';

import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MarqueeProps {
	children: ReactNode;
	className?: string;
	/** Duration in seconds for one full scroll cycle */
	duration?: number;
	reverse?: boolean;
	pauseOnHover?: boolean;
}

/**
 * Infinite-scroll marquee component for displaying repeating content.
 *
 * @param props - Component props with animation controls
 * @returns The marquee component
 */
export function Marquee({
	children,
	className,
	duration = 40,
	reverse = false,
	pauseOnHover = false,
}: MarqueeProps): React.ReactElement {
	return (
		<div
			className={cn('group overflow-hidden', className)}
			aria-hidden="true"
		>
			<div
				className={cn(
					'flex w-max',
					pauseOnHover && 'group-hover:[animation-play-state:paused]',
				)}
				style={{
					animation: `marquee ${duration}s linear infinite${reverse ? ' reverse' : ''}`,
				}}
			>
				<div className="flex shrink-0 items-center">{children}</div>
				<div className="flex shrink-0 items-center">{children}</div>
			</div>
		</div>
	);
}
