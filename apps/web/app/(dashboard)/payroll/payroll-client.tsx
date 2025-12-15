'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { processPayrollAction } from '@/actions/payroll';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	type PayrollSettings,
	calculatePayroll,
	fetchPayrollRuns,
	fetchPayrollSettings,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { type PayrollCalculateParams, mutationKeys, queryKeys } from '@/lib/query-keys';

const defaultFrequency: PayrollCalculateParams['paymentFrequency'] = 'WEEKLY';

const formatCurrency = (value: number): string =>
	new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);

/**
 * Computes period boundaries based on week start and frequency.
 *
 * @param weekStartDay - Day index the week starts on
 * @param frequency - Payment frequency
 * @returns Start and end dates for the current period
 */
function computePeriod(
	weekStartDay: number,
	frequency: PayrollCalculateParams['paymentFrequency'],
): { periodStart: Date; periodEnd: Date } {
	const today = new Date();
	if (frequency === 'MONTHLY') {
		return {
			periodStart: startOfMonth(today),
			periodEnd: endOfMonth(today),
		};
	}

	const start = startOfWeek(today, {
		weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
	});
	if (frequency === 'BIWEEKLY') {
		return { periodStart: start, periodEnd: addDays(start, 13) };
	}

	return {
		periodStart: start,
		periodEnd: endOfWeek(today, {
			weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
		}),
	};
}

