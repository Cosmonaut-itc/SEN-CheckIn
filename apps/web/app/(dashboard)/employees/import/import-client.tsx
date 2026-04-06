'use client';

import {
	type BulkCreateEmployeesResponse,
	bulkCreateEmployees,
	type ImportedEmployeePreview,
	importDocument,
	undoBulkImport,
} from '@/actions/employee-import';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
	type Employee,
	type JobPosition,
	type Location,
	fetchEmployeesList,
	fetchJobPositionsList,
	fetchLocationsList,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	FileUp,
	Loader2,
	Plus,
	Trash2,
	Undo2,
	Upload,
	XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type PaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
type ImportStep = 'config' | 'processing' | 'preview' | 'confirming' | 'results';
type ImportMutationMode = 'replace' | 'append';

interface PreviewRow extends ImportedEmployeePreview {
	id: string;
	code: string;
	included: boolean;
	isDuplicate: boolean;
	validationErrors: string[];
}

interface ImportMutationPayload {
	files: File[];
	mode: ImportMutationMode;
}

interface ImportMutationResult {
	employees: ImportedEmployeePreview[];
	pagesProcessed: number;
}

interface StepDefinition {
	key: ImportStep;
	label: string;
}

type ImportTranslator = (key: string, values?: Record<string, string | number>) => string;

