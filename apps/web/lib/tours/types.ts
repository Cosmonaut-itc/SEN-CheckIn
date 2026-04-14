import type { Placement } from 'react-joyride';

/**
 * A single step in a guided tour.
 */
export interface TourStep {
	/** CSS selector for the element to highlight */
	target: string;
	/** i18n key within the Tours namespace (for example, dashboard.step1) */
	contentKey: string;
	/** Tooltip placement relative to the target */
	placement: Placement;
}

/**
 * Configuration for a section-level guided tour.
 */
export interface TourConfig {
	/** Unique tour identifier, used in persistent tracking */
	id: string;
	/** Route prefix where this tour should auto-activate */
	section: string;
	/** Whether the tour is restricted to admin roles */
	adminOnly: boolean;
	/** Ordered Joyride step definitions */
	steps: TourStep[];
}