export function PayrollPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();

	const [paymentFrequency, setPaymentFrequency] =
		useState<PayrollCalculateParams['paymentFrequency']>(defaultFrequency);

	const [periodStart, setPeriodStart] = useState<Date>(
		() => computePeriod(1, defaultFrequency).periodStart,
	);
	const [periodEnd, setPeriodEnd] = useState<Date>(
		() => computePeriod(1, defaultFrequency).periodEnd,
	);

	const { data: settings } = useQuery<
		PayrollSettings | null,
		Error,
		PayrollSettings | null,
		readonly unknown[]
	>({
		queryKey: queryKeys.payrollSettings.current(organizationId),
		queryFn: () => fetchPayrollSettings(organizationId ?? undefined),
		enabled: Boolean(organizationId),
	});

	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		const next = computePeriod(settings?.weekStartDay ?? 1, paymentFrequency);
		setPeriodStart(next.periodStart);
		setPeriodEnd(next.periodEnd);
	}, [settings?.weekStartDay, paymentFrequency]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const calculationKey = useMemo(
		() => ({
			periodStart: periodStart.toISOString(),
			periodEnd: periodEnd.toISOString(),
			paymentFrequency,
			organizationId,
		}),
		[organizationId, paymentFrequency, periodEnd, periodStart],
	);

	const { data: calculation, isFetching: isCalculating } = useQuery({
		queryKey: queryKeys.payroll.calculate(calculationKey as unknown as PayrollCalculateParams),
		queryFn: () =>
			calculatePayroll({
				periodStart,
				periodEnd,
				paymentFrequency,
				organizationId: organizationId ?? undefined,
			}),
		enabled: Boolean(organizationId),
	});

	const hasBlockingWarnings =
		calculation?.overtimeEnforcement === 'BLOCK' &&
		(calculation?.employees ?? []).some((emp) =>
			emp.warnings.some((w) => w.severity === 'error'),
		);

	const processMutation = useMutation({
		mutationKey: mutationKeys.payroll.process,
		mutationFn: processPayrollAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Payroll processed');
				queryClient.invalidateQueries({
					queryKey: queryKeys.payroll.runs({
						organizationId: organizationId ?? undefined,
					}),
				});
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to process payroll');
			}
		},
		onError: () => {
			toast.error('Failed to process payroll');
		},
	});

	const runsQuery = useQuery({
		queryKey: queryKeys.payroll.runs({
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () => fetchPayrollRuns({ organizationId: organizationId ?? undefined }),
		enabled: Boolean(organizationId),
	});

	const onProcess = async (): Promise<void> => {
		if (!calculation) return;
		await processMutation.mutateAsync({
			periodStart,
			periodEnd,
			paymentFrequency,
			organizationId: organizationId ?? undefined,
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
					<p className="text-muted-foreground">
						Calculate payroll from attendance and job position pay rates.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Reglas legales (LFT México)</CardTitle>
					<CardDescription>
						Límites de jornada: Diurna 8h/48h, Nocturna 7h/42h, Mixta 7.5h/45h. Primeras
						9h extra al doble, posteriores al triple. Prima dominical: +25%. Descanso
						obligatorio trabajado: pago triple.
					</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Pay Period</CardTitle>
					<CardDescription>
						Period start/end are auto-derived from settings. Adjust if needed.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-4">
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">Payment frequency</label>
						<Select
							value={paymentFrequency}
							onValueChange={(value: string) => {
								const typedValue =
									value as PayrollCalculateParams['paymentFrequency'];
								setPaymentFrequency(typedValue);
								const next = computePeriod(settings?.weekStartDay ?? 1, typedValue);
								setPeriodStart(next.periodStart);
								setPeriodEnd(next.periodEnd);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select frequency" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="WEEKLY">Weekly</SelectItem>
								<SelectItem value="BIWEEKLY">Biweekly</SelectItem>
								<SelectItem value="MONTHLY">Monthly</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">Period start</label>
						<Input
							type="date"
							value={format(periodStart, 'yyyy-MM-dd')}
							onChange={(e) => setPeriodStart(new Date(e.target.value))}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">Period end</label>
						<Input
							type="date"
							value={format(periodEnd, 'yyyy-MM-dd')}
							onChange={(e) => setPeriodEnd(new Date(e.target.value))}
						/>
					</div>
					<div className="flex items-end">
						<Button
							className="w-full"
							onClick={onProcess}
							disabled={
								isCalculating ||
								processMutation.isPending ||
								!calculation ||
								hasBlockingWarnings
							}
						>
							{processMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Processing...
								</>
							) : (
								'Process Payroll'
							)}
						</Button>
						{hasBlockingWarnings && (
							<p className="mt-2 text-sm text-destructive">
								Overtime limits exceeded. Ajusta horarios o cambia la política a
								Advertir.
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Payroll Preview</CardTitle>
					<CardDescription>
						Calculated from attendance between the selected dates.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isCalculating ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Calculating...
						</div>
					) : !calculation ? (
						<p className="text-sm text-muted-foreground">No calculation available.</p>
					) : (
						<>
							<div className="mb-4 flex items-center justify-between">
								<div className="text-sm text-muted-foreground">
									Total employees: {calculation.employees.length}
								</div>
								<div className="text-lg font-semibold">
									Total: {formatCurrency(calculation.totalAmount)}
								</div>
							</div>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Employee</TableHead>
											<TableHead>Horas normales</TableHead>
											<TableHead>Horas extra (x2)</TableHead>
											<TableHead>Horas extra (x3)</TableHead>
											<TableHead>Prima dominical</TableHead>
											<TableHead>Descanso obligatorio</TableHead>
											<TableHead>Total</TableHead>
											<TableHead>Alertas</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{calculation.employees.map((row) => (
											<TableRow key={row.employeeId}>
												<TableCell>{row.name}</TableCell>
												<TableCell>{row.normalHours.toFixed(2)}</TableCell>
												<TableCell>
													{row.overtimeDoubleHours.toFixed(2)}
												</TableCell>
												<TableCell>
													{row.overtimeTripleHours.toFixed(2)}
												</TableCell>
												<TableCell>
													{row.sundayPremiumAmount > 0
														? formatCurrency(row.sundayPremiumAmount)
														: '-'}
												</TableCell>
												<TableCell>
													{row.mandatoryRestDayPremiumAmount > 0
														? formatCurrency(row.mandatoryRestDayPremiumAmount)
														: '-'}
												</TableCell>
												<TableCell>
													{formatCurrency(row.totalPay)}
												</TableCell>
												<TableCell>
													{row.warnings.length === 0 ? (
														<span className="text-xs text-muted-foreground">
															0
														</span>
													) : (
														<span
															className={`text-xs ${
																row.warnings.some(
																	(w) => w.severity === 'error',
																)
																	? 'text-destructive'
																	: 'text-amber-600'
															}`}
														>
															{row.warnings.length} alerta(s)
														</span>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{calculation.employees.some((emp) => emp.warnings.length > 0) && (
								<div className="mt-4 rounded-md border bg-muted/50 p-3">
									<p className="text-sm font-medium">Alertas de cumplimiento</p>
									<div className="mt-2 space-y-2 text-sm">
										{calculation.employees.map((emp) =>
											emp.warnings.map((w, idx) => (
												<div
													key={`${emp.employeeId}-${idx}`}
													className={
														w.severity === 'error'
															? 'text-destructive'
															: ''
													}
												>
													<strong>{emp.name}:</strong> {w.message}
												</div>
											)),
										)}
									</div>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Run History</CardTitle>
					<CardDescription>Recent payroll runs.</CardDescription>
				</CardHeader>
				<CardContent>
					{runsQuery.isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading...
						</div>
					) : runsQuery.data && runsQuery.data.length > 0 ? (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Period</TableHead>
										<TableHead>Frequency</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Total</TableHead>
										<TableHead>Processed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{runsQuery.data.map((run) => (
										<TableRow key={run.id}>
											<TableCell>
												{format(new Date(run.periodStart), 'MMM d, yyyy')} -{' '}
												{format(new Date(run.periodEnd), 'MMM d, yyyy')}
											</TableCell>
											<TableCell>{run.paymentFrequency}</TableCell>
											<TableCell>{run.status}</TableCell>
											<TableCell>
												{formatCurrency(Number(run.totalAmount ?? 0))}
											</TableCell>
											<TableCell>
												{run.processedAt
													? format(
															new Date(run.processedAt),
															'MMM d, yyyy',
														)
													: '-'}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No payroll runs found.</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
