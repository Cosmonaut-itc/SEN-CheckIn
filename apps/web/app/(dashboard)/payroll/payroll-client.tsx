'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, CircleAlert, Loader2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { processPayrollAction } from '@/actions/payroll';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { TourHelpButton } from '@/components/tour-help-button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty';
import {
	type PayrollCalculationEmployee,
	type PayrollRun,
	type PayrollSettings,
	type PayrollTaxSummary,
	calculatePayroll,
	fetchPayrollRuns,
	fetchPayrollSettings,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { useTour } from '@/hooks/use-tour';
import { type PayrollCalculateParams, mutationKeys, queryKeys } from '@/lib/query-keys';
import {
	addDaysToDateKey,
	getEndOfMonthDateKey,
	getStartOfMonthDateKey,
	getWeekStartDateKey,
} from '@/lib/date-key';
import { toDateKeyInTimeZone } from '@/lib/time-zone';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';

import { PayrollRunReceiptsDialog } from './payroll-run-receipts-dialog';
import { PtuTab } from './ptu-tab';
import { AguinaldoTab } from './aguinaldo-tab';
import { PayrollHolidayNoticeCard } from './payroll-holiday-notice';
import { buildPayrollCsvEmployeeRow, type CsvRow } from './payroll-client.helpers';
import { PayrollOvertimeAlert } from '@/components/overtime/payroll-overtime-alert';

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
 * Formats a payroll run period range for display.
 *
 * @param run - Payroll run metadata
 * @param t - Payroll translation helper
 * @returns Human-readable period label
 */
function formatPayrollRunPeriod(
	run: PayrollRun,
	t: ReturnType<typeof useTranslations>,
): string {
	return t('runHistory.periodRange', {
		start: format(new Date(run.periodStart), t('dateFormat')),
		end: format(new Date(run.periodEnd), t('dateFormat')),
	});
}

/**
 * Resolves the badge variant for a payroll run status.
 *
 * @param status - Payroll run status
 * @returns Badge variant aligned with the run state
 */
function getPayrollRunStatusVariant(
	status: PayrollRun['status'],
): 'secondary' | 'success' {
	return status === 'PROCESSED' ? 'success' : 'secondary';
}

type CsvColumn = {
	key: string;
	label: string;
};

/**
 * Parses a date key string into a Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance or undefined when invalid
 */
function parseDateKey(dateKey: string): Date | undefined {
	const parsed = new Date(`${dateKey}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Escapes a value for CSV output.
 *
 * @param value - CSV cell value
 * @returns Escaped CSV-safe string
 */
function escapeCsvValue(value: CsvRow[keyof CsvRow]): string {
	if (value === null || value === undefined) {
		return '';
	}
	const stringValue = String(value);
	if (/[",\n]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}
	return stringValue;
}

/**
 * Builds a CSV document string from column definitions and rows.
 *
 * @param columns - Ordered CSV columns
 * @param rows - Row data keyed by column key
 * @returns CSV string content
 */
function buildCsvContent(columns: CsvColumn[], rows: CsvRow[]): string {
	const header = columns.map((column) => escapeCsvValue(column.label)).join(',');
	const lines = rows.map((row) =>
		columns.map((column) => escapeCsvValue(row[column.key])).join(','),
	);
	return [header, ...lines].join('\n');
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
 * Aggregates dual payroll totals from employee breakdowns.
 *
 * @param employees - Payroll calculation employees
 * @returns Consolidated fiscal/complement/real totals
 */
function aggregateDualPayrollSummary(
	employees: PayrollCalculationEmployee[],
): { fiscalGrossTotal: number; complementTotal: number; totalRealTotal: number } {
	return employees.reduce(
		(acc, employee) => ({
			fiscalGrossTotal:
				acc.fiscalGrossTotal +
				(employee.fiscalGrossPay ?? employee.grossPay ?? employee.totalPay ?? 0),
			complementTotal: acc.complementTotal + (employee.complementPay ?? 0),
			totalRealTotal:
				acc.totalRealTotal + (employee.totalRealPay ?? employee.totalPay ?? 0),
		}),
		{
			fiscalGrossTotal: 0,
			complementTotal: 0,
			totalRealTotal: 0,
		},
	);
}

/**
 * Renders lunch break auto-deduction details for a payroll row.
 *
 * @param row - Payroll calculation row
 * @param t - Translation function for payroll copy
 * @returns Badge and deduction summary, or a dash when nothing was deducted
 */
function renderLunchBreakDeductionCell(
	row: PayrollCalculationEmployee,
	t: ReturnType<typeof useTranslations>,
): React.ReactElement {
	const deductedDays = row.lunchBreakAutoDeductedDays ?? 0;
	const deductedMinutes = row.lunchBreakAutoDeductedMinutes ?? 0;

	if (deductedDays === 0 || deductedMinutes === 0) {
		return <span className="text-muted-foreground">-</span>;
	}

	return (
		<div className="space-y-1">
			<Badge variant="warning">{t('preview.lunchBreak.badge')}</Badge>
			<div className="text-xs text-muted-foreground">
				<p>{t('preview.lunchBreak.days', { count: deductedDays })}</p>
				<p>{t('preview.lunchBreak.minutes', { count: deductedMinutes })}</p>
			</div>
		</div>
	);
}

/**
 * Renders deduction totals and a breakdown popover for a payroll row.
 *
 * @param row - Payroll calculation row
 * @param t - Translation function for payroll copy
 * @returns Deduction summary cell content
 */
function renderDeductionsCell(
	row: PayrollCalculationEmployee,
	t: ReturnType<typeof useTranslations>,
): React.ReactElement {
	const deductionsBreakdown = row.deductionsBreakdown ?? [];
	const totalDeductions = row.totalDeductions ?? 0;
	const exceededNetPay = row.warnings.some(
		(warning) => warning.type === 'DEDUCTIONS_EXCEED_NET_PAY',
	);

	if (totalDeductions <= 0 || deductionsBreakdown.length === 0) {
		return <span className="text-muted-foreground">-</span>;
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={exceededNetPay ? 'warning' : 'accent'}>
					{formatCurrency(totalDeductions)}
				</Badge>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-7 px-2">
							{t('preview.table.deductionsBreakdown')}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-96">
						<div className="space-y-3">
							<div>
								<p className="font-medium">{t('preview.deductions.title')}</p>
								<p className="text-xs text-muted-foreground">
									{t('preview.deductions.description')}
								</p>
							</div>
							<div className="space-y-2">
								{deductionsBreakdown.map((deduction) => (
									<div
										key={deduction.deductionId}
										className="rounded-xl border bg-muted/30 px-3 py-2"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-sm font-medium">
													{deduction.label}
												</p>
												<p className="text-xs text-muted-foreground">
													{t(
														`preview.deductions.types.${deduction.type}`,
													)}
												</p>
											</div>
											<div className="text-right">
												<p className="text-sm font-semibold">
													{formatCurrency(deduction.appliedAmount)}
												</p>
												<p className="text-xs text-muted-foreground">
													{t(
														`preview.deductions.methods.${deduction.calculationMethod}`,
													)}
												</p>
											</div>
										</div>
										<div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
											<span>
												{t('preview.deductions.baseAmount', {
													value: formatCurrency(deduction.baseAmount),
												})}
											</span>
											{deduction.frequency === 'INSTALLMENTS' &&
											deduction.totalInstallments ? (
												<span>
													{t('preview.deductions.installments', {
														completed:
															deduction.completedInstallmentsAfter,
														total: deduction.totalInstallments,
													})}
												</span>
											) : null}
											{deduction.remainingAmountAfter !== null ? (
												<span>
													{t('preview.deductions.remaining', {
														value: formatCurrency(
															deduction.remainingAmountAfter,
														),
													})}
												</span>
											) : null}
										</div>
									</div>
								))}
							</div>
							{exceededNetPay ? (
								<div className="rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)]/70 px-3 py-2 text-xs text-[var(--status-warning)]">
									<div className="flex items-center gap-2">
										<CircleAlert className="h-4 w-4" />
										<span>{t('preview.deductions.exceededNetPay')}</span>
									</div>
								</div>
							) : null}
						</div>
					</PopoverContent>
				</Popover>
			</div>
			{exceededNetPay ? (
				<p className="text-xs text-[var(--status-warning)]">
					{t('preview.deductions.capped')}
				</p>
			) : null}
		</div>
	);
}

/**
 * Computes period boundaries based on week start and frequency.
 *
 * @param weekStartDay - Day index the week starts on
 * @param frequency - Payment frequency
 * @param timeZone - IANA time zone used to compute the current date key
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
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const t = useTranslations('Payroll');
	useTour('payroll');

	const [paymentFrequency, setPaymentFrequency] =
		useState<PayrollCalculateParams['paymentFrequency']>(defaultFrequency);

	const [periodStartDateKey, setPeriodStartDateKey] = useState<string>(
		() => computePeriod(1, defaultFrequency, 'America/Mexico_City').periodStartDateKey,
	);
	const [periodEndDateKey, setPeriodEndDateKey] = useState<string>(
		() => computePeriod(1, defaultFrequency, 'America/Mexico_City').periodEndDateKey,
	);
	const [runsGlobalFilter, setRunsGlobalFilter] = useState<string>('');
	const [runsSorting, setRunsSorting] = useState<SortingState>([]);
	const [runsPagination, setRunsPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [runsColumnFilters, setRunsColumnFilters] = useState<ColumnFiltersState>([]);

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
	const payrollTimeZone = settings?.timeZone ?? 'America/Mexico_City';

	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		const next = computePeriod(settings?.weekStartDay ?? 1, paymentFrequency, payrollTimeZone);
		setPeriodStartDateKey(next.periodStartDateKey);
		setPeriodEndDateKey(next.periodEndDateKey);
	}, [settings?.weekStartDay, payrollTimeZone, paymentFrequency]);
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

	const periodStartDate = useMemo(() => parseDateKey(periodStartDateKey), [periodStartDateKey]);
	const periodEndDate = useMemo(() => parseDateKey(periodEndDateKey), [periodEndDateKey]);

	const isInvalidPeriodRange =
		Boolean(periodStartDate) &&
		Boolean(periodEndDate) &&
		periodEndDate !== undefined &&
		periodStartDate !== undefined &&
		periodEndDate < periodStartDate;

	const { data: calculation, isFetching: isCalculating } = useQuery({
		queryKey: queryKeys.payroll.calculate(calculationParams),
		queryFn: () =>
			calculatePayroll({
				periodStartDateKey,
				periodEndDateKey,
				paymentFrequency,
				organizationId: organizationId ?? undefined,
			}),
		enabled: Boolean(organizationId) && !isInvalidPeriodRange,
	});

	const effectiveCalculation = isInvalidPeriodRange ? null : calculation;

	const taxSummary = useMemo(() => {
		if (!effectiveCalculation) {
			return null;
		}
		return (
			effectiveCalculation.taxSummary ?? aggregateTaxSummary(effectiveCalculation.employees)
		);
	}, [effectiveCalculation]);
	const canViewDualPayroll =
		userRole === 'admin' || organizationRole === 'owner' || organizationRole === 'admin';
	const showDualPayrollColumns =
		canViewDualPayroll && Boolean(settings?.enableDualPayroll);
	const dualPayrollSummary = useMemo(() => {
		if (!effectiveCalculation || !showDualPayrollColumns) {
			return null;
		}
		return aggregateDualPayrollSummary(effectiveCalculation.employees);
	}, [effectiveCalculation, showDualPayrollColumns]);

	const overtimeAuthorizationSummary = useMemo(() => {
		if (!effectiveCalculation) {
			return {
				unauthorizedHours: 0,
				affectedEmployeesCount: 0,
			};
		}

		return effectiveCalculation.employees.reduce(
			(acc, employee) => ({
				unauthorizedHours:
					acc.unauthorizedHours + (employee.unauthorizedOvertimeHours ?? 0),
				affectedEmployeesCount:
					acc.affectedEmployeesCount +
					((employee.unauthorizedOvertimeHours ?? 0) > 0 ? 1 : 0),
			}),
			{
				unauthorizedHours: 0,
				affectedEmployeesCount: 0,
			},
		);
	}, [effectiveCalculation]);

	const onExportCsv = (): void => {
		if (!effectiveCalculation || effectiveCalculation.employees.length === 0) {
			toast.error(t('preview.toast.noCalculation'));
			return;
		}

		const columns: CsvColumn[] = [
			{ key: 'rowType', label: t('csv.headers.rowType') },
			{ key: 'employeeId', label: t('csv.headers.employeeId') },
			{ key: 'employeeName', label: t('csv.headers.employeeName') },
			{ key: 'paymentFrequency', label: t('csv.headers.paymentFrequency') },
			{ key: 'periodStart', label: t('csv.headers.periodStart') },
			{ key: 'periodEnd', label: t('csv.headers.periodEnd') },
			{ key: 'dailyPay', label: t('csv.headers.dailyPay') },
			...(showDualPayrollColumns
				? [
						{
							key: 'fiscalDailyPay',
							label: t('csv.headers.fiscalDailyPay'),
						},
				  ]
				: []),
			{ key: 'hourlyPay', label: t('csv.headers.hourlyPay') },
			{ key: 'hoursWorked', label: t('csv.headers.hoursWorked') },
			{ key: 'expectedHours', label: t('csv.headers.expectedHours') },
			{ key: 'normalHours', label: t('csv.headers.normalHours') },
			{ key: 'overtimeDoubleHours', label: t('csv.headers.overtimeDoubleHours') },
			{ key: 'overtimeTripleHours', label: t('csv.headers.overtimeTripleHours') },
			{
				key: 'authorizedOvertimeHours',
				label: t('csv.headers.authorizedOvertimeHours'),
			},
			{
				key: 'unauthorizedOvertimeHours',
				label: t('csv.headers.unauthorizedOvertimeHours'),
			},
			{ key: 'sundayPremiumAmount', label: t('csv.headers.sundayPremiumAmount') },
			{
				key: 'mandatoryRestDayPremiumAmount',
				label: t('csv.headers.mandatoryRestDayPremiumAmount'),
			},
			{ key: 'vacationDaysPaid', label: t('csv.headers.vacationDaysPaid') },
			{ key: 'vacationPayAmount', label: t('csv.headers.vacationPayAmount') },
			{
				key: 'vacationPremiumAmount',
				label: t('csv.headers.vacationPremiumAmount'),
			},
			{ key: 'incapacityDays', label: t('csv.headers.incapacityDays') },
			{
				key: 'incapacitySubsidy',
				label: t('csv.headers.incapacitySubsidy'),
			},
			{ key: 'seventhDayPay', label: t('csv.headers.seventhDayPay') },
			{ key: 'totalPay', label: t('csv.headers.totalPay') },
			...(showDualPayrollColumns
				? [
						{
							key: 'fiscalGrossPay',
							label: t('csv.headers.fiscalGrossPay'),
						},
						{
							key: 'complementPay',
							label: t('csv.headers.complementPay'),
						},
						{
							key: 'totalRealPay',
							label: t('csv.headers.totalRealPay'),
						},
				  ]
				: []),
			{ key: 'grossPay', label: t('csv.headers.grossPay') },
			{
				key: 'employeeWithholdingsTotal',
				label: t('csv.headers.employeeWithholdingsTotal'),
			},
			{
				key: 'employeeWithholdingsIsr',
				label: t('csv.headers.employeeWithholdingsIsr'),
			},
			{
				key: 'employeeWithholdingsImssTotal',
				label: t('csv.headers.employeeWithholdingsImssTotal'),
			},
			{ key: 'employerCostsTotal', label: t('csv.headers.employerCostsTotal') },
			{ key: 'employerCostsImssTotal', label: t('csv.headers.employerCostsImssTotal') },
			{
				key: 'employerCostsImssGuarderias',
				label: t('csv.headers.employerCostsImssGuarderias'),
			},
			{ key: 'employerCostsSarRetiro', label: t('csv.headers.employerCostsSarRetiro') },
			{ key: 'employerCostsInfonavit', label: t('csv.headers.employerCostsInfonavit') },
			{ key: 'employerCostsRiskWork', label: t('csv.headers.employerCostsRiskWork') },
			{ key: 'employerCostsIsn', label: t('csv.headers.employerCostsIsn') },
			{
				key: 'employerCostsAbsorbedImssEmployeeShare',
				label: t('csv.headers.employerCostsAbsorbedImssEmployeeShare'),
			},
			{ key: 'employerCostsAbsorbedIsr', label: t('csv.headers.employerCostsAbsorbedIsr') },
			{ key: 'netPay', label: t('csv.headers.netPay') },
			{ key: 'companyCost', label: t('csv.headers.companyCost') },
			{ key: 'baseSbcDaily', label: t('csv.headers.baseSbcDaily') },
			{ key: 'baseSbcPeriod', label: t('csv.headers.baseSbcPeriod') },
			{ key: 'baseIsrBase', label: t('csv.headers.baseIsrBase') },
			{ key: 'baseDaysInPeriod', label: t('csv.headers.baseDaysInPeriod') },
			{
				key: 'informationalIsrBeforeSubsidy',
				label: t('csv.headers.informationalIsrBeforeSubsidy'),
			},
			{
				key: 'informationalSubsidyApplied',
				label: t('csv.headers.informationalSubsidyApplied'),
			},
			{
				key: 'lunchBreakAutoDeductedDays',
				label: t('csv.headers.lunchBreakAutoDeductedDays'),
			},
			{
				key: 'lunchBreakAutoDeductedMinutes',
				label: t('csv.headers.lunchBreakAutoDeductedMinutes'),
			},
			{ key: 'warningsCount', label: t('csv.headers.warningsCount') },
			{ key: 'warnings', label: t('csv.headers.warnings') },
		];

		const rows: CsvRow[] = effectiveCalculation.employees.map((row) =>
			buildPayrollCsvEmployeeRow({
				row,
				periodStartDateKey,
				periodEndDateKey,
				t,
			}),
		);

		if (taxSummary) {
			rows.push({
				rowType: t('csv.rowTypes.summary'),
				employeeId: '',
				employeeName: t('csv.summaryLabel'),
				paymentFrequency: t(`paymentFrequency.${paymentFrequency}`),
				periodStart: periodStartDateKey,
				periodEnd: periodEndDateKey,
				grossPay: taxSummary.grossTotal,
				employeeWithholdingsTotal: taxSummary.employeeWithholdingsTotal,
				employerCostsTotal: taxSummary.employerCostsTotal,
				netPay: taxSummary.netPayTotal,
				companyCost: taxSummary.companyCostTotal,
			});
		}

		const csv = buildCsvContent(columns, rows);
		const fileName = t('csv.fileName', {
			start: periodStartDateKey,
			end: periodEndDateKey,
		});
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
		toast.success(t('preview.toast.exportSuccess'));
	};

	const hasBlockingWarnings =
		effectiveCalculation?.overtimeEnforcement === 'BLOCK' &&
		(effectiveCalculation?.employees ?? []).some((emp) =>
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
	const payrollRuns = runsQuery.data ?? [];

	/**
	 * Updates the run history search and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleRunsGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setRunsGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			setRunsPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		[],
	);

	const runColumns = useMemo<ColumnDef<PayrollRun>[]>(
		() => [
			{
				id: 'period',
				accessorFn: (row) => new Date(row.periodStart).getTime(),
				header: t('runHistory.table.period'),
				cell: ({ row }) => formatPayrollRunPeriod(row.original, t),
			},
			{
				accessorKey: 'paymentFrequency',
				header: t('runHistory.table.frequency'),
				cell: ({ row }) => t(`paymentFrequency.${row.original.paymentFrequency}`),
			},
			{
				accessorKey: 'status',
				header: t('runHistory.table.status'),
				cell: ({ row }) => t(`runStatus.${row.original.status}`),
			},
			{
				id: 'holidayNotices',
				header: t('runHistory.table.holidayNotices'),
				cell: ({ row }) => {
					const notices = row.original.holidayNotices ?? [];
					if (!notices || notices.length === 0) {
						return (
							<span className="text-xs text-muted-foreground">
								{t('runHistory.table.noHolidayNotices')}
							</span>
						);
					}

					return (
						<Dialog>
							<DialogTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									data-testid={`payroll-run-holiday-notice-trigger-${row.original.id}`}
								>
									{t('runHistory.table.holidayNoticesCount', {
										count: notices.length,
									})}
								</Button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-2xl">
								<DialogHeader>
									<DialogTitle data-testid="payroll-holiday-notice-dialog-title">
										{t('holidayNotice.title')}
									</DialogTitle>
								</DialogHeader>
								<PayrollHolidayNoticeCard notices={notices} compact />
							</DialogContent>
						</Dialog>
					);
				},
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'totalAmount',
				header: t('runHistory.table.total'),
				cell: ({ row }) => formatCurrency(Number(row.original.totalAmount ?? 0)),
				enableGlobalFilter: false,
			},
			{
				id: 'processedAt',
				accessorFn: (row) => (row.processedAt ? new Date(row.processedAt).getTime() : 0),
				header: t('runHistory.table.processed'),
				cell: ({ row }) =>
					row.original.processedAt
						? format(new Date(row.original.processedAt), t('dateFormat'))
						: '-',
				enableGlobalFilter: false,
			},
			{
				id: 'receipts',
				header: t('runHistory.table.receipts'),
				cell: ({ row }) =>
					row.original.status === 'PROCESSED' ? (
						<PayrollRunReceiptsDialog run={row.original} />
					) : (
						<Badge variant="outline" className="text-xs text-muted-foreground">
							{t('receipts.unavailable')}
						</Badge>
					),
				enableGlobalFilter: false,
			},
		],
		[t],
	);

	/**
	 * Renders the mobile card layout for a payroll history row.
	 *
	 * @param run - Payroll run metadata
	 * @returns Mobile payroll history card
	 */
	const renderPayrollRunCard = useCallback(
		(run: PayrollRun): React.ReactElement => {
			const notices = run.holidayNotices ?? [];

			return (
				<div className="space-y-4">
					<div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
						<div className="space-y-1">
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
								{t('runHistory.table.period')}
							</p>
							<p className="text-base font-semibold">
								{formatPayrollRunPeriod(run, t)}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="secondary">
								{t(`paymentFrequency.${run.paymentFrequency}`)}
							</Badge>
							<Badge variant={getPayrollRunStatusVariant(run.status)}>
								{t(`runStatus.${run.status}`)}
							</Badge>
						</div>
					</div>

					<div className="grid gap-3 min-[560px]:grid-cols-2">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">
								{t('runHistory.table.total')}
							</p>
							<p className="text-base font-semibold">
								{formatCurrency(Number(run.totalAmount ?? 0))}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">
								{t('runHistory.table.processed')}
							</p>
							<p className="text-sm font-medium">
								{run.processedAt
									? format(new Date(run.processedAt), t('dateFormat'))
									: '-'}
							</p>
						</div>
					</div>

					<div className="grid gap-2 [&_button]:min-h-11 [&_button]:w-full [&_a]:inline-flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:justify-center">
						{notices.length > 0 ? (
							<Dialog>
								<DialogTrigger asChild>
									<Button variant="outline" className="min-h-11">
										{t('runHistory.table.holidayNoticesCount', {
											count: notices.length,
										})}
									</Button>
								</DialogTrigger>
								<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-2xl">
									<DialogHeader>
										<DialogTitle data-testid="payroll-holiday-notice-dialog-title">
											{t('holidayNotice.title')}
										</DialogTitle>
									</DialogHeader>
									<PayrollHolidayNoticeCard notices={notices} compact />
								</DialogContent>
							</Dialog>
						) : (
							<div className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
								{t('runHistory.table.noHolidayNotices')}
							</div>
						)}

						{run.status === 'PROCESSED' ? (
							<PayrollRunReceiptsDialog run={run} />
						) : (
							<Badge
								variant="outline"
								className="justify-center rounded-2xl px-4 py-3 text-sm text-muted-foreground"
							>
								{t('receipts.unavailable')}
							</Badge>
						)}
					</div>
				</div>
			);
		},
		[t],
	);

	const onProcess = async (): Promise<void> => {
		if (isInvalidPeriodRange) {
			toast.error(t('payPeriod.invalidRange'));
			return;
		}
		if (!effectiveCalculation) return;
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
				<ResponsivePageHeader title={t('title')} description={t('noOrganization')} />
			</div>
		);
	}

	return (
		<div
			data-testid="payroll-page-root"
			className="min-w-0 space-y-6 overflow-x-hidden"
		>
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={<TourHelpButton tourId="payroll" />}
			/>

			<Tabs defaultValue="payroll" className="min-w-0 space-y-4 overflow-x-hidden">
				<TabsList
					data-tour="payroll-tabs"
					className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 min-[1025px]:inline-flex min-[1025px]:h-10 min-[1025px]:w-auto min-[1025px]:gap-0 min-[1025px]:bg-muted min-[1025px]:p-1"
				>
					<TabsTrigger
						value="payroll"
						data-testid="payroll-tab-payroll"
						className="min-h-11 w-full min-[1025px]:w-auto"
					>
						{t('tabs.payroll')}
					</TabsTrigger>
					<TabsTrigger
						value="ptu"
						disabled={!settings?.ptuEnabled}
						data-testid="payroll-tab-ptu"
						className="min-h-11 w-full min-[1025px]:w-auto"
					>
						{t('tabs.ptu')}
					</TabsTrigger>
					<TabsTrigger
						value="aguinaldo"
						disabled={!settings?.aguinaldoEnabled}
						data-testid="payroll-tab-aguinaldo"
						className="min-h-11 w-full min-[1025px]:w-auto"
					>
						{t('tabs.aguinaldo')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="payroll" className="min-w-0 space-y-6 overflow-x-hidden">
					<Card>
						<CardHeader>
							<CardTitle>{t('legalRules.title')}</CardTitle>
							<CardDescription>{t('legalRules.description')}</CardDescription>
						</CardHeader>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t('insights.title')}</CardTitle>
							<CardDescription>{t('insights.description')}</CardDescription>
						</CardHeader>
						<CardContent className="min-w-0">
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								<div className="space-y-2">
									<p className="text-sm font-medium">
										{t('insights.sections.minimumWage')}
									</p>
									<ul className="space-y-1 text-sm text-muted-foreground">
										<li>
											{t('insights.items.minimumWageGeneral', {
												value: formatCurrency(315.04),
											})}
										</li>
										<li>
											{t('insights.items.minimumWageZlfn', {
												value: formatCurrency(440.87),
											})}
										</li>
									</ul>
								</div>
								<div className="space-y-2">
									<p className="text-sm font-medium">
										{t('insights.sections.uma')}
									</p>
									<ul className="space-y-1 text-sm text-muted-foreground">
										<li>
											{t('insights.items.umaJan', {
												value: formatCurrency(113.14),
											})}
										</li>
										<li>
											{t('insights.items.umaFeb', {
												value: formatCurrency(117.31),
											})}
										</li>
									</ul>
								</div>
								<div className="space-y-2">
									<p className="text-sm font-medium">
										{t('insights.sections.subsidy')}
									</p>
									<ul className="space-y-1 text-sm text-muted-foreground">
										<li>
											{t('insights.items.subsidyLimit', {
												value: formatCurrency(11492.66),
											})}
										</li>
										<li>
											{t('insights.items.subsidyJan', {
												value: formatCurrency(536.21),
											})}
										</li>
										<li>
											{t('insights.items.subsidyFeb', {
												value: formatCurrency(535.65),
											})}
										</li>
									</ul>
								</div>
								<div className="space-y-2">
									<p className="text-sm font-medium">
										{t('insights.sections.isr')}
									</p>
									<p className="text-sm text-muted-foreground">
										{t('insights.items.isrTables')}
									</p>
								</div>
								<div className="space-y-2">
									<p className="text-sm font-medium">
										{t('insights.sections.cv')}
									</p>
									<p className="text-sm text-muted-foreground">
										{t('insights.items.cvRange')}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t('payPeriod.title')}</CardTitle>
							<CardDescription>{t('payPeriod.description')}</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4 min-[1025px]:grid-cols-4">
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
											payrollTimeZone,
										);
										setPeriodStartDateKey(next.periodStartDateKey);
										setPeriodEndDateKey(next.periodEndDateKey);
									}}
								>
									<SelectTrigger className="min-h-11 w-full">
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
								<label className="text-sm font-medium">
									{t('payPeriod.periodStart')}
								</label>
								<Popover>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											data-empty={!periodStartDate}
											className="min-h-11 w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
										>
											<CalendarIcon className="mr-2 h-4 w-4" />
											{periodStartDate ? (
												format(periodStartDate, 'PPP', { locale: es })
											) : (
												<span>{t('payPeriod.selectDate')}</span>
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Calendar
											mode="single"
											selected={periodStartDate}
											onSelect={(date) => {
												if (!date) return;
												setPeriodStartDateKey(
													toDateKeyInTimeZone(date, payrollTimeZone),
												);
											}}
											initialFocus
										/>
									</PopoverContent>
								</Popover>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-sm font-medium">
									{t('payPeriod.periodEnd')}
								</label>
								<Popover>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											data-empty={!periodEndDate}
											className="min-h-11 w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
										>
											<CalendarIcon className="mr-2 h-4 w-4" />
											{periodEndDate ? (
												format(periodEndDate, 'PPP', { locale: es })
											) : (
												<span>{t('payPeriod.selectDate')}</span>
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Calendar
											mode="single"
											selected={periodEndDate}
											onSelect={(date) => {
												if (!date) return;
												setPeriodEndDateKey(
													toDateKeyInTimeZone(date, payrollTimeZone),
												);
											}}
											initialFocus
										/>
									</PopoverContent>
								</Popover>
							</div>
							<div className="flex flex-col justify-end gap-2" data-tour="payroll-process">
								<Button
									className="min-h-11 w-full"
									onClick={onProcess}
									disabled={
										isCalculating ||
										processMutation.isPending ||
										!effectiveCalculation ||
										hasBlockingWarnings ||
										isInvalidPeriodRange
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
								{hasBlockingWarnings ? (
									<p className="text-sm text-destructive">
										{t('warnings.blockingOvertime')}
									</p>
								) : null}
							</div>
						</CardContent>
					</Card>

					{isInvalidPeriodRange && (
						<p className="text-sm text-destructive">{t('payPeriod.invalidRange')}</p>
					)}

					<Card className="min-w-0 overflow-hidden">
						<CardHeader>
							<CardTitle>{t('preview.title')}</CardTitle>
							<CardDescription>{t('preview.description')}</CardDescription>
						</CardHeader>
						<CardContent className="min-w-0 overflow-hidden">
							{isCalculating ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									{t('preview.calculating')}
								</div>
							) : !effectiveCalculation ||
							  effectiveCalculation.employees.length === 0 ? (
								<Empty className="border">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<CalendarIcon className="h-5 w-5" />
										</EmptyMedia>
										<EmptyTitle>{t('preview.noCalculation')}</EmptyTitle>
										<EmptyDescription>
											{isInvalidPeriodRange
												? t('payPeriod.invalidRange')
												: t('preview.description')}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<>
									<div className="mb-4 flex flex-col gap-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
										<div className="text-sm text-muted-foreground">
											{t('preview.totalEmployees', {
												count: effectiveCalculation.employees.length,
											})}
										</div>
										<div className="flex flex-col gap-3 min-[1025px]:items-end">
											<div className="text-lg font-semibold">
												{t('preview.totalAmount', {
													total: formatCurrency(
														effectiveCalculation.totalAmount,
													),
												})}
											</div>
											<Button
												variant="outline"
												size="sm"
												className="min-h-11 w-full min-[1025px]:w-auto"
												onClick={onExportCsv}
												disabled={
													effectiveCalculation.employees.length === 0
												}
											>
												{t('preview.actions.exportCsv')}
											</Button>
										</div>
									</div>
									<PayrollHolidayNoticeCard
										notices={effectiveCalculation.holidayNotices}
									/>
									<PayrollOvertimeAlert
										unauthorizedHours={
											overtimeAuthorizationSummary.unauthorizedHours
										}
										affectedEmployeesCount={
											overtimeAuthorizationSummary.affectedEmployeesCount
										}
									/>
									<div
										data-testid="payroll-preview-table-container"
										className="max-w-full overflow-x-auto rounded-md border"
									>
										<Table className="min-w-max">
											<TableHeader>
												<TableRow>
													<TableHead>
														{t('preview.table.employee')}
													</TableHead>
													<TableHead>
														{t('preview.table.normalHours')}
													</TableHead>
													<TableHead>
														{t('preview.table.overtimeDouble')}
													</TableHead>
													<TableHead>
														{t('preview.table.overtimeTriple')}
													</TableHead>
													<TableHead>
														{t('preview.table.authorizedOvertime')}
													</TableHead>
													<TableHead>
														{t('preview.table.unauthorizedOvertime')}
													</TableHead>
													<TableHead>
														{t('preview.table.sundayPremium')}
													</TableHead>
													<TableHead>
														{t('preview.table.mandatoryRest')}
													</TableHead>
													<TableHead>
														{t('preview.table.holidayImpact')}
													</TableHead>
													<TableHead>
														{t('preview.table.vacationPay')}
													</TableHead>
													<TableHead>
														{t('preview.table.vacationPremium')}
													</TableHead>
													<TableHead>
														{t('preview.table.incapacityDays')}
													</TableHead>
													<TableHead>
														{t('preview.table.incapacitySubsidy')}
													</TableHead>
													<TableHead>
														{t('preview.table.lunchBreakDeduction')}
													</TableHead>
													<TableHead>
														{t('preview.table.deductions')}
													</TableHead>
													{showDualPayrollColumns ? (
														<>
															<TableHead>
																{t('preview.table.fiscalGrossPay')}
															</TableHead>
															<TableHead>
																{t('preview.table.complementPay')}
															</TableHead>
															<TableHead>
																{t('preview.table.totalRealPay')}
															</TableHead>
														</>
													) : (
														<TableHead>
															{t('preview.table.total')}
														</TableHead>
													)}
													<TableHead>
														{t('preview.table.warnings')}
													</TableHead>
													<TableHead>
														{t('preview.table.detail')}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{effectiveCalculation.employees.map((row) => (
													<TableRow
														key={row.employeeId}
														className={
															row.unauthorizedOvertimeHours > 0
																? 'bg-[var(--status-warning-bg)]/40 hover:bg-[var(--status-warning-bg)]/55'
																: undefined
														}
													>
														<TableCell>{row.name}</TableCell>
														<TableCell>
															{row.normalHours.toFixed(2)}
														</TableCell>
														<TableCell>
															{row.overtimeDoubleHours.toFixed(2)}
														</TableCell>
														<TableCell>
															{row.overtimeTripleHours.toFixed(2)}
														</TableCell>
														<TableCell>
															{row.authorizedOvertimeHours > 0
																? row.authorizedOvertimeHours.toFixed(
																		2,
																	)
																: '-'}
														</TableCell>
														<TableCell>
															{row.unauthorizedOvertimeHours > 0 ? (
																<Badge variant="warning">
																	{row.unauthorizedOvertimeHours.toFixed(
																		2,
																	)}
																</Badge>
															) : (
																<span className="text-muted-foreground">
																	-
																</span>
															)}
														</TableCell>
														<TableCell>
															{row.sundayPremiumAmount > 0
																? formatCurrency(
																		row.sundayPremiumAmount,
																	)
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
															{row.holidayImpact &&
															row.holidayImpact
																.affectedHolidayDateKeys.length >
																0 ? (
																<Badge variant="outline">
																	{t(
																		'holidayNotice.employeeBadge',
																		{
																			count: row.holidayImpact
																				.affectedHolidayDateKeys
																				.length,
																		},
																	)}
																</Badge>
															) : (
																<span className="text-muted-foreground">
																	-
																</span>
															)}
														</TableCell>
														<TableCell>
															{row.vacationPayAmount > 0
																? formatCurrency(
																		row.vacationPayAmount,
																	)
																: '-'}
															{row.vacationDaysPaid > 0 && (
																<span className="mt-1 block text-xs text-muted-foreground">
																	{t(
																		'preview.table.vacationDays',
																		{
																			count: row.vacationDaysPaid,
																		},
																	)}
																</span>
															)}
														</TableCell>
														<TableCell>
															{row.vacationPremiumAmount > 0
																? formatCurrency(
																		row.vacationPremiumAmount,
																	)
																: '-'}
														</TableCell>
														<TableCell>
															{row.incapacitySummary
																?.daysIncapacityTotal
																? row.incapacitySummary
																		.daysIncapacityTotal
																: '-'}
														</TableCell>
														<TableCell>
															{row.incapacitySummary
																?.expectedImssSubsidyAmount
																? formatCurrency(
																		row.incapacitySummary
																			.expectedImssSubsidyAmount,
																	)
																: '-'}
														</TableCell>
														<TableCell>
															{renderLunchBreakDeductionCell(row, t)}
														</TableCell>
														<TableCell>
															{renderDeductionsCell(row, t)}
														</TableCell>
														{showDualPayrollColumns ? (
															<>
																<TableCell>
																	{formatCurrency(
																		row.fiscalGrossPay ?? row.grossPay,
																	)}
																</TableCell>
																<TableCell>
																	{formatCurrency(row.complementPay ?? 0)}
																</TableCell>
																<TableCell>
																	{formatCurrency(
																		row.totalRealPay ?? row.totalPay,
																	)}
																</TableCell>
															</>
														) : (
															<TableCell>
																{formatCurrency(row.totalPay)}
															</TableCell>
														)}
														<TableCell>
															{row.warnings.length === 0 ? (
																<span className="text-xs text-muted-foreground">
																	0
																</span>
															) : (
																<span
																	className={`text-xs ${
																		row.warnings.some(
																			(w) =>
																				w.severity ===
																				'error',
																		)
																			? 'text-destructive'
																			: 'text-[color:var(--status-warning)]'
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
																	<Button
																		variant="outline"
																		size="sm"
																		className="min-h-11"
																	>
																		{t('preview.table.detail')}
																	</Button>
																</DialogTrigger>
																<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-2xl">
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
																				{t(
																					'taxDetail.sections.summary',
																				)}
																			</p>
																			<div className="mt-2 grid gap-2">
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.grossPay',
																						)}
																					</span>
																					<span className="font-medium">
																						{formatCurrency(
																							row.grossPay,
																						)}
																					</span>
																				</div>
																				{showDualPayrollColumns ? (
																					<>
																						<div className="flex items-center justify-between">
																							<span className="text-muted-foreground">
																								{t(
																									'taxDetail.labels.fiscalGrossPay',
																								)}
																							</span>
																							<span>
																								{formatCurrency(
																									row.fiscalGrossPay ??
																										row.grossPay,
																								)}
																							</span>
																						</div>
																						<div className="flex items-center justify-between">
																							<span className="text-muted-foreground">
																								{t(
																									'taxDetail.labels.complementPay',
																								)}
																							</span>
																							<span>
																								{formatCurrency(
																									row.complementPay ?? 0,
																								)}
																							</span>
																						</div>
																						<div className="flex items-center justify-between">
																							<span className="text-muted-foreground">
																								{t(
																									'taxDetail.labels.totalRealPay',
																								)}
																							</span>
																							<span className="font-medium">
																								{formatCurrency(
																									row.totalRealPay ??
																										row.totalPay,
																								)}
																							</span>
																						</div>
																					</>
																				) : null}
																				{row.vacationDaysPaid >
																					0 && (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.vacationDays',
																							)}
																						</span>
																						<span>
																							{
																								row.vacationDaysPaid
																							}
																						</span>
																					</div>
																				)}
																				{row.vacationPayAmount >
																					0 && (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.vacationPay',
																							)}
																						</span>
																						<span>
																							{formatCurrency(
																								row.vacationPayAmount,
																							)}
																						</span>
																					</div>
																				)}
																				{row.vacationPremiumAmount >
																					0 && (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.vacationPremium',
																							)}
																						</span>
																						<span>
																							{formatCurrency(
																								row.vacationPremiumAmount,
																							)}
																						</span>
																					</div>
																				)}
																				{row
																					.incapacitySummary
																					?.daysIncapacityTotal ? (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.incapacityDays',
																							)}
																						</span>
																						<span>
																							{
																								row
																									.incapacitySummary
																									.daysIncapacityTotal
																							}
																						</span>
																					</div>
																				) : null}
																				{row
																					.incapacitySummary
																					?.expectedImssSubsidyAmount ? (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.incapacitySubsidy',
																							)}
																						</span>
																						<span>
																							{formatCurrency(
																								row
																									.incapacitySummary
																									.expectedImssSubsidyAmount,
																							)}
																						</span>
																					</div>
																				) : null}
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.employeeWithholdings',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employeeWithholdings
																								.total,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.netPay',
																						)}
																					</span>
																					<span className="font-medium">
																						{formatCurrency(
																							row.netPay,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.employerCosts',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.total,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.companyCost',
																						)}
																					</span>
																					<span className="font-medium">
																						{formatCurrency(
																							row.companyCost,
																						)}
																					</span>
																				</div>
																			</div>
																		</div>
																		<div>
																			<p className="font-medium">
																				{t(
																					'taxDetail.sections.bases',
																				)}
																			</p>
																			<div className="mt-2 grid gap-2">
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.sbcDaily',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.bases
																								.sbcDaily,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.sbcPeriod',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.bases
																								.sbcPeriod,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.isrBase',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.bases
																								.isrBase,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.daysInPeriod',
																						)}
																					</span>
																					<span>
																						{
																							row
																								.bases
																								.daysInPeriod
																						}
																					</span>
																				</div>
																			</div>
																		</div>
																		<div>
																			<p className="font-medium">
																				{t(
																					'taxDetail.sections.employeeWithholdings',
																				)}
																			</p>
																			<div className="mt-2 grid gap-2">
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.isrWithheld',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employeeWithholdings
																								.isrWithheld,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.imssEmployee',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employeeWithholdings
																								.imssEmployee
																								.total,
																						)}
																					</span>
																				</div>
																			</div>
																		</div>
																		<div>
																			<p className="font-medium">
																				{t(
																					'taxDetail.sections.employerCosts',
																				)}
																			</p>
																			<div className="mt-2 grid gap-2">
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.imssEmployer',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.imssEmployer
																								.total,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.sarRetiro',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.sarRetiro,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.infonavit',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.infonavit,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.riskWork',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.riskWork,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.isn',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.employerCosts
																								.isn,
																						)}
																					</span>
																				</div>
																				{row.employerCosts
																					.absorbedImssEmployeeShare >
																				0 ? (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.absorbedImssEmployeeShare',
																							)}
																						</span>
																						<span>
																							{formatCurrency(
																								row
																									.employerCosts
																									.absorbedImssEmployeeShare,
																							)}
																						</span>
																					</div>
																				) : null}
																				{row.employerCosts
																					.absorbedIsr >
																				0 ? (
																					<div className="flex items-center justify-between">
																						<span className="text-muted-foreground">
																							{t(
																								'taxDetail.labels.absorbedIsr',
																							)}
																						</span>
																						<span>
																							{formatCurrency(
																								row
																									.employerCosts
																									.absorbedIsr,
																							)}
																						</span>
																					</div>
																				) : null}
																			</div>
																		</div>
																		<div>
																			<p className="font-medium">
																				{t(
																					'taxDetail.sections.informational',
																				)}
																			</p>
																			<div className="mt-2 grid gap-2">
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.isrBeforeSubsidy',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.informationalLines
																								.isrBeforeSubsidy,
																						)}
																					</span>
																				</div>
																				<div className="flex items-center justify-between">
																					<span className="text-muted-foreground">
																						{t(
																							'taxDetail.labels.subsidyApplied',
																						)}
																					</span>
																					<span>
																						{formatCurrency(
																							row
																								.informationalLines
																								.subsidyApplied,
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
											{showDualPayrollColumns && dualPayrollSummary ? (
												<TableFooter>
													<TableRow>
														<TableCell colSpan={14}>
															<div className="flex flex-col">
																<span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
																	{t('preview.footer.totalsLabel')}
																</span>
																<span className="text-sm text-foreground">
																	{t('preview.footer.dualPayrollLabel')}
																</span>
															</div>
														</TableCell>
														<TableCell>
															{formatCurrency(
																dualPayrollSummary.fiscalGrossTotal,
															)}
														</TableCell>
														<TableCell>
															{formatCurrency(
																dualPayrollSummary.complementTotal,
															)}
														</TableCell>
														<TableCell>
															{formatCurrency(
																dualPayrollSummary.totalRealTotal,
															)}
														</TableCell>
														<TableCell colSpan={2} />
													</TableRow>
												</TableFooter>
											) : null}
										</Table>
									</div>
									{effectiveCalculation.employees.some(
										(emp) => emp.warnings.length > 0,
									) && (
										<div className="mt-4 rounded-md border bg-muted/50 p-3">
											<p className="text-sm font-medium">
												{t('compliance.title')}
											</p>
											<div className="mt-2 space-y-2 text-sm">
												{effectiveCalculation.employees.map((emp) =>
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

					{effectiveCalculation && taxSummary ? (
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
							<ResponsiveDataView
								columns={runColumns}
								data={payrollRuns}
								cardRenderer={renderPayrollRunCard}
								getCardKey={(run) => run.id}
								sorting={runsSorting}
								onSortingChange={setRunsSorting}
								pagination={runsPagination}
								onPaginationChange={setRunsPagination}
								columnFilters={runsColumnFilters}
								onColumnFiltersChange={setRunsColumnFilters}
								globalFilter={runsGlobalFilter}
								onGlobalFilterChange={handleRunsGlobalFilterChange}
								emptyState={t('runHistory.empty')}
								isLoading={runsQuery.isLoading}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="ptu">
					<PtuTab settings={settings ?? null} isLoading={!settings} />
				</TabsContent>

				<TabsContent value="aguinaldo">
					<AguinaldoTab settings={settings ?? null} isLoading={!settings} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
