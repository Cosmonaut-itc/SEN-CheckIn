'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchPayrollRunDetail, type PayrollRun, type PayrollRunEmployee } from '@/lib/client-functions';
import { queryKeys } from '@/lib/query-keys';

/**
 * Props for the payroll receipts dialog.
 */
type PayrollRunReceiptsDialogProps = {
	/** Payroll run metadata. */
	run: PayrollRun;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
});

/**
 * Formats a numeric value as Mexican Peso currency (MXN).
 *
 * @param value - Amount in MXN
 * @returns Formatted currency string
 */
function formatCurrency(value: number): string {
	return CURRENCY_FORMATTER.format(value);
}

/**
 * Resolves the net pay displayed for a payroll employee.
 *
 * @param employee - Payroll run employee row
 * @returns Net pay value
 */
function resolveEmployeeNetPay(employee: PayrollRunEmployee): number {
	return Number(employee.taxBreakdown?.netPay ?? employee.totalPay ?? 0);
}

/**
 * Payroll receipts dialog for a processed run.
 *
 * @param props - Dialog props
 * @returns Dialog element with receipt downloads
 */
export function PayrollRunReceiptsDialog({ run }: PayrollRunReceiptsDialogProps): React.ReactElement {
	const t = useTranslations('Payroll');
	const tCommon = useTranslations('Common');
	const [open, setOpen] = useState(false);

	const runDetailQuery = useQuery({
		queryKey: queryKeys.payroll.runDetail(run.id),
		queryFn: () => fetchPayrollRunDetail(run.id),
		enabled: open,
	});

	const employees = runDetailQuery.data?.employees ?? [];
	const isLoading = runDetailQuery.isLoading || runDetailQuery.isFetching;
	const periodLabel = useMemo(
		() =>
			t('runHistory.periodRange', {
				start: format(new Date(run.periodStart), t('dateFormat')),
				end: format(new Date(run.periodEnd), t('dateFormat')),
			}),
		[run.periodEnd, run.periodStart, t],
	);
	const processedAtLabel = run.processedAt
		? format(new Date(run.processedAt), t('dateFormat'))
		: tCommon('notAvailable');
	const downloadAllUrl = `/api/payroll/receipts/run/${run.id}/all`;
	const canDownloadAll = employees.length > 0 && !isLoading;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					{t('receipts.trigger')}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl overscroll-contain">
				<DialogHeader>
					<DialogTitle>{t('receipts.title')}</DialogTitle>
					<DialogDescription>{t('receipts.description')}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-lg border bg-muted/30 p-4">
						<div className="flex flex-wrap items-center justify-between gap-4">
							<div>
								<p className="text-sm font-medium">{periodLabel}</p>
								<p className="text-xs text-muted-foreground">
									{t('receipts.summary.processedAt', {
										date: processedAtLabel,
									})}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-4">
								<div className="text-right">
									<p className="text-xs text-muted-foreground">
										{t('receipts.summary.employeesLabel')}
									</p>
								<p className="text-sm font-semibold tabular-nums">
									{t('receipts.summary.employees', { count: employees.length })}
								</p>
							</div>
							<div className="text-right">
								<p className="text-xs text-muted-foreground">
									{t('receipts.summary.total')}
								</p>
								<p className="text-sm font-semibold tabular-nums">
									{formatCurrency(Number(run.totalAmount ?? 0))}
								</p>
							</div>
								{canDownloadAll ? (
									<Button asChild size="sm">
										<a href={downloadAllUrl}>{t('receipts.actions.downloadAll')}</a>
									</Button>
								) : (
									<Button size="sm" disabled>
										{t('receipts.actions.downloadAll')}
									</Button>
								)}
							</div>
						</div>
					</div>

					<div className="rounded-md border">
						<div className="max-h-[360px] overflow-y-auto">
							<Table>
							<TableHeader className="sticky top-0 z-10 bg-background">
								<TableRow>
									<TableHead>{t('receipts.table.employee')}</TableHead>
									<TableHead>{t('receipts.table.code')}</TableHead>
									<TableHead className="text-right">
										{t('receipts.table.netPay')}
									</TableHead>
									<TableHead className="text-right">
										{t('receipts.table.actions')}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									Array.from({ length: 3 }).map((_, index) => (
										<TableRow key={`receipt-skeleton-${index}`}>
											<TableCell>
												<Skeleton className="h-4 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-20" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-20" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-8 w-28" />
											</TableCell>
										</TableRow>
									))
								) : employees.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4} className="h-20 text-center">
											{t('receipts.empty')}
										</TableCell>
									</TableRow>
								) : (
									employees.map((employee) => {
										const netPay = resolveEmployeeNetPay(employee);
										const pdfUrl = `/api/payroll/receipts/run/${run.id}/employee/${employee.employeeId}`;
										const employeeName =
											employee.employeeName || tCommon('notAvailable');
										return (
											<TableRow key={employee.id}>
												<TableCell
													className="max-w-[240px] truncate font-medium"
													title={employee.employeeName ?? undefined}
												>
													{employeeName}
												</TableCell>
												<TableCell>
													{employee.employeeCode || tCommon('notAvailable')}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatCurrency(netPay)}
												</TableCell>
												<TableCell className="text-right">
													<Button variant="outline" size="sm" asChild>
														<a href={pdfUrl}>{t('receipts.actions.downloadOne')}</a>
													</Button>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
							</Table>
						</div>
					</div>
					{run.status !== 'PROCESSED' && (
						<Badge variant="outline" className="text-xs text-muted-foreground">
							{t('receipts.unavailable')}
						</Badge>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
