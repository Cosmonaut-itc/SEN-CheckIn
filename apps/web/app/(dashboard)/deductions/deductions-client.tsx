'use client';

import React from 'react';

import { EmployeeDeductionsManager } from '@/components/employee-deductions-manager';
import { TourHelpButton } from '@/components/tour-help-button';
import { useTour } from '@/hooks/use-tour';

/**
 * Client wrapper for the deductions dashboard page.
 *
 * @returns Deductions manager with guided tour wiring
 */
export function DeductionsPageClient(): React.ReactElement {
	useTour('deductions');

	return (
		<EmployeeDeductionsManager
			mode="organization"
			headerActions={<TourHelpButton tourId="deductions" />}
		/>
	);
}
