'use client';

import React, { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Props for the Reveal component.
 */
export interface RevealProps {
	/** Content to reveal */
	children: ReactNode;
	/** Optional class name for the wrapper */
	className?: string;
	/** Animation delay in seconds */
	delay?: number;
	/** Vertical offset in pixels for the initial state */
	yOffset?: number;
}

/**
 * Animate content into view with a subtle fade/slide effect.
 *
 * @param props - Component props with animation controls
 * @returns The animated wrapper element
 */
export function Reveal({
	children,
	className,
	delay = 0,
	yOffset = 18,
}: RevealProps): React.ReactElement {
	return (
		<motion.div
			className={cn(className)}
			initial={{ opacity: 0, y: yOffset }}
			whileInView={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, ease: 'easeOut', delay }}
			viewport={{ once: true, amount: 0.3 }}
		>
			{children}
		</motion.div>
	);
}
