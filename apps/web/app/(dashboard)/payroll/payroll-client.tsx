'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	type PayrollCalculationEmployee,
	type PayrollSettings,
	type PayrollTaxSummary,
	calculatePayroll,
	fetchPayrollRuns,
	fetchPayrollSettings,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { type PayrollCalculateParams, mutationKeys, queryKeys } from '@/lib/query-keys';
import {
	addDaysToDateKey,
	getEndOfMonthDateKey,
	getStartOfMonthDateKey,
	getWeekStartDateKey,
} from '@/lib/date-key';
import { toDateKeyInTimeZone } from '@/lib/time-zone';

const defaultFrequency: PayrollCalculateParams['paymentFrequency'] = 'WEEKLY';

/**
 * Formats a numeric value as Mexican Peso currency (MXN).
 *
 * @param value - Amount in MXN
 * @returns Formatted currency string
 */
function formatCurrency(value: number): string {
	return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

/**
 * Aggregates fiscal totals from employee breakdowns.
 *
 * @param employees - Payroll calculation employees
 * @returns Tax summary totals
 */
function aggregateTaxSummary(employees: PayrollCalculationEmployee[]): PayrollTaxSummary {
	return employees.reduce<PayrollTaxSummary>(
		(acc, employee) => ({
			grossTotal: acc.grossTotal + (employee.grossPay ?? employee.totalPay ?? 0),
			employeeWithholdingsTotal:
				acc.employeeWithholdingsTotal + (employee.employeeWithholdings?.total ?? 0),
			employerCostsTotal: acc.employerCostsTotal + (employee.employerCosts?.total ?? 0),
			netPayTotal: acc.netPayTotal + (employee.netPay ?? 0),
			companyCostTotal: acc.companyCostTotal + (employee.companyCost ?? 0),
		}),
		{
			grossTotal: 0,
			employeeWithholdingsTotal: 0,
			employerCostsTotal: 0,
			netPayTotal: 0,
			companyCostTotal: 0,
		},
	);
}

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
	timeZone: string,
): { periodStartDateKey: string; periodEndDateKey: string } {
	const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);

	if (frequency === 'MONTHLY') {
		const periodStartDateKey = getStartOfMonthDateKey(todayDateKey);
		const periodEndDateKey = getEndOfMonthDateKey(todayDateKey);
		return { periodStartDateKey, periodEndDateKey };
	}

	const weekStartDateKey = getWeekStartDateKey(todayDateKey, weekStartDay);
	if (frequency === 'BIWEEKLY') {
		return {
			periodStartDateKey: weekStartDateKey,
			periodEndDateKey: addDaysToDateKey(weekStartDateKey, 13),
		};
	}

	return {
		periodStartDateKey: weekStartDateKey,
		periodEndDateKey: addDaysToDateKey(weekStartDateKey, 6),
	};
}

