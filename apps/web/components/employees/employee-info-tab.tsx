'use client';

import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import type { Employee } from '@/lib/client-functions';

/**
 * Props for the employee info tab.
 */
export interface EmployeeInfoTabProps {
	/** Active employee record. */
	employee: Employee | null;
	/** Resolved location label. */
	locationName: string;
	/** Localized shift type label. */
	shiftTypeLabel: string;
	/** Date-fns format pattern. */
	dateFormat: string;
}

interface EmployeeInfoField {
	/** Stable key for rendering. */
	key: string;
	/** Visible label. */
	label: string;
	/** Static text value when not interactive. */
	value: string;
	/** Optional link href. */
	href?: string;
}

/**
 * Resolves the common placeholder for empty values.
 *
 * @param value - Candidate string value
 * @param fallback - Fallback string to return
 * @returns Non-empty string value or fallback
 */
function resolveValue(value: string | null | undefined, fallback: string): string {
	return value && value.trim().length > 0 ? value : fallback;
}

/**
 * Builds the rendered info fields for the employee tab.
 *
 * @param employee - Active employee
 * @param locationName - Resolved location label
 * @param shiftTypeLabel - Localized shift type label
 * @param dateFormat - Date-fns format pattern
 * @param t - Employees translator
 * @param tCommon - Common translator
 * @returns Ordered info field definitions
 */
function buildFields(
	employee: Employee | null,
	locationName: string,
	shiftTypeLabel: string,
	dateFormat: string,
	t: ReturnType<typeof useTranslations<'Employees'>>,
	tCommon: ReturnType<typeof useTranslations<'Common'>>,
): EmployeeInfoField[] {
	const notAvailable = tCommon('notAvailable');

	return [
		{
			key: 'location',
			label: t('fields.location'),
			value: resolveValue(locationName, notAvailable),
		},
		{
			key: 'jobPosition',
			label: t('fields.jobPosition'),
			value: resolveValue(employee?.jobPositionName, notAvailable),
		},
		{
			key: 'hireDate',
			label: t('fields.hireDate'),
			value: employee?.hireDate ? format(employee.hireDate, dateFormat) : notAvailable,
		},
		{
			key: 'shiftType',
			label: t('fields.shiftType'),
			value: resolveValue(shiftTypeLabel, notAvailable),
		},
		{
			key: 'email',
			label: t('fields.email'),
			value: resolveValue(employee?.email, notAvailable),
			href: employee?.email ? `mailto:${employee.email}` : undefined,
		},
		{
			key: 'phone',
			label: t('fields.phone'),
			value: resolveValue(employee?.phone, notAvailable),
			href: employee?.phone ? `tel:${employee.phone}` : undefined,
		},
		{
			key: 'nss',
			label: t('fields.nss'),
			value: resolveValue(employee?.nss, notAvailable),
		},
		{
			key: 'rfc',
			label: t('fields.rfc'),
			value: resolveValue(employee?.rfc, notAvailable),
		},
		{
			key: 'department',
			label: t('fields.department'),
			value: resolveValue(employee?.department, notAvailable),
		},
		{
			key: 'user',
			label: t('fields.user'),
			value: employee?.userId ? employee.userId : t('placeholders.noUser'),
		},
	];
}

/**
 * Renders the mobile employee info tab content.
 *
 * @param props - Component props
 * @returns Employee info tab JSX
 */
export function EmployeeInfoTab({
	employee,
	locationName,
	shiftTypeLabel,
	dateFormat,
}: EmployeeInfoTabProps): React.ReactElement {
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
	const fields = buildFields(employee, locationName, shiftTypeLabel, dateFormat, t, tCommon);

	return (
		<div className="grid gap-3">
			{fields.map((field) => (
				<div
					key={field.key}
					data-testid="employee-info-field"
					className="rounded-2xl border p-4"
				>
					<p className="text-xs text-muted-foreground">{field.label}</p>
					{field.href ? (
						<Link
							href={field.href}
							className="mt-1 inline-flex min-h-11 items-center font-medium text-[var(--accent-primary)]"
						>
							{field.value}
						</Link>
					) : (
						<p className="mt-1 font-medium">{field.value}</p>
					)}
				</div>
			))}
		</div>
	);
}
