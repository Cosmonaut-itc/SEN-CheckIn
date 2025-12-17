'use client';

import React, { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchPayrollSettings } from '@/lib/client-functions';
import { updatePayrollSettingsAction } from '@/actions/payroll';
import { useAppForm } from '@/lib/forms';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { isValidIanaTimeZone } from '@/lib/time-zone';

const dayOptions = [
	{ value: '0', labelKey: 'days.sunday' },
	{ value: '1', labelKey: 'days.monday' },
	{ value: '2', labelKey: 'days.tuesday' },
	{ value: '3', labelKey: 'days.wednesday' },
	{ value: '4', labelKey: 'days.thursday' },
	{ value: '5', labelKey: 'days.friday' },
	{ value: '6', labelKey: 'days.saturday' },
];

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Error thrown when a mandatory rest day date key is invalid.
 */
class InvalidMandatoryRestDayDateError extends Error {
	public readonly dateKey: string;

	/**
	 * @param dateKey - The invalid date key value
	 */
	constructor(dateKey: string) {
		super('Invalid mandatory rest day date key');
		this.name = 'InvalidMandatoryRestDayDateError';
		this.dateKey = dateKey;
	}
}

/**
 * Parses a newline-separated textarea value into sorted, unique date keys.
 *
 * @param value - Newline-separated list of YYYY-MM-DD date keys
 * @returns Sorted unique YYYY-MM-DD date keys
 * @throws InvalidMandatoryRestDayDateError when any non-empty line is not in YYYY-MM-DD format
 */
function parseAdditionalMandatoryRestDaysText(value: string): string[] {
	const lines = value
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => Boolean(line));

	for (const line of lines) {
		if (!DATE_KEY_REGEX.test(line)) {
			throw new InvalidMandatoryRestDayDateError(line);
		}
	}

	const unique = Array.from(new Set(lines));
	unique.sort((a, b) => a.localeCompare(b));
	return unique;
}

export function PayrollSettingsClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const t = useTranslations('PayrollSettings');
	const tCommon = useTranslations('Common');

	const { data, isLoading } = useQuery({
		queryKey: queryKeys.payrollSettings.current(undefined),
		queryFn: () => fetchPayrollSettings(),
	});

	const mutation = useMutation({
		mutationKey: mutationKeys.payrollSettings.update,
		mutationFn: updatePayrollSettingsAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.saveSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.payrollSettings.all });
				queryClient.invalidateQueries({
					queryKey: queryKeys.payrollSettings.current(undefined),
				});
			} else {
				toast.error(result.error ?? t('toast.saveError'));
			}
		},
		onError: () => {
			toast.error(t('toast.saveError'));
		},
	});

	const form = useAppForm({
		defaultValues: {
			weekStartDay: '1',
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDaysText: '',
		},
		onSubmit: async ({ value }) => {
			const trimmedTimeZone = value.timeZone.trim();
			if (!isValidIanaTimeZone(trimmedTimeZone)) {
				toast.error(t('validation.invalidTimeZone'));
				return;
			}

			let additionalMandatoryRestDays: string[];
			try {
				additionalMandatoryRestDays = parseAdditionalMandatoryRestDaysText(
					value.additionalMandatoryRestDaysText,
				);
			} catch (error) {
				if (error instanceof InvalidMandatoryRestDayDateError) {
					toast.error(t('validation.invalidDate', { date: error.dateKey }));
					return;
				}

				toast.error(t('validation.invalidDates'));
				return;
			}

			await mutation.mutateAsync({
				weekStartDay: Number(value.weekStartDay),
				timeZone: trimmedTimeZone,
				overtimeEnforcement: value.overtimeEnforcement as 'WARN' | 'BLOCK',
				additionalMandatoryRestDays,
			});
		},
	});

	useEffect(() => {
		if (data?.weekStartDay !== undefined) {
			form.setFieldValue('weekStartDay', String(data.weekStartDay));
		}
		if (data?.timeZone !== undefined) {
			form.setFieldValue('timeZone', data.timeZone);
		}
		if (data?.overtimeEnforcement !== undefined) {
			form.setFieldValue('overtimeEnforcement', data.overtimeEnforcement);
		}
		form.setFieldValue(
			'additionalMandatoryRestDaysText',
			(data?.additionalMandatoryRestDays ?? []).join('\n'),
		);
	}, [
		data?.weekStartDay,
		data?.timeZone,
		data?.overtimeEnforcement,
		data?.additionalMandatoryRestDays,
		form,
	]);

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('subtitle')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('weekStart.title')}</CardTitle>
					<CardDescription>{t('weekStart.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						<form.AppField name="weekStartDay">
							{(field) => (
								<field.SelectField
									label={t('weekStart.label')}
									options={dayOptions.map((opt) => ({
										value: opt.value,
										label: t(opt.labelKey),
									}))}
									placeholder={
										isLoading ? tCommon('loading') : t('weekStart.selectDay')
									}
									disabled={isLoading || mutation.isPending}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="timeZone"
							validators={{
								onChange: ({ value }) =>
									isValidIanaTimeZone(value.trim())
										? undefined
										: t('validation.invalidTimeZone'),
							}}
						>
							{(field) => (
								<field.TextField
									label={t('timeZone.label')}
									placeholder={t('timeZone.placeholder')}
									description={t('timeZone.description')}
									disabled={isLoading || mutation.isPending}
								/>
							)}
						</form.AppField>
						<form.AppField name="overtimeEnforcement">
							{(field) => (
								<field.SelectField
									label={t('overtimeEnforcement.label')}
									options={[
										{
											value: 'WARN',
											label: t('overtimeEnforcement.options.WARN'),
										},
										{
											value: 'BLOCK',
											label: t('overtimeEnforcement.options.BLOCK'),
										},
									]}
									placeholder={
										isLoading
											? tCommon('loading')
											: t('overtimeEnforcement.selectEnforcement')
									}
									disabled={isLoading || mutation.isPending}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="additionalMandatoryRestDaysText"
							validators={{
								onChange: ({ value }) => {
									try {
										parseAdditionalMandatoryRestDaysText(value);
										return undefined;
									} catch (error) {
										if (error instanceof InvalidMandatoryRestDayDateError) {
											return t('validation.invalidDate', {
												date: error.dateKey,
											});
										}
										return t('validation.invalidDates');
									}
								},
							}}
						>
							{(field) => (
								<field.TextareaField
									label={t('additionalMandatoryRestDays.label')}
									placeholder={t('additionalMandatoryRestDays.placeholder')}
									description={t('additionalMandatoryRestDays.description')}
									rows={4}
								/>
							)}
						</form.AppField>
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">{t('legalRules.title')}</p>
							<ul className="list-disc pl-4">
								<li>{t('legalRules.items.maxOvertimePerDay')}</li>
								<li>{t('legalRules.items.firstNineDouble')}</li>
								<li>{t('legalRules.items.additionalTriple')}</li>
								<li>{t('legalRules.items.sundayPremium')}</li>
								<li>{t('legalRules.items.mandatoryRestDay')}</li>
							</ul>
						</div>
						<form.AppForm>
							<form.SubmitButton
								label={tCommon('save')}
								loadingLabel={tCommon('saving')}
								className="mt-2"
							/>
						</form.AppForm>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
