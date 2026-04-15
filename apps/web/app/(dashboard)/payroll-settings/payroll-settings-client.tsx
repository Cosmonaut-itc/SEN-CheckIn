'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { TourHelpButton } from '@/components/tour-help-button';
import { DocumentWorkflowSettingsSection } from '@/components/document-workflow-settings-section';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchPayrollSettings } from '@/lib/client-functions';
import { updatePayrollSettingsAction } from '@/actions/payroll';
import { useAppForm, useStore } from '@/lib/forms';
import { useTour } from '@/hooks/use-tour';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { isValidIanaTimeZone } from '@/lib/time-zone';
import { parseDateKey } from '@/lib/date-key';
import { useOrgContext } from '@/lib/org-client-context';
import { cn } from '@/lib/utils';
import { PayrollHolidaysSection } from './payroll-holidays-section';

const dayOptions = [
	{ value: '0', labelKey: 'days.sunday' },
	{ value: '1', labelKey: 'days.monday' },
	{ value: '2', labelKey: 'days.tuesday' },
	{ value: '3', labelKey: 'days.wednesday' },
	{ value: '4', labelKey: 'days.thursday' },
	{ value: '5', labelKey: 'days.friday' },
	{ value: '6', labelKey: 'days.saturday' },
];

const ptuModeOptions = [
	{ value: 'DEFAULT_RULES', labelKey: 'ptu.modeOptions.default' },
	{ value: 'MANUAL', labelKey: 'ptu.modeOptions.manual' },
];

const employerTypeOptions = [
	{ value: 'PERSONA_MORAL', labelKey: 'ptu.employerTypeOptions.personaMoral' },
	{ value: 'PERSONA_FISICA', labelKey: 'ptu.employerTypeOptions.personaFisica' },
];

const dualPayrollPreviewCards: Array<{
	titleKey: 'taxSettings.dualPayroll.realTitle' | 'taxSettings.dualPayroll.fiscalTitle' | 'taxSettings.dualPayroll.complementTitle';
	descriptionKey:
		| 'taxSettings.dualPayroll.realDescription'
		| 'taxSettings.dualPayroll.fiscalDescription'
		| 'taxSettings.dualPayroll.complementDescription';
	accentBarClassName: string;
	titleClassName: string;
}> = [
	{
		titleKey: 'taxSettings.dualPayroll.realTitle',
		descriptionKey: 'taxSettings.dualPayroll.realDescription',
		accentBarClassName: 'bg-[color:var(--accent-primary)]',
		titleClassName: 'text-[color:var(--accent-primary)]',
	},
	{
		titleKey: 'taxSettings.dualPayroll.fiscalTitle',
		descriptionKey: 'taxSettings.dualPayroll.fiscalDescription',
		accentBarClassName: 'bg-[color:var(--accent-secondary)]',
		titleClassName: 'text-[color:var(--accent-secondary)]',
	},
	{
		titleKey: 'taxSettings.dualPayroll.complementTitle',
		descriptionKey: 'taxSettings.dualPayroll.complementDescription',
		accentBarClassName: 'bg-[color:var(--accent-tertiary)]',
		titleClassName: 'text-[color:var(--accent-tertiary)]',
	},
];

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_FIELD_META = {
	isValidating: false,
	isTouched: false,
	isBlurred: false,
	isDirty: false,
	isPristine: true,
	isValid: true,
	isDefaultValue: true,
	errors: [],
	errorMap: {},
	errorSourceMap: {},
};

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
		try {
			parseDateKey(line);
		} catch {
			throw new InvalidMandatoryRestDayDateError(line);
		}
	}

	const unique = Array.from(new Set(lines));
	unique.sort((a, b) => a.localeCompare(b));
	return unique;
}

/**
 * Parses a numeric text input into a number with range validation.
 *
 * @param value - Input string value
 * @param options - Validation options
 * @returns Parsed number or null when invalid
 */
function parseNumberInput(
	value: string,
	options: { min?: number; max?: number } = {},
): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	if (options.min !== undefined && parsed < options.min) {
		return null;
	}
	if (options.max !== undefined && parsed > options.max) {
		return null;
	}
	return parsed;
}

/**
 * Parses an integer input and validates bounds.
 *
 * @param value - Input string value
 * @param options - Validation options
 * @returns Parsed integer or null when invalid
 */
