'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';
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
	type DisciplinaryMutationResult,
} from '@/actions/disciplinary-measures';
import { Badge } from '@/components/ui/badge';
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
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
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
import { buildGeneratedLegalPdfFromHtml } from '@/lib/legal-documents/build-generated-legal-pdf';
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

interface DisciplinaryGenerationPayload {
	renderedHtml?: string;
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
 * Extracts generated HTML payload from disciplinary generation mutations.
 *
 * @param result - Mutation result payload
 * @returns Parsed generation payload or null
 */
function extractDisciplinaryGenerationPayload(
	result: DisciplinaryMutationResult<Record<string, unknown>>,
): DisciplinaryGenerationPayload | null {
	if (!result.success || !result.data) {
		return null;
	}

	const data = result.data as { renderedHtml?: string };
	return {
		renderedHtml: typeof data.renderedHtml === 'string' ? data.renderedHtml : undefined,
	};
}

/**
 * Sanitizes text segments for downloadable file names.
 *
 * @param value - Raw file name segment
 * @returns Sanitized segment
 */
function sanitizeDisciplinaryFileNameSegment(value: string): string {
	const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
	const sanitized = normalized.replace(/[^a-z0-9-]/g, '');
	return sanitized.length > 0 ? sanitized : 'documento';
}

/**
 * Builds generated disciplinary document file name.
 *
 * @param args - Kind and folio metadata
 * @returns Download file name
 */
function buildDisciplinaryGeneratedFileName(args: {
	kind: 'acta' | 'refusal';
	folio: number;
}): string {
	const prefix = args.kind === 'acta' ? 'acta-administrativa' : 'constancia-negativa-firma';
	const todayDateKey = new Date().toISOString().slice(0, 10);
	const folioSegment = sanitizeDisciplinaryFileNameSegment(args.folio.toString());
	return `${prefix}-${folioSegment}-${todayDateKey}.pdf`;
}

/**
 * Triggers browser download for generated disciplinary PDF.
 *
 * @param args - Download payload
 * @returns Nothing
 */
async function downloadDisciplinaryGeneratedPdf(args: {
	html: string;
	fileName: string;
	title: string;
}): Promise<void> {
	const pdfBytes = await buildGeneratedLegalPdfFromHtml({
		title: args.title,
		html: args.html,
	});
	const normalizedPdfBytes = new Uint8Array(pdfBytes.length);
	normalizedPdfBytes.set(pdfBytes);
	const blob = new Blob([normalizedPdfBytes], { type: 'application/pdf' });
	const objectUrl = URL.createObjectURL(blob);

	try {
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = args.fileName;
		anchor.rel = 'noopener';
		anchor.style.display = 'none';
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
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
	const { organizationId, organizationRole } = useOrgContext();
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
	const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
	const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
	const [createForm, setCreateForm] = useState<CreateMeasureFormState>(
		createDefaultCreateFormState(employeeId),
	);
	const [signedActaFile, setSignedActaFile] = useState<File | null>(null);
	const [signedRefusalFile, setSignedRefusalFile] = useState<File | null>(null);
	const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
	const [closeSignatureStatus, setCloseSignatureStatus] =
		useState<DisciplinarySignatureStatus>('signed_physical');
	const [closeNotes, setCloseNotes] = useState<string>('');

	const measuresQueryParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			...(employeeId ? { employeeId } : employeeFilter ? { employeeId: employeeFilter } : {}),
			...(search.trim() ? { search: search.trim() } : {}),
			...(fromDateKey ? { fromDateKey } : {}),
			...(toDateKey ? { toDateKey } : {}),
			...(statusFilter !== 'all' ? { status: statusFilter } : {}),
			...(outcomeFilter !== 'all' ? { outcome: outcomeFilter } : {}),
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

	const disciplinaryKpisParams = useMemo(() => {
		const params = {
			...(fromDateKey ? { fromDateKey } : {}),
			...(toDateKey ? { toDateKey } : {}),
		};
		return Object.keys(params).length > 0 ? params : undefined;
	}, [fromDateKey, toDateKey]);

	const { data: kpis } = useQuery({
		queryKey: queryKeys.disciplinaryMeasures.kpis(disciplinaryKpisParams),
		queryFn: () => fetchDisciplinaryKpis(disciplinaryKpisParams),
		enabled: canManage && !embedded,
	});

	const employeeListParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			...(organizationId ? { organizationId } : {}),
		}),
		[organizationId],
	);

	const { data: employeesResponse } = useQuery({
		queryKey: queryKeys.employees.list(employeeListParams),
		queryFn: () => fetchEmployeesList(employeeListParams),
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
		try {
			const result = await generateActaMutation.mutateAsync({ id: selectedMeasure.id });
			if (!result.success) {
				if (result.errorCode === 'DISCIPLINARY_ACTA_SETTINGS_INCOMPLETE') {
					toast.error(t('toast.validation.actaSettingsRequired'));
					return;
				}
				toast.error(result.error ?? t('toast.generateActaError'));
				return;
			}

			await invalidateDisciplinaryQueries();

			const payload = extractDisciplinaryGenerationPayload(result);
			if (!payload?.renderedHtml) {
				toast.error(t('toast.generateActaError'));
				return;
			}

			await downloadDisciplinaryGeneratedPdf({
				html: payload.renderedHtml,
				fileName: buildDisciplinaryGeneratedFileName({
					kind: 'acta',
					folio: selectedMeasure.folio,
				}),
				title: t('documentKinds.ACTA_ADMINISTRATIVA'),
			});

			toast.success(t('toast.generateActaSuccess'));
		} catch (error) {
			console.error('Failed to generate or download disciplinary acta:', error);
			toast.error(t('toast.generateActaError'));
		}
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
		try {
			const result = await generateRefusalMutation.mutateAsync({ id: selectedMeasure.id });
			if (!result.success) {
				toast.error(result.error ?? t('toast.generateRefusalError'));
				return;
			}

			await invalidateDisciplinaryQueries();

			const payload = extractDisciplinaryGenerationPayload(result);
			if (!payload?.renderedHtml) {
				toast.error(t('toast.generateRefusalError'));
				return;
			}

			await downloadDisciplinaryGeneratedPdf({
				html: payload.renderedHtml,
				fileName: buildDisciplinaryGeneratedFileName({
					kind: 'refusal',
					folio: selectedMeasure.folio,
				}),
				title: t('documentKinds.CONSTANCIA_NEGATIVA_FIRMA'),
			});

			toast.success(t('toast.generateRefusalSuccess'));
		} catch (error) {
			console.error('Failed to generate or download refusal certificate:', error);
			toast.error(t('toast.generateRefusalError'));
		}
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
	}, [
		closeMutation,
		closeNotes,
		closeSignatureStatus,
		invalidateDisciplinaryQueries,
		selectedMeasure,
		t,
	]);

	/**
	 * Opens the detail dialog for a disciplinary measure row.
	 *
	 * @param measureId - Selected measure identifier
	 * @returns Nothing
	 */
	const handleOpenDetail = useCallback((measureId: string): void => {
		setSelectedMeasureId(measureId);
		setIsDetailOpen(true);
	}, []);

	/**
	 * Handles detail dialog visibility changes and clears transient detail form state.
	 *
	 * @param open - Whether the detail dialog should remain open
	 * @returns Nothing
	 */
	const handleDetailDialogOpenChange = useCallback((open: boolean): void => {
		setIsDetailOpen(open);
		if (!open) {
			setSelectedMeasureId(null);
			setSignedActaFile(null);
			setSignedRefusalFile(null);
			setAttachmentFile(null);
			setCloseSignatureStatus('signed_physical');
			setCloseNotes('');
		}
	}, []);

	const totalRows = measuresResponse?.pagination.total ?? 0;
	const selectedMeasureDetail = (selectedMeasure ??
		null) as DisciplinaryMeasureDetailRecord | null;
	const kpiCards = useMemo(
		() => [
			{
				key: 'employeesWithMeasures',
				label: t('kpis.employeesWithMeasures'),
				value: kpis?.employeesWithMeasures ?? 0,
				icon: User,
				className:
					'border-amber-300/40 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/35 dark:to-card',
				iconClassName: 'text-amber-700 dark:text-amber-300',
			},
			{
				key: 'measuresInPeriod',
				label: t('kpis.measuresInPeriod'),
				value: kpis?.measuresInPeriod ?? 0,
				icon: FileWarning,
				className:
					'border-orange-300/40 bg-gradient-to-br from-orange-50 to-white dark:border-orange-900/40 dark:from-orange-950/35 dark:to-card',
				iconClassName: 'text-orange-700 dark:text-orange-300',
			},
			{
				key: 'activeSuspensions',
				label: t('kpis.activeSuspensions'),
				value: kpis?.activeSuspensions ?? 0,
				icon: Clock3,
				className:
					'border-rose-300/40 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/40 dark:from-rose-950/35 dark:to-card',
				iconClassName: 'text-rose-700 dark:text-rose-300',
			},
			{
				key: 'terminationEscalations',
				label: t('kpis.terminationEscalations'),
				value: kpis?.terminationEscalations ?? 0,
				icon: ShieldAlert,
				className:
					'border-red-300/40 bg-gradient-to-br from-red-50 to-white dark:border-red-900/40 dark:from-red-950/35 dark:to-card',
				iconClassName: 'text-red-700 dark:text-red-300',
			},
			{
				key: 'openMeasures',
				label: t('kpis.openMeasures'),
				value: kpis?.openMeasures ?? 0,
				icon: AlertTriangle,
				className:
					'border-yellow-300/40 bg-gradient-to-br from-yellow-50 to-white dark:border-yellow-900/40 dark:from-yellow-950/35 dark:to-card',
				iconClassName: 'text-yellow-700 dark:text-yellow-300',
			},
		],
		[kpis, t],
	);

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
						<span className="text-xs text-muted-foreground">
							{row.original.employeeCode ?? '—'}
						</span>
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
					<Badge
						variant={resolveStatusBadgeVariant(row.original.status)}
						data-testid={`disciplinary-measure-status-${row.original.id}`}
						data-status={row.original.status}
					>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
			},
			{
				id: 'reason',
				header: t('table.headers.reason'),
				cell: ({ row }) => (
					<span className="line-clamp-2 max-w-[360px] text-sm">
						{row.original.reason}
					</span>
				),
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleOpenDetail(row.original.id)}
						data-testid={`disciplinary-measure-view-detail-${row.original.id}`}
					>
						{t('actions.viewDetail')}
					</Button>
				),
			},
		],
		[handleOpenDetail, t, tCommon],
	);

	/**
	 * Renders the mobile card layout for a disciplinary measure row.
	 *
	 * @param measure - Disciplinary measure record to render
	 * @returns Mobile card content
	 */
	const renderMeasureCard = useCallback(
		(measure: DisciplinaryMeasureRecord): React.ReactNode => {
			const employeeName =
				`${measure.employeeFirstName ?? ''} ${measure.employeeLastName ?? ''}`.trim() ||
				tCommon('notAvailable');
			const employeeCode = measure.employeeCode ?? '—';

			return (
				<div className="space-y-4">
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="text-sm font-semibold text-foreground">#{measure.folio}</p>
							<p className="text-xs text-muted-foreground">
								{employeeName} · {employeeCode}
							</p>
						</div>
						<Badge
							variant={resolveStatusBadgeVariant(measure.status)}
							data-testid={`disciplinary-measure-status-${measure.id}`}
							data-status={measure.status}
						>
							{t(`status.${measure.status}`)}
						</Badge>
					</div>
					<div className="grid gap-3">
						<div className="space-y-1">
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('table.headers.incidentDate')}
							</p>
							<p className="text-sm text-foreground">{measure.incidentDateKey}</p>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('table.headers.outcome')}
							</p>
							<div>
								<Badge variant={resolveOutcomeBadgeVariant(measure.outcome)}>
									{t(`outcomes.${measure.outcome}`)}
								</Badge>
							</div>
						</div>
						<div className="space-y-1">
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('table.headers.reason')}
							</p>
							<p className="line-clamp-2 text-sm text-muted-foreground">
								{measure.reason}
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => handleOpenDetail(measure.id)}
						data-testid={`disciplinary-measure-view-detail-${measure.id}`}
					>
						{t('actions.viewDetail')}
					</Button>
				</div>
			);
		},
		[handleOpenDetail, t, tCommon],
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
				<div
					data-testid="disciplinary-measures-kpis"
					className="flex gap-3 overflow-x-auto pb-2 min-[1025px]:grid min-[1025px]:grid-cols-5 min-[1025px]:overflow-visible"
				>
					{kpiCards.map((kpiCard) => {
						const Icon = kpiCard.icon;
						return (
							<Card
								key={kpiCard.key}
								className={`min-w-[140px] flex-1 ${kpiCard.className} min-[1025px]:min-w-0`}
							>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-xs text-muted-foreground">
											{kpiCard.label}
										</p>
										<p className="text-2xl font-semibold">{kpiCard.value}</p>
									</div>
									<Icon className={`h-4 w-4 ${kpiCard.iconClassName}`} />
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			<Card>
				<CardHeader>
					<div className="flex flex-col gap-2 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
						<div>
							<CardTitle>{t('title')}</CardTitle>
							<CardDescription>{t('subtitle')}</CardDescription>
						</div>
						<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
							<DialogTrigger asChild>
								<Button
									className="w-full min-[1025px]:w-auto"
									data-testid="disciplinary-measures-create-button"
								>
									{t('actions.create')}
								</Button>
							</DialogTrigger>
							<DialogContent className="max-h-[90vh] w-full max-w-[calc(100vw-2rem)] overflow-y-auto min-[1025px]:max-w-xl">
								<DialogHeader>
									<DialogTitle>{t('createDialog.title')}</DialogTitle>
									<DialogDescription>
										{t('createDialog.description')}
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-3">
									<div className="space-y-1">
										<Label>{t('fields.employee')}</Label>
										<Select
											value={createForm.employeeId}
											onValueChange={(value) =>
												setCreateForm((previous) => ({
													...previous,
													employeeId: value,
												}))
											}
											disabled={Boolean(employeeId)}
										>
											<SelectTrigger className="w-full min-h-11">
												<SelectValue
													placeholder={t('placeholders.employee')}
												/>
											</SelectTrigger>
											<SelectContent>
												{employees.map((employeeOption) => (
													<SelectItem
														key={employeeOption.id}
														value={employeeOption.id}
													>
														{`${employeeOption.firstName} ${employeeOption.lastName}`.trim()}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="grid gap-3 min-[1025px]:grid-cols-2">
										<div className="space-y-1">
											<Label>{t('fields.incidentDate')}</Label>
											<Input
												type="date"
												className="min-h-11"
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
												<SelectTrigger className="w-full min-h-11">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{OUTCOME_OPTIONS.map((outcomeValue) => (
														<SelectItem
															key={outcomeValue}
															value={outcomeValue}
														>
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
											className="min-h-28"
											value={createForm.reason}
											onChange={(event) =>
												setCreateForm((previous) => ({
													...previous,
													reason: event.target.value,
												}))
											}
										/>
									</div>
									<div className="space-y-1">
										<Label>{t('fields.policyReference')}</Label>
										<Input
											className="min-h-11"
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
										<div className="grid gap-3 min-[1025px]:grid-cols-2">
											<div className="space-y-1">
												<Label>{t('fields.suspensionStartDate')}</Label>
												<Input
													type="date"
													className="min-h-11"
													value={createForm.suspensionStartDateKey}
													onChange={(event) =>
														setCreateForm((previous) => ({
															...previous,
															suspensionStartDateKey:
																event.target.value,
														}))
													}
												/>
											</div>
											<div className="space-y-1">
												<Label>{t('fields.suspensionEndDate')}</Label>
												<Input
													type="date"
													className="min-h-11"
													value={createForm.suspensionEndDateKey}
													onChange={(event) =>
														setCreateForm((previous) => ({
															...previous,
															suspensionEndDateKey:
																event.target.value,
														}))
													}
												/>
											</div>
										</div>
									) : null}
								</div>
								<DialogFooter className="flex-col-reverse gap-2 min-[1025px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[1025px]:[&>button]:w-auto">
									<Button
										variant="outline"
										onClick={() => {
											setIsCreateOpen(false);
											resetCreateForm();
										}}
									>
										{tCommon('cancel')}
									</Button>
									<Button
										onClick={() => void handleCreateMeasure()}
										disabled={createMutation.isPending}
									>
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
					<div
						data-tour="disciplinary-measures-filters"
						className="flex flex-col gap-2 min-[1025px]:grid min-[1025px]:grid-cols-5 min-[1025px]:gap-3"
					>
						<div className="space-y-1 min-[1025px]:col-span-2">
							<Label>{t('filters.search')}</Label>
							<Input
								className="min-h-11"
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
										setPagination((previous) => ({
											...previous,
											pageIndex: 0,
										}));
									}}
								>
									<SelectTrigger className="w-full min-h-11">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">
											{t('filters.allEmployees')}
										</SelectItem>
										{employees.map((employeeOption) => (
											<SelectItem
												key={employeeOption.id}
												value={employeeOption.id}
											>
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
								<SelectTrigger className="w-full min-h-11">
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
								<SelectTrigger className="w-full min-h-11">
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
								className="min-h-11"
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
								className="min-h-11"
								value={toDateKey}
								onChange={(event) => {
									setToDateKey(event.target.value);
									setPagination((previous) => ({ ...previous, pageIndex: 0 }));
								}}
							/>
						</div>
					</div>

					<div data-tour="disciplinary-measures-list">
						<ResponsiveDataView
							columns={columns}
							data={measures}
							cardRenderer={renderMeasureCard}
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
							emptyState={
								<p className="py-10 text-center text-sm text-muted-foreground">
									{t('table.empty')}
								</p>
							}
						/>
					</div>
				</CardContent>
			</Card>

			<Dialog open={isDetailOpen} onOpenChange={handleDetailDialogOpenChange}>
				<DialogContent className="max-h-[calc(100vh-4rem)] w-full max-w-[calc(100vw-2rem)] overflow-y-auto min-[1025px]:max-w-5xl min-[1280px]:max-w-6xl">
					<DialogHeader>
						<DialogTitle>{t('detail.title')}</DialogTitle>
						<DialogDescription>
							{selectedMeasureDetail
								? t('detail.subtitle', { folio: selectedMeasureDetail.folio })
								: t('detail.loading')}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						{isDetailLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t('detail.loading')}
							</div>
						) : null}
						{selectedMeasureDetail ? (
							<div className="space-y-4">
								<div className="grid gap-3 rounded-lg border bg-card p-4 min-[1025px]:grid-cols-2 min-[1280px]:grid-cols-4">
									<div>
										<p className="text-xs text-muted-foreground">
											{t('detail.fields.employee')}
										</p>
										<p className="text-sm font-medium">
											{`${selectedMeasureDetail.employeeFirstName ?? ''} ${selectedMeasureDetail.employeeLastName ?? ''}`.trim()}
										</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">
											{t('detail.fields.incidentDate')}
										</p>
										<p className="text-sm font-medium">
											{selectedMeasureDetail.incidentDateKey}
										</p>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">
											{t('detail.fields.status')}
										</p>
										<Badge
											variant={resolveStatusBadgeVariant(
												selectedMeasureDetail.status,
											)}
										>
											{t(`status.${selectedMeasureDetail.status}`)}
										</Badge>
									</div>
									<div>
										<p className="text-xs text-muted-foreground">
											{t('detail.fields.outcome')}
										</p>
										<Badge
											variant={resolveOutcomeBadgeVariant(
												selectedMeasureDetail.outcome,
											)}
										>
											{t(`outcomes.${selectedMeasureDetail.outcome}`)}
										</Badge>
									</div>
								</div>

								<div className="space-y-2">
									<p className="text-sm font-semibold">
										{t('detail.fields.reason')}
									</p>
									<p className="rounded-md border bg-card p-3 text-sm leading-relaxed">
										{selectedMeasureDetail.reason}
									</p>
								</div>

								<div className="grid gap-4 min-[1280px]:grid-cols-2">
									<Card>
										<CardHeader className="pb-3">
											<CardTitle className="text-base">
												{t('detail.documents.title')}
											</CardTitle>
											<CardDescription>
												{t('detail.documents.description')}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-2">
											{selectedMeasureDetail.documents.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													{t('detail.documents.empty')}
												</p>
											) : (
												selectedMeasureDetail.documents.map((document) => (
													<div
														key={document.id}
														className="flex flex-col gap-3 rounded-md border p-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between"
													>
														<div>
															<p className="text-sm font-medium">
																{t(
																	`documentKinds.${document.kind}`,
																)}{' '}
																v{document.versionNumber}
															</p>
															<p className="text-xs text-muted-foreground">
																{formatShortDateUtc(
																	document.uploadedAt,
																)}
															</p>
														</div>
														<Button
															variant="outline"
															size="sm"
															className="w-full min-[1025px]:w-auto"
															onClick={() =>
																void handleOpenDocument(
																	selectedMeasureDetail.id,
																	document.id,
																)
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
											<CardTitle className="text-base">
												{t('detail.attachments.title')}
											</CardTitle>
											<CardDescription>
												{t('detail.attachments.description')}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-2">
											{selectedMeasureDetail.attachments.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													{t('detail.attachments.empty')}
												</p>
											) : (
												selectedMeasureDetail.attachments.map(
													(attachment) => (
														<div
															key={attachment.id}
															className="flex flex-col gap-3 rounded-md border p-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between"
														>
															<div>
																<p className="text-sm font-medium">
																	{attachment.fileName}
																</p>
																<p className="text-xs text-muted-foreground">
																	{formatShortDateUtc(
																		attachment.uploadedAt,
																	)}
																</p>
															</div>
															<Button
																variant="outline"
																size="sm"
																className="w-full min-[1025px]:w-auto"
																onClick={() =>
																	void handleDeleteAttachment(
																		attachment.id,
																	)
																}
																disabled={
																	selectedMeasureDetail.status ===
																	'CLOSED'
																}
															>
																{t('actions.deleteAttachment')}
															</Button>
														</div>
													),
												)
											)}
										</CardContent>
									</Card>
								</div>

								{selectedMeasureDetail.status !== 'CLOSED' ? (
									<div className="space-y-4 rounded-lg border bg-card p-4">
										<h3 className="text-sm font-semibold">
											{t('detail.actions.title')}
										</h3>
										<div className="grid gap-3 min-[1280px]:grid-cols-2">
											<div className="space-y-2 rounded-md border bg-card p-3">
												<p className="text-sm font-medium">
													{t('actions.generateActa')}
												</p>
												<Button
													className="w-full"
													onClick={() => void handleGenerateActa()}
													disabled={generateActaMutation.isPending}
													data-testid="disciplinary-measure-generate-acta"
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

											<div className="space-y-2 rounded-md border bg-card p-3">
												<p className="text-sm font-medium">
													{t('actions.uploadSignedActa')}
												</p>
												<Input
													type="file"
													accept=".pdf,image/jpeg,image/png"
													className="min-h-11"
													onChange={(event) =>
														setSignedActaFile(
															event.target.files?.[0] ?? null,
														)
													}
												/>
												<Button
													className="w-full"
													onClick={() => void handleUploadSignedActa()}
												>
													<Upload className="mr-2 h-4 w-4" />
													{t('actions.uploadSignedActa')}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-card p-3">
												<p className="text-sm font-medium">
													{t('actions.generateRefusal')}
												</p>
												<Button
													variant="secondary"
													className="w-full"
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

											<div className="space-y-2 rounded-md border bg-card p-3">
												<p className="text-sm font-medium">
													{t('actions.uploadRefusal')}
												</p>
												<Input
													type="file"
													accept=".pdf,image/jpeg,image/png"
													className="min-h-11"
													onChange={(event) =>
														setSignedRefusalFile(
															event.target.files?.[0] ?? null,
														)
													}
												/>
												<Button
													variant="secondary"
													className="w-full"
													onClick={() => void handleUploadRefusal()}
												>
													<Upload className="mr-2 h-4 w-4" />
													{t('actions.uploadRefusal')}
												</Button>
											</div>

											<div className="space-y-2 rounded-md border bg-card p-3 min-[1280px]:col-span-2">
												<p className="text-sm font-medium">
													{t('actions.uploadAttachment')}
												</p>
												<div className="flex flex-col gap-2 min-[1025px]:flex-row min-[1025px]:items-center">
													<Input
														type="file"
														accept=".pdf,image/jpeg,image/png"
														className="min-h-11"
														onChange={(event) =>
															setAttachmentFile(
																event.target.files?.[0] ?? null,
															)
														}
													/>
													<Button
														variant="outline"
														className="w-full min-[1025px]:w-auto"
														onClick={() =>
															void handleUploadAttachment()
														}
													>
														<Paperclip className="mr-2 h-4 w-4" />
														{t('actions.uploadAttachment')}
													</Button>
												</div>
											</div>

											<div className="space-y-2 rounded-md border bg-card p-3 min-[1280px]:col-span-2">
												<p className="text-sm font-medium">
													{t('actions.closeMeasure')}
												</p>
												<div className="grid gap-2 min-[1025px]:grid-cols-3">
													<Select
														value={closeSignatureStatus}
														onValueChange={(value) =>
															setCloseSignatureStatus(
																value as DisciplinarySignatureStatus,
															)
														}
													>
														<SelectTrigger className="w-full min-h-11">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{SIGNATURE_STATUS_OPTIONS.map(
																(signatureStatus) => (
																	<SelectItem
																		key={signatureStatus}
																		value={signatureStatus}
																	>
																		{t(
																			`signatureStatus.${signatureStatus}`,
																		)}
																	</SelectItem>
																),
															)}
														</SelectContent>
													</Select>
													<Textarea
														className="min-h-24"
														value={closeNotes}
														onChange={(event) =>
															setCloseNotes(event.target.value)
														}
														rows={2}
														placeholder={t('placeholders.closeNotes')}
													/>
													<Button
														className="w-full"
														onClick={() => void handleCloseMeasure()}
														disabled={closeMutation.isPending}
													>
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
									<div
										className="rounded-md border border-emerald-300/40 bg-emerald-50/60 p-3 text-sm text-emerald-800"
										data-testid="disciplinary-measure-closed-message"
									>
										<CheckCircle2 className="mr-2 inline h-4 w-4" />
										{t('detail.closedMessage')}
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">{t('detail.empty')}</p>
						)}
					</div>
					<DialogFooter className="flex-col-reverse gap-2 min-[1025px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[1025px]:[&>button]:w-auto">
						<Button
							variant="outline"
							onClick={() => handleDetailDialogOpenChange(false)}
						>
							{t('actions.closeDetail')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
