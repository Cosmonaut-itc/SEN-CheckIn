'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, RotateCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
	calculatePtu,
	cancelPtuRun,
	createPtuRun,
	fetchPtuRunDetail,
	fetchPtuRuns,
	processPtuRun,
	updatePtuRun,
	type ExtraPaymentWarning,
	type PayrollSettings,
	type PtuCalculationResult,
	type PtuEmployeeOverride,
	type PtuRunEmployee,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { toDateKeyInTimeZone } from '@/lib/time-zone';
import { PtuRunReceiptsDialog } from './ptu-run-receipts-dialog';

type PtuOverrideDraft = {
	daysCounted?: number;
	dailyQuota?: number;
	annualSalaryBase?: number;
	eligibilityOverride?: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
};

type PtuTabProps = {
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
 * Builds a list of PTU overrides from the current draft state.
 *
 * @param overrides - Draft overrides keyed by employee id
 * @returns Array of PTU overrides for API payloads
 */
function buildPtuOverridePayload(
	overrides: Record<string, PtuOverrideDraft>,
): PtuEmployeeOverride[] {
	return Object.entries(overrides)
		.map(([employeeId, override]) => {
			const payload: PtuEmployeeOverride = { employeeId };
			if (override.daysCounted !== undefined) {
				payload.daysCounted = override.daysCounted;
			}
			if (override.dailyQuota !== undefined) {
				payload.dailyQuota = override.dailyQuota;
			}
			if (override.annualSalaryBase !== undefined) {
				payload.annualSalaryBase = override.annualSalaryBase;
			}
			if (override.eligibilityOverride) {
				payload.eligibilityOverride = override.eligibilityOverride;
			}
			return payload;
		})
		.filter(
			(entry) =>
				entry.daysCounted !== undefined ||
				entry.dailyQuota !== undefined ||
				entry.annualSalaryBase !== undefined ||
				entry.eligibilityOverride !== undefined,
		);
}

/**
 * Resolves a display-friendly employee label.
 *
 * @param employee - PTU run employee row
 * @returns Display name string
 */
function resolveEmployeeName(employee: PtuRunEmployee): string {
	const name = employee.employeeName?.trim();
	if (name) {
		return name;
	}
	return employee.employeeId;
}

/**
 * PTU management tab content.
 *
 * @param props - Tab props with payroll settings
 * @returns PTU tab content
 */
export function PtuTab({ settings, isLoading }: PtuTabProps): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Ptu');
	const tCommon = useTranslations('Common');

	const timeZone = settings?.timeZone ?? 'America/Mexico_City';
	const defaultFiscalYear = new Date().getFullYear() - 1;
	const [fiscalYearInput, setFiscalYearInput] = useState<string>(String(defaultFiscalYear));
	const [paymentDateKey, setPaymentDateKey] = useState<string>(() =>
		toDateKeyInTimeZone(new Date(), timeZone),
	);
	const [taxableIncomeInput, setTaxableIncomeInput] = useState<string>('');
	const [ptuPercentageInput, setPtuPercentageInput] = useState<string>('0.10');
	const [includeInactive, setIncludeInactive] = useState(false);
	const [smgDailyOverrideInput, setSmgDailyOverrideInput] = useState<string>('');
	const [calculation, setCalculation] = useState<PtuCalculationResult | null>(null);
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const [overrideDrafts, setOverrideDrafts] = useState<Record<string, PtuOverrideDraft>>({});
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancelReason, setCancelReason] = useState('');
	const [employeeSearch, setEmployeeSearch] = useState<string>('');

	const runsQuery = useQuery({
		queryKey: queryKeys.ptu.runs({ organizationId: organizationId ?? undefined }),
		queryFn: () => fetchPtuRuns({ organizationId: organizationId ?? undefined }),
		enabled: Boolean(organizationId),
	});
	const runs = runsQuery.data ?? [];

	const calculateMutation = useMutation({
		mutationKey: mutationKeys.ptu.calculate,
		mutationFn: calculatePtu,
		onSuccess: (result) => {
			setCalculation(result);
			setActiveRunId(null);
		},
		onError: () => {
			toast.error(t('toast.calculateError'));
		},
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.ptu.create,
		mutationFn: createPtuRun,
		onSuccess: (result) => {
			setCalculation(result);
			setActiveRunId(result.run.id);
			toast.success(t('toast.draftCreated'));
			queryClient.invalidateQueries({ queryKey: queryKeys.ptu.all });
		},
		onError: () => {
			toast.error(t('toast.draftError'));
		},
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.ptu.update,
		mutationFn: ({
			runId,
			payload,
		}: {
			runId: string;
			payload: Parameters<typeof updatePtuRun>[1];
		}) => updatePtuRun(runId, payload),
		onSuccess: (result) => {
			setCalculation(result);
			toast.success(t('toast.draftUpdated'));
			queryClient.invalidateQueries({ queryKey: queryKeys.ptu.all });
		},
		onError: () => {
			toast.error(t('toast.draftError'));
		},
	});

	const processMutation = useMutation({
		mutationKey: mutationKeys.ptu.process,
		mutationFn: processPtuRun,
		onSuccess: () => {
			toast.success(t('toast.processSuccess'));
			setActiveRunId(null);
			setCalculation(null);
			queryClient.invalidateQueries({ queryKey: queryKeys.ptu.all });
		},
		onError: () => {
			toast.error(t('toast.processError'));
		},
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.ptu.cancel,
		mutationFn: ({ runId, reason }: { runId: string; reason: string }) =>
			cancelPtuRun(runId, reason),
		onSuccess: () => {
			toast.success(t('toast.cancelSuccess'));
			setActiveRunId(null);
			setCalculation(null);
			setCancelDialogOpen(false);
			setCancelReason('');
			queryClient.invalidateQueries({ queryKey: queryKeys.ptu.all });
		},
		onError: () => {
			toast.error(t('toast.cancelError'));
		},
	});

	const validationErrors = useMemo(() => {
		const errors: string[] = [];
		const fiscalYear = parseIntegerInput(fiscalYearInput, { min: 2000 });
		if (fiscalYear === null) {
			errors.push(t('validation.fiscalYear'));
		}
		if (!paymentDateKey) {
			errors.push(t('validation.paymentDate'));
		}
		const taxableIncome = parseNumberInput(taxableIncomeInput, { min: 0 });
		if (taxableIncome === null) {
			errors.push(t('validation.taxableIncome'));
		}
		const ptuPercentage = parseNumberInput(ptuPercentageInput, { min: 0, max: 1 });
		if (ptuPercentage === null) {
			errors.push(t('validation.ptuPercentage'));
		}
		const smgOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: 0;
		if (smgDailyOverrideInput && smgOverride === null) {
			errors.push(t('validation.smgOverride'));
		}
		return errors;
	}, [
		fiscalYearInput,
		paymentDateKey,
		ptuPercentageInput,
		smgDailyOverrideInput,
		t,
		taxableIncomeInput,
	]);

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
		return effectiveCalculation.run.taxSummary as {
			netTotal?: number;
			grossTotal?: number;
			withheldTotal?: number;
		} | null;
	}, [effectiveCalculation]);

	const warningSummary: ExtraPaymentWarning[] = effectiveCalculation?.warnings ?? [];

	const overridePayload = useMemo(
		() => buildPtuOverridePayload(overrideDrafts),
		[overrideDrafts],
	);

	const handleCalculate = useCallback(async () => {
		if (validationErrors.length > 0) {
			toast.error(validationErrors[0]);
			return;
		}
		const fiscalYear = parseIntegerInput(fiscalYearInput, { min: 2000 }) ?? defaultFiscalYear;
		const taxableIncome = parseNumberInput(taxableIncomeInput, { min: 0 }) ?? 0;
		const ptuPercentage =
			parseNumberInput(ptuPercentageInput, {
				min: 0,
				max: 1,
			}) ?? 0.1;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await calculateMutation.mutateAsync({
			fiscalYear,
			paymentDateKey,
			taxableIncome,
			ptuPercentage,
			includeInactive,
			smgDailyOverride: smgDailyOverride ?? undefined,
			organizationId: organizationId ?? undefined,
			employeeOverrides: overridePayload,
		});
	}, [
		calculateMutation,
		defaultFiscalYear,
		fiscalYearInput,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		ptuPercentageInput,
		smgDailyOverrideInput,
		taxableIncomeInput,
		validationErrors,
	]);

	const handleCreateDraft = useCallback(async () => {
		if (validationErrors.length > 0) {
			toast.error(validationErrors[0]);
			return;
		}
		if (!settings?.ptuEnabled) {
			toast.error(t('toast.disabled'));
			return;
		}
		if (settings?.ptuIsExempt) {
			toast.error(t('toast.exempt'));
			return;
		}
		const fiscalYear = parseIntegerInput(fiscalYearInput, { min: 2000 }) ?? defaultFiscalYear;
		const taxableIncome = parseNumberInput(taxableIncomeInput, { min: 0 }) ?? 0;
		const ptuPercentage =
			parseNumberInput(ptuPercentageInput, {
				min: 0,
				max: 1,
			}) ?? 0.1;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await createMutation.mutateAsync({
			fiscalYear,
			paymentDateKey,
			taxableIncome,
			ptuPercentage,
			includeInactive,
			smgDailyOverride: smgDailyOverride ?? undefined,
			organizationId: organizationId ?? undefined,
			employeeOverrides: overridePayload,
		});
	}, [
		createMutation,
		defaultFiscalYear,
		fiscalYearInput,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		ptuPercentageInput,
		settings?.ptuEnabled,
		settings?.ptuIsExempt,
		smgDailyOverrideInput,
		t,
		taxableIncomeInput,
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
		const fiscalYear = parseIntegerInput(fiscalYearInput, { min: 2000 }) ?? defaultFiscalYear;
		const taxableIncome = parseNumberInput(taxableIncomeInput, { min: 0 }) ?? 0;
		const ptuPercentage =
			parseNumberInput(ptuPercentageInput, {
				min: 0,
				max: 1,
			}) ?? 0.1;
		const smgDailyOverride = smgDailyOverrideInput
			? parseNumberInput(smgDailyOverrideInput, { min: 0 })
			: undefined;

		await updateMutation.mutateAsync({
			runId: activeRunId,
			payload: {
				fiscalYear,
				paymentDateKey,
				taxableIncome,
				ptuPercentage,
				includeInactive,
				smgDailyOverride: smgDailyOverride ?? undefined,
				organizationId: organizationId ?? undefined,
				employeeOverrides: overridePayload,
			},
		});
	}, [
		activeRunId,
		defaultFiscalYear,
		fiscalYearInput,
		includeInactive,
		organizationId,
		overridePayload,
		paymentDateKey,
		ptuPercentageInput,
		smgDailyOverrideInput,
		taxableIncomeInput,
		updateMutation,
		validationErrors,
	]);

	const handleProcess = useCallback(async () => {
		if (!activeRunId) {
			toast.error(t('toast.noDraft'));
			return;
		}
		if (settings?.ptuIsExempt) {
			toast.error(t('toast.exempt'));
			return;
		}
		await processMutation.mutateAsync(activeRunId);
	}, [activeRunId, processMutation, settings?.ptuIsExempt, t]);

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
			field: keyof Omit<PtuOverrideDraft, 'eligibilityOverride'>,
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
					current.dailyQuota === undefined &&
					current.annualSalaryBase === undefined &&
					current.eligibilityOverride === undefined
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

	const handleEligibilityOverrideChange = useCallback(
		(employeeId: string, value: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE') => {
			setOverrideDrafts((prev) => {
				const next = { ...prev };
				const current = { ...(next[employeeId] ?? {}) };
				if (value === 'DEFAULT') {
					delete current.eligibilityOverride;
				} else {
					current.eligibilityOverride = value;
				}
				if (
					current.daysCounted === undefined &&
					current.dailyQuota === undefined &&
					current.annualSalaryBase === undefined &&
					current.eligibilityOverride === undefined
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
			const detail = await fetchPtuRunDetail(runId);
			if (!detail) {
				toast.error(t('toast.loadDraftError'));
				return;
			}
			setActiveRunId(runId);
			setCalculation({ run: detail.run, employees: detail.employees, warnings: [] });
			setFiscalYearInput(String(detail.run.fiscalYear));
			setPaymentDateKey(format(detail.run.paymentDate, 'yyyy-MM-dd'));
			setTaxableIncomeInput(String(detail.run.taxableIncome));
			setPtuPercentageInput(String(detail.run.ptuPercentage));
			setIncludeInactive(Boolean(detail.run.includeInactive));
			setSmgDailyOverrideInput('');
			setOverrideDrafts({});
		},
		[t],
	);

	if (!settings?.ptuEnabled) {
		return (
			<Card data-tour="payroll-ptu-config">
				<CardHeader>
					<CardTitle>{t('disabled.title')}</CardTitle>
					<CardDescription>{t('disabled.description')}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<Card data-tour="payroll-ptu-config">
				<CardHeader>
					<CardTitle>{t('config.title')}</CardTitle>
					<CardDescription>{t('config.description')}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-fiscal-year">{t('config.fields.fiscalYear')}</Label>
						<Input
							id="ptu-fiscal-year"
							type="number"
							min={2000}
							value={fiscalYearInput}
							onChange={(event) => setFiscalYearInput(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-payment-date">{t('config.fields.paymentDate')}</Label>
						<Input
							id="ptu-payment-date"
							type="date"
							value={paymentDateKey}
							onChange={(event) => setPaymentDateKey(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-taxable-income">
							{t('config.fields.taxableIncome')}
						</Label>
						<Input
							id="ptu-taxable-income"
							type="number"
							min={0}
							step="0.01"
							value={taxableIncomeInput}
							onChange={(event) => setTaxableIncomeInput(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-percentage">{t('config.fields.ptuPercentage')}</Label>
						<Input
							id="ptu-percentage"
							type="number"
							min={0}
							max={1}
							step="0.01"
							value={ptuPercentageInput}
							onChange={(event) => setPtuPercentageInput(event.target.value)}
							disabled={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-include-inactive">
							{t('config.fields.includeInactive')}
						</Label>
						<div className="flex items-center gap-2">
							<input
								id="ptu-include-inactive"
								type="checkbox"
								checked={includeInactive}
								onChange={(event) => setIncludeInactive(event.target.checked)}
								className="h-4 w-4 accent-primary"
							/>
							<span className="text-sm text-muted-foreground">
								{includeInactive
									? t('config.labels.include')
									: t('config.labels.exclude')}
							</span>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ptu-smg-override">
							{t('config.fields.smgDailyOverride')}
						</Label>
						<Input
							id="ptu-smg-override"
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
				{settings?.ptuIsExempt ? (
					<CardContent className="pt-0">
						<div className="flex items-start gap-3 rounded-md border border-[color:var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-3 text-sm text-[color:var(--status-warning)]">
							<ShieldAlert className="mt-0.5 h-4 w-4" />
							<div>
								<p className="font-medium">{t('exempt.title')}</p>
								<p className="text-xs">{t('exempt.description')}</p>
							</div>
						</div>
					</CardContent>
				) : null}
			</Card>

			<div className="flex flex-wrap items-center gap-3" data-tour="payroll-ptu-actions">
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
					disabled={!activeRunId || processMutation.isPending || settings?.ptuIsExempt}
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
							<Label htmlFor="ptu-cancel-reason">{t('cancel.reason')}</Label>
							<Input
								id="ptu-cancel-reason"
								value={cancelReason}
								onChange={(event) => setCancelReason(event.target.value)}
								placeholder={t('cancel.placeholder')}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
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

			<Card data-tour="payroll-ptu-summary">
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

			<Card data-tour="payroll-ptu-table">
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
								id="ptu-employee-search"
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
											<TableHead>{t('table.headers.eligibility')}</TableHead>
											<TableHead>{t('table.headers.days')}</TableHead>
											<TableHead>{t('table.headers.dailyQuota')}</TableHead>
											<TableHead>{t('table.headers.annualBase')}</TableHead>
											<TableHead>{t('table.headers.ptuFinal')}</TableHead>
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
														<Select
															value={
																override?.eligibilityOverride ??
																'DEFAULT'
															}
															onValueChange={(value) =>
																handleEligibilityOverrideChange(
																	employee.employeeId,
																	value as
																		| 'DEFAULT'
																		| 'INCLUDE'
																		| 'EXCLUDE',
																)
															}
														>
															<SelectTrigger className="h-8 w-32">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="DEFAULT">
																	{t('table.eligibility.default')}
																</SelectItem>
																<SelectItem value="INCLUDE">
																	{t('table.eligibility.include')}
																</SelectItem>
																<SelectItem value="EXCLUDE">
																	{t('table.eligibility.exclude')}
																</SelectItem>
															</SelectContent>
														</Select>
													</TableCell>
													<TableCell>
														<Input
															type="number"
															min={0}
															className="h-8 w-24"
															value={
																override?.daysCounted ??
																employee.daysCounted
															}
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
																override?.dailyQuota ??
																employee.dailyQuota
															}
															onChange={(event) =>
																handleOverrideChange(
																	employee.employeeId,
																	'dailyQuota',
																	event.target.value,
																	employee.dailyQuota,
																)
															}
														/>
													</TableCell>
													<TableCell>
														<Input
															type="number"
															min={0}
															step="0.01"
															className="h-8 w-32"
															value={
																override?.annualSalaryBase ??
																employee.annualSalaryBase
															}
															onChange={(event) =>
																handleOverrideChange(
																	employee.employeeId,
																	'annualSalaryBase',
																	event.target.value,
																	employee.annualSalaryBase,
																)
															}
														/>
													</TableCell>
													<TableCell className="tabular-nums">
														{formatCurrency(
															Number(employee.ptuFinal ?? 0),
														)}
													</TableCell>
													<TableCell className="tabular-nums">
														{formatCurrency(
															Number(employee.netAmount ?? 0),
														)}
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

			<Card data-tour="payroll-ptu-history">
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
										const csvUrl = `/api/ptu/runs/${run.id}/csv`;
										return (
											<TableRow
												key={run.id}
												data-testid={`ptu-run-row-${run.id}`}
											>
												<TableCell>{run.fiscalYear}</TableCell>
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
															<a
																href={csvUrl}
																data-testid={`ptu-run-csv-${run.id}`}
															>
																{t('history.actions.csv')}
															</a>
														</Button>
														{run.status === 'PROCESSED' ? (
															<PtuRunReceiptsDialog run={run} />
														) : (
															<Badge
																variant="outline"
																className="text-xs text-muted-foreground"
															>
																{t(
																	'history.actions.receiptsUnavailable',
																)}
															</Badge>
														)}
														{run.status === 'DRAFT' ? (
															<Button
																variant="ghost"
																size="sm"
																onClick={() =>
																	void handleLoadDraft(run.id)
																}
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