function parseIntegerInput(
	value: string,
	options: { min?: number; max?: number } = {},
): number | null {
	const parsed = parseNumberInput(value, options);
	if (parsed === null || !Number.isInteger(parsed)) {
		return null;
	}
	return parsed;
}

/**
 * Subscription no-op used by useSyncExternalStore for hydration gating.
 *
 * @returns Unsubscribe callback
 */
function subscribeNoop(): () => void {
	return () => undefined;
}

/**
 * Client snapshot resolver for hydration gating.
 *
 * @returns True when running after hydration on the client
 */
function getHydratedClientSnapshot(): boolean {
	return true;
}

/**
 * Server snapshot resolver for hydration gating.
 *
 * @returns False during SSR and hydration pass
 */
function getHydratedServerSnapshot(): boolean {
	return false;
}

export function PayrollSettingsClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const t = useTranslations('PayrollSettings');
	const tCommon = useTranslations('Common');
	useTour('payroll-settings');
	const isHydrated = useSyncExternalStore(
		subscribeNoop,
		getHydratedClientSnapshot,
		getHydratedServerSnapshot,
	);

	const { data, isLoading } = useQuery({
		queryKey: queryKeys.payrollSettings.current(organizationId),
		queryFn: () => fetchPayrollSettings(organizationId ?? undefined),
	});

	const mutation = useMutation({
		mutationKey: mutationKeys.payrollSettings.update,
		mutationFn: updatePayrollSettingsAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.saveSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.payrollSettings.all });
				queryClient.invalidateQueries({
					queryKey: queryKeys.payrollSettings.current(organizationId),
				});
			} else {
				toast.error(result.error ?? t('toast.saveError'));
			}
		},
		onError: () => {
			toast.error(t('toast.saveError'));
		},
	});

	const isInitialLoading = !isHydrated || isLoading;
	const canManagePayrollSettings =
		userRole === 'admin' || organizationRole === 'owner' || organizationRole === 'admin';
	const isFormDisabled =
		isInitialLoading || mutation.isPending || !canManagePayrollSettings;
	const canManageDualPayroll = canManagePayrollSettings;

	const form = useAppForm({
		defaultValues: {
			weekStartDay: '1',
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDaysText: '',
			riskWorkRate: '0',
			statePayrollTaxRate: '0',
			aguinaldoDays: '15',
			vacationPremiumRate: '0.25',
			realVacationPremiumRate: '0.25',
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			enableSeventhDayPay: false,
			enableDualPayroll: false,
			countSaturdayAsWorkedForSeventhDay: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: '',
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: false,
			lunchBreakMinutes: '60',
			lunchBreakThresholdHours: '6',
		},
		onSubmit: async ({ value }) => {
			if (!canManagePayrollSettings) {
				return;
			}

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

			const riskWorkRate = parseNumberInput(value.riskWorkRate, { min: 0, max: 1 });
			const statePayrollTaxRate = parseNumberInput(value.statePayrollTaxRate, {
				min: 0,
				max: 1,
			});
			const aguinaldoDays = parseIntegerInput(value.aguinaldoDays, { min: 0 });
			const vacationPremiumRate = parseNumberInput(value.vacationPremiumRate, {
				min: 0.25,
				max: 1,
			});
			const realVacationPremiumRate = parseNumberInput(value.realVacationPremiumRate, {
				min: 0.25,
				max: 1,
			});
			const lunchBreakMinutes = parseIntegerInput(value.lunchBreakMinutes, {
				min: 15,
				max: 120,
			});
			const lunchBreakThresholdHours = parseNumberInput(value.lunchBreakThresholdHours, {
				min: 4,
				max: 10,
			});

			const trimmedPtuExemptReason = value.ptuExemptReason.trim();
			if (value.ptuIsExempt && trimmedPtuExemptReason === '') {
				toast.error(t('validation.ptuExemptReason'));
				return;
			}

			if (
				riskWorkRate === null ||
				statePayrollTaxRate === null ||
				aguinaldoDays === null ||
				vacationPremiumRate === null ||
				realVacationPremiumRate === null ||
				(value.autoDeductLunchBreak &&
					(lunchBreakMinutes === null || lunchBreakThresholdHours === null))
			) {
				toast.error(t('validation.invalidNumber'));
				return;
			}

			const hasValidLunchBreakValues =
				lunchBreakMinutes !== null && lunchBreakThresholdHours !== null;
			const payload = {
				weekStartDay: Number(value.weekStartDay),
				timeZone: trimmedTimeZone,
				overtimeEnforcement: value.overtimeEnforcement as 'WARN' | 'BLOCK',
				additionalMandatoryRestDays,
				riskWorkRate,
				statePayrollTaxRate,
				absorbImssEmployeeShare: value.absorbImssEmployeeShare,
				absorbIsr: value.absorbIsr,
				aguinaldoDays,
				vacationPremiumRate,
				realVacationPremiumRate,
				enableSeventhDayPay: value.enableSeventhDayPay,
				enableDualPayroll: value.enableDualPayroll,
				countSaturdayAsWorkedForSeventhDay:
					value.countSaturdayAsWorkedForSeventhDay,
				ptuEnabled: value.ptuEnabled,
				ptuMode: value.ptuMode as 'DEFAULT_RULES' | 'MANUAL',
				ptuIsExempt: value.ptuIsExempt,
				ptuExemptReason: value.ptuIsExempt ? trimmedPtuExemptReason : null,
				employerType: value.employerType as 'PERSONA_MORAL' | 'PERSONA_FISICA',
				aguinaldoEnabled: value.aguinaldoEnabled,
				enableDisciplinaryMeasures: value.enableDisciplinaryMeasures,
				autoDeductLunchBreak: value.autoDeductLunchBreak,
				...(hasValidLunchBreakValues
					? {
							lunchBreakMinutes,
							lunchBreakThresholdHours,
						}
					: {}),
			};

			await mutation.mutateAsync(payload);
		},
	});
	const autoDeductLunchBreakEnabled = useStore(
		form.store,
		(state) => state.values.autoDeductLunchBreak,
	);
	const lunchBreakMinutesValue = useStore(form.store, (state) => state.values.lunchBreakMinutes);
	const lunchBreakThresholdHoursValue = useStore(
		form.store,
		(state) => state.values.lunchBreakThresholdHours,
	);

	const clearHiddenLunchBreakField = (fieldName: 'lunchBreakMinutes' | 'lunchBreakThresholdHours') => {
		form.setFieldValue(fieldName, '', { dontValidate: true });
		form.setFieldMeta(fieldName, () => EMPTY_FIELD_META);
	};
	const enableSeventhDayPayValue = useStore(
		form.store,
		(state) => state.values.enableSeventhDayPay,
	);
	const enableDualPayrollValue = useStore(
		form.store,
		(state) => state.values.enableDualPayroll,
	);
	const ptuIsExemptValue = useStore(form.store, (state) => state.values.ptuIsExempt);

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
		if (data?.riskWorkRate !== undefined) {
			form.setFieldValue('riskWorkRate', String(data.riskWorkRate));
		}
		if (data?.statePayrollTaxRate !== undefined) {
			form.setFieldValue('statePayrollTaxRate', String(data.statePayrollTaxRate));
		}
		if (data?.aguinaldoDays !== undefined) {
			form.setFieldValue('aguinaldoDays', String(data.aguinaldoDays));
		}
		if (data?.vacationPremiumRate !== undefined) {
			form.setFieldValue('vacationPremiumRate', String(data.vacationPremiumRate));
		}
		if (data?.realVacationPremiumRate !== undefined) {
			form.setFieldValue(
				'realVacationPremiumRate',
				String(data.realVacationPremiumRate),
			);
		}
		if (data?.absorbImssEmployeeShare !== undefined) {
			form.setFieldValue('absorbImssEmployeeShare', data.absorbImssEmployeeShare);
		}
		if (data?.absorbIsr !== undefined) {
			form.setFieldValue('absorbIsr', data.absorbIsr);
		}
		if (data?.enableSeventhDayPay !== undefined) {
			form.setFieldValue('enableSeventhDayPay', data.enableSeventhDayPay);
		}
		if (data?.enableDualPayroll !== undefined) {
			form.setFieldValue('enableDualPayroll', data.enableDualPayroll);
		}
		if (data?.countSaturdayAsWorkedForSeventhDay !== undefined) {
			form.setFieldValue(
				'countSaturdayAsWorkedForSeventhDay',
				data.countSaturdayAsWorkedForSeventhDay,
			);
		}
		if (data?.ptuEnabled !== undefined) {
			form.setFieldValue('ptuEnabled', data.ptuEnabled);
		}
		if (data?.ptuMode !== undefined) {
			form.setFieldValue('ptuMode', data.ptuMode);
		}
		if (data?.ptuIsExempt !== undefined) {
			form.setFieldValue('ptuIsExempt', data.ptuIsExempt);
		}
		if (data?.ptuExemptReason !== undefined) {
			form.setFieldValue('ptuExemptReason', data.ptuExemptReason ?? '');
		}
		if (data?.employerType !== undefined) {
			form.setFieldValue('employerType', data.employerType);
		}
		if (data?.aguinaldoEnabled !== undefined) {
			form.setFieldValue('aguinaldoEnabled', data.aguinaldoEnabled);
		}
		if (data?.enableDisciplinaryMeasures !== undefined) {
			form.setFieldValue('enableDisciplinaryMeasures', data.enableDisciplinaryMeasures);
		}
		if (data?.autoDeductLunchBreak !== undefined) {
			form.setFieldValue('autoDeductLunchBreak', data.autoDeductLunchBreak);
		}
		if (data?.lunchBreakMinutes !== undefined) {
			form.setFieldValue('lunchBreakMinutes', String(data.lunchBreakMinutes));
		}
		if (data?.lunchBreakThresholdHours !== undefined) {
			form.setFieldValue('lunchBreakThresholdHours', String(data.lunchBreakThresholdHours));
		}
		form.setFieldValue(
			'additionalMandatoryRestDaysText',
			(data?.additionalMandatoryRestDays ?? []).join('\n'),
		);
	}, [
		data?.weekStartDay,
		data?.timeZone,
		data?.overtimeEnforcement,
		data?.riskWorkRate,
		data?.statePayrollTaxRate,
		data?.aguinaldoDays,
		data?.vacationPremiumRate,
		data?.realVacationPremiumRate,
		data?.absorbImssEmployeeShare,
		data?.absorbIsr,
		data?.enableSeventhDayPay,
		data?.enableDualPayroll,
		data?.countSaturdayAsWorkedForSeventhDay,
		data?.ptuEnabled,
		data?.ptuMode,
		data?.ptuIsExempt,
		data?.ptuExemptReason,
		data?.employerType,
		data?.aguinaldoEnabled,
		data?.enableDisciplinaryMeasures,
		data?.autoDeductLunchBreak,
		data?.lunchBreakMinutes,
		data?.lunchBreakThresholdHours,
		data?.additionalMandatoryRestDays,
		form,
	]);

	useEffect(() => {
		if (autoDeductLunchBreakEnabled) {
			return;
		}

		if (parseIntegerInput(lunchBreakMinutesValue, { min: 15, max: 120 }) === null) {
			form.setFieldValue('lunchBreakMinutes', '');
		}

		if (parseNumberInput(lunchBreakThresholdHoursValue, { min: 4, max: 10 }) === null) {
			form.setFieldValue('lunchBreakThresholdHours', '');
		}
	}, [
		autoDeductLunchBreakEnabled,
		form,
		lunchBreakMinutesValue,
		lunchBreakThresholdHoursValue,
	]);

	return (
		<div className="space-y-4">
			<div
				data-tour="payroll-settings-title"
				className="flex flex-col gap-3 min-[1025px]:flex-row min-[1025px]:items-start min-[1025px]:justify-between"
			>
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<TourHelpButton tourId="payroll-settings" />
			</div>

			<Card data-tour="payroll-settings-week-start">
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
										isInitialLoading
											? tCommon('loading')
											: t('weekStart.selectDay')
									}
									disabled={isFormDisabled}
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
									disabled={isFormDisabled}
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
										isInitialLoading
											? tCommon('loading')
											: t('overtimeEnforcement.selectEnforcement')
									}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">{t('taxSettings.title')}</p>
							<p className="mt-1 text-xs">{t('taxSettings.description')}</p>
						</div>
						<form.AppField
							name="riskWorkRate"
							validators={{
								onChange: ({ value }) =>
									parseNumberInput(value, { min: 0, max: 1 }) === null
										? t('validation.invalidNumber')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('taxSettings.fields.riskWorkRate')}
									placeholder={t('taxSettings.placeholders.rate')}
									description={t('taxSettings.helpers.riskWorkRate')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="statePayrollTaxRate"
							validators={{
								onChange: ({ value }) =>
									parseNumberInput(value, { min: 0, max: 1 }) === null
										? t('validation.invalidNumber')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('taxSettings.fields.statePayrollTaxRate')}
									placeholder={t('taxSettings.placeholders.rate')}
									description={t('taxSettings.helpers.statePayrollTaxRate')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="aguinaldoDays"
							validators={{
								onChange: ({ value }) =>
									parseIntegerInput(value, { min: 0 }) === null
										? t('validation.invalidNumber')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('taxSettings.fields.aguinaldoDays')}
									placeholder={t('taxSettings.placeholders.days')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="vacationPremiumRate"
							validators={{
								onChange: ({ value }) =>
									parseNumberInput(value, { min: 0.25, max: 1 }) === null
										? t('validation.invalidNumber')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('taxSettings.fields.vacationPremiumRate')}
									placeholder={t('taxSettings.placeholders.rate')}
									description={t('taxSettings.helpers.vacationPremiumRate')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="realVacationPremiumRate"
							validators={{
								onChange: ({ value }) =>
									parseNumberInput(value, { min: 0.25, max: 1 }) === null
										? t('validation.invalidNumber')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('taxSettings.fields.realVacationPremiumRate')}
									placeholder={t('taxSettings.placeholders.rate')}
									description={t('taxSettings.helpers.realVacationPremiumRate')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="absorbImssEmployeeShare">
							{(field) => (
								<field.ToggleField
									label={t('taxSettings.fields.absorbImssEmployeeShare')}
									description={t('taxSettings.helpers.absorbImssEmployeeShare')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="absorbIsr">
							{(field) => (
								<field.ToggleField
									label={t('taxSettings.fields.absorbIsr')}
									description={t('taxSettings.helpers.absorbIsr')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="enableSeventhDayPay">
							{(field) => (
								<field.ToggleField
									label={t('taxSettings.fields.enableSeventhDayPay')}
									description={t('taxSettings.helpers.enableSeventhDayPay')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						{canManageDualPayroll ? (
							<div
								className={cn(
									'rounded-2xl border p-4 transition-colors',
									enableDualPayrollValue
										? 'border-[color:var(--accent-primary)]/35 bg-[color:var(--accent-primary-bg)] shadow-[var(--shadow-sm)]'
										: 'border-[color:var(--border-default)] bg-[color:var(--bg-secondary)]/70',
								)}
							>
								<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
									<div className="space-y-1">
										<p className="text-sm font-semibold text-[color:var(--text-primary)]">
											{t('taxSettings.fields.enableDualPayroll')}
										</p>
										<p className="text-xs text-[color:var(--text-tertiary)]">
											{t('taxSettings.helpers.enableDualPayroll')}
										</p>
									</div>
									<div className="min-w-0 flex-1">
										<form.AppField name="enableDualPayroll">
											{(field) => (
												<field.ToggleField
													label={t('taxSettings.fields.enableDualPayroll')}
													description={t(
														'taxSettings.helpers.enableDualPayroll',
													)}
													disabled={isFormDisabled}
												/>
											)}
										</form.AppField>
									</div>
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-3">
									{dualPayrollPreviewCards.map(
										({
											titleKey,
											descriptionKey,
											accentBarClassName,
											titleClassName,
										}) => (
											<div
												key={titleKey}
												className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)]/95 p-4 shadow-[var(--shadow-sm)]"
											>
												<div
													className={cn(
														'h-1.5 w-12 rounded-full',
														accentBarClassName,
													)}
												/>
												<p
													className={cn(
														'mt-3 text-[11px] font-semibold uppercase tracking-[0.16em]',
														titleClassName,
													)}
												>
													{t(titleKey)}
												</p>
												<p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
													{t(descriptionKey)}
												</p>
											</div>
										),
									)}
								</div>
							</div>
						) : null}
						{enableSeventhDayPayValue ? (
							<form.AppField name="countSaturdayAsWorkedForSeventhDay">
								{(field) => (
									<field.ToggleField
										label={t(
											'taxSettings.fields.countSaturdayAsWorkedForSeventhDay',
										)}
										description={t(
											'taxSettings.helpers.countSaturdayAsWorkedForSeventhDay',
										)}
										disabled={isFormDisabled}
									/>
								)}
							</form.AppField>
						) : null}
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">{t('lunchBreak.title')}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{t('lunchBreak.description')}
							</p>
						</div>
						<form.AppField name="autoDeductLunchBreak">
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										{t('lunchBreak.fields.autoDeductLunchBreak')}
									</Label>
									<div className="col-span-3 flex items-center gap-2">
										<input
											type="checkbox"
											id={field.name}
											checked={Boolean(field.state.value)}
											onChange={(event) => {
												const nextChecked = event.target.checked;
												field.handleChange(nextChecked);
												if (nextChecked) {
													return;
												}

												if (
													parseIntegerInput(lunchBreakMinutesValue, {
														min: 15,
														max: 120,
													}) === null
												) {
													clearHiddenLunchBreakField('lunchBreakMinutes');
												}

												if (
													parseNumberInput(lunchBreakThresholdHoursValue, {
														min: 4,
														max: 10,
													}) === null
												) {
													clearHiddenLunchBreakField(
														'lunchBreakThresholdHours',
													);
												}
											}}
											onBlur={field.handleBlur}
											disabled={isFormDisabled}
											className="h-4 w-4 accent-primary"
										/>
										<p className="text-xs text-muted-foreground">
											{t('lunchBreak.helpers.autoDeductLunchBreak')}
										</p>
									</div>
								</div>
							)}
						</form.AppField>
						{autoDeductLunchBreakEnabled ? (
							<>
								<form.AppField
									name="lunchBreakMinutes"
									validators={{
										onChange: ({ value }) =>
											parseIntegerInput(value, { min: 15, max: 120 }) === null
												? t('validation.invalidNumber')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('lunchBreak.fields.lunchBreakMinutes')}
											placeholder={t('lunchBreak.placeholders.minutes')}
											description={t('lunchBreak.helpers.lunchBreakMinutes')}
											disabled={isFormDisabled}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="lunchBreakThresholdHours"
									validators={{
										onChange: ({ value }) =>
											parseNumberInput(value, { min: 4, max: 10 }) === null
												? t('validation.invalidNumber')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('lunchBreak.fields.lunchBreakThresholdHours')}
											placeholder={t(
												'lunchBreak.placeholders.thresholdHours',
											)}
											description={t(
												'lunchBreak.helpers.lunchBreakThresholdHours',
											)}
											disabled={isFormDisabled}
										/>
									)}
								</form.AppField>
							</>
						) : null}
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">{t('ptu.title')}</p>
							<p className="mt-1 text-xs">{t('ptu.description')}</p>
						</div>
						<form.AppField name="ptuEnabled">
							{(field) => (
								<field.ToggleField
									label={t('ptu.fields.enabled')}
									description={t('ptu.helpers.enabled')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="ptuMode">
							{(field) => (
								<field.SelectField
									label={t('ptu.fields.mode')}
									options={ptuModeOptions.map((option) => ({
										value: option.value,
										label: t(option.labelKey),
									}))}
									placeholder={t('ptu.placeholders.mode')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="ptuIsExempt">
							{(field) => (
								<field.ToggleField
									label={t('ptu.fields.isExempt')}
									description={t('ptu.helpers.isExempt')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						{ptuIsExemptValue ? (
							<form.AppField name="ptuExemptReason">
								{(field) => (
									<field.TextField
										label={t('ptu.fields.exemptReason')}
										placeholder={t('ptu.placeholders.exemptReason')}
										disabled={isFormDisabled}
									/>
								)}
							</form.AppField>
						) : null}
						<form.AppField name="employerType">
							{(field) => (
								<field.SelectField
									label={t('ptu.fields.employerType')}
									options={employerTypeOptions.map((option) => ({
										value: option.value,
										label: t(option.labelKey),
									}))}
									placeholder={t('ptu.placeholders.employerType')}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppField name="aguinaldoEnabled">
							{(field) => (
								<field.ToggleField
									label={t('ptu.fields.aguinaldoEnabled')}
									description={t('ptu.helpers.aguinaldoEnabled')}
									disabled={isFormDisabled}
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
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">{t('disciplinary.title')}</p>
							<p className="mt-1 text-xs">{t('disciplinary.description')}</p>
						</div>
						<form.AppField name="enableDisciplinaryMeasures">
							{(field) => (
								<field.ToggleField
									label={t('disciplinary.fields.enableDisciplinaryMeasures')}
									description={t(
										'disciplinary.helpers.enableDisciplinaryMeasures',
									)}
									disabled={isFormDisabled}
								/>
							)}
						</form.AppField>
						<form.AppForm>
							{canManagePayrollSettings ? (
								<form.SubmitButton
									label={tCommon('save')}
									loadingLabel={tCommon('saving')}
									className="mt-2"
								/>
							) : null}
						</form.AppForm>
					</form>
				</CardContent>
			</Card>

			<PayrollHolidaysSection />

			<DocumentWorkflowSettingsSection />
		</div>
	);
}
