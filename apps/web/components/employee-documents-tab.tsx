'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Eye, FileSignature, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
	EmployeeDocumentRequirementKey,
	EmployeeDocumentReviewStatus,
	EmploymentProfileSubtype,
	IdentificationSubtype,
	LegalDocumentKind,
} from '@sen-checkin/types';

import {
	confirmEmployeeDocumentAction,
	confirmEmployeeLegalPhysicalAction,
	generateEmployeeLegalDocumentAction,
	presignEmployeeDocumentAction,
	presignEmployeeLegalPhysicalAction,
	reviewEmployeeDocumentAction,
	signEmployeeLegalDigitalAction,
	type DocumentMutationResult,
} from '@/actions/employee-documents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	fetchEmployeeDocumentUrl,
	fetchEmployeeDocumentsHistory,
	fetchEmployeeDocumentsSummary,
	type EmployeeDocumentVersionRecord,
} from '@/lib/client-functions';
import { formatShortDateUtc } from '@/lib/date-format';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const SignatureCanvasDialog = dynamic(
	() =>
		import('@/components/signature-canvas-dialog').then(
			(module) => module.SignatureCanvasDialog,
		),
	{
		ssr: false,
		loading: () => null,
	},
);

const ALLOWED_UPLOAD_TYPES = new Set<string>(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Component props for the employee documents tab.
 */
export interface EmployeeDocumentsTabProps {
	/** Employee identifier. */
	employeeId: string;
}

interface LegalGenerationPayload {
	generation?: { id?: string };
	renderedHtml?: string;
}

/**
 * Converts a Date to YYYY-MM-DD.
 *
 * @returns Date key for today's date
 */
function getTodayDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Converts a file into a SHA-256 hash.
 *
 * @param file - File to hash
 * @returns Hex digest
 */
async function computeFileSha256(file: File): Promise<string> {
	const buffer = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Uploads a file using presigned POST fields.
 *
 * @param args - Presigned target and file payload
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

	let uploadResponse: Response | null = null;
	try {
		uploadResponse = await fetch(args.url, {
			method: 'POST',
			body: formData,
		});
	} catch (error) {
		if (!(error instanceof TypeError)) {
			throw error;
		}
		uploadResponse = await fetch(args.url, {
			method: 'POST',
			mode: 'no-cors',
			body: formData,
		});
	}

	if (uploadResponse.type !== 'opaque' && !uploadResponse.ok) {
		throw new Error(`Upload failed: ${uploadResponse.status}`);
	}
}

/**
 * Resolves UI badge style for a document review status.
 *
 * @param status - Review status
 * @returns Badge variant
 */
function getStatusVariant(
	status: EmployeeDocumentReviewStatus | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (status === 'APPROVED') {
		return 'default';
	}
	if (status === 'REJECTED') {
		return 'destructive';
	}
	if (status === 'PENDING_REVIEW') {
		return 'secondary';
	}
	return 'outline';
}

/**
 * Resolves icon for a document requirement status.
 *
 * @param status - Requirement status
 * @returns Icon element
 */
function getStatusIcon(status: EmployeeDocumentReviewStatus | null | undefined): React.ReactElement {
	if (status === 'APPROVED') {
		return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
	}
	if (status === 'REJECTED') {
		return <XCircle className="h-4 w-4 text-rose-600" />;
	}
	if (status === 'PENDING_REVIEW') {
		return <AlertCircle className="h-4 w-4 text-amber-600" />;
	}
	return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Extracts legal generation payload from mutation result.
 *
 * @param result - Mutation result
 * @returns Parsed payload or null
 */
function extractLegalGenerationPayload(
	result: DocumentMutationResult<Record<string, unknown>>,
): LegalGenerationPayload | null {
	if (!result.success || !result.data) {
		return null;
	}

	const data = result.data as {
		generation?: { id?: string };
		renderedHtml?: string;
	};

	return {
		generation: data.generation,
		renderedHtml: data.renderedHtml,
	};
}

/**
 * Returns legal kind from requirement key.
 *
 * @param requirementKey - Requirement key
 * @returns Kind for legal requirements or null
 */
function resolveLegalKindForRequirement(
	requirementKey: EmployeeDocumentRequirementKey,
): LegalDocumentKind | null {
	if (requirementKey === 'SIGNED_CONTRACT') {
		return 'CONTRACT';
	}
	if (requirementKey === 'SIGNED_NDA') {
		return 'NDA';
	}
	return null;
}

/**
 * Employee documents checklist and legal workflow tab.
 *
 * @param props - Component props
 * @returns Documents tab UI
 */
export function EmployeeDocumentsTab({ employeeId }: EmployeeDocumentsTabProps): React.ReactElement {
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const { organizationRole } = useOrgContext();

	const canAdminReview = organizationRole === 'owner' || organizationRole === 'admin';
	const canCreateInitialUpload = Boolean(
		canAdminReview || organizationRole === 'member',
	);

	const [historyFilter, setHistoryFilter] = useState<EmployeeDocumentRequirementKey | 'ALL'>('ALL');
	const [uploadingRequirementKey, setUploadingRequirementKey] = useState<string | null>(null);
	const [activeSignatureKind, setActiveSignatureKind] = useState<LegalDocumentKind | null>(null);
	const [isSigningDigital, setIsSigningDigital] = useState<boolean>(false);
	const [legalPreviewByKind, setLegalPreviewByKind] = useState<
		Partial<Record<LegalDocumentKind, string>>
	>({});
	const [identificationSubtype, setIdentificationSubtype] = useState<IdentificationSubtype>('INE');
	const [employmentProfileSubtype, setEmploymentProfileSubtype] =
		useState<EmploymentProfileSubtype>('CURRICULUM');

	const summaryQuery = useQuery({
		queryKey: queryKeys.employees.documentsSummary(employeeId),
		queryFn: () => fetchEmployeeDocumentsSummary(employeeId),
		enabled: Boolean(employeeId),
	});

	const historyQuery = useQuery({
		queryKey: queryKeys.employees.documentsHistory({
			employeeId,
			limit: 50,
			offset: 0,
			requirementKey: historyFilter === 'ALL' ? undefined : historyFilter,
		}),
		queryFn: () =>
			fetchEmployeeDocumentsHistory({
				employeeId,
				limit: 50,
				offset: 0,
				requirementKey: historyFilter === 'ALL' ? undefined : historyFilter,
			}),
		enabled: Boolean(employeeId),
	});

	const reviewMutation = useMutation({
		mutationKey: mutationKeys.employeeDocuments.review,
		mutationFn: reviewEmployeeDocumentAction,
	});

	const generateMutation = useMutation({
		mutationKey: mutationKeys.employeeDocuments.generateLegal,
		mutationFn: generateEmployeeLegalDocumentAction,
	});

	const invalidateDocuments = useCallback(async (): Promise<void> => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.employees.documentsSummary(employeeId) }),
			queryClient.invalidateQueries({
				queryKey: queryKeys.employees.documentsHistory({
					employeeId,
					limit: 50,
					offset: 0,
					requirementKey: historyFilter === 'ALL' ? undefined : historyFilter,
				}),
			}),
			queryClient.invalidateQueries({ queryKey: queryKeys.employees.all }),
		]);
	}, [employeeId, historyFilter, queryClient]);

	/**
	 * Returns translation key for requirement labels.
	 *
	 * @param requirementKey - Requirement key
	 * @returns Translation key suffix
	 */
	const getRequirementLabelKey = useCallback(
		(requirementKey: EmployeeDocumentRequirementKey): string =>
			`documents.requirements.${requirementKey}.title`,
		[],
	);

	/**
	 * Opens a stored document in a new tab.
	 *
	 * @param docVersionId - Document version identifier
	 * @returns Nothing
	 */
	const handleOpenDocument = useCallback(
		async (docVersionId: string): Promise<void> => {
			try {
				const url = await fetchEmployeeDocumentUrl({ employeeId, docVersionId });
				if (!url) {
					toast.error(t('documents.toast.viewError'));
					return;
				}
				window.open(url, '_blank', 'noopener,noreferrer');
			} catch (error) {
				console.error('[employee-documents] failed to open document', error);
				toast.error(t('documents.toast.viewError'));
			}
		},
		[employeeId, t],
	);

	/**
	 * Uploads and confirms a document requirement version.
	 *
	 * @param requirementKey - Requirement key
	 * @param file - File to upload
	 * @returns Nothing
	 */
	const handleUploadRequirement = useCallback(
		async (requirementKey: EmployeeDocumentRequirementKey, file: File): Promise<void> => {
			if (!canCreateInitialUpload) {
				toast.error(t('documents.toast.uploadForbidden'));
				return;
			}
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(t('documents.toast.invalidSize'));
				return;
			}
			if (!file.type || !ALLOWED_UPLOAD_TYPES.has(file.type)) {
				toast.error(t('documents.toast.invalidType'));
				return;
			}

			setUploadingRequirementKey(requirementKey);
			try {
				const sha256 = await computeFileSha256(file);
				const presignResult = await presignEmployeeDocumentAction({
					employeeId,
					requirementKey,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
				});
				if (!presignResult.success || !presignResult.data) {
					toast.error(presignResult.error ?? t('documents.toast.uploadError'));
					return;
				}

				await uploadToPresignedPost({
					url: presignResult.data.url,
					fields: presignResult.data.fields,
					file,
				});

				const confirmResult = await confirmEmployeeDocumentAction({
					employeeId,
					requirementKey,
					docVersionId: presignResult.data.docVersionId,
					objectKey: presignResult.data.objectKey,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
					sha256,
					identificationSubtype:
						requirementKey === 'IDENTIFICATION' ? identificationSubtype : undefined,
					employmentProfileSubtype:
						requirementKey === 'EMPLOYMENT_PROFILE'
							? employmentProfileSubtype
							: undefined,
				});

				if (!confirmResult.success) {
					toast.error(confirmResult.error ?? t('documents.toast.uploadError'));
					return;
				}

				toast.success(t('documents.toast.uploadSuccess'));
				await invalidateDocuments();
			} catch (error) {
				console.error('[employee-documents] upload requirement failed', error);
				toast.error(t('documents.toast.uploadError'));
			} finally {
				setUploadingRequirementKey(null);
			}
		},
		[
			canCreateInitialUpload,
			employeeId,
			employmentProfileSubtype,
			identificationSubtype,
			invalidateDocuments,
			t,
		],
	);

	/**
	 * Reviews a current document version.
	 *
	 * @param docVersion - Document version row
	 * @param nextStatus - Status to apply
	 * @returns Nothing
	 */
	const handleReviewDocument = useCallback(
		async (
			docVersion: EmployeeDocumentVersionRecord,
			nextStatus: 'APPROVED' | 'REJECTED',
		): Promise<void> => {
			if (!canAdminReview) {
				toast.error(t('documents.toast.reviewForbidden'));
				return;
			}

			const reviewComment =
				nextStatus === 'REJECTED'
					? window.prompt(t('documents.review.rejectPrompt'))?.trim()
					: undefined;

			if (nextStatus === 'REJECTED' && !reviewComment) {
				toast.error(t('documents.toast.rejectCommentRequired'));
				return;
			}

			const result = await reviewMutation.mutateAsync({
				employeeId,
				docVersionId: docVersion.id,
				reviewStatus: nextStatus,
				reviewComment,
			});
			if (!result.success) {
				toast.error(result.error ?? t('documents.toast.reviewError'));
				return;
			}

			toast.success(
				nextStatus === 'APPROVED'
					? t('documents.toast.approveSuccess')
					: t('documents.toast.rejectSuccess'),
			);
			await invalidateDocuments();
		},
		[canAdminReview, employeeId, invalidateDocuments, reviewMutation, t],
	);

	/**
	 * Generates legal document content for the selected kind.
	 *
	 * @param kind - Legal document kind
	 * @returns Nothing
	 */
	const handleGenerateLegal = useCallback(
		async (kind: LegalDocumentKind): Promise<void> => {
			const result = await generateMutation.mutateAsync({
				employeeId,
				kind,
			});
			if (!result.success) {
				toast.error(result.error ?? t('documents.toast.generateError'));
				return;
			}

			const payload = extractLegalGenerationPayload(result);
			if (payload?.renderedHtml) {
				setLegalPreviewByKind((prev) => ({ ...prev, [kind]: payload.renderedHtml ?? '' }));
			}

			toast.success(t('documents.toast.generateSuccess'));
			await invalidateDocuments();
		},
		[employeeId, generateMutation, invalidateDocuments, t],
	);

	/**
	 * Uploads and confirms a physically signed legal document.
	 *
	 * @param kind - Legal document kind
	 * @param generationId - Legal generation identifier
	 * @param file - Signed file
	 * @returns Nothing
	 */
	const handleUploadPhysicalSigned = useCallback(
		async (kind: LegalDocumentKind, generationId: string, file: File): Promise<void> => {
			if (file.size > MAX_UPLOAD_BYTES) {
				toast.error(t('documents.toast.invalidSize'));
				return;
			}
			if (!file.type || !ALLOWED_UPLOAD_TYPES.has(file.type)) {
				toast.error(t('documents.toast.invalidType'));
				return;
			}

			setUploadingRequirementKey(`PHYSICAL_${kind}`);
			try {
				const sha256 = await computeFileSha256(file);
				const presignResult = await presignEmployeeLegalPhysicalAction({
					employeeId,
					kind,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
				});
				if (!presignResult.success || !presignResult.data) {
					toast.error(presignResult.error ?? t('documents.toast.uploadError'));
					return;
				}

				await uploadToPresignedPost({
					url: presignResult.data.url,
					fields: presignResult.data.fields,
					file,
				});

				const confirmResult = await confirmEmployeeLegalPhysicalAction({
					employeeId,
					kind,
					docVersionId: presignResult.data.docVersionId,
					generationId,
					objectKey: presignResult.data.objectKey,
					fileName: file.name,
					contentType: file.type,
					sizeBytes: file.size,
					sha256,
					signedAtDateKey: getTodayDateKey(),
				});

				if (!confirmResult.success) {
					toast.error(confirmResult.error ?? t('documents.toast.uploadError'));
					return;
				}

				toast.success(t('documents.toast.uploadSuccess'));
				await invalidateDocuments();
			} catch (error) {
				console.error('[employee-documents] physical signed upload failed', error);
				toast.error(t('documents.toast.uploadError'));
			} finally {
				setUploadingRequirementKey(null);
			}
		},
		[employeeId, invalidateDocuments, t],
	);

	/**
	 * Confirms a digital signature for a generated legal document.
	 *
	 * @param signatureDataUrl - Signature capture in data URL format
	 * @returns Nothing
	 */
	const handleConfirmDigitalSignature = useCallback(
		async (signatureDataUrl: string): Promise<void> => {
			if (!activeSignatureKind) {
				return;
			}

			const summary = summaryQuery.data;
			const generation = summary?.latestGenerations?.[activeSignatureKind];
			if (!generation?.id) {
				toast.error(t('documents.toast.generationRequired'));
				return;
			}

			setIsSigningDigital(true);
			try {
				const result = await signEmployeeLegalDigitalAction({
					employeeId,
					kind: activeSignatureKind,
					generationId: generation.id,
					signatureDataUrl,
					signedAtDateKey: getTodayDateKey(),
				});
				if (!result.success) {
					toast.error(result.error ?? t('documents.toast.signError'));
					return;
				}

				setActiveSignatureKind(null);
				toast.success(t('documents.toast.signSuccess'));
				await invalidateDocuments();
			} finally {
				setIsSigningDigital(false);
			}
		},
		[activeSignatureKind, employeeId, invalidateDocuments, summaryQuery.data, t],
	);

	const summary = summaryQuery.data;
	const historyData = historyQuery.data;

	const requirementStates = useMemo(
		() =>
			(summary?.requirements ?? []).slice().sort((left, right) => left.displayOrder - right.displayOrder),
		[summary?.requirements],
	);

	const currentByRequirement = useMemo(() => {
		const currentDocuments = historyData?.current ?? [];
		return new Map<EmployeeDocumentRequirementKey, EmployeeDocumentVersionRecord>(
			currentDocuments.map((document) => [document.requirementKey, document] as const),
		);
	}, [historyData]);

	const legalKinds: LegalDocumentKind[] = ['CONTRACT', 'NDA'];

	/**
	 * Resolves a user-facing message explaining why a checklist upload input is disabled.
	 *
	 * @param args - Upload state flags
	 * @returns Translated reason or null when enabled
	 */
	const resolveChecklistUploadDisabledReason = useCallback(
		(args: {
			isActive: boolean;
			isLegalRequirement: boolean;
			canUploadByRole: boolean;
			hasCurrentVersion: boolean;
			isPendingUpload: boolean;
		}): string | null => {
			if (!args.canUploadByRole) {
				return t('documents.fields.disabledReasons.noPermission');
			}
			if (organizationRole === 'member' && args.hasCurrentVersion) {
				return t('documents.fields.disabledReasons.updateRestricted');
			}
			if (!args.isActive) {
				return t('documents.fields.disabledReasons.legalGate');
			}
			if (args.isLegalRequirement) {
				return t('documents.fields.disabledReasons.generateFirst');
			}
			if (args.isPendingUpload) {
				return t('documents.fields.disabledReasons.uploading');
			}
			return null;
		},
		[organizationRole, t],
	);

	if (summaryQuery.isLoading) {
		return (
			<Card>
				<CardContent className="flex min-h-[220px] items-center justify-center">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						{tCommon('loading')}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!summary) {
		return (
			<Card>
				<CardContent className="py-8 text-sm text-muted-foreground">
					{t('documents.empty')}
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			<Card className="border-border/70 bg-muted/30">
				<CardHeader className="space-y-2">
					<CardTitle className="text-base">{t('documents.progress.title')}</CardTitle>
					<CardDescription>{t('documents.progress.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid grid-cols-2 gap-3 min-[1025px]:grid-cols-3">
						<div className="rounded-md border border-border/70 bg-card/80 p-3">
							<p className="text-xs text-muted-foreground">{t('documents.progress.percent')}</p>
							<p className="text-2xl font-semibold text-foreground">
								{summary.documentProgressPercent}%
							</p>
						</div>
						<div className="rounded-md border border-border/70 bg-card/80 p-3">
							<p className="text-xs text-muted-foreground">{t('documents.progress.missing')}</p>
							<p className="text-2xl font-semibold text-foreground">
								{summary.documentMissingCount}
							</p>
						</div>
						<div className="rounded-md border border-border/70 bg-card/80 p-3">
							<p className="text-xs text-muted-foreground">{t('documents.progress.status')}</p>
							<Badge variant="outline" className="mt-1">
								{t(`documents.workflowStatus.${summary.documentWorkflowStatus}`)}
							</Badge>
						</div>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-emerald-500 transition-all duration-300 dark:bg-emerald-400"
							style={{ width: `${summary.documentProgressPercent}%` }}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t('documents.checklist.title')}</CardTitle>
					<CardDescription>{t('documents.checklist.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{requirementStates.map((requirement) => {
						const currentVersion = currentByRequirement.get(requirement.requirementKey) ?? requirement.currentVersion;
						const isPendingUpload = uploadingRequirementKey === requirement.requirementKey;
						const isLegalRequirement = Boolean(resolveLegalKindForRequirement(requirement.requirementKey));
						const memberUpdateRestricted =
							organizationRole === 'member' && Boolean(currentVersion);
						const canUploadRequirement = canCreateInitialUpload && !memberUpdateRestricted;
						const isUploadDisabled =
							!canUploadRequirement || isPendingUpload || isLegalRequirement;
						const uploadDisabledReason = resolveChecklistUploadDisabledReason({
							isActive: requirement.isActive,
							isLegalRequirement,
							canUploadByRole: canCreateInitialUpload,
							hasCurrentVersion: Boolean(currentVersion),
							isPendingUpload,
						});

						return (
							<div
								key={requirement.requirementKey}
								className={cn(
									'rounded-md border p-3 transition-colors',
									requirement.isActive
										? 'border-border/70 bg-card/70'
										: 'border-border/60 bg-muted/35',
								)}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="space-y-1">
										<p className="flex items-center gap-2 text-sm font-medium">
											{getStatusIcon(currentVersion?.reviewStatus)}
											{t(getRequirementLabelKey(requirement.requirementKey))}
										</p>
										<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
											<Badge variant={getStatusVariant(currentVersion?.reviewStatus)}>
												{currentVersion?.reviewStatus
													? t(`documents.reviewStatus.${currentVersion.reviewStatus}`)
													: t('documents.reviewStatus.NOT_UPLOADED')}
											</Badge>
											{requirement.isRequired ? (
												<Badge variant="outline">{t('documents.badges.required')}</Badge>
											) : (
												<Badge variant="secondary">{t('documents.badges.optional')}</Badge>
											)}
											{!requirement.isActive ? (
												<Badge variant="outline">{t('documents.badges.locked')}</Badge>
											) : null}
										</div>
										{currentVersion ? (
											<p className="text-xs text-muted-foreground">
												{t('documents.fileInfo.current', {
													fileName: currentVersion.fileName,
													version: currentVersion.versionNumber,
												})}
											</p>
										) : null}
									</div>
									<div className="flex flex-col gap-2 min-[1025px]:flex-row min-[1025px]:flex-wrap min-[1025px]:items-center">
										{canAdminReview && currentVersion ? (
											<>
												<Button
													type="button"
													size="sm"
													variant="outline"
													className="w-full min-h-11 min-[1025px]:w-auto"
													onClick={() => void handleOpenDocument(currentVersion.id)}
												>
													<Eye className="mr-2 h-4 w-4" />
													{t('documents.actions.view')}
												</Button>
												{currentVersion.reviewStatus === 'PENDING_REVIEW' ? (
													<>
														<Button
															type="button"
															size="sm"
															variant="secondary"
															className="w-full min-h-11 min-[1025px]:w-auto"
															onClick={() =>
																void handleReviewDocument(
																	currentVersion,
																	'APPROVED',
																)
															}
															disabled={reviewMutation.isPending}
														>
															{t('documents.actions.approve')}
														</Button>
														<Button
															type="button"
															size="sm"
															variant="destructive"
															className="w-full min-h-11 min-[1025px]:w-auto"
															onClick={() =>
																void handleReviewDocument(
																	currentVersion,
																	'REJECTED',
																)
															}
															disabled={reviewMutation.isPending}
														>
															{t('documents.actions.reject')}
														</Button>
													</>
												) : null}
											</>
										) : null}
									</div>
								</div>

								{requirement.isActive && !isLegalRequirement ? (
									<div className="mt-3 grid gap-3 min-[1025px]:grid-cols-[minmax(0,280px)_1fr] min-[1025px]:items-end">
										{requirement.requirementKey === 'IDENTIFICATION' ? (
											<div className="space-y-2">
												<Label>{t('documents.fields.identificationSubtype')}</Label>
												<Select
													value={identificationSubtype}
													onValueChange={(value) =>
														setIdentificationSubtype(value as IdentificationSubtype)
													}
													disabled={isPendingUpload}
												>
													<SelectTrigger className="min-h-11 w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="INE">{t('documents.subtypes.INE')}</SelectItem>
														<SelectItem value="PASSPORT">
															{t('documents.subtypes.PASSPORT')}
														</SelectItem>
														<SelectItem value="OTHER">{t('documents.subtypes.OTHER')}</SelectItem>
													</SelectContent>
												</Select>
											</div>
										) : null}
										{requirement.requirementKey === 'EMPLOYMENT_PROFILE' ? (
											<div className="space-y-2">
												<Label>{t('documents.fields.employmentProfileSubtype')}</Label>
												<Select
													value={employmentProfileSubtype}
													onValueChange={(value) =>
														setEmploymentProfileSubtype(value as EmploymentProfileSubtype)
													}
													disabled={isPendingUpload}
												>
													<SelectTrigger className="min-h-11 w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="CURRICULUM">
															{t('documents.subtypes.CURRICULUM')}
														</SelectItem>
														<SelectItem value="JOB_APPLICATION">
															{t('documents.subtypes.JOB_APPLICATION')}
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
										) : null}
										<div className="space-y-2">
											<Label htmlFor={`document-upload-${requirement.requirementKey}`}>
												{t('documents.fields.file')}
											</Label>
											<Input
												id={`document-upload-${requirement.requirementKey}`}
												type="file"
												accept=".pdf,image/jpeg,image/png"
												className="min-h-11 w-full"
												disabled={isUploadDisabled}
												onChange={(event) => {
													const file = event.target.files?.[0];
													if (!file) {
														return;
													}
													void handleUploadRequirement(requirement.requirementKey, file);
													event.target.value = '';
												}}
											/>
											{isUploadDisabled && uploadDisabledReason ? (
												<p className="text-xs text-amber-600 dark:text-amber-400">
													{uploadDisabledReason}
												</p>
											) : null}
										</div>
									</div>
								) : null}
							</div>
						);
					})}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t('documents.legal.title')}</CardTitle>
					<CardDescription>{t('documents.legal.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{!summary.gateUnlocked ? (
						<div className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
							{t('documents.legal.locked', {
								approved: summary.baseApprovedCount,
								required: summary.baseApprovedThresholdForLegal,
							})}
						</div>
					) : null}

					<div className="grid gap-4 min-[1025px]:grid-cols-2">
						{legalKinds.map((kind) => {
							const requirementKey =
								kind === 'CONTRACT' ? 'SIGNED_CONTRACT' : 'SIGNED_NDA';
							const currentVersion = currentByRequirement.get(requirementKey);
							const latestGeneration = summary.latestGenerations?.[kind];
							const isPhysicalUploadPending = uploadingRequirementKey === `PHYSICAL_${kind}`;
							const isPhysicalUploadDisabled =
								!canAdminReview ||
								!summary.gateUnlocked ||
								!latestGeneration?.id ||
								isPhysicalUploadPending;
							const physicalUploadDisabledReason = !canAdminReview
								? t('documents.fields.disabledReasons.noPermission')
								: !summary.gateUnlocked
									? t('documents.fields.disabledReasons.legalGate')
									: !latestGeneration?.id
										? t('documents.fields.disabledReasons.generateFirst')
										: isPhysicalUploadPending
											? t('documents.fields.disabledReasons.uploading')
											: null;

							return (
								<Card key={kind} className="border-border/70 bg-card/80">
									<CardHeader className="space-y-2">
										<CardTitle className="text-sm">{t(`documents.legal.${kind}.title`)}</CardTitle>
										<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<Badge variant={getStatusVariant(currentVersion?.reviewStatus)}>
												{currentVersion?.reviewStatus
													? t(`documents.reviewStatus.${currentVersion.reviewStatus}`)
													: t('documents.reviewStatus.NOT_UPLOADED')}
											</Badge>
											{latestGeneration?.templateVersionNumber ? (
												<Badge variant="outline">
													{t('documents.legal.templateVersion', {
														version: latestGeneration.templateVersionNumber,
													})}
												</Badge>
											) : null}
										</div>
									</CardHeader>
									<CardContent className="space-y-3">
										<div className="flex flex-col gap-2 min-[1025px]:flex-row min-[1025px]:flex-wrap">
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="w-full min-h-11 min-[1025px]:w-auto"
												onClick={() => void handleGenerateLegal(kind)}
												disabled={!summary.gateUnlocked || generateMutation.isPending}
											>
												{generateMutation.isPending ? (
													<>
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														{t('documents.actions.generating')}
													</>
												) : (
													<>
														<FileSignature className="mr-2 h-4 w-4" />
														{t('documents.actions.generate')}
													</>
												)}
											</Button>
											<Button
												type="button"
												size="sm"
												className="w-full min-h-11 min-[1025px]:w-auto"
												onClick={() => setActiveSignatureKind(kind)}
												disabled={!summary.gateUnlocked || !latestGeneration?.id}
											>
												{t('documents.actions.signDigital')}
											</Button>
											{canAdminReview && currentVersion ? (
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="w-full min-h-11 min-[1025px]:w-auto"
													onClick={() => void handleOpenDocument(currentVersion.id)}
												>
													<Eye className="mr-2 h-4 w-4" />
													{t('documents.actions.view')}
												</Button>
											) : null}
										</div>

										<div className="space-y-2">
											<Label htmlFor={`physical-upload-${kind}`}>
												{t('documents.fields.uploadSignedPhysical')}
											</Label>
											<Input
												id={`physical-upload-${kind}`}
												type="file"
												accept=".pdf,image/jpeg,image/png"
												className="min-h-11 w-full"
												disabled={isPhysicalUploadDisabled}
												onChange={(event) => {
													const file = event.target.files?.[0];
													if (!file || !latestGeneration?.id) {
														return;
													}
													void handleUploadPhysicalSigned(kind, latestGeneration.id, file);
													event.target.value = '';
												}}
											/>
											{isPhysicalUploadDisabled && physicalUploadDisabledReason ? (
												<p className="text-xs text-amber-600 dark:text-amber-400">
													{physicalUploadDisabledReason}
												</p>
											) : null}
										</div>

										{legalPreviewByKind[kind] ? (
											<div className="rounded-md border border-border/70 bg-muted/30 p-3">
												<p className="mb-2 text-xs text-muted-foreground">
													{t('documents.legal.previewTitle')}
												</p>
												<iframe
													title={`${kind}-preview`}
													srcDoc={legalPreviewByKind[kind]}
													className="h-48 w-full rounded border border-border/70 bg-background"
												/>
											</div>
										) : null}
									</CardContent>
								</Card>
							);
						})}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="space-y-2">
					<CardTitle className="text-base">{t('documents.history.title')}</CardTitle>
					<CardDescription>{t('documents.history.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="w-full min-[1025px]:max-w-xs">
						<Select
							value={historyFilter}
							onValueChange={(value) =>
								setHistoryFilter(value as EmployeeDocumentRequirementKey | 'ALL')
							}
						>
							<SelectTrigger className="min-h-11 w-full">
								<SelectValue placeholder={t('documents.history.filterAll')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">{t('documents.history.filterAll')}</SelectItem>
								{requirementStates.map((requirement) => (
									<SelectItem key={requirement.requirementKey} value={requirement.requirementKey}>
										{t(getRequirementLabelKey(requirement.requirementKey))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="rounded-md border">
						<Table className="min-w-[40rem]">
							<TableHeader>
								<TableRow>
									<TableHead>{t('documents.history.headers.requirement')}</TableHead>
									<TableHead>{t('documents.history.headers.version')}</TableHead>
									<TableHead>{t('documents.history.headers.status')}</TableHead>
									<TableHead>{t('documents.history.headers.uploadedAt')}</TableHead>
									<TableHead>{t('documents.history.headers.actions')}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{historyQuery.isLoading ? (
									<TableRow>
										<TableCell colSpan={5} className="h-16 text-center text-sm text-muted-foreground">
											{tCommon('loading')}
										</TableCell>
									</TableRow>
								) : (historyData?.history ?? []).length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="h-16 text-center text-sm text-muted-foreground">
											{t('documents.history.empty')}
										</TableCell>
									</TableRow>
								) : (
									(historyData?.history ?? []).map((row) => (
										<TableRow key={row.id}>
											<TableCell className="text-sm">
												{t(getRequirementLabelKey(row.requirementKey))}
											</TableCell>
											<TableCell className="text-sm">v{row.versionNumber}</TableCell>
											<TableCell>
												<Badge variant={getStatusVariant(row.reviewStatus)}>
													{t(`documents.reviewStatus.${row.reviewStatus}`)}
												</Badge>
											</TableCell>
											<TableCell className="text-sm">
												{formatShortDateUtc(new Date(row.uploadedAt))}
											</TableCell>
											<TableCell>
												{canAdminReview ? (
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="w-full min-h-11 min-[1025px]:w-auto"
														onClick={() => void handleOpenDocument(row.id)}
													>
														<Eye className="mr-2 h-4 w-4" />
														{t('documents.actions.view')}
													</Button>
												) : null}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<SignatureCanvasDialog
				open={Boolean(activeSignatureKind)}
				onOpenChange={(open) => {
					if (!open) {
						setActiveSignatureKind(null);
					}
				}}
				title={t('documents.signature.title')}
				description={t('documents.signature.description')}
				clearLabel={t('documents.signature.clear')}
				cancelLabel={tCommon('cancel')}
				confirmLabel={isSigningDigital ? t('documents.actions.signing') : t('documents.signature.confirm')}
				onConfirm={(signatureDataUrl) => handleConfirmDigitalSignature(signatureDataUrl)}
				isPending={isSigningDigital}
			/>
		</div>
	);
}
