'use client';

import React from 'react';

import { DisciplinaryMeasuresManager } from '@/components/disciplinary-measures-manager';

/**
 * Props for employee disciplinary measures tab.
 */
export interface EmployeeDisciplinaryMeasuresTabProps {
	/** Employee identifier in scope. */
	employeeId: string;
}

/**
 * Employee-level disciplinary measures tab.
 *
 * @param props - Tab props
 * @returns Embedded disciplinary manager filtered by employee
 */
export function EmployeeDisciplinaryMeasuresTab({
	employeeId,
}: EmployeeDisciplinaryMeasuresTabProps): React.ReactElement {
	return <DisciplinaryMeasuresManager employeeId={employeeId} embedded={true} />;
}
