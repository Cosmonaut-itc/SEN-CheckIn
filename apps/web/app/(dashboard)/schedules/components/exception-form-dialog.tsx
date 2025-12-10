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
import type {
	Employee,
	ScheduleException,
	ScheduleExceptionType,
} from '@/lib/client-functions';

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
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-h-[calc(100vh-6rem)] sm:max-w-5xl lg:max-w-6xl">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<DialogHeader>
						<DialogTitle>
							{initialException ? 'Edit Schedule Exception' : 'Add Schedule Exception'}
						</DialogTitle>
						<DialogDescription>
							Set a day off, modified hours, or extra day for an employee.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField
							name="employeeId"
							validators={{
								onChange: ({ value }) =>
									!value ? 'Employee selection is required' : undefined,
							}}
						>
							{(field) => (
								<field.SelectField
									label="Employee"
									options={employees.map((employee) => ({
										value: employee.id,
										label: `${employee.firstName} ${employee.lastName}`,
									}))}
									placeholder="Select employee"
								/>
							)}
						</form.AppField>

						<form.AppField
							name="exceptionDate"
							validators={{
								onChange: ({ value }) =>
									!value ? 'Date is required' : undefined,
							}}
						>
							{(field) => <field.DateField label="Date" />}
						</form.AppField>

						<form.AppField name="exceptionType">
							{(field) => (
								<field.SelectField
									label="Exception Type"
									options={[
										{ value: 'DAY_OFF', label: 'Day Off' },
										{ value: 'MODIFIED', label: 'Modified Hours' },
										{ value: 'EXTRA_DAY', label: 'Extra Day' },
									]}
									placeholder="Select type"
								/>
							)}
						</form.AppField>

						<form.AppField name="reason">
							{(field) => <field.TextField label="Reason" placeholder="Optional" />}
						</form.AppField>
					</div>

					{showTimeInputs && (
						<div className="grid gap-4 sm:grid-cols-2">
							<form.AppField name="startTime">
								{(field) => <field.TimeField label="Start Time" />}
							</form.AppField>
							<form.AppField name="endTime">
								{(field) => <field.TimeField label="End Time" />}
							</form.AppField>
						</div>
					)}

					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton
								label={initialException ? 'Save changes' : 'Create exception'}
								loadingLabel="Saving..."
							/>
						</form.AppForm>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

