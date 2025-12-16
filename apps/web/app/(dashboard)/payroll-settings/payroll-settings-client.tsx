'use client';

import React, { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchPayrollSettings } from '@/lib/client-functions';
import { updatePayrollSettingsAction } from '@/actions/payroll';
import { useAppForm } from '@/lib/forms';
import { toast } from 'sonner';

const dayOptions = [
	{ value: '0', label: 'Sunday' },
	{ value: '1', label: 'Monday' },
	{ value: '2', label: 'Tuesday' },
	{ value: '3', label: 'Wednesday' },
	{ value: '4', label: 'Thursday' },
	{ value: '5', label: 'Friday' },
	{ value: '6', label: 'Saturday' },
];

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a newline-separated textarea value into sorted, unique date keys.
 *
 * @param value - Newline-separated list of YYYY-MM-DD date keys
 * @returns Sorted unique YYYY-MM-DD date keys
 * @throws When any non-empty line is not in YYYY-MM-DD format
 */
function parseAdditionalMandatoryRestDaysText(value: string): string[] {
	const lines = value
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => Boolean(line));

	for (const line of lines) {
		if (!DATE_KEY_REGEX.test(line)) {
			throw new Error(`Invalid date "${line}". Use YYYY-MM-DD (one per line).`);
		}
	}

	const unique = Array.from(new Set(lines));
	unique.sort((a, b) => a.localeCompare(b));
	return unique;
}

export function PayrollSettingsClient(): React.ReactElement {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: queryKeys.payrollSettings.current(undefined),
		queryFn: () => fetchPayrollSettings(),
	});

	const mutation = useMutation({
		mutationKey: mutationKeys.payrollSettings.update,
		mutationFn: updatePayrollSettingsAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Payroll settings saved');
				queryClient.invalidateQueries({ queryKey: queryKeys.payrollSettings.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.payrollSettings.current(undefined) });
			} else {
				toast.error(result.error ?? 'Failed to save payroll settings');
			}
		},
		onError: () => {
			toast.error('Failed to save payroll settings');
		},
	});

	const form = useAppForm({
		defaultValues: {
			weekStartDay: '1',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDaysText: '',
		},
		onSubmit: async ({ value }) => {
			const additionalMandatoryRestDays = parseAdditionalMandatoryRestDaysText(
				value.additionalMandatoryRestDaysText,
			);
			await mutation.mutateAsync({
				weekStartDay: Number(value.weekStartDay),
				overtimeEnforcement: value.overtimeEnforcement as 'WARN' | 'BLOCK',
				additionalMandatoryRestDays,
			});
		},
	});

	useEffect(() => {
		if (data?.weekStartDay !== undefined) {
			form.setFieldValue('weekStartDay', String(data.weekStartDay));
		}
		if (data?.overtimeEnforcement !== undefined) {
			form.setFieldValue('overtimeEnforcement', data.overtimeEnforcement);
		}
		form.setFieldValue(
			'additionalMandatoryRestDaysText',
			(data?.additionalMandatoryRestDays ?? []).join('\n'),
		);
	}, [data?.weekStartDay, data?.overtimeEnforcement, data?.additionalMandatoryRestDays, form]);

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Payroll Settings</h1>
				<p className="text-muted-foreground">
					Configure the start of the week to align weekly and biweekly payroll periods and set overtime enforcement.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Week Start</CardTitle>
					<CardDescription>Used to calculate weekly and biweekly pay periods.</CardDescription>
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
									label="Start of week"
									options={dayOptions}
									placeholder={isLoading ? 'Loading...' : 'Select day'}
									disabled={isLoading || mutation.isPending}
								/>
							)}
						</form.AppField>
						<form.AppField name="overtimeEnforcement">
							{(field) => (
								<field.SelectField
									label="Overtime enforcement"
									options={[
										{ value: 'WARN', label: 'Advertir (permitir con avisos)' },
										{ value: 'BLOCK', label: 'Bloquear si excede límites' },
									]}
									placeholder={isLoading ? 'Loading...' : 'Select enforcement'}
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
										return error instanceof Error ? error.message : 'Invalid dates';
									}
								},
							}}
						>
							{(field) => (
								<field.TextareaField
									label="Días de descanso obligatorio extra"
									placeholder="YYYY-MM-DD"
									description="Uno por línea. Útil para jornada electoral (LFT Art. 74 fr. IX) y descansos locales."
									rows={4}
								/>
							)}
						</form.AppField>
						<div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">Reglas legales de horas extra</p>
							<ul className="list-disc pl-4">
								<li>Máximo 3 horas extra por día (3 días por semana)</li>
								<li>Primeras 9 horas extra semanales: pago doble</li>
								<li>Horas extra adicionales: pago triple</li>
								<li>Prima dominical: 25% adicional si se trabaja en domingo</li>
								<li>Día de descanso obligatorio trabajado: +2× salario diario (total 3×)</li>
							</ul>
						</div>
						<form.AppForm>
							<form.SubmitButton
								label="Save"
								loadingLabel="Saving..."
								className="mt-2"
							/>
						</form.AppForm>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
