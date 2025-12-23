import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useAppForm, useStore } from '@/lib/forms';
import type { ScheduleTemplate } from '@/lib/client-functions';
import type { ScheduleTemplateDayInput, ShiftType } from '@/actions/schedules';
import { useTranslations } from 'next-intl';
import { DayScheduleEditor } from './day-schedule-editor';
import {
	LaborLawWarnings,
	evaluateWarnings,
	computeWeeklyHours,
	type ScheduleWarning,
} from './labor-law-warnings';
import { toast } from 'sonner';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

/**
 * Maps a schedule template into editable day inputs.
 *
 * @param template - Template to map
 * @returns Day input array
 */
function mapTemplateDays(template?: ScheduleTemplate | null): ScheduleTemplateDayInput[] {
	if (!template?.days) {
		return [];
	}
	return template.days.map((day) => ({
		dayOfWeek: day.dayOfWeek,
		startTime: day.startTime,
		endTime: day.endTime,
		isWorkingDay: day.isWorkingDay,
	}));
}

/**
 * Creates a default Monday–Saturday daytime schedule.
 *
 * @returns Default day input array
 */
function createDefaultDays(): ScheduleTemplateDayInput[] {
	return Array.from({ length: 7 }, (_, index) => ({
		dayOfWeek: index,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: index >= 1 && index <= 6, // Monday–Saturday to align with 48h/6d (8h)
	}));
}

/**
 * Creates a default day schedule preset for the selected shift type.
 *
 * Defaults to a Monday–Saturday working week to align with Mexican weekly hour limits.
 *
 * @param shiftType - Selected shift type
 * @returns Default day schedule inputs
 */
function createDefaultDaysForShift(shiftType: ShiftType): ScheduleTemplateDayInput[] {
	const preset =
		shiftType === 'NOCTURNA'
			? { startTime: '22:00', endTime: '05:00' } // 7h, Monday–Saturday = 42h
			: shiftType === 'MIXTA'
				? { startTime: '15:00', endTime: '22:30' } // 7.5h, nocturnidad < 3.5h
				: { startTime: '09:00', endTime: '17:00' }; // 8h, Monday–Saturday = 48h
	return Array.from({ length: 7 }, (_, index) => ({
		dayOfWeek: index,
		startTime: preset.startTime,
		endTime: preset.endTime,
		isWorkingDay: index >= 1 && index <= 6, // Monday–Saturday on
	}));
}

/**
 * Props for the TemplateFormDialog component.
 */
export interface TemplateFormDialogProps {
	/** Dialog open state */
	open: boolean;
	/** Handler for dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** Callback executed on submit */
	onSubmit: (input: {
		name: string;
		description?: string | null;
		shiftType: ShiftType;
		days: ScheduleTemplateDayInput[];
	}) => Promise<void> | void;
	/** Template to edit; undefined for create */
	initialTemplate?: ScheduleTemplate | null;
	/** Week start day used for UX hints */
	weekStartDay: number;
	/** Overtime enforcement mode */
	overtimeEnforcement: 'WARN' | 'BLOCK';
}

/**
 * Dialog wrapper for creating or editing schedule templates.
 *
 * @param props - Component props
 * @returns Rendered dialog with form
 */
