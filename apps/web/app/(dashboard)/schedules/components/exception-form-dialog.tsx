'use client';

import React, { useEffect } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useAppForm } from '@/lib/forms';
import { useTranslations } from 'next-intl';
import type { Employee, ScheduleException, ScheduleExceptionType } from '@/lib/client-functions';

/**
 * Props for the ExceptionFormDialog component.
 */
export interface ExceptionFormDialogProps {
	/** Dialog open state */
	open: boolean;
	/** Handler for dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** Employee list for selection */
	employees: Employee[];
	/** Callback fired when the form is submitted */
	onSubmit: (input: {
		employeeId: string;
		exceptionDate: Date;
		exceptionType: ScheduleExceptionType;
		startTime?: string | null;
		endTime?: string | null;
		reason?: string | null;
		id?: string;
	}) => Promise<void> | void;
	/** Existing exception for edit mode */
	initialException?: ScheduleException | null;
}

/**
 * Dialog for creating or editing schedule exceptions.
 *
 * @param props - Component props
 * @returns Rendered dialog content
 */
export function ExceptionFormDialog({
	open,
	onOpenChange,
	employees,
	onSubmit,
	initialException,
}: ExceptionFormDialogProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const tCommon = useTranslations('Common');
	const form = useAppForm({
		defaultValues: {
			employeeId: initialException?.employeeId ?? '',
			exceptionDate: initialException
				? new Date(initialException.exceptionDate).toISOString().slice(0, 10)
				: '',
			exceptionType: (initialException?.exceptionType ?? 'DAY_OFF') as ScheduleExceptionType,
			startTime: initialException?.startTime ?? '09:00',
			endTime: initialException?.endTime ?? '17:00',
			reason: initialException?.reason ?? '',
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				id: initialException?.id,
				employeeId: value.employeeId,
				exceptionDate: new Date(value.exceptionDate),
				exceptionType: value.exceptionType,
				startTime:
					value.exceptionType === 'DAY_OFF' ? null : (value.startTime ?? undefined),
				endTime: value.exceptionType === 'DAY_OFF' ? null : (value.endTime ?? undefined),
				reason: value.reason?.trim() ? value.reason.trim() : null,
			});
		},
	});

	useEffect(() => {
		if (initialException) {
			form.setFieldValue('employeeId', initialException.employeeId);
			form.setFieldValue(
				'exceptionDate',
				new Date(initialException.exceptionDate).toISOString().slice(0, 10),
			);
			form.setFieldValue('exceptionType', initialException.exceptionType);
			form.setFieldValue('startTime', initialException.startTime ?? '09:00');
			form.setFieldValue('endTime', initialException.endTime ?? '17:00');
			form.setFieldValue('reason', initialException.reason ?? '');
		} else {
			form.setFieldValue('employeeId', '');
			form.setFieldValue('exceptionDate', '');
			form.setFieldValue('exceptionType', 'DAY_OFF');
			form.setFieldValue('startTime', '09:00');
			form.setFieldValue('endTime', '17:00');
			form.setFieldValue('reason', '');
		}
	}, [initialException, form]);

	const showTimeInputs = form.state.values.exceptionType !== 'DAY_OFF';

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6"
				>
					<DialogHeader>
						<DialogTitle>
							{initialException
								? t('exceptions.form.title.edit')
								: t('exceptions.form.title.create')}
						</DialogTitle>
						<DialogDescription>{t('exceptions.form.description')}</DialogDescription>
					</DialogHeader>

					<div className="grid gap-6 sm:grid-cols-2">
						<form.AppField
							name="employeeId"
							validators={{
								onChange: ({ value }) =>
									!value
										? t('exceptions.form.validation.employeeRequired')
										: undefined,
							}}
						>
							{(field) => (
								<field.SelectField
									label={t('exceptions.form.fields.employee.label')}
									options={employees.map((employee) => ({
										value: employee.id,
										label: `${employee.firstName} ${employee.lastName}`,
									}))}
									placeholder={t('exceptions.form.fields.employee.placeholder')}
								/>
							)}
						</form.AppField>

						<form.AppField
							name="exceptionDate"
							validators={{
								onChange: ({ value }) =>
									!value
										? t('exceptions.form.validation.dateRequired')
										: undefined,
							}}
						>
							{(field) => (
								<field.DateField label={t('exceptions.form.fields.date.label')} />
							)}
						</form.AppField>

						<form.AppField name="exceptionType">
							{(field) => (
								<field.SelectField
									label={t('exceptions.form.fields.type.label')}
									options={[
										{ value: 'DAY_OFF', label: t('exceptions.types.DAY_OFF') },
										{
											value: 'MODIFIED',
											label: t('exceptions.types.MODIFIED'),
										},
										{
											value: 'EXTRA_DAY',
											label: t('exceptions.types.EXTRA_DAY'),
										},
									]}
									placeholder={t('exceptions.form.fields.type.placeholder')}
								/>
							)}
						</form.AppField>

						<form.AppField name="reason">
							{(field) => (
								<field.TextField
									label={t('exceptions.form.fields.reason.label')}
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
					</div>

					{showTimeInputs && (
						<div className="grid gap-6 sm:grid-cols-2">
							<form.AppField name="startTime">
								{(field) => (
									<field.TimeField
										label={t('exceptions.form.fields.startTime.label')}
									/>
								)}
							</form.AppField>
							<form.AppField name="endTime">
								{(field) => (
									<field.TimeField
										label={t('exceptions.form.fields.endTime.label')}
									/>
								)}
							</form.AppField>
						</div>
					)}

					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton
								label={
									initialException
										? t('exceptions.form.actions.saveChanges')
										: t('exceptions.form.actions.create')
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
