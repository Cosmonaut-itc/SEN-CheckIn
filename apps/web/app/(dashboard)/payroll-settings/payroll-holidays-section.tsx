'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	CalendarDays,
	CheckCircle2,
	Download,
	FileUp,
	Loader2,
	Pencil,
	RefreshCw,
	ShieldAlert,
	Trash2,
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import type { HolidayCalendarEntry, HolidayKind, HolidaySource, HolidayStatus } from '@sen-checkin/types';
import {
	approvePayrollHolidaySyncRun,
	createPayrollHolidayCustom,
	exportPayrollHolidaysCsv,
	fetchPayrollHolidays,
	fetchPayrollHolidaySyncStatus,
	importPayrollHolidaysCsv,
	rejectPayrollHolidaySyncRun,
	syncPayrollHolidays,
	updatePayrollHoliday,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { queryKeys } from '@/lib/query-keys';

type SelectFilterValue = 'ALL' | HolidaySource | HolidayStatus | HolidayKind;
type SyncDecisionMode = 'approve' | 'reject';

interface CustomHolidayFormState {
	dateKey: string;
	name: string;
	kind: HolidayKind;
	recurrence: 'ONE_TIME' | 'ANNUAL';
	legalReference: string;
}

interface EditHolidayFormState {
	id: string;
	dateKey: string;
	name: string;
	kind: HolidayKind;
	legalReference: string;
	active: boolean;
	reason: string;
}

interface HolidayImportReport {
	appliedRows: number;
	rejectedRows: number;
	errors: Array<{ line: number; reason: string }>;
}

const HOLIDAY_SOURCE_VALUES: HolidaySource[] = ['INTERNAL', 'PROVIDER', 'CUSTOM'];
const HOLIDAY_STATUS_VALUES: HolidayStatus[] = [
	'PENDING_APPROVAL',
	'APPROVED',
	'REJECTED',
	'DEACTIVATED',
];
const HOLIDAY_KIND_VALUES: HolidayKind[] = ['MANDATORY', 'OPTIONAL'];

/**
 * Converts a date key (YYYY-MM-DD) into a Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date value at UTC midnight
 */
function dateFromDateKey(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00.000Z`);
}

/**
 * Converts a date key into a localized short date string.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Formatted date string
 */
function formatDateKey(dateKey: string): string {
	return format(dateFromDateKey(dateKey), 'dd/MM/yyyy', { locale: es });
}

/**
 * Downloads CSV content as a local file.
 *
 * @param fileName - Download file name
 * @param content - CSV content
 * @returns Nothing
 */
function downloadCsvContent(fileName: string, content: string): void {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
}

/**
 * Builds a list of years used by the holiday module tabs.
 *
 * @param baseYear - Current reference year
 * @returns Ordered years for tab navigation
 */
function buildYearTabs(baseYear: number): number[] {
	return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2];
}

/**
 * Returns a style badge variant for a holiday status value.
 *
 * @param status - Holiday status value
 * @returns Badge variant
 */
function getStatusBadgeVariant(status: HolidayStatus): 'secondary' | 'outline' | 'destructive' {
	if (status === 'APPROVED') {
		return 'secondary';
	}
	if (status === 'PENDING_APPROVAL') {
		return 'outline';
	}
	return 'destructive';
}

/**
 * Payroll holidays settings section.
 *
 * @returns React section for holiday sync, filtering, approvals, and CRUD actions
 */
export function PayrollHolidaysSection(): React.ReactElement {
	const t = useTranslations('PayrollSettings');
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const importInputRef = useRef<HTMLInputElement>(null);
	const currentYear = new Date().getFullYear();

	const [selectedYear, setSelectedYear] = useState<number>(currentYear);
	const [sourceFilter, setSourceFilter] = useState<SelectFilterValue>('ALL');
	const [statusFilter, setStatusFilter] = useState<SelectFilterValue>('ALL');
	const [kindFilter, setKindFilter] = useState<SelectFilterValue>('ALL');
	const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
	const [calendarMonth, setCalendarMonth] = useState<Date>(new Date(currentYear, 0, 1));

	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [customForm, setCustomForm] = useState<CustomHolidayFormState>({
		dateKey: '',
		name: '',
		kind: 'MANDATORY',
		recurrence: 'ONE_TIME',
		legalReference: '',
	});

	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editForm, setEditForm] = useState<EditHolidayFormState | null>(null);

	const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
	const [decisionMode, setDecisionMode] = useState<SyncDecisionMode>('approve');
	const [decisionReason, setDecisionReason] = useState('');

	const [importReport, setImportReport] = useState<HolidayImportReport | null>(null);

	const holidayQueryParams = useMemo(
		() => ({
			organizationId: organizationId ?? undefined,
			year: selectedYear,
			source: sourceFilter === 'ALL' ? undefined : (sourceFilter as HolidaySource),
			status: statusFilter === 'ALL' ? undefined : (statusFilter as HolidayStatus),
			kind: kindFilter === 'ALL' ? undefined : (kindFilter as HolidayKind),
		}),
		[kindFilter, organizationId, selectedYear, sourceFilter, statusFilter],
	);

	const holidaysQuery = useQuery({
		queryKey: queryKeys.payrollSettings.holidays(holidayQueryParams),
		queryFn: () => fetchPayrollHolidays(holidayQueryParams),
		enabled: Boolean(organizationId),
	});

	const syncStatusQuery = useQuery({
		queryKey: queryKeys.payrollSettings.holidaySyncStatus(organizationId),
		queryFn: () => fetchPayrollHolidaySyncStatus(organizationId ?? undefined),
		enabled: Boolean(organizationId),
	});

	/**
	 * Invalidates holiday and payroll related query caches.
	 *
	 * @returns Nothing
	 */
	const invalidateHolidayQueries = (): void => {
		queryClient.invalidateQueries({ queryKey: queryKeys.payrollSettings.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
	};

	const syncMutation = useMutation({
		mutationFn: () =>
			syncPayrollHolidays({
				organizationId: organizationId ?? undefined,
				year: selectedYear,
			}),
		onSuccess: (result) => {
			invalidateHolidayQueries();
			toast.success(
				t('holidays.toast.syncSuccess', {
					imported: result.importedCount,
					pending: result.pendingCount,
				}),
			);
		},
		onError: () => {
			toast.error(t('holidays.toast.syncError'));
		},
	});

	const createCustomMutation = useMutation({
		mutationFn: () =>
			createPayrollHolidayCustom({
				organizationId: organizationId ?? undefined,
				dateKey: customForm.dateKey,
				name: customForm.name.trim(),
				kind: customForm.kind,
				recurrence: customForm.recurrence,
				legalReference: customForm.legalReference.trim() || null,
			}),
		onSuccess: () => {
			invalidateHolidayQueries();
			setCreateDialogOpen(false);
			setCustomForm({
				dateKey: '',
				name: '',
				kind: 'MANDATORY',
				recurrence: 'ONE_TIME',
				legalReference: '',
			});
			toast.success(t('holidays.toast.createSuccess'));
		},
		onError: () => {
			toast.error(t('holidays.toast.createError'));
		},
	});

	const editMutation = useMutation({
		mutationFn: () => {
			if (!editForm) {
				throw new Error('Holiday form state is empty.');
			}
			return updatePayrollHoliday(editForm.id, {
				dateKey: editForm.dateKey,
				name: editForm.name.trim(),
				kind: editForm.kind,
				legalReference: editForm.legalReference.trim() || null,
				active: editForm.active,
				reason: editForm.reason.trim(),
			});
		},
		onSuccess: () => {
			invalidateHolidayQueries();
			setEditDialogOpen(false);
			setEditForm(null);
			toast.success(t('holidays.toast.updateSuccess'));
		},
		onError: () => {
			toast.error(t('holidays.toast.updateError'));
		},
	});

	const approveMutation = useMutation({
		mutationFn: (runId: string) =>
			approvePayrollHolidaySyncRun(runId, decisionReason.trim()),
		onSuccess: (result) => {
			invalidateHolidayQueries();
			setDecisionDialogOpen(false);
			setDecisionReason('');
			toast.success(
				t('holidays.toast.approveSuccess', {
					count: result.approvedCount,
				}),
			);
		},
		onError: () => {
			toast.error(t('holidays.toast.approveError'));
		},
	});

	const rejectMutation = useMutation({
		mutationFn: (runId: string) =>
			rejectPayrollHolidaySyncRun(runId, decisionReason.trim()),
		onSuccess: (result) => {
			invalidateHolidayQueries();
			setDecisionDialogOpen(false);
			setDecisionReason('');
			toast.success(
				t('holidays.toast.rejectSuccess', {
					count: result.rejectedCount,
				}),
			);
		},
		onError: () => {
			toast.error(t('holidays.toast.rejectError'));
		},
	});

	const importCsvMutation = useMutation({
		mutationFn: (csvContent: string) =>
			importPayrollHolidaysCsv({
				csvContent,
				organizationId: organizationId ?? undefined,
			}),
		onSuccess: (report) => {
			invalidateHolidayQueries();
			setImportReport(report);
			toast.success(
				t('holidays.toast.importSuccess', {
					applied: report.appliedRows,
					rejected: report.rejectedRows,
				}),
			);
		},
		onError: () => {
			toast.error(t('holidays.toast.importError'));
		},
	});

	const exportCsvMutation = useMutation({
		mutationFn: () =>
			exportPayrollHolidaysCsv({
				organizationId: organizationId ?? undefined,
				year: selectedYear,
				source: sourceFilter === 'ALL' ? undefined : (sourceFilter as HolidaySource),
				status: statusFilter === 'ALL' ? undefined : (statusFilter as HolidayStatus),
				kind: kindFilter === 'ALL' ? undefined : (kindFilter as HolidayKind),
			}),
		onSuccess: (exportResult) => {
			downloadCsvContent(exportResult.fileName, exportResult.csvContent);
			toast.success(
				t('holidays.toast.exportSuccess', {
					count: exportResult.count,
				}),
			);
		},
		onError: () => {
			toast.error(t('holidays.toast.exportError'));
		},
	});

	const entries = useMemo(() => holidaysQuery.data ?? [], [holidaysQuery.data]);
	const syncStatus = syncStatusQuery.data;
	const yearTabs = buildYearTabs(currentYear);
	const pendingRun = syncStatus?.lastRun;
	const pendingCount = syncStatus?.pendingApprovalCount ?? 0;
	const hasPendingApproval = Boolean(pendingRun?.id && pendingCount > 0);

	const calendarEntries = useMemo(() => {
		return entries.filter((entry) => {
			if (!selectedDateKey) {
				return true;
			}
			return entry.dateKey === selectedDateKey;
		});
	}, [entries, selectedDateKey]);

	const mandatoryDates = useMemo(
		() =>
			entries
				.filter((entry) => entry.kind === 'MANDATORY')
				.map((entry) => dateFromDateKey(entry.dateKey)),
		[entries],
	);
	const optionalDates = useMemo(
		() =>
			entries
				.filter((entry) => entry.kind === 'OPTIONAL')
				.map((entry) => dateFromDateKey(entry.dateKey)),
		[entries],
	);
	const pendingDates = useMemo(
		() =>
			entries
				.filter((entry) => entry.status === 'PENDING_APPROVAL')
				.map((entry) => dateFromDateKey(entry.dateKey)),
		[entries],
	);

	/**
	 * Opens the edit dialog with entry defaults.
	 *
	 * @param entry - Holiday entry selected for edit/deactivation
	 * @param forceDeactivate - When true, preselects active=false
	 * @returns Nothing
	 */
	const openEditDialog = (entry: HolidayCalendarEntry, forceDeactivate = false): void => {
		setEditForm({
			id: entry.id,
			dateKey: entry.dateKey,
			name: entry.name,
			kind: entry.kind,
			legalReference: entry.legalReference ?? '',
			active: forceDeactivate ? false : entry.active,
			reason: '',
		});
		setEditDialogOpen(true);
	};

	/**
	 * Validates and submits the custom holiday form.
	 *
	 * @returns Nothing
	 */
	const submitCustomHoliday = (): void => {
		if (!customForm.dateKey) {
			toast.error(t('holidays.validation.dateRequired'));
			return;
		}
		if (!customForm.name.trim()) {
			toast.error(t('holidays.validation.nameRequired'));
			return;
		}
		createCustomMutation.mutate();
	};

	/**
	 * Validates and submits the edit holiday form.
	 *
	 * @returns Nothing
	 */
	const submitEditHoliday = (): void => {
		if (!editForm) {
			return;
		}
		if (!editForm.dateKey) {
			toast.error(t('holidays.validation.dateRequired'));
			return;
		}
		if (!editForm.name.trim()) {
			toast.error(t('holidays.validation.nameRequired'));
			return;
		}
		if (!editForm.reason.trim()) {
			toast.error(t('holidays.validation.reasonRequired'));
			return;
		}
		editMutation.mutate();
	};

	/**
	 * Opens approval/rejection dialog for pending sync entries.
	 *
	 * @param mode - Decision mode
	 * @returns Nothing
	 */
	const openDecisionDialog = (mode: SyncDecisionMode): void => {
		setDecisionMode(mode);
		setDecisionReason('');
		setDecisionDialogOpen(true);
	};

	/**
	 * Submits approval or rejection for the latest pending sync run.
	 *
	 * @returns Nothing
	 */
	const submitSyncDecision = (): void => {
		if (!pendingRun?.id) {
			return;
		}
		if (!decisionReason.trim()) {
			toast.error(t('holidays.validation.reasonRequired'));
			return;
		}
		if (decisionMode === 'approve') {
			approveMutation.mutate(pendingRun.id);
			return;
		}
		rejectMutation.mutate(pendingRun.id);
	};

	/**
	 * Handles CSV file selection and triggers import.
	 *
	 * @param event - File input change event
	 * @returns Nothing
	 */
	const onImportCsvFile = async (
		event: React.ChangeEvent<HTMLInputElement>,
	): Promise<void> => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		event.target.value = '';
		const csvContent = await file.text();
		importCsvMutation.mutate(csvContent);
	};

	return (
		<div className="space-y-4">
			<Card className="border-primary/30">
				<CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-2">
						<CardTitle className="flex items-center gap-2 text-base">
							<CalendarDays className="h-4 w-4" />
							{t('holidays.title')}
						</CardTitle>
						<CardDescription>{t('holidays.description')}</CardDescription>
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<Badge variant={syncStatus?.stale ? 'destructive' : 'secondary'}>
								{syncStatus?.stale
									? t('holidays.syncStatus.badges.stale')
									: t('holidays.syncStatus.badges.updated')}
							</Badge>
							<span>
								{t('holidays.syncStatus.lastRun', {
									value: pendingRun?.startedAt
										? format(pendingRun.startedAt, 'dd/MM/yyyy HH:mm', {
												locale: es,
											})
										: t('holidays.syncStatus.values.never'),
								})}
							</span>
							<span>
								{t('holidays.syncStatus.pendingCount', {
									count: pendingCount,
								})}
							</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={() => exportCsvMutation.mutate()}
							disabled={exportCsvMutation.isPending || holidaysQuery.isLoading}
						>
							{exportCsvMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Download className="mr-2 h-4 w-4" />
							)}
							{t('holidays.actions.exportCsv')}
						</Button>
						<Button
							variant="outline"
							onClick={() => importInputRef.current?.click()}
							disabled={importCsvMutation.isPending}
						>
							{importCsvMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<FileUp className="mr-2 h-4 w-4" />
							)}
							{t('holidays.actions.importCsv')}
						</Button>
						<input
							ref={importInputRef}
							type="file"
							accept=".csv,text/csv"
							className="hidden"
							onChange={onImportCsvFile}
						/>
						<Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
							{syncMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 h-4 w-4" />
							)}
							{t('holidays.actions.syncNow')}
						</Button>
					</div>
				</CardHeader>
				{importReport ? (
					<CardContent className="border-t pt-4">
						<div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm">
							<p className="font-medium">{t('holidays.import.summaryTitle')}</p>
							<p className="text-muted-foreground">
								{t('holidays.import.summary', {
									applied: importReport.appliedRows,
									rejected: importReport.rejectedRows,
								})}
							</p>
							{importReport.errors.length > 0 ? (
								<ul className="mt-2 space-y-1 text-xs text-muted-foreground">
									{importReport.errors.slice(0, 6).map((error) => (
										<li key={`${error.line}-${error.reason}`}>
											{t('holidays.import.errorRow', {
												line: error.line,
												reason: error.reason,
											})}
										</li>
									))}
								</ul>
							) : null}
						</div>
					</CardContent>
				) : null}
			</Card>

			<Card>
				<CardHeader className="gap-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap gap-2">
							{yearTabs.map((year) => (
								<Button
									key={year}
									size="sm"
									variant={selectedYear === year ? 'default' : 'outline'}
									onClick={() => {
										setSelectedYear(year);
										setCalendarMonth(new Date(year, 0, 1));
										setSelectedDateKey(null);
									}}
								>
									{year}
								</Button>
							))}
						</div>
						<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
							<DialogTrigger asChild>
								<Button variant="outline">{t('holidays.actions.newCustom')}</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{t('holidays.createDialog.title')}</DialogTitle>
									<DialogDescription>
										{t('holidays.createDialog.description')}
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-3">
									<div className="space-y-1">
										<Label htmlFor="holiday-date">{t('holidays.fields.date')}</Label>
										<Input
											id="holiday-date"
											type="date"
											value={customForm.dateKey}
											onChange={(event) =>
												setCustomForm((prev) => ({
													...prev,
													dateKey: event.target.value,
												}))
											}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor="holiday-name">{t('holidays.fields.name')}</Label>
										<Input
											id="holiday-name"
											value={customForm.name}
											onChange={(event) =>
												setCustomForm((prev) => ({
													...prev,
													name: event.target.value,
												}))
											}
										/>
									</div>
									<div className="grid gap-3 sm:grid-cols-2">
										<div className="space-y-1">
											<Label>{t('holidays.fields.kind')}</Label>
											<Select
												value={customForm.kind}
												onValueChange={(value) =>
													setCustomForm((prev) => ({
														...prev,
														kind: value as HolidayKind,
													}))
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{HOLIDAY_KIND_VALUES.map((kind) => (
														<SelectItem key={kind} value={kind}>
															{t(`holidays.filters.kindValues.${kind}`)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1">
											<Label>{t('holidays.fields.recurrence')}</Label>
											<Select
												value={customForm.recurrence}
												onValueChange={(value) =>
													setCustomForm((prev) => ({
														...prev,
														recurrence: value as 'ONE_TIME' | 'ANNUAL',
													}))
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="ONE_TIME">
														{t('holidays.recurrence.oneTime')}
													</SelectItem>
													<SelectItem value="ANNUAL">
														{t('holidays.recurrence.annual')}
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="space-y-1">
										<Label htmlFor="holiday-legal">
											{t('holidays.fields.legalReference')}
										</Label>
										<Input
											id="holiday-legal"
											value={customForm.legalReference}
											onChange={(event) =>
												setCustomForm((prev) => ({
													...prev,
													legalReference: event.target.value,
												}))
											}
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										onClick={submitCustomHoliday}
										disabled={createCustomMutation.isPending}
									>
										{createCustomMutation.isPending ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : null}
										{t('holidays.createDialog.submit')}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
					<div className="grid gap-2 sm:grid-cols-3">
						<div className="space-y-1">
							<Label>{t('holidays.filters.source')}</Label>
							<Select
								value={sourceFilter}
								onValueChange={(value) => setSourceFilter(value as SelectFilterValue)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">
										{t('holidays.filters.all')}
									</SelectItem>
									{HOLIDAY_SOURCE_VALUES.map((source) => (
										<SelectItem key={source} value={source}>
											{t(`holidays.filters.sourceValues.${source}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>{t('holidays.filters.status')}</Label>
							<Select
								value={statusFilter}
								onValueChange={(value) => setStatusFilter(value as SelectFilterValue)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">
										{t('holidays.filters.all')}
									</SelectItem>
									{HOLIDAY_STATUS_VALUES.map((status) => (
										<SelectItem key={status} value={status}>
											{t(`holidays.filters.statusValues.${status}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>{t('holidays.filters.kind')}</Label>
							<Select
								value={kindFilter}
								onValueChange={(value) => setKindFilter(value as SelectFilterValue)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">
										{t('holidays.filters.all')}
									</SelectItem>
									{HOLIDAY_KIND_VALUES.map((kind) => (
										<SelectItem key={kind} value={kind}>
											{t(`holidays.filters.kindValues.${kind}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardHeader>
				{hasPendingApproval ? (
					<CardContent className="pt-0">
						<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-start gap-2">
									<ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
									<div className="space-y-1">
										<p className="text-sm font-medium">
											{t('holidays.pending.title', { count: pendingCount })}
										</p>
										<p className="text-xs text-muted-foreground">
											{t('holidays.pending.description')}
										</p>
									</div>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setStatusFilter('PENDING_APPROVAL');
											setSelectedDateKey(null);
										}}
									>
										{t('holidays.actions.reviewPending')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => openDecisionDialog('reject')}
									>
										{t('holidays.actions.rejectPending')}
									</Button>
									<Button
										size="sm"
										onClick={() => openDecisionDialog('approve')}
									>
										<CheckCircle2 className="mr-2 h-4 w-4" />
										{t('holidays.actions.approvePending')}
									</Button>
								</div>
							</div>
						</div>
					</CardContent>
				) : null}
			</Card>

			<div className="grid gap-4 xl:grid-cols-[320px_1fr]">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('holidays.calendar.title')}</CardTitle>
						<CardDescription>{t('holidays.calendar.description')}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Calendar
							mode="single"
							month={calendarMonth}
							onMonthChange={setCalendarMonth}
							selected={selectedDateKey ? dateFromDateKey(selectedDateKey) : undefined}
							onSelect={(date) =>
								setSelectedDateKey(date ? format(date, 'yyyy-MM-dd') : null)
							}
							modifiers={{
								mandatory: mandatoryDates,
								optional: optionalDates,
								pending: pendingDates,
							}}
							modifiersClassNames={{
								mandatory:
									'border border-primary/50 bg-primary/20 text-foreground dark:bg-primary/30',
								optional:
									'border border-amber-500/50 bg-amber-500/20 text-foreground dark:bg-amber-500/30',
								pending:
									'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
							}}
						/>
						<div className="space-y-1 text-xs text-muted-foreground">
							<p>{t('holidays.calendar.legendMandatory')}</p>
							<p>{t('holidays.calendar.legendOptional')}</p>
							<p>{t('holidays.calendar.legendPending')}</p>
						</div>
						{selectedDateKey ? (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setSelectedDateKey(null)}
							>
								{t('holidays.actions.clearDateFilter')}
							</Button>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t('holidays.table.title')}</CardTitle>
						<CardDescription>
							{t('holidays.table.description', { count: calendarEntries.length })}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('holidays.table.headers.date')}</TableHead>
										<TableHead>{t('holidays.table.headers.name')}</TableHead>
										<TableHead>{t('holidays.table.headers.kind')}</TableHead>
										<TableHead>{t('holidays.table.headers.source')}</TableHead>
										<TableHead>{t('holidays.table.headers.status')}</TableHead>
										<TableHead>{t('holidays.table.headers.actions')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{holidaysQuery.isLoading ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className="py-8 text-center text-sm text-muted-foreground"
											>
												<Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
												{t('holidays.table.loading')}
											</TableCell>
										</TableRow>
									) : calendarEntries.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className="py-8 text-center text-sm text-muted-foreground"
											>
												{t('holidays.table.empty')}
											</TableCell>
										</TableRow>
									) : (
										calendarEntries.map((entry) => (
											<TableRow key={entry.id}>
												<TableCell>{formatDateKey(entry.dateKey)}</TableCell>
												<TableCell>
													<div className="space-y-1">
														<p className="font-medium">{entry.name}</p>
														{entry.legalReference ? (
															<p className="text-xs text-muted-foreground">
																{entry.legalReference}
															</p>
														) : null}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{t(`holidays.filters.kindValues.${entry.kind}`)}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{t(`holidays.filters.sourceValues.${entry.source}`)}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant={getStatusBadgeVariant(entry.status)}>
														{t(`holidays.filters.statusValues.${entry.status}`)}
													</Badge>
												</TableCell>
												<TableCell>
													{entry.source === 'INTERNAL' ? (
														<span className="text-xs text-muted-foreground">
															{t('holidays.table.readOnly')}
														</span>
													) : (
														<div className="flex gap-1">
															<Button
																size="icon"
																variant="ghost"
																onClick={() => openEditDialog(entry)}
																aria-label={t('holidays.table.actions.edit')}
															>
																<Pencil className="h-4 w-4" />
															</Button>
															<Button
																size="icon"
																variant="ghost"
																onClick={() =>
																	openEditDialog(entry, true)
																}
																aria-label={t(
																	'holidays.table.actions.deactivate',
																)}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													)}
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			</div>

			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('holidays.editDialog.title')}</DialogTitle>
						<DialogDescription>{t('holidays.editDialog.description')}</DialogDescription>
					</DialogHeader>
					{editForm ? (
						<div className="grid gap-3">
							<div className="space-y-1">
								<Label htmlFor="edit-date">{t('holidays.fields.date')}</Label>
								<Input
									id="edit-date"
									type="date"
									value={editForm.dateKey}
									onChange={(event) =>
										setEditForm((prev) =>
											prev
												? {
														...prev,
														dateKey: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="edit-name">{t('holidays.fields.name')}</Label>
								<Input
									id="edit-name"
									value={editForm.name}
									onChange={(event) =>
										setEditForm((prev) =>
											prev
												? {
														...prev,
														name: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1">
									<Label>{t('holidays.fields.kind')}</Label>
									<Select
										value={editForm.kind}
										onValueChange={(value) =>
											setEditForm((prev) =>
												prev
													? {
															...prev,
															kind: value as HolidayKind,
														}
													: prev,
											)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{HOLIDAY_KIND_VALUES.map((kind) => (
												<SelectItem key={kind} value={kind}>
													{t(`holidays.filters.kindValues.${kind}`)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label>{t('holidays.fields.active')}</Label>
									<Select
										value={editForm.active ? 'true' : 'false'}
										onValueChange={(value) =>
											setEditForm((prev) =>
												prev
													? {
															...prev,
															active: value === 'true',
														}
													: prev,
											)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="true">
												{t('holidays.active.active')}
											</SelectItem>
											<SelectItem value="false">
												{t('holidays.active.inactive')}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							<div className="space-y-1">
								<Label htmlFor="edit-legal">{t('holidays.fields.legalReference')}</Label>
								<Input
									id="edit-legal"
									value={editForm.legalReference}
									onChange={(event) =>
										setEditForm((prev) =>
											prev
												? {
														...prev,
														legalReference: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="edit-reason">{t('holidays.fields.reason')}</Label>
								<Textarea
									id="edit-reason"
									value={editForm.reason}
									onChange={(event) =>
										setEditForm((prev) =>
											prev
												? {
														...prev,
														reason: event.target.value,
													}
												: prev,
										)
									}
									rows={3}
								/>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button onClick={submitEditHoliday} disabled={editMutation.isPending}>
							{editMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{t('holidays.editDialog.submit')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{decisionMode === 'approve'
								? t('holidays.decision.approveTitle')
								: t('holidays.decision.rejectTitle')}
						</DialogTitle>
						<DialogDescription>{t('holidays.decision.description')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1">
						<Label htmlFor="decision-reason">{t('holidays.fields.reason')}</Label>
						<Textarea
							id="decision-reason"
							value={decisionReason}
							onChange={(event) => setDecisionReason(event.target.value)}
							rows={4}
						/>
					</div>
					<DialogFooter>
						<Button
							variant={decisionMode === 'approve' ? 'default' : 'destructive'}
							onClick={submitSyncDecision}
							disabled={approveMutation.isPending || rejectMutation.isPending}
						>
							{approveMutation.isPending || rejectMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{decisionMode === 'approve'
								? t('holidays.actions.approvePending')
								: t('holidays.actions.rejectPending')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