export function TemplateFormDialog({
	open,
	onOpenChange,
	onSubmit,
	initialTemplate,
	weekStartDay,
	overtimeEnforcement,
}: TemplateFormDialogProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const tCommon = useTranslations('Common');
	const shiftChangeInitializedRef = useRef<boolean>(false);
	const weekStartDayKey: DayKey = DAY_KEYS[weekStartDay] ?? 'mon';
	const weekStartDayLabel = t(`days.long.${weekStartDayKey}`);

	const form = useAppForm({
		defaultValues: {
			name: initialTemplate?.name ?? '',
			description: initialTemplate?.description ?? '',
			shiftType: initialTemplate?.shiftType ?? ('DIURNA' as ShiftType),
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				name: value.name,
				description: value.description?.trim() === '' ? null : value.description,
				shiftType: value.shiftType,
				days: daySchedules,
			});
		},
	});

	const shiftTypeValue = useStore(form.store, (state) => state.values.shiftType);

	const [daySchedules, setDaySchedules] = useState<ScheduleTemplateDayInput[]>(() => {
		const mapped = mapTemplateDays(initialTemplate);
		return mapped.length > 0 ? mapped : createDefaultDays();
	});

	useEffect(() => {
		const mapped = mapTemplateDays(initialTemplate);
		// eslint-disable-next-line react-hooks/set-state-in-effect -- reset form state when editing a different template
		setDaySchedules(mapped.length > 0 ? mapped : createDefaultDays());

		if (initialTemplate) {
			form.setFieldValue('name', initialTemplate.name);
			form.setFieldValue('description', initialTemplate.description ?? '');
			form.setFieldValue('shiftType', initialTemplate.shiftType as ShiftType);
		} else {
			form.reset({
				name: '',
				description: '',
				shiftType: 'DIURNA',
			});
		}
		shiftChangeInitializedRef.current = false;
	}, [initialTemplate, form]);

	useEffect(() => {
		if (!shiftChangeInitializedRef.current) {
			shiftChangeInitializedRef.current = true;
			return;
		}
		const defaults = createDefaultDaysForShift(shiftTypeValue as ShiftType);
		// eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed day schedules when the shift changes
		setDaySchedules(defaults);
	}, [shiftTypeValue]);

	const warningsInput = useMemo(
		() => ({
			shiftType: form.state.values.shiftType,
			days: daySchedules,
		}),
		[form.state.values.shiftType, daySchedules],
	);

	const warnings: ScheduleWarning[] = useMemo(
		() => evaluateWarnings(warningsInput.shiftType, warningsInput.days, overtimeEnforcement),
		[overtimeEnforcement, warningsInput],
	);

	const hasBlockingErrors =
		overtimeEnforcement === 'BLOCK' && warnings.some((w) => w.severity === 'error');

	const weeklyTotals = useMemo(() => {
		const total = computeWeeklyHours(daySchedules);
		const limit =
			warningsInput.shiftType === 'NOCTURNA'
				? 42
				: warningsInput.shiftType === 'MIXTA'
					? 45
					: 48;
		return { total, limit, diff: total - limit };
	}, [daySchedules, warningsInput.shiftType]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-h-[calc(100vh-6rem)] sm:max-w-5xl lg:max-w-6xl">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						if (hasBlockingErrors) {
							toast.error(t('templateForm.toast.blockingErrors'));
							return;
						}
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<DialogHeader>
						<DialogTitle>
							{initialTemplate
								? t('templateForm.title.edit')
								: t('templateForm.title.create')}
						</DialogTitle>
						<DialogDescription>{t('templateForm.description')}</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField
							name="name"
							validators={{
								onChange: ({ value }) =>
									!value.trim()
										? t('templateForm.validation.nameRequired')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('templateForm.fields.name.label')}
									placeholder={t('templateForm.fields.name.placeholder')}
								/>
							)}
						</form.AppField>

						<form.AppField name="shiftType">
							{(field) => (
								<field.SelectField
									label={t('templateForm.fields.shiftType.label')}
									options={[
										{ value: 'DIURNA', label: t('shiftTypes.options.DIURNA') },
										{
											value: 'NOCTURNA',
											label: t('shiftTypes.options.NOCTURNA'),
										},
										{ value: 'MIXTA', label: t('shiftTypes.options.MIXTA') },
									]}
									placeholder={t('templateForm.fields.shiftType.placeholder')}
								/>
							)}
						</form.AppField>

						<form.AppField name="description">
							{(field) => (
								<field.TextareaField
									label={t('templateForm.fields.description.label')}
									placeholder={t('templateForm.fields.description.placeholder')}
									rows={3}
								/>
							)}
						</form.AppField>
						<div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">
								{t('templateForm.weekStartDay.title')}
							</p>
							<p>
								{t('templateForm.weekStartDay.description', {
									day: weekStartDayLabel,
								})}
							</p>
							<p className="mt-1">{t('templateForm.weekStartDay.hint')}</p>
						</div>
					</div>

					<div
						className={`rounded-md border p-3 text-sm ${
							weeklyTotals.diff > 0
								? 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
								: weeklyTotals.diff < 0
									? 'border-amber-300 bg-amber-50 text-amber-900'
									: 'border-emerald-200 bg-emerald-50 text-emerald-900'
						}`}
					>
						<p className="font-medium">
							{t('templateForm.weeklyTotals.summary', {
								total: weeklyTotals.total.toFixed(2),
								limit: weeklyTotals.limit,
							})}
						</p>
						{weeklyTotals.diff > 0 && (
							<p>
								{t('templateForm.weeklyTotals.over', {
									diff: weeklyTotals.diff.toFixed(2),
								})}
							</p>
						)}
						{weeklyTotals.diff < 0 && (
							<p>
								{t('templateForm.weeklyTotals.under', {
									diff: Math.abs(weeklyTotals.diff).toFixed(2),
								})}
							</p>
						)}
						{weeklyTotals.diff === 0 && <p>{t('templateForm.weeklyTotals.exact')}</p>}
					</div>

					<DayScheduleEditor
						days={daySchedules}
						shiftType={form.state.values.shiftType}
						onChange={setDaySchedules}
					/>

					<LaborLawWarnings
						shiftType={warningsInput.shiftType}
						days={warningsInput.days}
						overtimeEnforcement={overtimeEnforcement}
					/>
					{hasBlockingErrors && (
						<p className="text-sm text-destructive">
							{t('templateForm.blockingFooter')}
						</p>
					)}

					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton
								label={
									initialTemplate
										? t('templateForm.actions.saveChanges')
										: t('templateForm.actions.create')
								}
								loadingLabel={tCommon('saving')}
							/>
						</form.AppForm>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
