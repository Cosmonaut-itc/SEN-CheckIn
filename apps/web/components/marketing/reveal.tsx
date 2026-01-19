'use client';

import React, { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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
	const prefersReducedMotion = useReducedMotion();
	const initialState = prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: yOffset };
	const transition = prefersReducedMotion
		? { duration: 0 }
		: { duration: 0.6, delay };

	return (
		<motion.div
			className={cn(className)}
			initial={initialState}
			whileInView={{ opacity: 1, y: 0 }}
			transition={transition}
			viewport={{ once: true, amount: 0.3 }}
		>
			{children}
		</motion.div>
	);
}
