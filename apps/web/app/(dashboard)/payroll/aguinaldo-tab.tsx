'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, RotateCw, Save, Trash2 } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
	calculateAguinaldo,
	cancelAguinaldoRun,
	createAguinaldoRun,
	fetchAguinaldoRunDetail,
	fetchAguinaldoRuns,
	processAguinaldoRun,
	updateAguinaldoRun,
	type AguinaldoCalculationResult,
	type AguinaldoEmployeeOverride,
	type AguinaldoRunEmployee,
	type ExtraPaymentWarning,
	type PayrollSettings,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { toDateKeyInTimeZone } from '@/lib/time-zone';
import { AguinaldoRunReceiptsDialog } from './aguinaldo-run-receipts-dialog';

type AguinaldoOverrideDraft = {
	daysCounted?: number;
	dailySalaryBase?: number;
	aguinaldoDaysPolicy?: number;
};

type AguinaldoTabProps = {
	settings: PayrollSettings | null;
	isLoading: boolean;
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
 * Parses a numeric text input into a number with optional bounds.
 *
 * @param value - Input string value
 * @param options - Validation options
 * @returns Parsed number or null when invalid
 */
function parseNumberInput(
	value: string,
	options: { min?: number; max?: number } = {},
): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	if (options.min !== undefined && parsed < options.min) {
		return null;
	}
	if (options.max !== undefined && parsed > options.max) {
		return null;
	}
	return parsed;
}

/**
 * Parses an integer input and validates bounds.
 *
 * @param value - Input string value
 * @param options - Validation options
 * @returns Parsed integer or null when invalid
 */
function parseIntegerInput(
	value: string,
	options: { min?: number; max?: number } = {},
): number | null {
	const parsed = parseNumberInput(value, options);
	if (parsed === null || !Number.isInteger(parsed)) {
		return null;
	}
	return parsed;
}

/**
 * Builds a list of aguinaldo overrides from the current draft state.
 *
 * @param overrides - Draft overrides keyed by employee id
 * @returns Array of aguinaldo overrides for API payloads
 */
function buildAguinaldoOverridePayload(
	overrides: Record<string, AguinaldoOverrideDraft>,
): AguinaldoEmployeeOverride[] {
	return Object.entries(overrides)
		.map(([employeeId, override]) => {
			const payload: AguinaldoEmployeeOverride = { employeeId };
			if (override.daysCounted !== undefined) {
				payload.daysCounted = override.daysCounted;
			}
			if (override.dailySalaryBase !== undefined) {
				payload.dailySalaryBase = override.dailySalaryBase;
			}
			if (override.aguinaldoDaysPolicy !== undefined) {
				payload.aguinaldoDaysPolicy = override.aguinaldoDaysPolicy;
			}
			return payload;
		})
		.filter(
			(entry) =>
				entry.daysCounted !== undefined ||
				entry.dailySalaryBase !== undefined ||
				entry.aguinaldoDaysPolicy !== undefined,
		);
}

/**
 * Resolves a display-friendly employee label.
 *
 * @param employee - Aguinaldo run employee row
 * @returns Display name string
 */
function resolveEmployeeName(employee: AguinaldoRunEmployee): string {
	const name = employee.employeeName?.trim();
	if (name) {
		return name;
	}
	return employee.employeeId;
}

/**
 * Aguinaldo management tab content.
 *
 * @param props - Tab props with payroll settings
 * @returns Aguinaldo tab content
 */
