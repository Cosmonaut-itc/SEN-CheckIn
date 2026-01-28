'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, FileUp, Loader2, RefreshCw, Search } from 'lucide-react';

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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	cancelIncapacityAction,
	confirmIncapacityDocumentAction,
	createIncapacityAction,
	getIncapacityDocumentUrlAction,
	presignIncapacityDocumentAction,
	updateIncapacityAction,
	type IncapacityMutationErrorCode,
} from '@/actions/incapacities';
import {
	fetchEmployeesList,
	fetchIncapacitiesList,
	type IncapacityDocument,
	type IncapacityRecord,
} from '@/lib/client-functions';
import { formatDateRangeUtc, formatShortDateUtc } from '@/lib/date-format';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { useSession } from '@/lib/auth-client';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';
import type {
	IncapacityIssuedBy,
	IncapacitySequence,
	IncapacityStatus,
	IncapacityType,
} from '@sen-checkin/types';

const ALL_EMPLOYEES_VALUE = '__all__';
const ALL_TYPES_VALUE = '__all__';
const ALL_STATUS_VALUE = '__all__';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const CONFIRM_RETRY_DELAYS_MS = [400, 800, 1200];

/**
 * Delay helper for retry flows.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Determines whether a document confirm should retry.
 *
 * @param errorCode - Error code returned from confirm action
 * @returns True when the error is likely transient
 */
function shouldRetryConfirm(
	errorCode: IncapacityMutationErrorCode | undefined,
): boolean {
	return (
		errorCode === 'INCAPACITY_DOCUMENT_NOT_FOUND' ||
		errorCode === 'INCAPACITY_DOCUMENT_INVALID'
	);
}

/**
 * Ensures incapacity document timestamps are Date instances.
 *
 * @param document - Raw incapacity document payload
 * @returns Normalized incapacity document
 */
function normalizeIncapacityDocument(document: IncapacityDocument): IncapacityDocument {
	return {
		...document,
		uploadedAt:
			document.uploadedAt instanceof Date
				? document.uploadedAt
				: new Date(document.uploadedAt),
		createdAt:
			document.createdAt instanceof Date ? document.createdAt : new Date(document.createdAt),
	};
}

const statusVariants: Record<
	IncapacityStatus,
	'default' | 'secondary' | 'destructive' | 'outline'
> = {
	ACTIVE: 'default',
	CANCELLED: 'outline',
};

const typeVariants: Record<IncapacityType, 'default' | 'secondary' | 'outline'> = {
	EG: 'default',
	RT: 'secondary',
	MAT: 'outline',
	LIC140BIS: 'outline',
};

/**
 * Converts a date key to a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at UTC midnight
 */
function toUtcDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Computes a SHA-256 hash for a file.
 *
 * @param file - File to hash
 * @returns SHA-256 hex digest
 */
