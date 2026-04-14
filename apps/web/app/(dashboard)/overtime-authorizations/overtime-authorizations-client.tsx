'use client';

import React from 'react';

import { OvertimeAuthorizationsManager } from '@/components/overtime/overtime-authorizations-manager';
import { TourHelpButton } from '@/components/tour-help-button';
import { useTour } from '@/hooks/use-tour';

/**
 * Client wrapper for the overtime authorizations dashboard page.
 *
 * @returns Overtime authorizations manager with guided tour wiring
 */
export function OvertimeAuthorizationsPageClient(): React.ReactElement {
	useTour('overtime-authorizations');

	return (
		<OvertimeAuthorizationsManager
			extraActions={<TourHelpButton tourId="overtime-authorizations" />}
		/>
	);
}