export function AguinaldoTab({ settings, isLoading }: AguinaldoTabProps): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Aguinaldo');
	const tCommon = useTranslations('Common');

	const timeZone = settings?.timeZone ?? 'America/Mexico_City';
	const defaultCalendarYear = new Date().getFullYear();
	const [calendarYearInput, setCalendarYearInput] = useState<string>(
		String(defaultCalendarYear),
	);
	const [paymentDateKey, setPaymentDateKey] = useState<string>(() =>
		toDateKeyInTimeZone(new Date(), timeZone),
	);
	const [includeInactive, setIncludeInactive] = useState(false);
	const [smgDailyOverrideInput, setSmgDailyOverrideInput] = useState<string>('');
	const [calculation, setCalculation] = useState<AguinaldoCalculationResult | null>(null);
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const [overrideDrafts, setOverrideDrafts] = useState<Record<string, AguinaldoOverrideDraft>>(
		{},
	);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancelReason, setCancelReason] = useState('');
	const [employeeSearch, setEmployeeSearch] = useState<string>('');

	const runsQuery = useQuery({
		queryKey: queryKeys.aguinaldo.runs({ organizationId: organizationId ?? undefined }),
		queryFn: () => fetchAguinaldoRuns({ organizationId: organizationId ?? undefined }),
		enabled: Boolean(organizationId),
	});
	const runs = runsQuery.data ?? [];

	const calculateMutation = useMutation({
		mutationKey: mutationKeys.aguinaldo.calculate,
		mutationFn: calculateAguinaldo,
		onSuccess: (result) => {
			setCalculation(result);
			setActiveRunId(null);
		},
		onError: () => {
			toast.error(t('toast.calculateError'));
		},
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.aguinaldo.create,
		mutationFn: createAguinaldoRun,
		onSuccess: (result) => {
			setCalculation(result);
			setActiveRunId(result.run.id);
			toast.success(t('toast.draftCreated'));
			queryClient.invalidateQueries({ queryKey: queryKeys.aguinaldo.all });
		},
		onError: () => {
			toast.error(t('toast.draftError'));
		},
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.aguinaldo.update,
		mutationFn: ({
			runId,
			payload,
		}: {
			runId: string;
			payload: Parameters<typeof updateAguinaldoRun>[1];
		}) => updateAguinaldoRun(runId, payload),
		onSuccess: (result) => {
			setCalculation(result);
			toast.success(t('toast.draftUpdated'));
			queryClient.invalidateQueries({ queryKey: queryKeys.aguinaldo.all });
		},
		onError: () => {
			toast.error(t('toast.draftError'));
		},
	});

	const processMutation = useMutation({
		mutationKey: mutationKeys.aguinaldo.process,
		mutationFn: processAguinaldoRun,
		onSuccess: () => {
			toast.success(t('toast.processSuccess'));
			setActiveRunId(null);
			setCalculation(null);
			queryClient.invalidateQueries({ queryKey: queryKeys.aguinaldo.all });
		},
		onError: () => {
			toast.error(t('toast.processError'));
		},
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.aguinaldo.cancel,
		mutationFn: ({ runId, reason }: { runId: string; reason: string }) =>
			cancelAguinaldoRun(runId, reason),
		onSuccess: () => {
			toast.success(t('toast.cancelSuccess'));
			setActiveRunId(null);
			setCalculation(null);
			setCancelDialogOpen(false);
			setCancelReason('');
			queryClient.invalidateQueries({ queryKey: queryKeys.aguinaldo.all });
		},
		onError: () => {
			toast.error(t('toast.cancelError'));
		},
	});

	const validationErrors = useMemo(() => {
		const errors: string[] = [];
		const calendarYear = parseIntegerInput(calendarYearInput, { min: 2000 });
		if (calendarYear === null) {
			errors.push(t('validation.calendarYear'));
		}
		if (!paymentDateKey) {
			errors.push(t('validation.paymentDate'));
		}
		const smgOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: 0;
		if (smgDailyOverrideInput && smgOverride === null) {
			errors.push(t('validation.smgOverride'));
		}
		return errors;
	}, [calendarYearInput, paymentDateKey, smgDailyOverrideInput, t]);

	const effectiveCalculation = calculation;
	const effectiveRun = effectiveCalculation?.run ?? null;
	const employeeRows = useMemo(
		() => effectiveCalculation?.employees ?? [],
		[effectiveCalculation],
	);
	const filteredEmployeeRows = useMemo(() => {
		const searchTerm = employeeSearch.trim().toLowerCase();
		if (!searchTerm) {
			return employeeRows;
		}
		return employeeRows.filter((employee) =>
			resolveEmployeeName(employee).toLowerCase().includes(searchTerm),
		);
	}, [employeeRows, employeeSearch]);

	const totals = useMemo(() => {
		if (!effectiveCalculation) {
			return null;
		}
		return effectiveCalculation.run.taxSummary as
			| { netTotal?: number; grossTotal?: number; withheldTotal?: number }
			| null;
	}, [effectiveCalculation]);

	const warningSummary: ExtraPaymentWarning[] = effectiveCalculation?.warnings ?? [];

	const overridePayload = useMemo(
		() => buildAguinaldoOverridePayload(overrideDrafts),
		[overrideDrafts],
	);

	const handleCalculate = useCallback(async () => {
		if (validationErrors.length > 0) {
			toast.error(validationErrors[0]);
			return;
		}
		const calendarYear =
			parseIntegerInput(calendarYearInput, { min: 2000 }) ?? defaultCalendarYear;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await calculateMutation.mutateAsync({
			calendarYear,
			paymentDateKey,
			includeInactive,
			smgDailyOverride: smgDailyOverride ?? undefined,
			organizationId: organizationId ?? undefined,
			employeeOverrides: overridePayload,
		});
	}, [
		calculateMutation,
		calendarYearInput,
		defaultCalendarYear,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		smgDailyOverrideInput,
		validationErrors,
	]);

	const handleCreateDraft = useCallback(async () => {
		if (validationErrors.length > 0) {
			toast.error(validationErrors[0]);
			return;
		}
		if (!settings?.aguinaldoEnabled) {
			toast.error(t('toast.disabled'));
			return;
		}
		const calendarYear =
			parseIntegerInput(calendarYearInput, { min: 2000 }) ?? defaultCalendarYear;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await createMutation.mutateAsync({
			calendarYear,
			paymentDateKey,
			includeInactive,
			smgDailyOverride: smgDailyOverride ?? undefined,
			organizationId: organizationId ?? undefined,
			employeeOverrides: overridePayload,
		});
	}, [
		calendarYearInput,
		createMutation,
		defaultCalendarYear,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		settings?.aguinaldoEnabled,
		smgDailyOverrideInput,
		t,
		validationErrors,
	]);

	const handleUpdateDraft = useCallback(async () => {
		if (!activeRunId) {
			return;
		}
		if (validationErrors.length > 0) {
			toast.error(validationErrors[0]);
			return;
		}
		const calendarYear =
			parseIntegerInput(calendarYearInput, { min: 2000 }) ?? defaultCalendarYear;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await updateMutation.mutateAsync({
			runId: activeRunId,
			payload: {
				calendarYear,
				paymentDateKey,
				includeInactive,
				smgDailyOverride: smgDailyOverride ?? undefined,
				organizationId: organizationId ?? undefined,
				employeeOverrides: overridePayload,
			},
		});
	}, [
		activeRunId,
		calendarYearInput,
		defaultCalendarYear,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		smgDailyOverrideInput,
		updateMutation,
		validationErrors,
	]);

	const handleProcess = useCallback(async () => {
		if (!activeRunId) {
			toast.error(t('toast.noDraft'));
			return;
		}
		await processMutation.mutateAsync(activeRunId);
	}, [activeRunId, processMutation, t]);

	const handleCancel = useCallback(async () => {
		if (!activeRunId) {
			return;
		}
		const trimmedReason = cancelReason.trim();
		if (!trimmedReason) {
			toast.error(t('validation.cancelReason'));
			return;
		}
		await cancelMutation.mutateAsync({ runId: activeRunId, reason: trimmedReason });
	}, [activeRunId, cancelMutation, cancelReason, t]);

	const handleOverrideChange = useCallback(
		(
			employeeId: string,
			field: keyof AguinaldoOverrideDraft,
			value: string,
			baseValue: number,
		) => {
			const parsed = value.trim() === '' ? null : Number(value);
			setOverrideDrafts((prev) => {
				const next = { ...prev };
				const current = { ...(next[employeeId] ?? {}) };
				if (parsed === null || Number.isNaN(parsed) || parsed === baseValue) {
					delete current[field];
				} else {
					current[field] = parsed;
				}
				if (
					current.daysCounted === undefined &&
					current.dailySalaryBase === undefined &&
					current.aguinaldoDaysPolicy === undefined
				) {
					delete next[employeeId];
				} else {
					next[employeeId] = current;
				}
				return next;
			});
		},
		[],
	);

	const handleLoadDraft = useCallback(
		async (runId: string) => {
			const detail = await fetchAguinaldoRunDetail(runId);
			if (!detail) {
				toast.error(t('toast.loadDraftError'));
				return;
			}
			setActiveRunId(runId);
			setCalculation({ run: detail.run, employees: detail.employees, warnings: [] });
			setCalendarYearInput(String(detail.run.calendarYear));
			setPaymentDateKey(format(detail.run.paymentDate, 'yyyy-MM-dd'));
			setIncludeInactive(Boolean(detail.run.includeInactive));
			setSmgDailyOverrideInput('');
			setOverrideDrafts({});
		},
		[t],
	);

	if (!settings?.aguinaldoEnabled) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t('disabled.title')}</CardTitle>
					<CardDescription>{t('disabled.description')}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{t('config.title')}</CardTitle>
					<CardDescription>{t('config.description')}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="aguinaldo-year">{t('config.fields.calendarYear')}</Label>
						<Input
							id="aguinaldo-year"
							type="number"
							min={2000}
							value={calendarYearInput}
							onChange={(event) => setCalendarYearInput(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="aguinaldo-payment-date">
							{t('config.fields.paymentDate')}
						</Label>
						<Input
							id="aguinaldo-payment-date"
							type="date"
							value={paymentDateKey}
							onChange={(event) => setPaymentDateKey(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="aguinaldo-include-inactive">
							{t('config.fields.includeInactive')}
						</Label>
						<div className="flex items-center gap-2">
							<input
								id="aguinaldo-include-inactive"
								type="checkbox"
								checked={includeInactive}
								onChange={(event) => setIncludeInactive(event.target.checked)}
								className="h-4 w-4 accent-primary"
							/>
							<span className="text-sm text-muted-foreground">
								{includeInactive ? t('config.labels.include') : t('config.labels.exclude')}
							</span>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="aguinaldo-smg-override">
							{t('config.fields.smgDailyOverride')}
						</Label>
						<Input
							id="aguinaldo-smg-override"
							type="number"
							min={0}
							step="0.01"
							placeholder={t('config.placeholders.smgDailyOverride')}
							value={smgDailyOverrideInput}
							onChange={(event) => setSmgDailyOverrideInput(event.target.value)}
							disabled={isLoading}
						/>
					</div>
				</CardContent>
			</Card>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="outline"
					onClick={handleCalculate}
					disabled={calculateMutation.isPending || validationErrors.length > 0}
				>
					{calculateMutation.isPending ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							{t('actions.calculating')}
						</>
					) : (
						<>
							<RotateCw className="mr-2 h-4 w-4" />
							{t('actions.calculate')}
						</>
					)}
				</Button>
				<Button
					onClick={activeRunId ? handleUpdateDraft : handleCreateDraft}
					disabled={
						createMutation.isPending ||
						updateMutation.isPending ||
						validationErrors.length > 0
					}
				>
					{activeRunId ? (
						<>
							<Save className="mr-2 h-4 w-4" />
							{t('actions.updateDraft')}
						</>
					) : (
						<>
							<Save className="mr-2 h-4 w-4" />
							{t('actions.saveDraft')}
						</>
					)}
				</Button>
				<Button
					variant="default"
					onClick={handleProcess}
					disabled={!activeRunId || processMutation.isPending}
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
				<Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
					<DialogTrigger asChild>
						<Button
							variant="outline"
							disabled={!activeRunId}
							className="text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							{t('actions.cancel')}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('cancel.title')}</DialogTitle>
							<DialogDescription>{t('cancel.description')}</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="aguinaldo-cancel-reason">{t('cancel.reason')}</Label>
							<Input
								id="aguinaldo-cancel-reason"
								value={cancelReason}
								onChange={(event) => setCancelReason(event.target.value)}
								placeholder={t('cancel.placeholder')}
							/>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setCancelDialogOpen(false)}
							>
								{tCommon('cancel')}
							</Button>
							<Button
								variant="destructive"
								onClick={handleCancel}
								disabled={cancelMutation.isPending}
							>
								{t('actions.confirmCancel')}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('summary.title')}</CardTitle>
					<CardDescription>{t('summary.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					{!effectiveRun ? (
						<p className="text-sm text-muted-foreground">{t('summary.empty')}</p>
					) : (
						<div className="grid gap-4 md:grid-cols-3">
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.status')}
								</p>
								<Badge variant="outline" className="mt-1">
									{t(`status.${effectiveRun.status}`)}
								</Badge>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.employees')}
								</p>
								<p className="text-lg font-semibold tabular-nums">
									{effectiveRun.employeeCount}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.netTotal')}
								</p>
								<p className="text-lg font-semibold tabular-nums">
									{formatCurrency(Number(effectiveRun.totalAmount ?? 0))}
								</p>
							</div>
						</div>
					)}
					{totals ? (
						<div className="mt-4 grid gap-4 md:grid-cols-3">
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.grossTotal')}
								</p>
								<p className="text-lg font-semibold tabular-nums">
									{formatCurrency(Number(totals.grossTotal ?? 0))}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.withheldTotal')}
								</p>
								<p className="text-lg font-semibold tabular-nums">
									{formatCurrency(Number(totals.withheldTotal ?? 0))}
								</p>
							</div>
							<div className="rounded-md border p-3">
								<p className="text-xs text-muted-foreground">
									{t('summary.items.netTotal')}
								</p>
								<p className="text-lg font-semibold tabular-nums">
									{formatCurrency(Number(totals.netTotal ?? 0))}
								</p>
							</div>
						</div>
					) : null}
					{warningSummary.length > 0 ? (
						<div className="mt-4 space-y-2">
							<p className="text-sm font-medium">{t('summary.warningsTitle')}</p>
							<ul className="space-y-1 text-sm text-[color:var(--status-warning)]">
								{warningSummary.map((warning) => (
									<li key={`${warning.type}-${warning.message}`}>
										{warning.message}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('table.title')}</CardTitle>
					<CardDescription>{t('table.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					{calculateMutation.isPending ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t('actions.calculating')}
						</div>
					) : employeeRows.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t('table.empty')}</p>
					) : filteredEmployeeRows.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t('table.emptySearch')}</p>
					) : (
						<div className="space-y-3">
							<Input
								id="aguinaldo-employee-search"
								value={employeeSearch}
								onChange={(event) => setEmployeeSearch(event.target.value)}
								placeholder={t('table.searchPlaceholder')}
								className="max-w-sm"
							/>
							<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('table.headers.employee')}</TableHead>
										<TableHead>{t('table.headers.days')}</TableHead>
										<TableHead>{t('table.headers.dailySalary')}</TableHead>
										<TableHead>{t('table.headers.policyDays')}</TableHead>
										<TableHead>{t('table.headers.gross')}</TableHead>
										<TableHead>{t('table.headers.net')}</TableHead>
										<TableHead>{t('table.headers.warnings')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredEmployeeRows.map((employee) => {
										const override = overrideDrafts[employee.employeeId];
										const warningCount = employee.warnings?.length ?? 0;
										return (
											<TableRow key={employee.id ?? employee.employeeId}>
												<TableCell className="font-medium">
													{resolveEmployeeName(employee)}
												</TableCell>
												<TableCell>
													<Input
														type="number"
														min={0}
														className="h-8 w-24"
														value={override?.daysCounted ?? employee.daysCounted}
														onChange={(event) =>
															handleOverrideChange(
																employee.employeeId,
																'daysCounted',
																event.target.value,
																employee.daysCounted,
															)
														}
													/>
												</TableCell>
												<TableCell>
													<Input
														type="number"
														min={0}
														step="0.01"
														className="h-8 w-28"
														value={
															override?.dailySalaryBase ??
															employee.dailySalaryBase
														}
														onChange={(event) =>
															handleOverrideChange(
																employee.employeeId,
																'dailySalaryBase',
																event.target.value,
																employee.dailySalaryBase,
															)
														}
													/>
												</TableCell>
												<TableCell>
													<Input
														type="number"
														min={0}
														step="1"
														className="h-8 w-20"
														value={
															override?.aguinaldoDaysPolicy ??
															employee.aguinaldoDaysPolicy
														}
														onChange={(event) =>
															handleOverrideChange(
																employee.employeeId,
																'aguinaldoDaysPolicy',
																event.target.value,
																employee.aguinaldoDaysPolicy,
															)
														}
													/>
												</TableCell>
												<TableCell className="tabular-nums">
													{formatCurrency(Number(employee.grossAmount ?? 0))}
												</TableCell>
												<TableCell className="tabular-nums">
													{formatCurrency(Number(employee.netAmount ?? 0))}
												</TableCell>
												<TableCell>
													{warningCount === 0 ? (
														<span className="text-xs text-muted-foreground">
															0
														</span>
													) : (
														<Badge
															variant="outline"
															className="text-xs text-[color:var(--status-warning)]"
														>
															{t('table.warningsCount', {
																count: warningCount,
															})}
														</Badge>
													)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('history.title')}</CardTitle>
					<CardDescription>{t('history.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					{runs.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t('history.empty')}</p>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('history.headers.year')}</TableHead>
										<TableHead>{t('history.headers.status')}</TableHead>
										<TableHead>{t('history.headers.paymentDate')}</TableHead>
										<TableHead>{t('history.headers.total')}</TableHead>
										<TableHead className="text-right">
											{t('history.headers.actions')}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{runs.map((run) => {
										const paymentDateLabel = format(
											new Date(run.paymentDate),
											t('dateFormat'),
										);
										const csvUrl = `/api/aguinaldo/runs/${run.id}/csv`;
										return (
											<TableRow key={run.id}>
												<TableCell>{run.calendarYear}</TableCell>
												<TableCell>
													<Badge variant="outline">
														{t(`status.${run.status}`)}
													</Badge>
												</TableCell>
												<TableCell>{paymentDateLabel}</TableCell>
												<TableCell className="tabular-nums">
													{formatCurrency(Number(run.totalAmount ?? 0))}
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-2">
														<Button asChild variant="outline" size="sm">
															<a href={csvUrl}>
																{t('history.actions.csv')}
															</a>
														</Button>
														{run.status === 'PROCESSED' ? (
															<AguinaldoRunReceiptsDialog run={run} />
														) : (
															<Badge
																variant="outline"
																className="text-xs text-muted-foreground"
															>
																{t('history.actions.receiptsUnavailable')}
															</Badge>
														)}
														{run.status === 'DRAFT' ? (
															<Button
																variant="ghost"
																size="sm"
																onClick={() => void handleLoadDraft(run.id)}
															>
																{t('history.actions.edit')}
															</Button>
														) : null}
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
