import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { ScheduleTemplateDayInput } from '@/actions/schedules';
import type { ShiftType } from '@/lib/client-functions';
import { useTranslations } from 'next-intl';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

/**
 * Ensures a complete seven-day schedule array with sensible defaults.
 *
 * @param days - Optional partial day definitions
 * @returns Seven-day schedule array sorted by dayOfWeek
 */
function ensureFullWeek(days?: ScheduleTemplateDayInput[]): ScheduleTemplateDayInput[] {
	const initial: ScheduleTemplateDayInput[] = Array.from({ length: 7 }, (_, index) => ({
		dayOfWeek: index,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: index >= 1 && index <= 5,
	}));

	if (!days || days.length === 0) {
		return initial;
	}

	const merged = initial.map((entry) => {
		const existing = days.find((day) => day.dayOfWeek === entry.dayOfWeek);
		return existing
			? {
					...entry,
					...existing,
				}
			: entry;
	});

	return merged.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/**
 * Props for the DayScheduleEditor component.
 */
interface DayScheduleEditorProps {
	/** Current day configuration */
	days: ScheduleTemplateDayInput[];
	/** Shift type used for default context */
	shiftType: ShiftType;
	/** Callback invoked when any day changes */
	onChange: (nextDays: ScheduleTemplateDayInput[]) => void;
}

/**
 * Editor grid for seven-day schedule configuration.
 *
 * @param props - Component props
 * @returns Rendered schedule editor
 */
export function DayScheduleEditor({
	days,
	shiftType,
	onChange,
}: DayScheduleEditorProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const shiftTypeLabel = t(`shiftTypes.short.${shiftType}`);
	const normalizedDays = useMemo(() => ensureFullWeek(days), [days]);

	const handleUpdate = (dayIndex: number, partial: Partial<ScheduleTemplateDayInput>): void => {
		const next = normalizedDays.map((day) =>
			day.dayOfWeek === dayIndex ? { ...day, ...partial } : day,
		);
		onChange(next);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-medium">{t('templateForm.weeklySchedule')}</p>
					<p className="text-xs text-muted-foreground">
						{t('templateForm.shiftTypeSummary', { shiftType: shiftTypeLabel })}
					</p>
				</div>
			</div>
			<div className="grid gap-3">
				{normalizedDays.map((day) => (
					<div
						key={day.dayOfWeek}
						className="grid grid-cols-12 items-center gap-2 rounded-md border p-3"
					>
						<div className="col-span-3 flex items-center gap-2">
							<input
								type="checkbox"
								className="h-4 w-4 accent-primary"
								checked={day.isWorkingDay !== false}
								onChange={(e) =>
									handleUpdate(day.dayOfWeek, { isWorkingDay: e.target.checked })
								}
							/>
							<span className="text-sm font-medium">
								{(() => {
									const dayKey: DayKey = DAY_KEYS[day.dayOfWeek] ?? 'sun';
									return t(`days.short.${dayKey}`);
								})()}
							</span>
						</div>
						<div className="col-span-4">
							<Label className="text-xs text-muted-foreground">
								{t('templateForm.start')}
							</Label>
							<Input
								type="time"
								value={day.startTime}
								disabled={day.isWorkingDay === false}
								onChange={(e) =>
									handleUpdate(day.dayOfWeek, { startTime: e.target.value })
								}
							/>
						</div>
						<div className="col-span-4">
							<Label className="text-xs text-muted-foreground">
								{t('templateForm.end')}
							</Label>
							<Input
								type="time"
								value={day.endTime}
								disabled={day.isWorkingDay === false}
								onChange={(e) =>
									handleUpdate(day.dayOfWeek, { endTime: e.target.value })
								}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