export function PayrollPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Payroll');
	const tCommon = useTranslations('Common');

	const [paymentFrequency, setPaymentFrequency] =
		useState<PayrollCalculateParams['paymentFrequency']>(defaultFrequency);

	const [periodStartDateKey, setPeriodStartDateKey] = useState<string>(
		() => computePeriod(1, defaultFrequency, 'America/Mexico_City').periodStartDateKey,
	);
	const [periodEndDateKey, setPeriodEndDateKey] = useState<string>(
		() => computePeriod(1, defaultFrequency, 'America/Mexico_City').periodEndDateKey,
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
		const next = computePeriod(
			settings?.weekStartDay ?? 1,
			paymentFrequency,
			settings?.timeZone ?? 'America/Mexico_City',
		);
		setPeriodStartDateKey(next.periodStartDateKey);
		setPeriodEndDateKey(next.periodEndDateKey);
	}, [settings?.weekStartDay, settings?.timeZone, paymentFrequency]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const calculationParams: PayrollCalculateParams = useMemo(
		() => ({
			periodStartDateKey,
			periodEndDateKey,
			paymentFrequency,
			organizationId: organizationId ?? undefined,
		}),
		[organizationId, paymentFrequency, periodEndDateKey, periodStartDateKey],
	);

	const { data: calculation, isFetching: isCalculating } = useQuery({
		queryKey: queryKeys.payroll.calculate(calculationParams),
		queryFn: () =>
			calculatePayroll({
				periodStartDateKey,
				periodEndDateKey,
				paymentFrequency,
				organizationId: organizationId ?? undefined,
			}),
		enabled: Boolean(organizationId),
	});

	const taxSummary = useMemo(() => {
		if (!calculation) {
			return null;
		}
		return calculation.taxSummary ?? aggregateTaxSummary(calculation.employees);
	}, [calculation]);

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
				toast.success(t('toast.processSuccess'));
				queryClient.invalidateQueries({
					queryKey: queryKeys.payroll.runs({
						organizationId: organizationId ?? undefined,
					}),
				});
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.processError'));
			}
		},
		onError: () => {
			toast.error(t('toast.processError'));
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
			periodStartDateKey,
			periodEndDateKey,
			paymentFrequency,
			organizationId: organizationId ?? undefined,
		});
	};

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('legalRules.title')}</CardTitle>
					<CardDescription>{t('legalRules.description')}</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('payPeriod.title')}</CardTitle>
					<CardDescription>{t('payPeriod.description')}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-4">
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">
							{t('payPeriod.paymentFrequency')}
						</label>
						<Select
							value={paymentFrequency}
							onValueChange={(value: string) => {
								const typedValue =
									value as PayrollCalculateParams['paymentFrequency'];
								setPaymentFrequency(typedValue);
								const next = computePeriod(
									settings?.weekStartDay ?? 1,
									typedValue,
									settings?.timeZone ?? 'America/Mexico_City',
								);
								setPeriodStartDateKey(next.periodStartDateKey);
								setPeriodEndDateKey(next.periodEndDateKey);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('payPeriod.selectFrequency')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="WEEKLY">
									{t('paymentFrequency.WEEKLY')}
								</SelectItem>
								<SelectItem value="BIWEEKLY">
									{t('paymentFrequency.BIWEEKLY')}
								</SelectItem>
								<SelectItem value="MONTHLY">
									{t('paymentFrequency.MONTHLY')}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">{t('payPeriod.periodStart')}</label>
						<Input
							type="date"
							value={periodStartDateKey}
							onChange={(e) => setPeriodStartDateKey(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium">{t('payPeriod.periodEnd')}</label>
						<Input
							type="date"
							value={periodEndDateKey}
							onChange={(e) => setPeriodEndDateKey(e.target.value)}
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
									{t('actions.processing')}
								</>
							) : (
								t('actions.process')
							)}
						</Button>
						{hasBlockingWarnings && (
							<p className="mt-2 text-sm text-destructive">
								{t('warnings.blockingOvertime')}
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('preview.title')}</CardTitle>
					<CardDescription>{t('preview.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					{isCalculating ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t('preview.calculating')}
						</div>
					) : !calculation ? (
						<p className="text-sm text-muted-foreground">
							{t('preview.noCalculation')}
						</p>
					) : (
						<>
							<div className="mb-4 flex items-center justify-between">
								<div className="text-sm text-muted-foreground">
									{t('preview.totalEmployees', {
										count: calculation.employees.length,
									})}
								</div>
								<div className="text-lg font-semibold">
									{t('preview.totalAmount', {
										total: formatCurrency(calculation.totalAmount),
									})}
								</div>
							</div>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t('preview.table.employee')}</TableHead>
											<TableHead>{t('preview.table.normalHours')}</TableHead>
											<TableHead>
												{t('preview.table.overtimeDouble')}
											</TableHead>
											<TableHead>
												{t('preview.table.overtimeTriple')}
											</TableHead>
											<TableHead>
												{t('preview.table.sundayPremium')}
											</TableHead>
											<TableHead>
												{t('preview.table.mandatoryRest')}
											</TableHead>
											<TableHead>{t('preview.table.total')}</TableHead>
											<TableHead>{t('preview.table.warnings')}</TableHead>
											<TableHead>{t('preview.table.detail')}</TableHead>
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
														? formatCurrency(
																row.mandatoryRestDayPremiumAmount,
															)
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
															{t('preview.warningsCount', {
																count: row.warnings.length,
															})}
														</span>
													)}
												</TableCell>
												<TableCell>
													<Dialog>
														<DialogTrigger asChild>
															<Button variant="outline" size="sm">
																{t('preview.table.detail')}
															</Button>
														</DialogTrigger>
														<DialogContent className="sm:max-w-2xl">
															<DialogHeader>
																<DialogTitle>
																	{t('taxDetail.title', {
																		name: row.name,
																	})}
																</DialogTitle>
															</DialogHeader>
															<div className="space-y-4 text-sm">
																<div>
																	<p className="font-medium">
																		{t('taxDetail.sections.summary')}
																	</p>
																	<div className="mt-2 grid gap-2">
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.grossPay')}
																			</span>
																			<span className="font-medium">
																				{formatCurrency(row.grossPay)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.employeeWithholdings')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.employeeWithholdings.total,
																				)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.netPay')}
																			</span>
																			<span className="font-medium">
																				{formatCurrency(row.netPay)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.employerCosts')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.employerCosts.total,
																				)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.companyCost')}
																			</span>
																			<span className="font-medium">
																				{formatCurrency(row.companyCost)}
																			</span>
																		</div>
																	</div>
																</div>
																<div>
																	<p className="font-medium">
																		{t('taxDetail.sections.bases')}
																	</p>
																	<div className="mt-2 grid gap-2">
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.sbcDaily')}
																			</span>
																			<span>{formatCurrency(row.bases.sbcDaily)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.sbcPeriod')}
																			</span>
																			<span>{formatCurrency(row.bases.sbcPeriod)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.isrBase')}
																			</span>
																			<span>{formatCurrency(row.bases.isrBase)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.daysInPeriod')}
																			</span>
																			<span>{row.bases.daysInPeriod}</span>
																		</div>
																	</div>
																</div>
																<div>
																	<p className="font-medium">
																		{t('taxDetail.sections.employeeWithholdings')}
																	</p>
																	<div className="mt-2 grid gap-2">
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.isrWithheld')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.employeeWithholdings.isrWithheld,
																				)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.imssEmployee')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.employeeWithholdings.imssEmployee.total,
																				)}
																			</span>
																		</div>
																	</div>
																</div>
																<div>
																	<p className="font-medium">
																		{t('taxDetail.sections.employerCosts')}
																	</p>
																	<div className="mt-2 grid gap-2">
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.imssEmployer')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.employerCosts.imssEmployer.total,
																				)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.sarRetiro')}
																			</span>
																			<span>{formatCurrency(row.employerCosts.sarRetiro)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.infonavit')}
																			</span>
																			<span>{formatCurrency(row.employerCosts.infonavit)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.riskWork')}
																			</span>
																			<span>{formatCurrency(row.employerCosts.riskWork)}</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.isn')}
																			</span>
																			<span>{formatCurrency(row.employerCosts.isn)}</span>
																		</div>
																		{row.employerCosts.absorbedImssEmployeeShare > 0 ? (
																			<div className="flex items-center justify-between">
																				<span className="text-muted-foreground">
																					{t(
																						'taxDetail.labels.absorbedImssEmployeeShare',
																					)}
																				</span>
																				<span>
																					{formatCurrency(
																						row.employerCosts.absorbedImssEmployeeShare,
																					)}
																				</span>
																			</div>
																		) : null}
																		{row.employerCosts.absorbedIsr > 0 ? (
																			<div className="flex items-center justify-between">
																				<span className="text-muted-foreground">
																					{t('taxDetail.labels.absorbedIsr')}
																				</span>
																				<span>
																					{formatCurrency(
																						row.employerCosts.absorbedIsr,
																					)}
																				</span>
																			</div>
																		) : null}
																	</div>
																</div>
																<div>
																	<p className="font-medium">
																		{t('taxDetail.sections.informational')}
																	</p>
																	<div className="mt-2 grid gap-2">
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.isrBeforeSubsidy')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.informationalLines.isrBeforeSubsidy,
																				)}
																			</span>
																		</div>
																		<div className="flex items-center justify-between">
																			<span className="text-muted-foreground">
																				{t('taxDetail.labels.subsidyApplied')}
																			</span>
																			<span>
																				{formatCurrency(
																					row.informationalLines.subsidyApplied,
																				)}
																			</span>
																		</div>
																	</div>
																</div>
															</div>
														</DialogContent>
													</Dialog>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{calculation.employees.some((emp) => emp.warnings.length > 0) && (
								<div className="mt-4 rounded-md border bg-muted/50 p-3">
									<p className="text-sm font-medium">{t('compliance.title')}</p>
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

			{calculation && taxSummary ? (
				<Card>
					<CardHeader>
						<CardTitle>{t('summary.title')}</CardTitle>
						<CardDescription>{t('summary.description')}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.gross')}
								</p>
								<p className="mt-1 text-base font-semibold">
									{formatCurrency(taxSummary.grossTotal)}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.employeeWithholdings')}
								</p>
								<p className="mt-1 text-base font-semibold">
									{formatCurrency(taxSummary.employeeWithholdingsTotal)}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.netPay')}
								</p>
								<p className="mt-1 text-base font-semibold">
									{formatCurrency(taxSummary.netPayTotal)}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.employerCosts')}
								</p>
								<p className="mt-1 text-base font-semibold">
									{formatCurrency(taxSummary.employerCostsTotal)}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.companyCost')}
								</p>
								<p className="mt-1 text-base font-semibold">
									{formatCurrency(taxSummary.companyCostTotal)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>{t('runHistory.title')}</CardTitle>
					<CardDescription>{t('runHistory.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					{runsQuery.isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{tCommon('loading')}
						</div>
					) : runsQuery.data && runsQuery.data.length > 0 ? (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('runHistory.table.period')}</TableHead>
										<TableHead>{t('runHistory.table.frequency')}</TableHead>
										<TableHead>{t('runHistory.table.status')}</TableHead>
										<TableHead>{t('runHistory.table.total')}</TableHead>
										<TableHead>{t('runHistory.table.processed')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{runsQuery.data.map((run) => (
										<TableRow key={run.id}>
											<TableCell>
												{t('runHistory.periodRange', {
													start: format(
														new Date(run.periodStart),
														t('dateFormat'),
													),
													end: format(
														new Date(run.periodEnd),
														t('dateFormat'),
													),
												})}
											</TableCell>
											<TableCell>
												{t(`paymentFrequency.${run.paymentFrequency}`)}
											</TableCell>
											<TableCell>{t(`runStatus.${run.status}`)}</TableCell>
											<TableCell>
												{formatCurrency(Number(run.totalAmount ?? 0))}
											</TableCell>
											<TableCell>
												{run.processedAt
													? format(
															new Date(run.processedAt),
															t('dateFormat'),
														)
													: '-'}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">{t('runHistory.empty')}</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
