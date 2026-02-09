'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';
import {
	AlertTriangle,
	CheckCircle2,
	Clock3,
	FileWarning,
	Loader2,
	Paperclip,
	ShieldAlert,
	Upload,
	User,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type {
	DisciplinaryMeasureStatus,
	DisciplinaryOutcome,
	DisciplinarySignatureStatus,
} from '@sen-checkin/types';

import {
	closeDisciplinaryMeasureAction,
	confirmDisciplinaryAttachmentAction,
	confirmDisciplinaryRefusalAction,
	confirmDisciplinarySignedActaAction,
	createDisciplinaryMeasureAction,
	deleteDisciplinaryAttachmentAction,
	generateDisciplinaryActaAction,
	generateDisciplinaryRefusalAction,
	presignDisciplinaryAttachmentAction,
	presignDisciplinaryRefusalAction,
	presignDisciplinarySignedActaAction,
} from '@/actions/disciplinary-measures';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import {
	fetchDisciplinaryDocumentUrl,
	fetchDisciplinaryKpis,
	fetchDisciplinaryMeasureById,
	fetchDisciplinaryMeasures,
	fetchEmployeesList,
	type DisciplinaryMeasureDetailRecord,
	type DisciplinaryMeasureRecord,
	type Employee,
} from '@/lib/client-functions';
import { formatShortDateUtc } from '@/lib/date-format';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';

const ALLOWED_UPLOAD_TYPES = new Set<string>(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const STATUS_OPTIONS: DisciplinaryMeasureStatus[] = ['DRAFT', 'GENERATED', 'CLOSED'];
const OUTCOME_OPTIONS: DisciplinaryOutcome[] = [
	'no_action',
	'warning',
	'suspension',
	'termination_process',
];
const SIGNATURE_STATUS_OPTIONS: DisciplinarySignatureStatus[] = [
	'signed_physical',
	'refused_to_sign',
];

/**
 * Props for the disciplinary measures manager.
 */
export interface DisciplinaryMeasuresManagerProps {
	/** Optional fixed employee identifier for embedded usage in employee detail tabs. */
	employeeId?: string;
	/** Whether the component is rendered in embedded mode (employee tab). */
	embedded?: boolean;
}

interface CreateMeasureFormState {
	employeeId: string;
	incidentDateKey: string;
	reason: string;
	policyReference: string;
	outcome: DisciplinaryOutcome;
	suspensionStartDateKey: string;
	suspensionEndDateKey: string;
}

/**
 * Creates the default create-measure form state.
 *
 * @param employeeId - Optional fixed employee identifier
 * @returns Initial form state
 */
function createDefaultCreateFormState(employeeId?: string): CreateMeasureFormState {
	return {
		employeeId: employeeId ?? '',
		incidentDateKey: new Date().toISOString().slice(0, 10),
		reason: '',
		policyReference: '',
		outcome: 'warning',
		suspensionStartDateKey: '',
		suspensionEndDateKey: '',
	};
}

/**
 * Converts a File payload into SHA-256 hash.
 *
 * @param file - File payload to hash
 * @returns Hex hash value
 */
async function computeFileSha256(file: File): Promise<string> {
	const buffer = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Uploads a file to a presigned POST endpoint.
 *
 * @param args - Upload target and file payload
 * @returns Nothing
 * @throws Error when upload fails
 */
async function uploadToPresignedPost(args: {
	url: string;
	fields: Record<string, string>;
	file: File;
}): Promise<void> {
	const formData = new FormData();
	Object.entries(args.fields).forEach(([key, value]) => {
		formData.append(key, value);
	});
	formData.append('file', args.file);

	const response = await fetch(args.url, {
		method: 'POST',
		body: formData,
	});

	if (response.type !== 'opaque' && !response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}
}

/**
 * Validates disciplinary upload payload constraints.
 *
 * @param file - File payload
 * @returns True when the file respects size and MIME constraints
 */
function isValidUploadFile(file: File | null): file is File {
	if (!file) {
		return false;
	}
	if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
		return false;
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return false;
	}
	return true;
}

/**
 * Resolves the status badge variant for disciplinary measures.
 *
 * @param status - Disciplinary measure status
 * @returns Badge variant token
 */
function resolveStatusBadgeVariant(
	status: DisciplinaryMeasureStatus,
): 'default' | 'secondary' | 'outline' {
	switch (status) {
		case 'CLOSED':
			return 'default';
		case 'GENERATED':
			return 'secondary';
		case 'DRAFT':
		default:
			return 'outline';
	}
}

/**
 * Resolves the outcome badge variant for disciplinary measures.
 *
 * @param outcome - Outcome value
 * @returns Badge variant token
 */
function resolveOutcomeBadgeVariant(
	outcome: DisciplinaryOutcome,
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (outcome === 'termination_process') {
		return 'destructive';
	}
	if (outcome === 'suspension') {
		return 'secondary';
	}
	if (outcome === 'warning') {
		return 'outline';
	}
	return 'default';
}

/**
 * Disciplinary measures manager used in both dashboard and employee tabs.
 *
 * @param props - Manager props
 * @returns Manager JSX
 */
export function DisciplinaryMeasuresManager({
	employeeId,
	embedded = false,
}: DisciplinaryMeasuresManagerProps): React.ReactElement {
	const t = useTranslations('DisciplinaryMeasures');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const { organizationRole } = useOrgContext();
	const searchParams = useSearchParams();

	const canManage = organizationRole === 'owner' || organizationRole === 'admin';
	const employeeFilterFromUrl = searchParams.get('employeeId') ?? '';

	const [search, setSearch] = useState<string>('');
	const [statusFilter, setStatusFilter] = useState<DisciplinaryMeasureStatus | 'all'>('all');
	const [outcomeFilter, setOutcomeFilter] = useState<DisciplinaryOutcome | 'all'>('all');
	const [fromDateKey, setFromDateKey] = useState<string>('');
	const [toDateKey, setToDateKey] = useState<string>('');
	const [employeeFilter, setEmployeeFilter] = useState<string>(
		employeeId ?? employeeFilterFromUrl,
	);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: embedded ? 10 : 20,
	});
	const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
	const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
	const [createForm, setCreateForm] = useState<CreateMeasureFormState>(
		createDefaultCreateFormState(employeeId),
	);
	const [signedActaFile, setSignedActaFile] = useState<File | null>(null);
	const [signedRefusalFile, setSignedRefusalFile] = useState<File | null>(null);
	const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
	const [closeSignatureStatus, setCloseSignatureStatus] = useState<DisciplinarySignatureStatus>(
		'signed_physical',
	);
	const [closeNotes, setCloseNotes] = useState<string>('');

	const measuresQueryParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			employeeId: employeeId ?? (employeeFilter || undefined),
			search: search.trim() || undefined,
			fromDateKey: fromDateKey || undefined,
			toDateKey: toDateKey || undefined,
			status: statusFilter === 'all' ? undefined : statusFilter,
			outcome: outcomeFilter === 'all' ? undefined : outcomeFilter,
		}),
		[
			employeeFilter,
			employeeId,
			fromDateKey,
			outcomeFilter,
			pagination.pageIndex,
			pagination.pageSize,
			search,
			statusFilter,
			toDateKey,
		],
	);

	const { data: measuresResponse, isFetching: isMeasuresLoading } = useQuery({
		queryKey: queryKeys.disciplinaryMeasures.list(measuresQueryParams),
		queryFn: () => fetchDisciplinaryMeasures(measuresQueryParams),
		enabled: canManage,
	});

	const { data: kpis } = useQuery({
		queryKey: queryKeys.disciplinaryMeasures.kpis({
			fromDateKey: fromDateKey || undefined,
			toDateKey: toDateKey || undefined,
		}),
		queryFn: () =>
			fetchDisciplinaryKpis({
				fromDateKey: fromDateKey || undefined,
				toDateKey: toDateKey || undefined,
			}),
		enabled: canManage && !embedded,
	});

	const { data: employeesResponse } = useQuery({
		queryKey: queryKeys.employees.list({
			limit: 200,
			offset: 0,
		}),
		queryFn: () =>
			fetchEmployeesList({
				limit: 200,
				offset: 0,
			}),
		enabled: canManage && !employeeId,
	});

	const { data: selectedMeasure, isFetching: isDetailLoading } = useQuery({
		queryKey: queryKeys.disciplinaryMeasures.detail(selectedMeasureId ?? ''),
		queryFn: () => fetchDisciplinaryMeasureById(selectedMeasureId ?? ''),
		enabled: Boolean(selectedMeasureId),
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.disciplinaryMeasures.create,
		mutationFn: createDisciplinaryMeasureAction,
	});

	const generateActaMutation = useMutation({
		mutationKey: mutationKeys.disciplinaryMeasures.generateActa,
		mutationFn: generateDisciplinaryActaAction,
	});

	const generateRefusalMutation = useMutation({
		mutationKey: mutationKeys.disciplinaryMeasures.generateRefusal,
		mutationFn: generateDisciplinaryRefusalAction,
	});

	const closeMutation = useMutation({
		mutationKey: mutationKeys.disciplinaryMeasures.close,
		mutationFn: closeDisciplinaryMeasureAction,
	});

	const employees = useMemo<Employee[]>(() => employeesResponse?.data ?? [], [employeesResponse]);
	const measures = useMemo<DisciplinaryMeasureRecord[]>(
		() => measuresResponse?.data ?? [],
		[measuresResponse],
	);

	/**
	 * Invalidates disciplinary query caches after successful mutation.
	 *
	 * @returns Nothing
	 */
	const invalidateDisciplinaryQueries = useCallback(async (): Promise<void> => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.disciplinaryMeasures.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.employees.all }),
		]);
	}, [queryClient]);

	/**
	 * Resets create form to its default values.
	 *
	 * @returns Nothing
	 */
	const resetCreateForm = useCallback((): void => {
		setCreateForm(createDefaultCreateFormState(employeeId));
	}, [employeeId]);

	/**
	 * Handles disciplinary measure creation from dialog form.
	 *
	 * @returns Nothing
	 */
	const handleCreateMeasure = useCallback(async (): Promise<void> => {
		if (!createForm.employeeId.trim()) {
			toast.error(t('toast.validation.employeeRequired'));
			return;
		}
		if (!createForm.incidentDateKey.trim()) {
			toast.error(t('toast.validation.incidentDateRequired'));
			return;
		}
		if (!createForm.reason.trim()) {
			toast.error(t('toast.validation.reasonRequired'));
			return;
		}
		if (
			createForm.outcome === 'suspension' &&
			(!createForm.suspensionStartDateKey || !createForm.suspensionEndDateKey)
		) {
			toast.error(t('toast.validation.suspensionRangeRequired'));
			return;
		}

		const result = await createMutation.mutateAsync({
			employeeId: createForm.employeeId,
			incidentDateKey: createForm.incidentDateKey,
			reason: createForm.reason.trim(),
			policyReference: createForm.policyReference.trim() || undefined,
			outcome: createForm.outcome,
			suspensionStartDateKey:
				createForm.outcome === 'suspension'
					? createForm.suspensionStartDateKey || undefined
					: undefined,
			suspensionEndDateKey:
				createForm.outcome === 'suspension'
					? createForm.suspensionEndDateKey || undefined
					: undefined,
		});

		if (!result.success) {
			toast.error(result.error ?? t('toast.createError'));
			return;
		}

		toast.success(t('toast.createSuccess'));
		setIsCreateOpen(false);
		resetCreateForm();
		await invalidateDisciplinaryQueries();
	}, [createForm, createMutation, invalidateDisciplinaryQueries, resetCreateForm, t]);

	/**
	 * Opens a disciplinary document in a new browser tab.
	 *
	 * @param measureId - Parent measure identifier
	 * @param documentVersionId - Document version identifier
	 * @returns Nothing
	 */
	const handleOpenDocument = useCallback(
		async (measureId: string, documentVersionId: string): Promise<void> => {
			try {
				const url = await fetchDisciplinaryDocumentUrl({ measureId, documentVersionId });
				if (!url) {
					toast.error(t('toast.documentUrlError'));
					return;
				}
				window.open(url, '_blank', 'noopener,noreferrer');
			} catch (error) {
				console.error('Failed to open disciplinary document:', error);
				toast.error(t('toast.documentUrlError'));
			}
		},
		[t],
	);

	/**
	 * Uploads and confirms signed acta file for the selected measure.
	 *
	 * @returns Nothing
	 */
	const handleUploadSignedActa = useCallback(async (): Promise<void> => {
		const measure = selectedMeasure;
		if (!measure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		if (!isValidUploadFile(signedActaFile)) {
			toast.error(t('toast.validation.invalidFile'));
			return;
		}
		if (!measure.generatedActaGenerationId) {
			toast.error(t('toast.validation.actaGenerationRequired'));
			return;
		}

		const file = signedActaFile;
		const presignResult = await presignDisciplinarySignedActaAction({
			id: measure.id,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
		});
		if (!presignResult.success || !presignResult.data) {
			toast.error(presignResult.error ?? t('toast.uploadSignedActaError'));
			return;
		}

		await uploadToPresignedPost({
			url: presignResult.data.url,
			fields: presignResult.data.fields,
			file,
		});

		const confirmResult = await confirmDisciplinarySignedActaAction({
			id: measure.id,
			docVersionId: presignResult.data.docVersionId,
			generationId: measure.generatedActaGenerationId,
			objectKey: presignResult.data.objectKey,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
			sha256: await computeFileSha256(file),
			signedAtDateKey: new Date().toISOString().slice(0, 10),
		});
		if (!confirmResult.success) {
			toast.error(confirmResult.error ?? t('toast.uploadSignedActaError'));
			return;
		}

		setSignedActaFile(null);
		toast.success(t('toast.uploadSignedActaSuccess'));
		await invalidateDisciplinaryQueries();
	}, [invalidateDisciplinaryQueries, selectedMeasure, signedActaFile, t]);

	/**
	 * Uploads and confirms refusal certificate file for the selected measure.
	 *
	 * @returns Nothing
	 */
	const handleUploadRefusal = useCallback(async (): Promise<void> => {
		const measure = selectedMeasure;
		if (!measure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		if (!isValidUploadFile(signedRefusalFile)) {
			toast.error(t('toast.validation.invalidFile'));
			return;
		}
		if (!measure.generatedRefusalGenerationId) {
			toast.error(t('toast.validation.refusalGenerationRequired'));
			return;
		}

		const file = signedRefusalFile;
		const presignResult = await presignDisciplinaryRefusalAction({
			id: measure.id,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
		});
		if (!presignResult.success || !presignResult.data) {
			toast.error(presignResult.error ?? t('toast.uploadRefusalError'));
			return;
		}

		await uploadToPresignedPost({
			url: presignResult.data.url,
			fields: presignResult.data.fields,
			file,
		});

		const confirmResult = await confirmDisciplinaryRefusalAction({
			id: measure.id,
			docVersionId: presignResult.data.docVersionId,
			generationId: measure.generatedRefusalGenerationId,
			objectKey: presignResult.data.objectKey,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
			sha256: await computeFileSha256(file),
			signedAtDateKey: new Date().toISOString().slice(0, 10),
		});
		if (!confirmResult.success) {
			toast.error(confirmResult.error ?? t('toast.uploadRefusalError'));
			return;
		}

		setSignedRefusalFile(null);
		toast.success(t('toast.uploadRefusalSuccess'));
		await invalidateDisciplinaryQueries();
	}, [invalidateDisciplinaryQueries, selectedMeasure, signedRefusalFile, t]);

	/**
	 * Uploads and confirms an evidence attachment for the selected measure.
	 *
	 * @returns Nothing
	 */
	const handleUploadAttachment = useCallback(async (): Promise<void> => {
		const measure = selectedMeasure;
		if (!measure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		if (!isValidUploadFile(attachmentFile)) {
			toast.error(t('toast.validation.invalidFile'));
			return;
		}

		const file = attachmentFile;
		const presignResult = await presignDisciplinaryAttachmentAction({
			id: measure.id,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
		});
		if (!presignResult.success || !presignResult.data) {
			toast.error(presignResult.error ?? t('toast.uploadAttachmentError'));
			return;
		}

		await uploadToPresignedPost({
			url: presignResult.data.url,
			fields: presignResult.data.fields,
			file,
		});

		const confirmResult = await confirmDisciplinaryAttachmentAction({
			id: measure.id,
			attachmentId: presignResult.data.attachmentId,
			objectKey: presignResult.data.objectKey,
			fileName: file.name,
			contentType: file.type,
			sizeBytes: file.size,
			sha256: await computeFileSha256(file),
		});
		if (!confirmResult.success) {
			toast.error(confirmResult.error ?? t('toast.uploadAttachmentError'));
			return;
		}

		setAttachmentFile(null);
		toast.success(t('toast.uploadAttachmentSuccess'));
		await invalidateDisciplinaryQueries();
	}, [attachmentFile, invalidateDisciplinaryQueries, selectedMeasure, t]);

	/**
	 * Deletes an attachment from the selected measure.
	 *
	 * @param attachmentId - Attachment identifier
	 * @returns Nothing
	 */
	const handleDeleteAttachment = useCallback(
		async (attachmentId: string): Promise<void> => {
			if (!selectedMeasure) {
				toast.error(t('toast.selectMeasureFirst'));
				return;
			}

			const result = await deleteDisciplinaryAttachmentAction({
				id: selectedMeasure.id,
				attachmentId,
			});
			if (!result.success) {
				toast.error(result.error ?? t('toast.deleteAttachmentError'));
				return;
			}

			toast.success(t('toast.deleteAttachmentSuccess'));
			await invalidateDisciplinaryQueries();
		},
		[invalidateDisciplinaryQueries, selectedMeasure, t],
	);

	/**
	 * Generates acta for the selected measure.
	 *
	 * @returns Nothing
	 */
	const handleGenerateActa = useCallback(async (): Promise<void> => {
		if (!selectedMeasure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		const result = await generateActaMutation.mutateAsync({ id: selectedMeasure.id });
		if (!result.success) {
			toast.error(result.error ?? t('toast.generateActaError'));
			return;
		}

		toast.success(t('toast.generateActaSuccess'));
		await invalidateDisciplinaryQueries();
	}, [generateActaMutation, invalidateDisciplinaryQueries, selectedMeasure, t]);

	/**
	 * Generates refusal certificate for the selected measure.
	 *
	 * @returns Nothing
	 */
	const handleGenerateRefusal = useCallback(async (): Promise<void> => {
		if (!selectedMeasure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		const result = await generateRefusalMutation.mutateAsync({ id: selectedMeasure.id });
		if (!result.success) {
			toast.error(result.error ?? t('toast.generateRefusalError'));
			return;
		}

		toast.success(t('toast.generateRefusalSuccess'));
		await invalidateDisciplinaryQueries();
	}, [generateRefusalMutation, invalidateDisciplinaryQueries, selectedMeasure, t]);

	/**
	 * Closes the selected measure with the chosen signature status.
	 *
	 * @returns Nothing
	 */
	const handleCloseMeasure = useCallback(async (): Promise<void> => {
		if (!selectedMeasure) {
			toast.error(t('toast.selectMeasureFirst'));
			return;
		}
		const result = await closeMutation.mutateAsync({
			id: selectedMeasure.id,
			signatureStatus: closeSignatureStatus,
			notes: closeNotes.trim() || undefined,
		});
		if (!result.success) {
			toast.error(result.error ?? t('toast.closeError'));
			return;
		}

		toast.success(t('toast.closeSuccess'));
		setCloseNotes('');
		await invalidateDisciplinaryQueries();
	}, [closeMutation, closeNotes, closeSignatureStatus, invalidateDisciplinaryQueries, selectedMeasure, t]);

	const totalRows = measuresResponse?.pagination.total ?? 0;
	const selectedMeasureDetail = (selectedMeasure ?? null) as DisciplinaryMeasureDetailRecord | null;

	const columns = useMemo<ColumnDef<DisciplinaryMeasureRecord>[]>(
		() => [
			{
				accessorKey: 'folio',
				header: t('table.headers.folio'),
				cell: ({ row }) => <span className="font-semibold">#{row.original.folio}</span>,
			},
			{
				id: 'employee',
				header: t('table.headers.employee'),
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="font-medium">
							{`${row.original.employeeFirstName ?? ''} ${row.original.employeeLastName ?? ''}`.trim() ||
								tCommon('notAvailable')}
						</span>
						<span className="text-xs text-muted-foreground">{row.original.employeeCode ?? '—'}</span>
					</div>
				),
			},
			{
				accessorKey: 'incidentDateKey',
				header: t('table.headers.incidentDate'),
				cell: ({ row }) => row.original.incidentDateKey,
			},
			{
				accessorKey: 'outcome',
				header: t('table.headers.outcome'),
				cell: ({ row }) => (
					<Badge variant={resolveOutcomeBadgeVariant(row.original.outcome)}>
						{t(`outcomes.${row.original.outcome}`)}
					</Badge>
				),
			},
			{
				accessorKey: 'status',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge variant={resolveStatusBadgeVariant(row.original.status)}>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
			},
			{
				id: 'reason',
				header: t('table.headers.reason'),
				cell: ({ row }) => (
					<span className="line-clamp-2 max-w-[360px] text-sm">{row.original.reason}</span>
				),
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSelectedMeasureId(row.original.id)}
					>
						{t('actions.viewDetail')}
					</Button>
				),
			},
		],
		[t, tCommon],
	);

	if (!canManage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t('forbidden.title')}</CardTitle>
					<CardDescription>{t('forbidden.description')}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{embedded ? null : (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
					<Card className="border-amber-300/40 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/35 dark:to-card">
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="text-xs text-muted-foreground">{t('kpis.employeesWithMeasures')}</p>
								<p className="text-2xl font-semibold">{kpis?.employeesWithMeasures ?? 0}</p>
							</div>
							<User className="h-4 w-4 text-amber-700 dark:text-amber-300" />
						</CardContent>
					</Card>
					<Card className="border-orange-300/40 bg-gradient-to-br from-orange-50 to-white dark:border-orange-900/40 dark:from-orange-950/35 dark:to-card">
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="text-xs text-muted-foreground">{t('kpis.measuresInPeriod')}</p>
								<p className="text-2xl font-semibold">{kpis?.measuresInPeriod ?? 0}</p>
							</div>
							<FileWarning className="h-4 w-4 text-orange-700 dark:text-orange-300" />
						</CardContent>
					</Card>
					<Card className="border-rose-300/40 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/40 dark:from-rose-950/35 dark:to-card">
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="text-xs text-muted-foreground">{t('kpis.activeSuspensions')}</p>
								<p className="text-2xl font-semibold">{kpis?.activeSuspensions ?? 0}</p>
							</div>
							<Clock3 className="h-4 w-4 text-rose-700 dark:text-rose-300" />
						</CardContent>
					</Card>
					<Card className="border-red-300/40 bg-gradient-to-br from-red-50 to-white dark:border-red-900/40 dark:from-red-950/35 dark:to-card">
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="text-xs text-muted-foreground">{t('kpis.terminationEscalations')}</p>
								<p className="text-2xl font-semibold">{kpis?.terminationEscalations ?? 0}</p>
							</div>
							<ShieldAlert className="h-4 w-4 text-red-700 dark:text-red-300" />
						</CardContent>
					</Card>
					<Card className="border-yellow-300/40 bg-gradient-to-br from-yellow-50 to-white dark:border-yellow-900/40 dark:from-yellow-950/35 dark:to-card">
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="text-xs text-muted-foreground">{t('kpis.openMeasures')}</p>
								<p className="text-2xl font-semibold">{kpis?.openMeasures ?? 0}</p>
							</div>
							<AlertTriangle className="h-4 w-4 text-yellow-700 dark:text-yellow-300" />
						</CardContent>
					</Card>
				</div>
			)}

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<CardTitle>{t('title')}</CardTitle>
							<CardDescription>{t('subtitle')}</CardDescription>
						</div>
						<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
							<DialogTrigger asChild>
								<Button>{t('actions.create')}</Button>
							</DialogTrigger>
							<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
								<DialogHeader>
									<DialogTitle>{t('createDialog.title')}</DialogTitle>
									<DialogDescription>{t('createDialog.description')}</DialogDescription>
								</DialogHeader>
								<div className="space-y-3">
									<div className="space-y-1">
										<Label>{t('fields.employee')}</Label>
										<Select
											value={createForm.employeeId}
											onValueChange={(value) =>
												setCreateForm((previous) => ({ ...previous, employeeId: value }))
											}
											disabled={Boolean(employeeId)}
										>
											<SelectTrigger>
												<SelectValue placeholder={t('placeholders.employee')} />
											</SelectTrigger>
											<SelectContent>
												{employees.map((employeeOption) => (
													<SelectItem key={employeeOption.id} value={employeeOption.id}>
														{`${employeeOption.firstName} ${employeeOption.lastName}`.trim()}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="grid gap-3 md:grid-cols-2">
										<div className="space-y-1">
											<Label>{t('fields.incidentDate')}</Label>
											<Input
												type="date"
												value={createForm.incidentDateKey}
												onChange={(event) =>
													setCreateForm((previous) => ({
														...previous,
														incidentDateKey: event.target.value,
													}))
												}
											/>
										</div>
										<div className="space-y-1">
											<Label>{t('fields.outcome')}</Label>
											<Select
												value={createForm.outcome}
												onValueChange={(value) =>
													setCreateForm((previous) => ({
														...previous,
														outcome: value as DisciplinaryOutcome,
													}))
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{OUTCOME_OPTIONS.map((outcomeValue) => (
														<SelectItem key={outcomeValue} value={outcomeValue}>
															{t(`outcomes.${outcomeValue}`)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="space-y-1">
										<Label>{t('fields.reason')}</Label>
										<Textarea
											rows={4}
											value={createForm.reason}
											onChange={(event) =>
												setCreateForm((previous) => ({ ...previous, reason: event.target.value }))
											}
										/>
									</div>
									<div className="space-y-1">
										<Label>{t('fields.policyReference')}</Label>
										<Input
											value={createForm.policyReference}
											onChange={(event) =>
												setCreateForm((previous) => ({
													...previous,
													policyReference: event.target.value,
												}))
											}
										/>
									</div>
									{createForm.outcome === 'suspension' ? (
										<div className="grid gap-3 md:grid-cols-2">
											<div className="space-y-1">
												<Label>{t('fields.suspensionStartDate')}</Label>
												<Input
													type="date"
													value={createForm.suspensionStartDateKey}
													onChange={(event) =>
														setCreateForm((previous) => ({
															...previous,
															suspensionStartDateKey: event.target.value,
														}))
													}
												/>
											</div>
											<div className="space-y-1">
												<Label>{t('fields.suspensionEndDate')}</Label>
												<Input
													type="date"
													value={createForm.suspensionEndDateKey}
													onChange={(event) =>
														setCreateForm((previous) => ({
															...previous,
															suspensionEndDateKey: event.target.value,
														}))
													}
												/>
											</div>
										</div>
									) : null}
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => {
											setIsCreateOpen(false);
											resetCreateForm();
										}}
									>
										{tCommon('cancel')}
									</Button>
									<Button onClick={() => void handleCreateMeasure()} disabled={createMutation.isPending}>
										{createMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{t('actions.creating')}
											</>
										) : (
											t('actions.create')
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
						<div className="space-y-1 xl:col-span-2">
							<Label>{t('filters.search')}</Label>
							<Input
								value={search}
								onChange={(event) => {
									setSearch(event.target.value);
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
								placeholder={t('placeholders.search')}
							/>
						</div>
						{employeeId ? null : (
							<div className="space-y-1">
								<Label>{t('filters.employee')}</Label>
								<Select
									value={employeeFilter || 'all'}
									onValueChange={(value) => {
										setEmployeeFilter(value === 'all' ? '' : value);
										setPagination((previous) => ({ ...previous, pageIndex: 0 }));
									}}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">{t('filters.allEmployees')}</SelectItem>
										{employees.map((employeeOption) => (
											<SelectItem key={employeeOption.id} value={employeeOption.id}>
												{`${employeeOption.firstName} ${employeeOption.lastName}`.trim()}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<div className="space-y-1">
							<Label>{t('filters.status')}</Label>
							<Select
								value={statusFilter}
								onValueChange={(value) => {
									setStatusFilter(value as DisciplinaryMeasureStatus | 'all');
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
									{STATUS_OPTIONS.map((statusValue) => (
										<SelectItem key={statusValue} value={statusValue}>
											{t(`status.${statusValue}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>{t('filters.outcome')}</Label>
							<Select
								value={outcomeFilter}
								onValueChange={(value) => {
									setOutcomeFilter(value as DisciplinaryOutcome | 'all');
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t('filters.allOutcomes')}</SelectItem>
									{OUTCOME_OPTIONS.map((outcomeValue) => (
										<SelectItem key={outcomeValue} value={outcomeValue}>
											{t(`outcomes.${outcomeValue}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>{t('filters.fromDate')}</Label>
							<Input
								type="date"
								value={fromDateKey}
								onChange={(event) => {
									setFromDateKey(event.target.value);
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
							/>
						</div>
						<div className="space-y-1">
							<Label>{t('filters.toDate')}</Label>
							<Input
								type="date"
								value={toDateKey}
								onChange={(event) => {
									setToDateKey(event.target.value);
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
							/>
						</div>
					</div>

					<DataTable
						columns={columns}
						data={measures}
						sorting={sorting}
						onSortingChange={setSorting}
						pagination={pagination}
						onPaginationChange={setPagination}
						columnFilters={columnFilters}
						onColumnFiltersChange={setColumnFilters}
						globalFilter=""
						onGlobalFilterChange={() => {}}
						manualPagination={true}
						manualFiltering={true}
						rowCount={totalRows}
						showToolbar={false}
						isLoading={isMeasuresLoading}
						emptyState={<p className="py-10 text-center text-sm text-muted-foreground">{t('table.empty')}</p>}
					/>
				</CardContent>
			</Card>

			{selectedMeasureId ? (
				<Card className="border-amber-300/30">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle>{t('detail.title')}</CardTitle>
								<CardDescription>
									{selectedMeasureDetail
										? t('detail.subtitle', { folio: selectedMeasureDetail.folio })
										: t('detail.loading')}
								</CardDescription>
							</div>
							<Button variant="outline" onClick={() => setSelectedMeasureId(null)}>
								{t('actions.closeDetail')}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						{isDetailLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t('detail.loading')}
							</div>
						) : null}
						{selectedMeasureDetail ? (
							<div className="space-y-4">
								<div className="grid gap-3 rounded-lg border bg-muted/10 p-4 md:grid-cols-2 xl:grid-cols-4">
									<div>
										<p className="text-xs text-muted-foreground">{t('detail.fields.employee')}</p>
										<p className="text-sm font-medium">
											{`${selectedMeasureDetail.employeeFirstName ?? ''} ${selectedMeasureDetail.employeeLastName ?? ''}`.trim()}
										</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">{t('detail.fields.incidentDate')}</p>
										<p className="text-sm font-medium">{selectedMeasureDetail.incidentDateKey}</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">{t('detail.fields.status')}</p>
										<Badge variant={resolveStatusBadgeVariant(selectedMeasureDetail.status)}>
											{t(`status.${selectedMeasureDetail.status}`)}
										</Badge>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">{t('detail.fields.outcome')}</p>
										<Badge
											variant={resolveOutcomeBadgeVariant(selectedMeasureDetail.outcome)}
										>
											{t(`outcomes.${selectedMeasureDetail.outcome}`)}
										</Badge>
									</div>
								</div>

								<div className="space-y-2">
									<p className="text-sm font-semibold">{t('detail.fields.reason')}</p>
									<p className="rounded-md border bg-background p-3 text-sm leading-relaxed">
										{selectedMeasureDetail.reason}
									</p>
								</div>

								<div className="grid gap-4 xl:grid-cols-2">
									<Card>
										<CardHeader className="pb-3">
											<CardTitle className="text-base">{t('detail.documents.title')}</CardTitle>
											<CardDescription>{t('detail.documents.description')}</CardDescription>
										</CardHeader>
										<CardContent className="space-y-2">
											{selectedMeasureDetail.documents.length === 0 ? (
												<p className="text-sm text-muted-foreground">{t('detail.documents.empty')}</p>
											) : (
												selectedMeasureDetail.documents.map((document) => (
													<div
														key={document.id}
														className="flex items-center justify-between rounded-md border p-2"
													>
														<div>
															<p className="text-sm font-medium">
																{t(`documentKinds.${document.kind}`)} v{document.versionNumber}
															</p>
															<p className="text-xs text-muted-foreground">
																{formatShortDateUtc(document.uploadedAt)}
															</p>
														</div>
														<Button
															variant="outline"
															size="sm"
															onClick={() =>
																void handleOpenDocument(selectedMeasureDetail.id, document.id)
															}
														>
															{t('actions.viewDocument')}
														</Button>
													</div>
												))
											)}
										</CardContent>
									</Card>

									<Card>
										<CardHeader className="pb-3">
											<CardTitle className="text-base">{t('detail.attachments.title')}</CardTitle>
											<CardDescription>{t('detail.attachments.description')}</CardDescription>
										</CardHeader>
										<CardContent className="space-y-2">
											{selectedMeasureDetail.attachments.length === 0 ? (
												<p className="text-sm text-muted-foreground">{t('detail.attachments.empty')}</p>
											) : (
												selectedMeasureDetail.attachments.map((attachment) => (
													<div
														key={attachment.id}
														className="flex items-center justify-between rounded-md border p-2"
													>
														<div>
															<p className="text-sm font-medium">{attachment.fileName}</p>
															<p className="text-xs text-muted-foreground">
																{formatShortDateUtc(attachment.uploadedAt)}
															</p>
														</div>
														<Button
															variant="outline"
															size="sm"
															onClick={() => void handleDeleteAttachment(attachment.id)}
															disabled={selectedMeasureDetail.status === 'CLOSED'}
														>
															{t('actions.deleteAttachment')}
														</Button>
													</div>
												))
											)}
										</CardContent>
									</Card>
								</div>

								{selectedMeasureDetail.status !== 'CLOSED' ? (
									<div className="space-y-4 rounded-lg border border-amber-300/40 bg-gradient-to-br from-amber-100/55 via-amber-50/15 to-background p-4 dark:border-amber-900/40 dark:from-amber-900/20 dark:via-amber-950/10 dark:to-background">
										<h3 className="text-sm font-semibold">{t('detail.actions.title')}</h3>
										<div className="grid gap-3 xl:grid-cols-2">
											<div className="space-y-2 rounded-md border bg-background p-3">
												<p className="text-sm font-medium">{t('actions.generateActa')}</p>
												<Button
													onClick={() => void handleGenerateActa()}
													disabled={generateActaMutation.isPending}
												>
													{generateActaMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															{t('actions.generatingActa')}
														</>
													) : (
														t('actions.generateActa')
													)}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-background p-3">
												<p className="text-sm font-medium">{t('actions.uploadSignedActa')}</p>
												<Input
													type="file"
													accept=".pdf,image/jpeg,image/png"
													onChange={(event) =>
														setSignedActaFile(event.target.files?.[0] ?? null)
													}
												/>
												<Button onClick={() => void handleUploadSignedActa()}>
													<Upload className="mr-2 h-4 w-4" />
													{t('actions.uploadSignedActa')}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-background p-3">
												<p className="text-sm font-medium">{t('actions.generateRefusal')}</p>
												<Button
													variant="secondary"
													onClick={() => void handleGenerateRefusal()}
													disabled={generateRefusalMutation.isPending}
												>
													{generateRefusalMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															{t('actions.generatingRefusal')}
														</>
													) : (
														t('actions.generateRefusal')
													)}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-background p-3">
												<p className="text-sm font-medium">{t('actions.uploadRefusal')}</p>
												<Input
													type="file"
													accept=".pdf,image/jpeg,image/png"
													onChange={(event) =>
														setSignedRefusalFile(event.target.files?.[0] ?? null)
													}
												/>
												<Button variant="secondary" onClick={() => void handleUploadRefusal()}>
													<Upload className="mr-2 h-4 w-4" />
													{t('actions.uploadRefusal')}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-background p-3 xl:col-span-2">
												<p className="text-sm font-medium">{t('actions.uploadAttachment')}</p>
												<div className="flex flex-wrap items-center gap-2">
													<Input
														type="file"
														accept=".pdf,image/jpeg,image/png"
														onChange={(event) =>
															setAttachmentFile(event.target.files?.[0] ?? null)
														}
													/>
													<Button variant="outline" onClick={() => void handleUploadAttachment()}>
														<Paperclip className="mr-2 h-4 w-4" />
														{t('actions.uploadAttachment')}
													</Button>
												</div>
											</div>

											<div className="space-y-2 rounded-md border bg-background p-3 xl:col-span-2">
												<p className="text-sm font-medium">{t('actions.closeMeasure')}</p>
												<div className="grid gap-2 md:grid-cols-3">
													<Select
														value={closeSignatureStatus}
														onValueChange={(value) =>
															setCloseSignatureStatus(value as DisciplinarySignatureStatus)
														}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{SIGNATURE_STATUS_OPTIONS.map((signatureStatus) => (
																<SelectItem key={signatureStatus} value={signatureStatus}>
																	{t(`signatureStatus.${signatureStatus}`)}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<Textarea
														value={closeNotes}
														onChange={(event) => setCloseNotes(event.target.value)}
														rows={2}
														placeholder={t('placeholders.closeNotes')}
													/>
													<Button onClick={() => void handleCloseMeasure()} disabled={closeMutation.isPending}>
														{closeMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																{t('actions.closing')}
															</>
														) : (
															t('actions.closeMeasure')
														)}
													</Button>
												</div>
											</div>
										</div>
									</div>
								) : (
									<div className="rounded-md border border-emerald-300/40 bg-emerald-50/60 p-3 text-sm text-emerald-800">
										<CheckCircle2 className="mr-2 inline h-4 w-4" />
										{t('detail.closedMessage')}
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">{t('detail.empty')}</p>
						)}
					</CardContent>
				</Card>
			) : null}

			{embedded && !employeeId ? (
				<div className="flex justify-end">
					<Button asChild variant="outline">
						<Link href="/disciplinary-measures">{t('actions.openModule')}</Link>
					</Button>
				</div>
			) : null}
		</div>
	);
}