const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.heic,.heif,.pdf';
const ACCEPTED_MIME_TYPES = new Set<string>([
	'image/jpeg',
	'image/png',
	'image/heic',
	'image/heif',
	'application/pdf',
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Returns a stable identifier for a browser File instance.
 *
 * @param file - File selected by the user
 * @returns Deterministic dedupe key
 */
function buildFileKey(file: File): string {
	return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

/**
 * Builds the default employee code shown in the preview grid.
 *
 * @param serial - Sequential number for the new row
 * @returns Formatted employee code
 */
function buildEmployeeCode(serial: number): string {
	return `EMP-${String(serial).padStart(3, '0')}`;
}

/**
 * Produces a normalized full-name key for duplicate detection.
 *
 * @param firstName - Employee first name
 * @param lastName - Employee last name
 * @returns Lowercased dedupe key
 */
function buildEmployeeNameKey(firstName: string, lastName: string): string {
	return `${firstName.trim().toLowerCase()} ${lastName.trim().toLowerCase()}`.trim();
}

/**
 * Validates a preview row before bulk creation.
 *
 * @param row - Preview row under validation
 * @param t - Import translation accessor
 * @returns Localized validation errors
 */
function validatePreviewRow(
	row: Pick<PreviewRow, 'firstName' | 'lastName' | 'dailyPay' | 'locationId' | 'jobPositionId'>,
	t: ImportTranslator,
): string[] {
	const errors: string[] = [];

	if (!row.firstName.trim()) {
		errors.push(t('validation.requiredFirstName'));
	}

	if (!row.lastName.trim()) {
		errors.push(t('validation.requiredLastName'));
	}

	if (row.dailyPay === null || Number.isNaN(row.dailyPay) || row.dailyPay <= 0) {
		errors.push(t('validation.requiredDailyPay'));
	}

	if (!row.locationId.trim()) {
		errors.push(t('validation.requiredLocation'));
	}

	if (!row.jobPositionId.trim()) {
		errors.push(t('validation.requiredJobPosition'));
	}

	return errors;
}

/**
 * Filters and deduplicates files before they enter the wizard state.
 *
 * @param currentFiles - Current files already tracked by the wizard
 * @param incomingFiles - Files selected or dropped by the user
 * @param t - Import translation accessor
 * @returns Deduplicated valid files
 */
function prepareFilesForImport(
	currentFiles: File[],
	incomingFiles: File[],
	t: ImportTranslator,
): File[] {
	const currentKeys = new Set(currentFiles.map(buildFileKey));
	const validFiles: File[] = [];
	let oversizedCount = 0;
	let invalidTypeCount = 0;
	let duplicateCount = 0;

	for (const file of incomingFiles) {
		if (file.size > MAX_FILE_SIZE_BYTES) {
			oversizedCount += 1;
			continue;
		}

		if (!ACCEPTED_MIME_TYPES.has(file.type)) {
			invalidTypeCount += 1;
			continue;
		}

		const fileKey = buildFileKey(file);
		if (currentKeys.has(fileKey)) {
			duplicateCount += 1;
			continue;
		}

		currentKeys.add(fileKey);
		validFiles.push(file);
	}

	if (oversizedCount > 0) {
		toast.error(t('toast.invalidSize'));
	}

	if (invalidTypeCount > 0) {
		toast.error(t('toast.invalidType'));
	}

	if (duplicateCount > 0) {
		toast.error(t('toast.duplicateFiles'));
	}

	return validFiles;
}

/**
 * Creates preview rows from extracted employee data.
 *
 * @param args - Build arguments
 * @returns Preview rows plus the next suggested code sequence
 */
function buildPreviewRows(args: {
	employees: ImportedEmployeePreview[];
	existingEmployees: Employee[];
	currentRows: PreviewRow[];
	nextCode: number;
	validationT: ImportTranslator;
}): { rows: PreviewRow[]; nextCode: number } {
	const seenNames = new Set<string>([
		...args.existingEmployees.map((employee) =>
			buildEmployeeNameKey(employee.firstName, employee.lastName),
		),
		...args.currentRows.map((row) => buildEmployeeNameKey(row.firstName, row.lastName)),
	]);

	const rows = args.employees.map((employee, index) => {
		const nameKey = buildEmployeeNameKey(employee.firstName, employee.lastName);
		const isDuplicate = seenNames.has(nameKey);

		seenNames.add(nameKey);

		const row: PreviewRow = {
			...employee,
			id: globalThis.crypto.randomUUID(),
			code: buildEmployeeCode(args.nextCode + index),
			included: true,
			isDuplicate,
			validationErrors: [],
		};

		row.validationErrors = validatePreviewRow(row, args.validationT);

		return row;
	});

	return {
		rows,
		nextCode: args.nextCode + args.employees.length,
	};
}

/**
 * Resolves the current preview rows to use for a document import mutation.
 *
 * @param mode - Import behavior for the incoming files
 * @param previewRowsRef - Mutable ref with the latest preview rows
 * @returns Rows that should participate in duplicate detection
 */
export function resolveCurrentPreviewRowsForImport<T>(
	mode: ImportMutationMode,
	previewRowsRef: React.MutableRefObject<T[]>,
): T[] {
	return mode === 'append' ? previewRowsRef.current : [];
}

/**
 * Resolves which files should participate in duplicate detection for a new import.
 *
 * @param args - Current step plus tracked file collections
 * @returns Files already known by the wizard for the active step
 */
export function resolveTrackedFilesForImport(args: {
	step: ImportStep;
	processedFiles: File[];
	selectedFiles: File[];
}): File[] {
	return args.step === 'preview' ? args.processedFiles : args.selectedFiles;
}

/**
 * Employee bulk-import wizard client component.
 *
 * @returns Import flow UI
 */
export function ImportClient(): React.ReactElement {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const tImport = useTranslations('Employees.import');
	const tEmployees = useTranslations('Employees');

	const [step, setStep] = useState<ImportStep>('config');
	const [processingMessage, setProcessingMessage] = useState<string>('');
	const [defaultLocationId, setDefaultLocationId] = useState<string>('');
	const [defaultJobPositionId, setDefaultJobPositionId] = useState<string>('');
	const [defaultPaymentFrequency, setDefaultPaymentFrequency] =
		useState<PaymentFrequency>('MONTHLY');
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [processedFiles, setProcessedFiles] = useState<File[]>([]);
	const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
	const previewRowsRef = useRef<PreviewRow[]>([]);
	const [nextCode, setNextCode] = useState<number>(1);
	const [importResult, setImportResult] = useState<BulkCreateEmployeesResponse | null>(null);

	useEffect(() => {
		previewRowsRef.current = previewRows;
	}, [previewRows]);

	const { data: locationsData, isLoading: isLoadingLocations } = useQuery({
		queryKey: queryKeys.locations.list({
			organizationId: organizationId ?? undefined,
			limit: 100,
			offset: 0,
		}),
		queryFn: () =>
			fetchLocationsList({
				organizationId,
				limit: 100,
				offset: 0,
			}),
	});

	const { data: jobPositionsData, isLoading: isLoadingJobPositions } = useQuery({
		queryKey: queryKeys.jobPositions.list({
			organizationId: organizationId ?? undefined,
			limit: 100,
			offset: 0,
		}),
		queryFn: () =>
			fetchJobPositionsList({
				organizationId: organizationId ?? undefined,
				limit: 100,
				offset: 0,
			}),
	});

	const locations: Location[] = locationsData?.data ?? [];
	const jobPositions: JobPosition[] = jobPositionsData?.data ?? [];
	const canAnalyze =
		selectedFiles.length > 0 &&
		defaultLocationId.length > 0 &&
		defaultJobPositionId.length > 0 &&
		!isLoadingLocations &&
		!isLoadingJobPositions;

	const steps: StepDefinition[] = [
		{ key: 'config', label: tImport('steps.config') },
		{ key: 'processing', label: tImport('steps.processing') },
		{ key: 'preview', label: tImport('steps.preview') },
		{ key: 'results', label: tImport('steps.results') },
	];
	const activeStepIndex =
		step === 'confirming' ? 2 : steps.findIndex((item) => item.key === step);

	const importMutation = useMutation({
		mutationKey: mutationKeys.employees.importDocument,
		mutationFn: async (payload: ImportMutationPayload): Promise<ImportMutationResult> => {
			const employees: ImportedEmployeePreview[] = [];
			let pagesProcessed = 0;

			for (const [index, file] of payload.files.entries()) {
				setProcessingMessage(
					tImport('processing.fileProgress', {
						current: index + 1,
						total: payload.files.length,
						name: file.name,
					}),
				);

				const formData = new FormData();
				formData.append('file', file);
				formData.append('defaultLocationId', defaultLocationId);
				formData.append('defaultJobPositionId', defaultJobPositionId);
				formData.append('defaultPaymentFrequency', defaultPaymentFrequency);

				const result = await importDocument(formData);

				if (!result.success || !result.data) {
					throw new Error(result.error ?? tImport('toast.importError'));
				}

				employees.push(...result.data.employees);
				pagesProcessed += result.data.processingMeta.pagesProcessed;
			}

			return {
				employees,
				pagesProcessed,
			};
		},
		onSuccess: async (result, variables) => {
			const employeeListQuery = {
				organizationId,
				limit: 1000,
				offset: 0,
			};
			const existingEmployees = await queryClient.fetchQuery({
				queryKey: queryKeys.employees.list(employeeListQuery),
				queryFn: () => fetchEmployeesList(employeeListQuery),
			});
			const builtRows = buildPreviewRows({
				employees: result.employees,
				existingEmployees: existingEmployees.data,
				currentRows: resolveCurrentPreviewRowsForImport(variables.mode, previewRowsRef),
				nextCode,
				validationT: tImport,
			});

			setPreviewRows((currentRows) =>
				variables.mode === 'append' ? [...currentRows, ...builtRows.rows] : builtRows.rows,
			);
			setProcessedFiles((currentFiles) =>
				variables.mode === 'append' ? [...currentFiles, ...variables.files] : variables.files,
			);
			setNextCode(builtRows.nextCode);
			setSelectedFiles([]);
			setProcessingMessage('');
			setStep('preview');

			if (variables.mode === 'append') {
				toast.success(
					tImport('toast.appendSuccess', {
						count: builtRows.rows.length,
					}),
				);
			}
		},
		onError: (error, variables) => {
			setProcessingMessage('');
			setStep(variables.mode === 'append' ? 'preview' : 'config');
			toast.error(error.message);
		},
	});

	const bulkCreateMutation = useMutation({
		mutationKey: mutationKeys.employees.bulkCreate,
		mutationFn: async (): Promise<BulkCreateEmployeesResponse> => {
			const response = await bulkCreateEmployees({
				employees: includedRows.map((row) => ({
					code: row.code,
					firstName: row.firstName.trim(),
					lastName: row.lastName.trim(),
					dailyPay: row.dailyPay ?? 0,
					paymentFrequency: row.paymentFrequency,
					jobPositionId: row.jobPositionId,
					locationId: row.locationId,
				})),
			});

			if (!response.success || !response.data) {
				throw new Error(response.error ?? tImport('toast.bulkCreateError'));
			}

			return response.data;
		},
		onSuccess: (response) => {
			setImportResult(response);
			void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			setStep('results');
		},
		onError: (error) => {
			setStep('preview');
			toast.error(error.message);
		},
	});

	const undoMutation = useMutation({
		mutationKey: mutationKeys.employees.undoBulkImport,
		mutationFn: async () => {
			if (!importResult?.batchId) {
				throw new Error(tImport('toast.undoMissingBatch'));
			}

			const response = await undoBulkImport(importResult.batchId);

			if (!response.success || !response.data) {
				throw new Error(response.error ?? tImport('toast.undoError'));
			}

			return response.data;
		},
		onSuccess: async () => {
			toast.success(tImport('toast.undoSuccess'));
			await queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			router.push('/employees');
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const includedRows = previewRows.filter((row) => row.included);
	const hasValidationErrors = includedRows.some((row) => row.validationErrors.length > 0);
	const canConfirm =
		includedRows.length > 0 && !hasValidationErrors && !bulkCreateMutation.isPending;

	/**
	 * Opens the hidden file input.
	 *
	 * @returns Nothing
	 */
	function openFilePicker(): void {
		fileInputRef.current?.click();
	}

	/**
	 * Adds user-selected files into the wizard or processes them in preview mode.
	 *
	 * @param files - Incoming file list from the browser
	 * @returns Nothing
	 */
	function addFiles(files: File[]): void {
		if (files.length === 0) {
			return;
		}

		if (step === 'preview') {
			const validFiles = prepareFilesForImport(
				resolveTrackedFilesForImport({
					step,
					processedFiles,
					selectedFiles,
				}),
				files,
				tImport,
			);

			if (validFiles.length === 0) {
				return;
			}

			setStep('processing');
			importMutation.mutate({
				files: validFiles,
				mode: 'append',
			});
			return;
		}

		setSelectedFiles((currentFiles) => [
			...currentFiles,
			...prepareFilesForImport(
				resolveTrackedFilesForImport({
					step,
					processedFiles,
					selectedFiles: currentFiles,
				}),
				files,
				tImport,
			),
		]);
	}

	/**
	 * Handles file input change events.
	 *
	 * @param event - Browser file input change event
	 * @returns Nothing
	 */
	function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>): void {
		addFiles(Array.from(event.target.files ?? []));

		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	}

	/**
	 * Handles file drop events over the dropzone.
	 *
	 * @param event - Browser drag-and-drop event
	 * @returns Nothing
	 */
	function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
		event.preventDefault();
		addFiles(Array.from(event.dataTransfer.files));
	}

	/**
	 * Removes a file from the pre-analysis queue.
	 *
	 * @param fileKey - Stable file key to remove
	 * @returns Nothing
	 */
	function removeFile(fileKey: string): void {
		setSelectedFiles((currentFiles) =>
			currentFiles.filter((file) => buildFileKey(file) !== fileKey),
		);
	}

	/**
	 * Updates a preview row and re-runs row-level validation.
	 *
	 * @param id - Preview row identifier
	 * @param updates - Partial row changes
	 * @returns Nothing
	 */
	function updateRow(id: string, updates: Partial<PreviewRow>): void {
		setPreviewRows((currentRows) =>
			currentRows.map((row) => {
				if (row.id !== id) {
					return row;
				}

				const nextRow: PreviewRow = {
					...row,
					...updates,
				};

				nextRow.validationErrors = validatePreviewRow(nextRow, tImport);

				return nextRow;
			}),
		);
	}

	/**
	 * Removes a preview row from the import batch.
	 *
	 * @param id - Preview row identifier
	 * @returns Nothing
	 */
	function deleteRow(id: string): void {
		setPreviewRows((currentRows) => currentRows.filter((row) => row.id !== id));
	}

	/**
	 * Starts AI analysis for the current config-step files.
	 *
	 * @returns Nothing
	 */
	function handleAnalyze(): void {
		if (selectedFiles.length === 0) {
			toast.error(tImport('toast.selectFiles'));
			return;
		}

		if (!defaultLocationId || !defaultJobPositionId) {
			toast.error(tImport('toast.selectDefaults'));
			return;
		}

		setImportResult(null);
		setProcessingMessage('');
		setStep('processing');
		importMutation.mutate({
			files: selectedFiles,
			mode: 'replace',
		});
	}

	/**
	 * Submits the reviewed preview rows for bulk creation.
	 *
	 * @returns Nothing
	 */
	function handleConfirm(): void {
		if (includedRows.length === 0) {
			toast.error(tImport('toast.noIncludedRows'));
			return;
		}

		if (hasValidationErrors) {
			toast.error(tImport('toast.validationErrors'));
			return;
		}

		setStep('confirming');
		bulkCreateMutation.mutate();
	}

	return (
		<div className="min-w-0 space-y-6">
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept={ACCEPTED_TYPES}
				className="hidden"
				onChange={handleFileSelect}
			/>

			<div className="space-y-4">
				<Button variant="ghost" className="gap-2" onClick={() => router.push('/employees')}>
					<ArrowLeft className="h-4 w-4" />
					{tImport('back')}
				</Button>

				<div className="rounded-2xl border border-[color:var(--border-subtle)] bg-gradient-to-br from-[var(--accent-primary-bg)] via-background to-[var(--status-info-bg)] p-6 shadow-[var(--shadow-sm)]">
					<div className="space-y-3">
						<Badge variant="accent">{tImport('badge')}</Badge>
						<h1 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-balance">
							{tImport('title')}
						</h1>
						<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
							{tImport('subtitle')}
						</p>
					</div>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{steps.map((item, index) => {
					const isActive = index === activeStepIndex;
					const isCompleted = index < activeStepIndex;

					return (
						<div
							key={item.key}
							className={cn(
								'rounded-xl border px-4 py-3 transition-colors',
								isActive &&
									'border-primary bg-[var(--accent-primary-bg)] text-foreground',
								isCompleted &&
									'border-[color:var(--status-success)]/30 bg-[var(--status-success-bg)]',
								!isActive &&
									!isCompleted &&
									'border-[color:var(--border-subtle)] bg-card',
							)}
						>
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
								{tImport('stepLabel', { index: index + 1 })}
							</p>
							<p className="mt-1 text-sm font-medium">{item.label}</p>
						</div>
					);
				})}
			</div>

			{!organizationId ? (
				<Alert variant="warning">
					<AlertTriangle />
					<AlertTitle>{tEmployees('noOrganization')}</AlertTitle>
				</Alert>
			) : null}

			{step === 'config' ? (
				<Card>
					<CardHeader>
						<CardTitle>{tImport('config.title')}</CardTitle>
						<CardDescription>{tImport('config.description')}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-4 lg:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="employee-import-default-location">
									{tImport('fields.defaultLocation')}
								</Label>
								<Select
									value={defaultLocationId}
									onValueChange={setDefaultLocationId}
								>
									<SelectTrigger
										id="employee-import-default-location"
										aria-label={tImport('fields.defaultLocation')}
										className="w-full"
									>
										<SelectValue
											placeholder={tEmployees('placeholders.selectLocation')}
										/>
									</SelectTrigger>
									<SelectContent>
										{locations.map((location) => (
											<SelectItem key={location.id} value={location.id}>
												{location.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="employee-import-default-job-position">
									{tImport('fields.defaultJobPosition')}
								</Label>
								<Select
									value={defaultJobPositionId}
									onValueChange={setDefaultJobPositionId}
								>
									<SelectTrigger
										id="employee-import-default-job-position"
										aria-label={tImport('fields.defaultJobPosition')}
										className="w-full"
									>
										<SelectValue
											placeholder={tEmployees(
												'placeholders.selectJobPosition',
											)}
										/>
									</SelectTrigger>
									<SelectContent>
										{jobPositions.map((jobPosition) => (
											<SelectItem key={jobPosition.id} value={jobPosition.id}>
												{jobPosition.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="employee-import-default-payment-frequency">
									{tImport('fields.defaultPaymentFrequency')}
								</Label>
								<Select
									value={defaultPaymentFrequency}
									onValueChange={(value) =>
										setDefaultPaymentFrequency(value as PaymentFrequency)
									}
								>
									<SelectTrigger
										id="employee-import-default-payment-frequency"
										aria-label={tImport('fields.defaultPaymentFrequency')}
										className="w-full"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="WEEKLY">
											{tEmployees('paymentFrequency.WEEKLY')}
										</SelectItem>
										<SelectItem value="BIWEEKLY">
											{tEmployees('paymentFrequency.BIWEEKLY')}
										</SelectItem>
										<SelectItem value="MONTHLY">
											{tEmployees('paymentFrequency.MONTHLY')}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div
							role="button"
							tabIndex={0}
							onClick={openFilePicker}
							onKeyDown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									openFilePicker();
								}
							}}
							onDragOver={(event) => event.preventDefault()}
							onDrop={handleDrop}
							className="group rounded-2xl border-2 border-dashed border-[color:var(--border-subtle)] bg-[var(--accent-primary-bg)]/50 p-8 transition-colors hover:border-primary hover:bg-[var(--accent-primary-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
						>
							<div className="mx-auto flex max-w-xl flex-col items-center text-center">
								<div className="mb-4 rounded-full bg-[var(--accent-primary-bg-hover)] p-4 text-primary transition-transform group-hover:-translate-y-0.5">
									<Upload className="h-8 w-8" />
								</div>
								<p className="text-base font-semibold">
									{tImport('dropzone.title')}
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									{tImport('dropzone.description')}
								</p>
								<p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
									{tImport('dropzone.supportedFormats')}
								</p>
							</div>
						</div>

						{selectedFiles.length > 0 ? (
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label>
										{tImport('files.selectedCount', {
											count: selectedFiles.length,
										})}
									</Label>
									<Badge variant="neutral">{tImport('files.maxSize')}</Badge>
								</div>
								<div className="space-y-2">
									{selectedFiles.map((file) => {
										const fileKey = buildFileKey(file);

										return (
											<div
												key={fileKey}
												className="flex items-center justify-between rounded-xl border border-[color:var(--border-subtle)] bg-card px-4 py-3"
											>
												<div className="flex min-w-0 items-center gap-3">
													<div className="rounded-lg bg-[var(--accent-primary-bg)] p-2 text-primary">
														<FileUp className="h-4 w-4" />
													</div>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium">
															{file.name}
														</p>
														<p className="text-xs text-muted-foreground">
															{Math.max(
																1,
																Math.round(file.size / 1024),
															)}{' '}
															KB
														</p>
													</div>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => removeFile(fileKey)}
													aria-label={tImport('files.remove')}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										);
									})}
								</div>
							</div>
						) : null}

						<div className="flex justify-end">
							<Button type="button" onClick={handleAnalyze} disabled={!canAnalyze}>
								{importMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : null}
								{tImport('actions.analyze')}
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}

			{step === 'processing' ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-4 py-18 text-center">
						<div className="rounded-full bg-[var(--accent-primary-bg)] p-4 text-primary">
							<Loader2 className="h-8 w-8 animate-spin" />
						</div>
						<div className="space-y-2">
							<h2 className="font-[var(--font-display)] text-2xl font-semibold">
								{tImport('processing.title')}
							</h2>
							<p className="text-sm text-muted-foreground">
								{processingMessage || tImport('processing.description')}
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			{step === 'preview' ? (
				<Card>
					<CardHeader>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="space-y-2">
								<CardTitle>{tImport('preview.title')}</CardTitle>
								<CardDescription>{tImport('preview.description')}</CardDescription>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="neutral">
									{tImport('preview.detectedCount', {
										count: previewRows.length,
									})}
								</Badge>
								<Button type="button" variant="outline" onClick={openFilePicker}>
									<Plus className="h-4 w-4" />
									{tImport('actions.addFiles')}
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="overflow-hidden rounded-xl border border-[color:var(--border-subtle)]">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{tImport('preview.headers.include')}</TableHead>
										<TableHead>{tEmployees('fields.code')}</TableHead>
										<TableHead>{tEmployees('fields.firstName')}</TableHead>
										<TableHead>{tEmployees('fields.lastName')}</TableHead>
										<TableHead>{tImport('preview.headers.dailyPay')}</TableHead>
										<TableHead>{tEmployees('fields.location')}</TableHead>
										<TableHead>{tEmployees('fields.jobPosition')}</TableHead>
										<TableHead>
											{tEmployees('fields.paymentFrequency')}
										</TableHead>
										<TableHead>{tImport('preview.headers.status')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{previewRows.map((row) => (
										<TableRow
											key={row.id}
											className={cn(
												row.validationErrors.length > 0 &&
													'bg-[var(--status-error-bg)]/45',
												!row.included && 'opacity-60',
											)}
										>
											<TableCell>
												<input
													type="checkbox"
													checked={row.included}
													onChange={(event) =>
														updateRow(row.id, {
															included: event.target.checked,
														})
													}
													aria-label={tImport('preview.toggleInclude')}
													className="h-4 w-4 rounded border-input"
												/>
											</TableCell>
											<TableCell>
												<code className="rounded bg-[var(--accent-primary-bg)] px-2 py-1 text-xs font-medium text-primary">
													{row.code}
												</code>
											</TableCell>
											<TableCell>
												<div className="space-y-2">
													<Input
														value={row.firstName}
														onChange={(event) =>
															updateRow(row.id, {
																firstName: event.target.value,
															})
														}
														className={cn(
															'min-w-[10rem]',
															row.fieldConfidence.firstName <
																LOW_CONFIDENCE_THRESHOLD &&
																'border-[color:var(--status-warning)]',
														)}
													/>
													{row.fieldConfidence.firstName <
													LOW_CONFIDENCE_THRESHOLD ? (
														<Badge variant="warning">
															<AlertTriangle className="h-3 w-3" />
															{tImport('preview.lowConfidence')}
														</Badge>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<div className="space-y-2">
													<Input
														value={row.lastName}
														onChange={(event) =>
															updateRow(row.id, {
																lastName: event.target.value,
															})
														}
														className={cn(
															'min-w-[10rem]',
															row.fieldConfidence.lastName <
																LOW_CONFIDENCE_THRESHOLD &&
																'border-[color:var(--status-warning)]',
														)}
													/>
													{row.fieldConfidence.lastName <
													LOW_CONFIDENCE_THRESHOLD ? (
														<Badge variant="warning">
															<AlertTriangle className="h-3 w-3" />
															{tImport('preview.lowConfidence')}
														</Badge>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<div className="space-y-2">
													<Input
														type="number"
														value={row.dailyPay ?? ''}
														onChange={(event) =>
															updateRow(row.id, {
																dailyPay:
																	event.target.value.length > 0
																		? Number(event.target.value)
																		: null,
															})
														}
														className={cn(
															'w-28',
															row.fieldConfidence.dailyPay <
																LOW_CONFIDENCE_THRESHOLD &&
																'border-[color:var(--status-warning)]',
														)}
														placeholder="0.00"
														min="0"
														step="0.01"
													/>
													{row.fieldConfidence.dailyPay <
													LOW_CONFIDENCE_THRESHOLD ? (
														<Badge variant="warning">
															<AlertTriangle className="h-3 w-3" />
															{tImport('preview.lowConfidence')}
														</Badge>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<Select
													value={row.locationId}
													onValueChange={(value) =>
														updateRow(row.id, { locationId: value })
													}
												>
													<SelectTrigger className="w-[12rem]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{locations.map((location) => (
															<SelectItem
																key={location.id}
																value={location.id}
															>
																{location.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>
											<TableCell>
												<Select
													value={row.jobPositionId}
													onValueChange={(value) =>
														updateRow(row.id, { jobPositionId: value })
													}
												>
													<SelectTrigger className="w-[12rem]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{jobPositions.map((jobPosition) => (
															<SelectItem
																key={jobPosition.id}
																value={jobPosition.id}
															>
																{jobPosition.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>
											<TableCell>
												<Select
													value={row.paymentFrequency}
													onValueChange={(value) =>
														updateRow(row.id, {
															paymentFrequency:
																value as PaymentFrequency,
														})
													}
												>
													<SelectTrigger className="w-[10rem]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="WEEKLY">
															{tEmployees('paymentFrequency.WEEKLY')}
														</SelectItem>
														<SelectItem value="BIWEEKLY">
															{tEmployees(
																'paymentFrequency.BIWEEKLY',
															)}
														</SelectItem>
														<SelectItem value="MONTHLY">
															{tEmployees('paymentFrequency.MONTHLY')}
														</SelectItem>
													</SelectContent>
												</Select>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-2">
													{row.isDuplicate ? (
														<Badge variant="info">
															{tImport('preview.duplicate')}
														</Badge>
													) : null}
													{row.validationErrors.length > 0 ? (
														<Badge variant="error">
															{tImport('preview.errorCount', {
																count: row.validationErrors.length,
															})}
														</Badge>
													) : (
														<Badge variant="success">
															{tImport('preview.ready')}
														</Badge>
													)}
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => deleteRow(row.id)}
														aria-label={tImport('preview.deleteRow')}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						{hasValidationErrors ? (
							<Alert variant="warning">
								<AlertTriangle />
								<AlertTitle>{tImport('preview.validationTitle')}</AlertTitle>
								<AlertDescription>
									{tImport('preview.validationDescription')}
								</AlertDescription>
							</Alert>
						) : null}

						<div className="flex flex-col gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--accent-primary-bg)]/40 p-4 lg:flex-row lg:items-center lg:justify-between">
							<div className="space-y-1 text-sm text-muted-foreground">
								<p>{tImport('preview.summary', { count: includedRows.length })}</p>
								<p>{tImport('preview.warningHelp')}</p>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<Button
									type="button"
									variant="outline"
									onClick={() => router.push('/employees')}
								>
									{tImport('actions.cancel')}
								</Button>
								<Button
									type="button"
									onClick={handleConfirm}
									disabled={!canConfirm}
								>
									{bulkCreateMutation.isPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : null}
									{tImport('actions.confirm', { count: includedRows.length })}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			) : null}

			{step === 'confirming' ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-4 py-18 text-center">
						<div className="rounded-full bg-[var(--accent-primary-bg)] p-4 text-primary">
							<Loader2 className="h-8 w-8 animate-spin" />
						</div>
						<div className="space-y-2">
							<h2 className="font-[var(--font-display)] text-2xl font-semibold">
								{tImport('confirming.title')}
							</h2>
							<p className="text-sm text-muted-foreground">
								{tImport('confirming.description')}
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			{step === 'results' && importResult ? (
				<Card>
					<CardHeader>
						<CardTitle>{tImport('results.title')}</CardTitle>
						<CardDescription>{tImport('results.description')}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{importResult.summary.created > 0 ? (
							<Alert variant="success">
								<CheckCircle2 />
								<AlertTitle>
									{tImport('results.successTitle', {
										count: importResult.summary.created,
									})}
								</AlertTitle>
								<AlertDescription>
									{tImport('results.successDescription')}
								</AlertDescription>
							</Alert>
						) : null}

						{importResult.summary.failed > 0 ? (
							<Alert variant="error">
								<XCircle />
								<AlertTitle>
									{tImport('results.failedTitle', {
										count: importResult.summary.failed,
									})}
								</AlertTitle>
								<AlertDescription>
									<ul className="space-y-1">
										{importResult.results
											.filter((result) => !result.success)
											.map((result) => (
												<li
													key={`${result.index}-${result.error ?? 'unknown'}`}
												>
													{tImport('results.failedRow', {
														row: result.index + 1,
														error:
															result.error ??
															tImport('results.unknownError'),
													})}
												</li>
											))}
									</ul>
								</AlertDescription>
							</Alert>
						) : null}

						<div className="flex flex-wrap items-center gap-3">
							{importResult.summary.created > 0 ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => undoMutation.mutate()}
									disabled={undoMutation.isPending}
									className="text-[var(--status-error)]"
								>
									{undoMutation.isPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Undo2 className="h-4 w-4" />
									)}
									{tImport('actions.undo')}
								</Button>
							) : null}
							<Button type="button" onClick={() => router.push('/employees')}>
								{tImport('actions.goToEmployees')}
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