async function computeFileSha256(file: File): Promise<string> {
	const buffer = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolves the error toast message for incapacity mutations.
 *
 * @param t - Translation helper for Incapacities namespace
 * @param errorCode - Error code from the mutation result
 * @param fallbackKey - Translation key for the fallback message
 * @returns Localized error message
 */
function getIncapacityErrorMessage(
	t: (key: string) => string,
	errorCode: IncapacityMutationErrorCode | undefined,
	fallbackKey: string,
): string {
	switch (errorCode) {
		case 'INCAPACITY_EMPLOYEE_REQUIRED':
			return t('toast.errors.employeeRequired');
		case 'INCAPACITY_EMPLOYEE_NOT_FOUND':
			return t('toast.errors.employeeNotFound');
		case 'INCAPACITY_INVALID_RANGE':
			return t('toast.errors.invalidRange');
		case 'INCAPACITY_SAT_MISMATCH':
			return t('toast.errors.satMismatch');
		case 'INCAPACITY_BUCKET_NOT_CONFIGURED':
			return t('toast.errors.bucketNotConfigured');
		case 'INCAPACITY_DOCUMENT_INVALID':
			return t('toast.errors.documentInvalid');
		case 'INCAPACITY_DOCUMENT_NOT_FOUND':
			return t('toast.errors.documentNotFound');
		case 'BAD_REQUEST':
			return t('toast.errors.badRequest');
		case 'UNAUTHORIZED':
			return t('toast.errors.unauthorized');
		case 'FORBIDDEN':
			return t('toast.errors.forbidden');
		case 'NOT_FOUND':
			return t('toast.errors.notFound');
		case 'CONFLICT':
			return t('toast.errors.conflict');
		default:
			return t(fallbackKey);
	}
}

/**
 * Incapacities management page for HR/admin workflows.
 *
 * @returns Incapacities page client component
 */
export function IncapacitiesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const { data: session } = useSession();
	const isAdminUser =
		session?.user?.role === 'admin' ||
		userRole === 'admin' ||
		organizationRole === 'admin' ||
		organizationRole === 'owner';
	const t = useTranslations('Incapacities');

	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [fromDate, setFromDate] = useState<string>('');
	const [toDate, setToDate] = useState<string>('');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(ALL_EMPLOYEES_VALUE);
	const [selectedType, setSelectedType] = useState<string>(ALL_TYPES_VALUE);
	const [selectedStatus, setSelectedStatus] = useState<string>(ALL_STATUS_VALUE);
	const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
	const [editingRecord, setEditingRecord] = useState<IncapacityRecord | null>(null);
	const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
	const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null);

	/**
	 * Resets pagination to the first page.
	 *
	 * @returns void
	 */
	const resetPagination = useCallback((): void => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	/**
	 * Updates the global search filter and resets pagination.
	 *
	 * @param value - Next filter value
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates column filters and resets pagination.
	 *
	 * @param updater - Column filter updater
	 * @returns void
	 */
	const handleColumnFiltersChange = useCallback(
		(updater: React.SetStateAction<ColumnFiltersState>): void => {
			setColumnFilters((prev) => (typeof updater === 'function' ? updater(prev) : updater));
			resetPagination();
		},
		[resetPagination],
	);

	const requestParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			organizationId: organizationId ?? undefined,
			search: globalFilter.trim() ? globalFilter.trim() : undefined,
			employeeId: selectedEmployeeId !== ALL_EMPLOYEES_VALUE ? selectedEmployeeId : undefined,
			type: selectedType !== ALL_TYPES_VALUE ? (selectedType as IncapacityType) : undefined,
			status:
				selectedStatus !== ALL_STATUS_VALUE
					? (selectedStatus as IncapacityStatus)
					: undefined,
			from: fromDate || undefined,
			to: toDate || undefined,
		}),
		[
			fromDate,
			globalFilter,
			organizationId,
			pagination.pageIndex,
			pagination.pageSize,
			selectedEmployeeId,
			selectedStatus,
			selectedType,
			toDate,
		],
	);

	const {
		data: incapacityResponse,
		isFetching,
		refetch,
	} = useQuery({
		queryKey: queryKeys.incapacities.list(requestParams),
		queryFn: () => fetchIncapacitiesList(requestParams),
		enabled: Boolean(organizationId),
	});

	const records = incapacityResponse?.data ?? [];
	const totalRows = incapacityResponse?.pagination.total ?? 0;

	const employeesQuery = useQuery({
		queryKey: queryKeys.employees.list({
			limit: 100,
			offset: 0,
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () =>
			fetchEmployeesList({
				limit: 100,
				offset: 0,
				organizationId: organizationId ?? undefined,
			}),
		enabled: Boolean(organizationId),
	});

	const employees = employeesQuery.data?.data ?? [];

	const createForm = useAppForm({
		defaultValues: {
			employeeId: '',
			caseId: '',
			type: 'EG' as IncapacityType,
			startDateKey: '',
			endDateKey: '',
			daysAuthorized: 1,
			certificateFolio: '',
			issuedBy: 'IMSS',
			sequence: 'inicial',
			percentOverride: '',
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				toast.error(t('toast.noOrganization'));
				return;
			}
			if (!value.employeeId) {
				toast.error(t('form.validation.employeeRequired'));
				return;
			}
			if (!value.caseId.trim()) {
				toast.error(t('form.validation.caseIdRequired'));
				return;
			}
			if (!value.startDateKey) {
				toast.error(t('form.validation.startDateRequired'));
				return;
			}
			if (!value.endDateKey) {
				toast.error(t('form.validation.endDateRequired'));
				return;
			}
			if (value.endDateKey < value.startDateKey) {
				toast.error(t('form.validation.dateRange'));
				return;
			}

			const daysAuthorized = Number(value.daysAuthorized);
			if (!Number.isFinite(daysAuthorized) || daysAuthorized <= 0) {
				toast.error(t('form.validation.daysAuthorizedInvalid'));
				return;
			}

			let percentOverrideValue: number | null = null;
			if (value.percentOverride) {
				const numericOverride = Number(value.percentOverride);
				if (
					!Number.isFinite(numericOverride) ||
					numericOverride < 0 ||
					numericOverride > 1
				) {
					toast.error(t('form.validation.percentOverrideInvalid'));
					return;
				}
				percentOverrideValue = numericOverride;
			}

			await createMutation.mutateAsync({
				employeeId: value.employeeId,
				caseId: value.caseId.trim(),
				type: value.type,
				startDateKey: value.startDateKey,
				endDateKey: value.endDateKey,
				daysAuthorized,
				certificateFolio: value.certificateFolio?.trim() || undefined,
				issuedBy: value.issuedBy as IncapacityIssuedBy,
				sequence: value.sequence as IncapacitySequence,
				percentOverride: percentOverrideValue,
			});
		},
	});

	const editForm = useAppForm({
		defaultValues: {
			id: '',
			employeeId: '',
			caseId: '',
			type: 'EG' as IncapacityType,
			startDateKey: '',
			endDateKey: '',
			daysAuthorized: 1,
			certificateFolio: '',
			issuedBy: 'IMSS',
			sequence: 'inicial',
			percentOverride: '',
			status: 'ACTIVE' as IncapacityStatus,
		},
		onSubmit: async ({ value }) => {
			if (!editingRecord) {
				return;
			}
			if (!value.caseId.trim()) {
				toast.error(t('form.validation.caseIdRequired'));
				return;
			}
			if (!value.startDateKey || !value.endDateKey) {
				toast.error(t('form.validation.dateRange'));
				return;
			}
			if (value.endDateKey < value.startDateKey) {
				toast.error(t('form.validation.dateRange'));
				return;
			}

			const daysAuthorized = Number(value.daysAuthorized);
			if (!Number.isFinite(daysAuthorized) || daysAuthorized <= 0) {
				toast.error(t('form.validation.daysAuthorizedInvalid'));
				return;
			}

			let percentOverrideValue: number | null = null;
			if (value.percentOverride) {
				const numericOverride = Number(value.percentOverride);
				if (
					!Number.isFinite(numericOverride) ||
					numericOverride < 0 ||
					numericOverride > 1
				) {
					toast.error(t('form.validation.percentOverrideInvalid'));
					return;
				}
				percentOverrideValue = numericOverride;
			}

			await updateMutation.mutateAsync({
				id: editingRecord.id,
				employeeId: editingRecord.employeeId,
				caseId: value.caseId.trim(),
				type: value.type,
				startDateKey: value.startDateKey,
				endDateKey: value.endDateKey,
				daysAuthorized,
				certificateFolio: value.certificateFolio?.trim() || undefined,
				issuedBy: value.issuedBy as IncapacityIssuedBy,
				sequence: value.sequence as IncapacitySequence,
				percentOverride: percentOverrideValue,
				status: value.status,
			});
		},
	});

	useEffect(() => {
		if (!editingRecord) {
			return;
		}
		editForm.reset({
			id: editingRecord.id,
			employeeId: editingRecord.employeeId,
			caseId: editingRecord.caseId,
			type: editingRecord.type,
			startDateKey: editingRecord.startDateKey,
			endDateKey: editingRecord.endDateKey,
			daysAuthorized: editingRecord.daysAuthorized,
			certificateFolio: editingRecord.certificateFolio ?? '',
			issuedBy: editingRecord.issuedBy,
			sequence: editingRecord.sequence,
			percentOverride:
				editingRecord.percentOverride !== null &&
				editingRecord.percentOverride !== undefined
					? String(editingRecord.percentOverride)
					: '',
			status: editingRecord.status,
		});
	}, [editingRecord, editForm]);

	const createMutation = useMutation({
		mutationKey: mutationKeys.incapacities.create,
		mutationFn: createIncapacityAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.incapacities.all });
				setIsCreateOpen(false);
				createForm.reset();
			} else {
				toast.error(getIncapacityErrorMessage(t, result.errorCode, 'toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.incapacities.update,
		mutationFn: updateIncapacityAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.incapacities.all });
				setEditingRecord(result.data ?? null);
			} else {
				toast.error(getIncapacityErrorMessage(t, result.errorCode, 'toast.updateError'));
			}
		},
		onError: () => toast.error(t('toast.updateError')),
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.incapacities.cancel,
		mutationFn: cancelIncapacityAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.cancelSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.incapacities.all });
				setEditingRecord(result.data ?? null);
			} else {
				toast.error(getIncapacityErrorMessage(t, result.errorCode, 'toast.cancelError'));
			}
		},
		onError: () => toast.error(t('toast.cancelError')),
	});

	const handleDocumentUpload = useCallback(
		async (record: IncapacityRecord, file: File): Promise<void> => {
			setUploadingDocumentId(record.id);
			try {
				if (file.size > MAX_UPLOAD_BYTES) {
					toast.error(t('documents.errors.sizeExceeded'));
					return;
				}
				if (!file.type || !ALLOWED_UPLOAD_TYPES.has(file.type)) {
					toast.error(t('documents.errors.invalidType'));
					return;
				}

				const sha256 = await computeFileSha256(file);
				const presignResult = await presignIncapacityDocumentAction({
					incapacityId: record.id,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
				});
				if (!presignResult.success || !presignResult.data) {
					toast.error(
						getIncapacityErrorMessage(
							t,
							presignResult.errorCode,
							'toast.documentPresignError',
						),
					);
					return;
				}

				const formData = new FormData();
				Object.entries(presignResult.data.fields).forEach(([key, value]) => {
					formData.append(key, value);
				});
				formData.append('file', file);

				let uploadResponse: Response | null = null;
				try {
					uploadResponse = await fetch(presignResult.data.url, {
						method: 'POST',
						body: formData,
					});
				} catch (error) {
					if (error instanceof TypeError) {
						try {
							uploadResponse = await fetch(presignResult.data.url, {
								method: 'POST',
								body: formData,
								mode: 'no-cors',
							});
						} catch (fallbackError) {
							console.error('[incapacities] upload failed', fallbackError);
							toast.error(t('toast.documentUploadNetworkError'));
							return;
						}
					} else {
						throw error;
					}
				}

				if (uploadResponse && uploadResponse.type !== 'opaque' && !uploadResponse.ok) {
					toast.error(t('toast.documentUploadError'));
					return;
				}

				setProcessingDocumentId(record.id);
				let confirmResult = await confirmIncapacityDocumentAction({
					incapacityId: record.id,
					documentId: presignResult.data.documentId,
					objectKey: presignResult.data.objectKey,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
					sha256,
				});

				if (!confirmResult.success && shouldRetryConfirm(confirmResult.errorCode)) {
					for (const delay of CONFIRM_RETRY_DELAYS_MS) {
						await sleep(delay);
						confirmResult = await confirmIncapacityDocumentAction({
							incapacityId: record.id,
							documentId: presignResult.data.documentId,
							objectKey: presignResult.data.objectKey,
							fileName: file.name,
							contentType: file.type,
							sizeBytes: file.size,
							sha256,
						});
						if (confirmResult.success) {
							break;
						}
						if (!shouldRetryConfirm(confirmResult.errorCode)) {
							break;
						}
					}
				}

				if (confirmResult.success) {
					if (confirmResult.data) {
						const normalizedDocument = normalizeIncapacityDocument(confirmResult.data);
						setEditingRecord((prev) => {
							if (!prev || prev.id !== record.id) {
								return prev;
							}
							const exists = prev.documents.some(
								(document) => document.id === normalizedDocument.id,
							);
							return exists
								? prev
								: {
										...prev,
										documents: [...prev.documents, normalizedDocument],
									};
						});
					}
					toast.success(t('toast.documentUploadSuccess'));
					queryClient.invalidateQueries({ queryKey: queryKeys.incapacities.all });
				} else {
					toast.error(
						getIncapacityErrorMessage(
							t,
							confirmResult.errorCode,
							'toast.documentUploadError',
						),
					);
				}
			} catch (error) {
				console.error('[incapacities] upload failed', error);
				toast.error(t('toast.documentUploadError'));
			} finally {
				setProcessingDocumentId(null);
				setUploadingDocumentId(null);
			}
		},
		[queryClient, t],
	);

	const handleDocumentView = useCallback(
		async (record: IncapacityRecord, documentId: string): Promise<void> => {
			const result = await getIncapacityDocumentUrlAction({
				incapacityId: record.id,
				documentId,
			});
			if (!result.success || !result.data) {
				toast.error(
					getIncapacityErrorMessage(t, result.errorCode, 'toast.documentFetchError'),
				);
				return;
			}
			window.open(result.data.url, '_blank', 'noopener,noreferrer');
		},
		[t],
	);

	const columns = useMemo<ColumnDef<IncapacityRecord>[]>(
		() => [
			{
				accessorKey: 'employeeName',
				header: t('table.headers.employee'),
				cell: ({ row }) => (
					<div className="min-w-[180px]">
						<p className="truncate font-medium">
							{row.original.employeeName} {row.original.employeeLastName}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{row.original.employeeId}
						</p>
					</div>
				),
			},
			{
				accessorKey: 'type',
				header: t('table.headers.type'),
				cell: ({ row }) => (
					<Badge variant={typeVariants[row.original.type]}>
						{t(`type.${row.original.type}`)}
					</Badge>
				),
			},
			{
				accessorKey: 'period',
				header: t('table.headers.period'),
				cell: ({ row }) =>
					formatDateRangeUtc(
						toUtcDate(row.original.startDateKey),
						toUtcDate(row.original.endDateKey),
					),
			},
			{
				accessorKey: 'daysAuthorized',
				header: t('table.headers.days'),
				cell: ({ row }) => row.original.daysAuthorized,
			},
			{
				accessorKey: 'caseId',
				header: t('table.headers.folio'),
				cell: ({ row }) => (
					<div className="min-w-[140px] font-mono text-xs">
						<p className="truncate">{row.original.caseId}</p>
						{row.original.certificateFolio ? (
							<p className="truncate text-muted-foreground">
								{row.original.certificateFolio}
							</p>
						) : null}
					</div>
				),
			},
			{
				accessorKey: 'status',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge variant={statusVariants[row.original.status]}>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditingRecord(row.original)}
						>
							{t('table.actions.view')}
						</Button>
					</div>
				),
			},
		],
		[t],
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-start justify-between">
					<div>
						<CardTitle>{t('title')}</CardTitle>
						<CardDescription>{t('subtitle')}</CardDescription>
					</div>
					<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
						<DialogTrigger asChild>
							<Button>{t('actions.create')}</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-2xl">
							<DialogHeader>
								<DialogTitle>{t('form.title')}</DialogTitle>
								<DialogDescription>{t('form.description')}</DialogDescription>
							</DialogHeader>
							<createForm.AppForm>
								<form
									onSubmit={(event) => {
										event.preventDefault();
										event.stopPropagation();
										createForm.handleSubmit();
									}}
								>
									<div className="grid gap-4 md:grid-cols-2">
										<createForm.AppField
											name="employeeId"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('form.validation.employeeRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.SelectField
													label={t('form.fields.employee')}
													placeholder={t('form.placeholders.employee')}
													options={employees.map((emp) => ({
														label: `${emp.firstName} ${emp.lastName}`,
														value: emp.id,
													}))}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField
											name="caseId"
											validators={{
												onChange: ({ value }) =>
													!value || !value.trim()
														? t('form.validation.caseIdRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField
													label={t('form.fields.caseId')}
													placeholder={t('form.placeholders.caseId')}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField name="type">
											{(field) => (
												<field.SelectField
													label={t('form.fields.type')}
													placeholder={t('form.placeholders.type')}
													options={[
														{ label: t('type.EG'), value: 'EG' },
														{ label: t('type.RT'), value: 'RT' },
														{ label: t('type.MAT'), value: 'MAT' },
														{
															label: t('type.LIC140BIS'),
															value: 'LIC140BIS',
														},
													]}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField
											name="startDateKey"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('form.validation.startDateRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.DateField label={t('form.fields.startDate')} />
											)}
										</createForm.AppField>
										<createForm.AppField
											name="endDateKey"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('form.validation.endDateRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.DateField label={t('form.fields.endDate')} />
											)}
										</createForm.AppField>
										<createForm.AppField
											name="daysAuthorized"
											validators={{
												onChange: ({ value }) => {
													const numericValue = Number(value);
													return !Number.isFinite(numericValue) ||
														numericValue <= 0
														? t('form.validation.daysAuthorizedInvalid')
														: undefined;
												},
											}}
										>
											{(field) => (
												<field.TextField
													label={t('form.fields.daysAuthorized')}
													type="number"
												/>
											)}
										</createForm.AppField>
										<createForm.AppField name="certificateFolio">
											{(field) => (
												<field.TextField
													label={t('form.fields.certificateFolio')}
													placeholder={t('form.placeholders.certificateFolio')}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField name="issuedBy">
											{(field) => (
												<field.SelectField
													label={t('form.fields.issuedBy')}
													options={[
														{ label: t('issuedBy.IMSS'), value: 'IMSS' },
														{
															label: t('issuedBy.recognized_by_IMSS'),
															value: 'recognized_by_IMSS',
														},
													]}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField name="sequence">
											{(field) => (
												<field.SelectField
													label={t('form.fields.sequence')}
													options={[
														{
															label: t('sequence.inicial'),
															value: 'inicial',
														},
														{
															label: t('sequence.subsecuente'),
															value: 'subsecuente',
														},
														{
															label: t('sequence.recaida'),
															value: 'recaida',
														},
													]}
												/>
											)}
										</createForm.AppField>
										<createForm.AppField
											name="percentOverride"
											validators={{
												onChange: ({ value }) => {
													if (!value) {
														return undefined;
													}
													const numericValue = Number(value);
													return !Number.isFinite(numericValue) ||
														numericValue < 0 ||
														numericValue > 1
														? t('form.validation.percentOverrideInvalid')
														: undefined;
												},
											}}
										>
											{(field) => (
												<field.TextField
													label={t('form.fields.percentOverride')}
													placeholder={t('form.placeholders.percentOverride')}
												/>
											)}
										</createForm.AppField>
									</div>
									<DialogFooter className="mt-4 flex flex-col items-end gap-2">
										<createForm.SubmitButton
											label={t('form.actions.submit')}
											loadingLabel={t('form.actions.submitting')}
										/>
										<createForm.Subscribe selector={(state) => [state.canSubmit]}>
											{([canSubmit]) =>
												canSubmit ? null : (
													<p className="text-xs text-muted-foreground">
														{t('form.helper')}
													</p>
												)
											}
										</createForm.Subscribe>
									</DialogFooter>
								</form>
							</createForm.AppForm>
						</DialogContent>
					</Dialog>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<div className="relative w-full max-w-xs">
							<Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder={t('filters.search')}
								value={globalFilter}
								onChange={(event) => handleGlobalFilterChange(event.target.value)}
								className="pl-9"
							/>
						</div>
						<Select
							value={selectedEmployeeId}
							onValueChange={(value) => {
								setSelectedEmployeeId(value);
								resetPagination();
							}}
						>
							<SelectTrigger className="w-[220px]">
								<SelectValue placeholder={t('filters.employee')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_EMPLOYEES_VALUE}>
									{t('filters.allEmployees')}
								</SelectItem>
								{employees.map((emp) => (
									<SelectItem key={emp.id} value={emp.id}>
										{emp.firstName} {emp.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={selectedType}
							onValueChange={(value) => {
								setSelectedType(value);
								resetPagination();
							}}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t('filters.type')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_TYPES_VALUE}>
									{t('filters.allTypes')}
								</SelectItem>
								<SelectItem value="EG">{t('type.EG')}</SelectItem>
								<SelectItem value="RT">{t('type.RT')}</SelectItem>
								<SelectItem value="MAT">{t('type.MAT')}</SelectItem>
								<SelectItem value="LIC140BIS">{t('type.LIC140BIS')}</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={selectedStatus}
							onValueChange={(value) => {
								setSelectedStatus(value);
								resetPagination();
							}}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t('filters.status')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_STATUS_VALUE}>
									{t('filters.allStatus')}
								</SelectItem>
								<SelectItem value="ACTIVE">{t('status.ACTIVE')}</SelectItem>
								<SelectItem value="CANCELLED">{t('status.CANCELLED')}</SelectItem>
							</SelectContent>
						</Select>
						<div className="flex items-center gap-2">
							<div className="relative">
								<CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									type="date"
									value={fromDate}
									onChange={(event) => {
										setFromDate(event.target.value);
										resetPagination();
									}}
									className="pl-9"
									aria-label={t('filters.from')}
								/>
							</div>
							<div className="relative">
								<CalendarIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									type="date"
									value={toDate}
									onChange={(event) => {
										setToDate(event.target.value);
										resetPagination();
									}}
									className="pl-9"
									aria-label={t('filters.to')}
								/>
							</div>
						</div>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							<RefreshCw className="mr-2 h-4 w-4" />
							{t('actions.refresh')}
						</Button>
					</div>
					<DataTable
						columns={columns}
						data={records}
						sorting={sorting}
						onSortingChange={setSorting}
						pagination={pagination}
						onPaginationChange={setPagination}
						columnFilters={columnFilters}
						onColumnFiltersChange={handleColumnFiltersChange}
						globalFilter={globalFilter}
						onGlobalFilterChange={handleGlobalFilterChange}
						showToolbar={false}
						manualPagination
						manualFiltering
						rowCount={totalRows}
						emptyState={t('table.empty')}
						isLoading={isFetching}
					/>
				</CardContent>
			</Card>

			<Dialog
				open={Boolean(editingRecord)}
				onOpenChange={(open) => !open && setEditingRecord(null)}
			>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{t('detail.title')}</DialogTitle>
						<DialogDescription>{t('detail.description')}</DialogDescription>
					</DialogHeader>
					{editingRecord ? (
						<div className="space-y-6">
							<div className="grid gap-4 md:grid-cols-2">
								<div>
									<p className="text-sm text-muted-foreground">
										{t('detail.labels.employee')}
									</p>
									<p className="font-medium">
										{editingRecord.employeeName}{' '}
										{editingRecord.employeeLastName}
									</p>
									<p className="text-xs text-muted-foreground">
										{editingRecord.employeeId}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">
										{t('detail.labels.period')}
									</p>
									<p className="font-medium">
										{formatDateRangeUtc(
											toUtcDate(editingRecord.startDateKey),
											toUtcDate(editingRecord.endDateKey),
										)}
									</p>
								</div>
							</div>

							<editForm.AppForm>
								<form
									onSubmit={(event) => {
										event.preventDefault();
										event.stopPropagation();
										editForm.handleSubmit();
									}}
								>
									<div className="grid gap-4 md:grid-cols-2">
										<editForm.AppField
											name="caseId"
											validators={{
												onChange: ({ value }) =>
													!value || !value.trim()
														? t('form.validation.caseIdRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField label={t('form.fields.caseId')} />
											)}
										</editForm.AppField>
										<editForm.AppField name="type">
											{(field) => (
												<field.SelectField
													label={t('form.fields.type')}
													options={[
														{ label: t('type.EG'), value: 'EG' },
														{ label: t('type.RT'), value: 'RT' },
														{ label: t('type.MAT'), value: 'MAT' },
														{
															label: t('type.LIC140BIS'),
															value: 'LIC140BIS',
														},
													]}
												/>
											)}
										</editForm.AppField>
										<editForm.AppField
											name="startDateKey"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('form.validation.startDateRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.DateField label={t('form.fields.startDate')} />
											)}
										</editForm.AppField>
										<editForm.AppField
											name="endDateKey"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('form.validation.endDateRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.DateField label={t('form.fields.endDate')} />
											)}
										</editForm.AppField>
										<editForm.AppField
											name="daysAuthorized"
											validators={{
												onChange: ({ value }) => {
													const numericValue = Number(value);
													return !Number.isFinite(numericValue) ||
														numericValue <= 0
														? t('form.validation.daysAuthorizedInvalid')
														: undefined;
												},
											}}
										>
											{(field) => (
												<field.TextField
													label={t('form.fields.daysAuthorized')}
													type="number"
												/>
											)}
										</editForm.AppField>
										<editForm.AppField name="certificateFolio">
											{(field) => (
												<field.TextField
													label={t('form.fields.certificateFolio')}
												/>
											)}
										</editForm.AppField>
										<editForm.AppField name="issuedBy">
											{(field) => (
												<field.SelectField
													label={t('form.fields.issuedBy')}
													options={[
														{ label: t('issuedBy.IMSS'), value: 'IMSS' },
														{
															label: t('issuedBy.recognized_by_IMSS'),
															value: 'recognized_by_IMSS',
														},
													]}
												/>
											)}
										</editForm.AppField>
										<editForm.AppField name="sequence">
											{(field) => (
												<field.SelectField
													label={t('form.fields.sequence')}
													options={[
														{
															label: t('sequence.inicial'),
															value: 'inicial',
														},
														{
															label: t('sequence.subsecuente'),
															value: 'subsecuente',
														},
														{
															label: t('sequence.recaida'),
															value: 'recaida',
														},
													]}
												/>
											)}
										</editForm.AppField>
										<editForm.AppField
											name="percentOverride"
											validators={{
												onChange: ({ value }) => {
													if (!value) {
														return undefined;
													}
													const numericValue = Number(value);
													return !Number.isFinite(numericValue) ||
														numericValue < 0 ||
														numericValue > 1
														? t('form.validation.percentOverrideInvalid')
														: undefined;
												},
											}}
										>
											{(field) => (
												<field.TextField
													label={t('form.fields.percentOverride')}
													placeholder={t('form.placeholders.percentOverride')}
												/>
											)}
										</editForm.AppField>
										<editForm.AppField name="status">
											{(field) => (
												<field.SelectField
													label={t('form.fields.status')}
													options={[
														{ label: t('status.ACTIVE'), value: 'ACTIVE' },
														{
															label: t('status.CANCELLED'),
															value: 'CANCELLED',
														},
													]}
												/>
											)}
										</editForm.AppField>
									</div>
									<DialogFooter className="mt-4 flex flex-col items-end gap-2">
										<editForm.SubmitButton
											label={t('actions.update')}
											loadingLabel={t('actions.updating')}
										/>
										<editForm.Subscribe selector={(state) => [state.canSubmit]}>
											{([canSubmit]) =>
												canSubmit ? null : (
													<p className="text-xs text-muted-foreground">
														{t('form.helper')}
													</p>
												)
											}
										</editForm.Subscribe>
									</DialogFooter>
								</form>
							</editForm.AppForm>

							<div className="space-y-3 rounded-lg border p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="font-medium">{t('documents.title')}</p>
										<p className="text-sm text-muted-foreground">
											{t('documents.description')}
										</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										disabled={
											uploadingDocumentId === editingRecord.id ||
											processingDocumentId === editingRecord.id
										}
										asChild
									>
										<label>
											<FileUp className="mr-2 h-4 w-4" />
											{uploadingDocumentId === editingRecord.id ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t('documents.uploading')}
												</>
											) : processingDocumentId === editingRecord.id ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t('documents.processing')}
												</>
											) : (
												t('documents.upload')
											)}
											<input
												type="file"
												className="hidden"
												accept="application/pdf,image/png,image/jpeg"
												onChange={(event) => {
													const file = event.target.files?.[0];
													if (!file) {
														return;
													}
													void handleDocumentUpload(editingRecord, file);
													// reset input to allow re-uploading same file
													event.currentTarget.value = '';
												}}
											/>
										</label>
									</Button>
								</div>
								{editingRecord.documents.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										{t('documents.empty')}
									</p>
								) : (
									<div className="max-h-64 overflow-y-auto rounded-md border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>{t('documents.table.file')}</TableHead>
													<TableHead>
														{t('documents.table.uploadedAt')}
													</TableHead>
													<TableHead>
														{t('documents.table.actions')}
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{editingRecord.documents.map((doc) => (
													<TableRow key={doc.id}>
														<TableCell className="font-medium">
															{doc.fileName}
														</TableCell>
														<TableCell>
															{formatShortDateUtc(doc.uploadedAt)}
														</TableCell>
														<TableCell>
															<Button
																variant="outline"
																size="sm"
																onClick={() =>
																	handleDocumentView(
																		editingRecord,
																		doc.id,
																	)
																}
															>
																{t('documents.actions.view')}
															</Button>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</div>
							{isAdminUser ? (
								<div className="flex justify-end">
									<Button
										variant="destructive"
										disabled={editingRecord.status === 'CANCELLED'}
										onClick={() => cancelMutation.mutate({ id: editingRecord.id })}
									>
										{t('actions.cancel')}
									</Button>
								</div>
							) : null}
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
