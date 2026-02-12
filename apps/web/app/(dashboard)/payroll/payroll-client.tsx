'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
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
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { DataTable } from '@/components/data-table/data-table';
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

type CsvColumn = {
	key: string;
	label: string;
};

type CsvRow = Record<string, string | number | null | undefined>;

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
	const { organizationId } = useOrgContext();
	const t = useTranslations('Payroll');

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
			{ key: 'hourlyPay', label: t('csv.headers.hourlyPay') },
			{ key: 'hoursWorked', label: t('csv.headers.hoursWorked') },
			{ key: 'expectedHours', label: t('csv.headers.expectedHours') },
			{ key: 'normalHours', label: t('csv.headers.normalHours') },
			{ key: 'overtimeDoubleHours', label: t('csv.headers.overtimeDoubleHours') },
			{ key: 'overtimeTripleHours', label: t('csv.headers.overtimeTripleHours') },
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
			{ key: 'warningsCount', label: t('csv.headers.warningsCount') },
			{ key: 'warnings', label: t('csv.headers.warnings') },
		];

		const rows: CsvRow[] = effectiveCalculation.employees.map((row) => {
			const warnings = row.warnings.map((warning) => warning.message).join(' | ');
			return {
				rowType: t('csv.rowTypes.employee'),
				employeeId: row.employeeId,
				employeeName: row.name,
				paymentFrequency: t(`paymentFrequency.${row.paymentFrequency}`),
				periodStart: periodStartDateKey,
				periodEnd: periodEndDateKey,
				dailyPay: row.dailyPay,
				hourlyPay: row.hourlyPay,
				hoursWorked: row.hoursWorked,
				expectedHours: row.expectedHours,
				normalHours: row.normalHours,
				overtimeDoubleHours: row.overtimeDoubleHours,
				overtimeTripleHours: row.overtimeTripleHours,
				sundayPremiumAmount: row.sundayPremiumAmount,
				mandatoryRestDayPremiumAmount: row.mandatoryRestDayPremiumAmount,
				vacationDaysPaid: row.vacationDaysPaid ?? 0,
				vacationPayAmount: row.vacationPayAmount ?? 0,
				vacationPremiumAmount: row.vacationPremiumAmount ?? 0,
				incapacityDays: row.incapacitySummary?.daysIncapacityTotal ?? 0,
				incapacitySubsidy: row.incapacitySummary?.expectedImssSubsidyAmount ?? 0,
				seventhDayPay: row.seventhDayPay ?? 0,
				totalPay: row.totalPay,
				grossPay: row.grossPay ?? row.totalPay,
				employeeWithholdingsTotal: row.employeeWithholdings?.total ?? 0,
				employeeWithholdingsIsr: row.employeeWithholdings?.isrWithheld ?? 0,
				employeeWithholdingsImssTotal: row.employeeWithholdings?.imssEmployee?.total ?? 0,
				employerCostsTotal: row.employerCosts?.total ?? 0,
				employerCostsImssTotal: row.employerCosts?.imssEmployer?.total ?? 0,
				employerCostsImssGuarderias: row.employerCosts?.imssEmployer?.guarderias ?? 0,
				employerCostsSarRetiro: row.employerCosts?.sarRetiro ?? 0,
				employerCostsInfonavit: row.employerCosts?.infonavit ?? 0,
				employerCostsRiskWork: row.employerCosts?.riskWork ?? 0,
				employerCostsIsn: row.employerCosts?.isn ?? 0,
				employerCostsAbsorbedImssEmployeeShare:
					row.employerCosts?.absorbedImssEmployeeShare ?? 0,
				employerCostsAbsorbedIsr: row.employerCosts?.absorbedIsr ?? 0,
				netPay: row.netPay ?? 0,
				companyCost: row.companyCost ?? 0,
				baseSbcDaily: row.bases?.sbcDaily ?? 0,
				baseSbcPeriod: row.bases?.sbcPeriod ?? 0,
				baseIsrBase: row.bases?.isrBase ?? 0,
				baseDaysInPeriod: row.bases?.daysInPeriod ?? 0,
				informationalIsrBeforeSubsidy: row.informationalLines?.isrBeforeSubsidy ?? 0,
				informationalSubsidyApplied: row.informationalLines?.subsidyApplied ?? 0,
				warningsCount: row.warnings.length,
				warnings,
			};
		});

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
				cell: ({ row }) =>
					t('runHistory.periodRange', {
						start: format(new Date(row.original.periodStart), t('dateFormat')),
						end: format(new Date(row.original.periodEnd), t('dateFormat')),
					}),
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
								<Button variant="outline" size="sm">
									{t('runHistory.table.holidayNoticesCount', {
										count: notices.length,
									})}
								</Button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-2xl">
								<DialogHeader>
									<DialogTitle>{t('holidayNotice.title')}</DialogTitle>
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

			<Tabs defaultValue="payroll" className="space-y-4">
				<TabsList>
					<TabsTrigger value="payroll">{t('tabs.payroll')}</TabsTrigger>
					<TabsTrigger value="ptu" disabled={!settings?.ptuEnabled}>
						{t('tabs.ptu')}
					</TabsTrigger>
					<TabsTrigger value="aguinaldo" disabled={!settings?.aguinaldoEnabled}>
						{t('tabs.aguinaldo')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="payroll" className="space-y-6">
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
				<CardContent>
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
							<p className="text-sm font-medium">{t('insights.sections.uma')}</p>
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
							<p className="text-sm font-medium">{t('insights.sections.subsidy')}</p>
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
							<p className="text-sm font-medium">{t('insights.sections.isr')}</p>
							<p className="text-sm text-muted-foreground">
								{t('insights.items.isrTables')}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">{t('insights.sections.cv')}</p>
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
									payrollTimeZone,
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
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!periodStartDate}
									className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
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
						<label className="text-sm font-medium">{t('payPeriod.periodEnd')}</label>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!periodEndDate}
									className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
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
					<div className="flex items-end">
						<Button
							className="w-full"
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
						{hasBlockingWarnings && (
							<p className="mt-2 text-sm text-destructive">
								{t('warnings.blockingOvertime')}
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			{isInvalidPeriodRange && (
				<p className="text-sm text-destructive">{t('payPeriod.invalidRange')}</p>
			)}

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
					) : !effectiveCalculation || effectiveCalculation.employees.length === 0 ? (
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
							<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
								<div className="text-sm text-muted-foreground">
									{t('preview.totalEmployees', {
										count: effectiveCalculation.employees.length,
									})}
								</div>
								<div className="flex items-center gap-3">
									<div className="text-lg font-semibold">
										{t('preview.totalAmount', {
											total: formatCurrency(effectiveCalculation.totalAmount),
										})}
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={onExportCsv}
										disabled={effectiveCalculation.employees.length === 0}
									>
										{t('preview.actions.exportCsv')}
									</Button>
								</div>
							</div>
							<PayrollHolidayNoticeCard notices={effectiveCalculation.holidayNotices} />
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
											<TableHead>{t('preview.table.holidayImpact')}</TableHead>
											<TableHead>{t('preview.table.vacationPay')}</TableHead>
											<TableHead>
												{t('preview.table.vacationPremium')}
											</TableHead>
											<TableHead>
												{t('preview.table.incapacityDays')}
											</TableHead>
											<TableHead>
												{t('preview.table.incapacitySubsidy')}
											</TableHead>
											<TableHead>{t('preview.table.total')}</TableHead>
											<TableHead>{t('preview.table.warnings')}</TableHead>
											<TableHead>{t('preview.table.detail')}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{effectiveCalculation.employees.map((row) => (
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
													{row.holidayImpact &&
													row.holidayImpact.affectedHolidayDateKeys
														.length > 0 ? (
														<Badge variant="outline">
															{t('holidayNotice.employeeBadge', {
																count: row.holidayImpact
																	.affectedHolidayDateKeys.length,
															})}
														</Badge>
													) : (
														<span className="text-muted-foreground">-</span>
													)}
												</TableCell>
												<TableCell>
													{row.vacationPayAmount > 0
														? formatCurrency(row.vacationPayAmount)
														: '-'}
													{row.vacationDaysPaid > 0 && (
														<span className="mt-1 block text-xs text-muted-foreground">
															{t('preview.table.vacationDays', {
																count: row.vacationDaysPaid,
															})}
														</span>
													)}
												</TableCell>
												<TableCell>
													{row.vacationPremiumAmount > 0
														? formatCurrency(row.vacationPremiumAmount)
														: '-'}
												</TableCell>
												<TableCell>
													{row.incapacitySummary?.daysIncapacityTotal
														? row.incapacitySummary.daysIncapacityTotal
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
																		{row.incapacitySummary
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
																		{row.incapacitySummary
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
																					row.bases
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
																					row.bases
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
																					row.bases
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
																					row.bases
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
																			.absorbedIsr > 0 ? (
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
								</Table>
							</div>
							{effectiveCalculation.employees.some(
								(emp) => emp.warnings.length > 0,
							) && (
								<div className="mt-4 rounded-md border bg-muted/50 p-3">
									<p className="text-sm font-medium">{t('compliance.title')}</p>
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
					<DataTable
						columns={runColumns}
						data={payrollRuns}
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
