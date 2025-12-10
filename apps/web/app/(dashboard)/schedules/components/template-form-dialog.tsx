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
import { DayScheduleEditor } from './day-schedule-editor';
import {
	LaborLawWarnings,
	evaluateWarnings,
	computeWeeklyHours,
	type ScheduleWarning,
} from './labor-law-warnings';
import { toast } from 'sonner';

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
 * Creates a default Monday–Friday daytime schedule.
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

function createDefaultDaysForShift(shiftType: ShiftType): ScheduleTemplateDayInput[] {
	const preset =
		shiftType === 'NOCTURNA'
			? { startTime: '22:00', endTime: '05:00' } // 7h, Monday–Saturday = 42h
			: shiftType === 'MIXTA'
				? { startTime: '18:00', endTime: '01:30' } // 7.5h, Monday–Saturday = 45h
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
	/** Indicates whether the form is currently submitting */
	isSubmitting?: boolean;
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
	isSubmitting,
	weekStartDay,
	overtimeEnforcement,
}: TemplateFormDialogProps): React.ReactElement {
	const shiftChangeInitializedRef = useRef<boolean>(false);

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
		() => evaluateWarnings(warningsInput.shiftType, warningsInput.days),
		[warningsInput],
	);

	const hasBlockingErrors = overtimeEnforcement === 'BLOCK' && warnings.some((w) => w.severity === 'error');

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
							toast.error('Schedule exceeds legal limits. Adjust hours before saving.');
							return;
						}
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<DialogHeader>
						<DialogTitle>
							{initialTemplate ? 'Edit Schedule Template' : 'Create Schedule Template'}
						</DialogTitle>
						<DialogDescription>
							Define working hours per day and validate against LFT limits.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField
							name="name"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
							}}
						>
							{(field) => <field.TextField label="Template Name" placeholder="Turno Matutino" />}
						</form.AppField>

						<form.AppField name="shiftType">
							{(field) => (
								<field.SelectField
									label="Shift Type"
									options={[
										{ value: 'DIURNA', label: 'Diurna — 8h diarias / 48h semanales' },
										{ value: 'NOCTURNA', label: 'Nocturna — 7h diarias / 42h semanales' },
										{ value: 'MIXTA', label: 'Mixta — 7.5h diarias / 45h semanales' },
									]}
									placeholder="Select shift type"
								/>
							)}
						</form.AppField>

						<form.AppField name="description">
							{(field) => (
								<field.TextareaField
									label="Description"
									placeholder="Optional context for the template"
									rows={3}
								/>
							)}
						</form.AppField>
						<div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">Week start day</p>
							<p>The current payroll settings start the week on day index {weekStartDay}.</p>
							<p className="mt-1">
								Adjust your working days accordingly to avoid weekly limit breaches.
							</p>
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
							Weekly hours: {weeklyTotals.total.toFixed(2)}h / limit {weeklyTotals.limit}h
						</p>
						{weeklyTotals.diff > 0 && (
							<p>
								You are {weeklyTotals.diff.toFixed(2)}h over the weekly limit for this shift. Adjust
								the schedule to comply with LFT rules.
							</p>
						)}
						{weeklyTotals.diff < 0 && (
							<p>
								You are {Math.abs(weeklyTotals.diff).toFixed(2)}h below the weekly limit. Ensure hours
								match your intended workload.
							</p>
						)}
						{weeklyTotals.diff === 0 && <p>The weekly total matches the limit.</p>}
					</div>

					<DayScheduleEditor
						days={daySchedules}
						shiftType={form.state.values.shiftType}
						onChange={setDaySchedules}
					/>

					<LaborLawWarnings shiftType={warningsInput.shiftType} days={warningsInput.days} />
					{hasBlockingErrors && (
						<p className="text-sm text-destructive">
							Overtime enforcement is set to BLOCK. Please resolve the errors above to proceed.
						</p>
					)}

					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton
								label={initialTemplate ? 'Save changes' : 'Create template'}
								loadingLabel={isSubmitting ? 'Saving...' : 'Saving...'}
							/>
						</form.AppForm>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

