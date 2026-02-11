'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { EmployeeDocumentRequirementKey, LegalDocumentKind } from '@sen-checkin/types';

import {
	confirmLegalBrandingAction,
	createLegalTemplateDraftAction,
	presignLegalBrandingAction,
	publishLegalTemplateAction,
	updateDocumentWorkflowConfigAction,
	updateLegalTemplateAction,
} from '@/actions/employee-documents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	fetchDocumentWorkflowConfig,
	fetchLegalBranding,
	fetchLegalTemplates,
	type LegalTemplateRecord,
	type OrganizationDocumentRequirementConfig,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

const LegalTemplateEditor = dynamic(
	() => import('@/components/legal-template-editor').then((module) => module.LegalTemplateEditor),
	{
		ssr: false,
		loading: () => null,
	},
);

const TEMPLATE_TOKENS = [
	'{{employee.fullName}}',
	'{{employee.code}}',
	'{{employee.rfc}}',
	'{{employee.nss}}',
	'{{employee.jobPositionName}}',
	'{{employee.locationName}}',
	'{{employee.hireDate}}',
	'{{document.generatedDate}}',
	'{{document.generatedDateLong}}',
	'{{document.generatedTimeLabel}}',
	'{{disciplinary.folio}}',
	'{{disciplinary.incidentDate}}',
	'{{disciplinary.reason}}',
	'{{disciplinary.outcome}}',
	'{{disciplinary.policyReference}}',
	'{{disciplinary.suspensionRange}}',
];

const DOCUMENT_TEMPLATE_KINDS: LegalDocumentKind[] = [
	'CONTRACT',
	'NDA',
	'ACTA_ADMINISTRATIVA',
	'CONSTANCIA_NEGATIVA_FIRMA',
];

const ALLOWED_UPLOAD_TYPES = new Set<string>(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Converts a file into SHA-256 hexadecimal hash.
 *
 * @param file - File to hash
 * @returns Hash hex string
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
 * @param args - Upload target and payload
 * @returns Nothing
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
 * Builds default HTML content for legal templates.
 *
 * @param kind - Legal kind
 * @returns Default template content
 */
function buildDefaultTemplateHtml(kind: LegalDocumentKind): string {
	if (kind === 'CONTRACT') {
		return `
<h1>Contrato Laboral</h1>
<p>Empleado: {{employee.fullName}}</p>
<p>Código: {{employee.code}}</p>
<p>Puesto: {{employee.jobPositionName}}</p>
<p>Ubicación: {{employee.locationName}}</p>
<p>RFC: {{employee.rfc}}</p>
<p>NSS: {{employee.nss}}</p>
<p>Fecha de ingreso: {{employee.hireDate}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();
	}

	if (kind === 'NDA') {
		return `
<h1>Convenio de Confidencialidad (NDA)</h1>
<p>Empleado: {{employee.fullName}}</p>
<p>Código: {{employee.code}}</p>
<p>Puesto: {{employee.jobPositionName}}</p>
<p>RFC: {{employee.rfc}}</p>
<p>NSS: {{employee.nss}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();
	}

	if (kind === 'ACTA_ADMINISTRATIVA') {
		return `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #111111;">
	<p style="text-align: center; font-weight: 700; margin: 0 0 8px 0;">ACTA ADMINISTRATIVA</p>
	<p style="text-align: center; margin: 0 0 28px 0;">Folio interno: {{disciplinary.folio}}</p>

	<p style="text-align: justify; margin: 0 0 18px 0;">
		En la Ciudad de {{employee.locationName}}, siendo las {{document.generatedTimeLabel}} horas del día {{document.generatedDateLong}}, se levanta la presente acta administrativa por una parte por la representación patronal y por la otra por la persona trabajadora {{employee.fullName}}, para dejar constancia de los acontecimientos reportados.
	</p>

	<p style="text-align: justify; margin: 0 0 18px 0;">
		Se levanta la presente acta administrativa con motivo de que la persona trabajadora identificada con código {{employee.code}} ha sido relacionada con hechos que constituyen faltas al Contrato Individual de Trabajo y/o Reglamento Interior de Trabajo.
	</p>

	<p style="text-align: justify; margin: 0 0 18px 0;">
		- El día {{disciplinary.incidentDate}} se registró la siguiente conducta: {{disciplinary.reason}}.
	</p>

	<p style="text-align: justify; margin: 0 0 18px 0;">
		Resultado disciplinario: {{disciplinary.outcome}}. Referencia de política: {{disciplinary.policyReference}}. Suspensión aplicable: {{disciplinary.suspensionRange}}.
	</p>

	<p style="text-align: justify; margin: 0 0 26px 0;">
		La presente se redacta para constancia y surte sus efectos legales correspondientes como soporte para futuras acciones. La persona trabajadora firma de conformidad la presente, aceptando ser responsable del contenido de esta acta.
	</p>

	<p style="text-align: center; font-weight: 600; margin: 0 0 24px 0;">
		{{employee.locationName}}, {{document.generatedDateLong}}
	</p>

	<p style="text-align: center; margin: 0 0 10px 0;">TRABAJADOR.</p>
	<p style="text-align: center; margin: 0 0 8px 0;">________________________________________</p>
	<p style="text-align: center; margin: 0 0 28px 0;">{{employee.fullName}}</p>

	<p style="text-align: center; margin: 0 0 10px 0;">Testigo.                                      Testigo.</p>
	<p style="text-align: center; margin: 0 0 8px 0;">______________________________      ______________________________</p>
	<p style="text-align: center; margin: 0;">Nombre y firma                              Nombre y firma</p>
</div>
`.trim();
	}

	return `
<h1>Constancia de negativa de firma</h1>
<p>Folio de medida: {{disciplinary.folio}}</p>
<p>Empleado: {{employee.fullName}}</p>
<p>Motivo del acta: {{disciplinary.reason}}</p>
<p>Resultado aplicado: {{disciplinary.outcome}}</p>
<p>Fecha del incidente: {{disciplinary.incidentDate}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();
}

/**
 * Document workflow settings section for payroll settings screen.
 *
 * @returns React element
 */
export function DocumentWorkflowSettingsSection(): React.ReactElement {
	const t = useTranslations('PayrollSettings');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const { organizationRole } = useOrgContext();

	const canManage = organizationRole === 'owner' || organizationRole === 'admin';

	const [threshold, setThreshold] = useState<string>('1');
	const [requirements, setRequirements] = useState<OrganizationDocumentRequirementConfig[]>([]);
	const [templateHtmlByKind, setTemplateHtmlByKind] = useState<
		Record<LegalDocumentKind, string>
	>({
		CONTRACT: buildDefaultTemplateHtml('CONTRACT'),
		NDA: buildDefaultTemplateHtml('NDA'),
		ACTA_ADMINISTRATIVA: buildDefaultTemplateHtml('ACTA_ADMINISTRATIVA'),
		CONSTANCIA_NEGATIVA_FIRMA: buildDefaultTemplateHtml('CONSTANCIA_NEGATIVA_FIRMA'),
	});
	const [brandingDisplayName, setBrandingDisplayName] = useState<string>('');
	const [brandingHeaderText, setBrandingHeaderText] = useState<string>('');
	const [brandingFile, setBrandingFile] = useState<File | null>(null);

	const configQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.config,
		queryFn: fetchDocumentWorkflowConfig,
		enabled: canManage,
	});

	const contractTemplatesQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.templates('CONTRACT'),
		queryFn: () => fetchLegalTemplates('CONTRACT'),
		enabled: canManage,
	});

	const ndaTemplatesQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.templates('NDA'),
		queryFn: () => fetchLegalTemplates('NDA'),
		enabled: canManage,
	});

	const actaTemplatesQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.templates('ACTA_ADMINISTRATIVA'),
		queryFn: () => fetchLegalTemplates('ACTA_ADMINISTRATIVA'),
		enabled: canManage,
	});

	const refusalTemplatesQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.templates('CONSTANCIA_NEGATIVA_FIRMA'),
		queryFn: () => fetchLegalTemplates('CONSTANCIA_NEGATIVA_FIRMA'),
		enabled: canManage,
	});

	const brandingQuery = useQuery({
		queryKey: queryKeys.documentWorkflow.branding,
		queryFn: fetchLegalBranding,
		enabled: canManage,
	});

	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		if (!configQuery.data) {
			return;
		}
		setThreshold(String(configQuery.data.config.baseApprovedThresholdForLegal));
		setRequirements(configQuery.data.requirements);
	}, [configQuery.data]);

	useEffect(() => {
		const latestContract = contractTemplatesQuery.data?.[0];
		if (latestContract?.htmlContent) {
			setTemplateHtmlByKind((previous) => ({
				...previous,
				CONTRACT: latestContract.htmlContent,
			}));
		}
	}, [contractTemplatesQuery.data]);

	useEffect(() => {
		const latestNda = ndaTemplatesQuery.data?.[0];
		if (latestNda?.htmlContent) {
			setTemplateHtmlByKind((previous) => ({
				...previous,
				NDA: latestNda.htmlContent,
			}));
		}
	}, [ndaTemplatesQuery.data]);

	useEffect(() => {
		const latestActa = actaTemplatesQuery.data?.[0];
		if (latestActa?.htmlContent) {
			setTemplateHtmlByKind((previous) => ({
				...previous,
				ACTA_ADMINISTRATIVA: latestActa.htmlContent,
			}));
		}
	}, [actaTemplatesQuery.data]);

	useEffect(() => {
		const latestRefusal = refusalTemplatesQuery.data?.[0];
		if (latestRefusal?.htmlContent) {
			setTemplateHtmlByKind((previous) => ({
				...previous,
				CONSTANCIA_NEGATIVA_FIRMA: latestRefusal.htmlContent,
			}));
		}
	}, [refusalTemplatesQuery.data]);

	useEffect(() => {
		if (!brandingQuery.data?.branding) {
			return;
		}
		setBrandingDisplayName(brandingQuery.data.branding.displayName ?? '');
		setBrandingHeaderText(brandingQuery.data.branding.headerText ?? '');
	}, [brandingQuery.data?.branding]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const updateConfigMutation = useMutation({
		mutationKey: mutationKeys.documentWorkflow.updateConfig,
		mutationFn: updateDocumentWorkflowConfigAction,
	});

	const createDraftMutation = useMutation({
		mutationKey: mutationKeys.documentWorkflow.createTemplateDraft,
		mutationFn: createLegalTemplateDraftAction,
	});

	const updateTemplateMutation = useMutation({
		mutationKey: mutationKeys.documentWorkflow.updateTemplate,
		mutationFn: updateLegalTemplateAction,
	});

	const publishTemplateMutation = useMutation({
		mutationKey: mutationKeys.documentWorkflow.publishTemplate,
		mutationFn: publishLegalTemplateAction,
	});

	const brandingMutation = useMutation({
		mutationKey: mutationKeys.documentWorkflow.confirmBranding,
		mutationFn: confirmLegalBrandingAction,
	});

	const latestTemplateByKind = useMemo(() => {
		const result: Record<LegalDocumentKind, LegalTemplateRecord | null> = {
			CONTRACT: contractTemplatesQuery.data?.[0] ?? null,
			NDA: ndaTemplatesQuery.data?.[0] ?? null,
			ACTA_ADMINISTRATIVA: actaTemplatesQuery.data?.[0] ?? null,
			CONSTANCIA_NEGATIVA_FIRMA: refusalTemplatesQuery.data?.[0] ?? null,
		};
		return result;
	}, [
		actaTemplatesQuery.data,
		contractTemplatesQuery.data,
		ndaTemplatesQuery.data,
		refusalTemplatesQuery.data,
	]);

	/**
	 * Updates requirement order or required flags.
	 *
	 * @param requirementKey - Requirement key
	 * @param patch - Mutable fields
	 * @returns Nothing
	 */
	const patchRequirement = useCallback(
		(
			requirementKey: EmployeeDocumentRequirementKey,
			patch: Partial<Pick<OrganizationDocumentRequirementConfig, 'isRequired' | 'displayOrder'>>,
		): void => {
			setRequirements((previous) =>
				previous.map((requirement) =>
					requirement.requirementKey === requirementKey
						? { ...requirement, ...patch }
						: requirement,
				),
			);
		},
		[],
	);

	/**
	 * Persists workflow requirement settings.
	 *
	 * @returns Nothing
	 */
	const handleSaveWorkflowConfig = useCallback(async (): Promise<void> => {
		const parsedThreshold = Number(threshold);
		if (!Number.isInteger(parsedThreshold) || parsedThreshold < 1) {
			toast.error(t('documentWorkflow.toast.invalidThreshold'));
			return;
		}

		const normalizedRequirements = requirements.map((requirement) => ({
			requirementKey: requirement.requirementKey,
			isRequired: requirement.isRequired,
			displayOrder: requirement.displayOrder,
			activationStage: requirement.activationStage,
		}));

		const result = await updateConfigMutation.mutateAsync({
			baseApprovedThresholdForLegal: parsedThreshold,
			requirements: normalizedRequirements,
		});
		if (!result.success) {
			toast.error(result.error ?? t('documentWorkflow.toast.saveError'));
			return;
		}

		toast.success(t('documentWorkflow.toast.saveSuccess'));
		await queryClient.invalidateQueries({ queryKey: queryKeys.documentWorkflow.config });
	}, [queryClient, requirements, t, threshold, updateConfigMutation]);

	/**
	 * Creates a new template draft version for legal documents.
	 *
	 * @param kind - Legal kind
	 * @returns Nothing
	 */
	const handleCreateDraft = useCallback(
		async (kind: LegalDocumentKind): Promise<void> => {
			const htmlContent = templateHtmlByKind[kind] ?? '';
			const result = await createDraftMutation.mutateAsync({
				kind,
				htmlContent: htmlContent.trim() || buildDefaultTemplateHtml(kind),
			});

			if (!result.success) {
				toast.error(result.error ?? t('documentWorkflow.templates.toast.createDraftError'));
				return;
			}

			toast.success(t('documentWorkflow.templates.toast.createDraftSuccess'));
			await queryClient.invalidateQueries({
				queryKey: queryKeys.documentWorkflow.templates(kind),
			});
		},
		[createDraftMutation, queryClient, t, templateHtmlByKind],
	);

	/**
	 * Persists the currently selected draft content.
	 *
	 * @param kind - Legal kind
	 * @returns Nothing
	 */
	const handleSaveTemplate = useCallback(
		async (kind: LegalDocumentKind): Promise<void> => {
			const latestTemplate = latestTemplateByKind[kind];
			if (!latestTemplate) {
				await handleCreateDraft(kind);
				return;
			}

			const htmlContent = (templateHtmlByKind[kind] ?? '').trim();
			const result = await updateTemplateMutation.mutateAsync({
				templateId: latestTemplate.id,
				htmlContent,
			});

			if (!result.success) {
				toast.error(result.error ?? t('documentWorkflow.templates.toast.saveError'));
				return;
			}

			toast.success(t('documentWorkflow.templates.toast.saveSuccess'));
			await queryClient.invalidateQueries({
				queryKey: queryKeys.documentWorkflow.templates(kind),
			});
		},
		[
			handleCreateDraft,
			latestTemplateByKind,
			queryClient,
			t,
			templateHtmlByKind,
			updateTemplateMutation,
		],
	);

	/**
	 * Publishes the latest template draft for a legal kind.
	 *
	 * @param kind - Legal kind
	 * @returns Nothing
	 */
	const handlePublishTemplate = useCallback(
		async (kind: LegalDocumentKind): Promise<void> => {
			const latestTemplate = latestTemplateByKind[kind];
			if (!latestTemplate) {
				toast.error(t('documentWorkflow.templates.toast.publishMissingDraft'));
				return;
			}

			const result = await publishTemplateMutation.mutateAsync(latestTemplate.id);
			if (!result.success) {
				toast.error(result.error ?? t('documentWorkflow.templates.toast.publishError'));
				return;
			}

			toast.success(t('documentWorkflow.templates.toast.publishSuccess'));
			await queryClient.invalidateQueries({
				queryKey: queryKeys.documentWorkflow.templates(kind),
			});
		},
		[latestTemplateByKind, publishTemplateMutation, queryClient, t],
	);

	/**
	 * Saves branding text values and optional logo upload.
	 *
	 * @returns Nothing
	 */
	const handleSaveBranding = useCallback(async (): Promise<void> => {
		if (brandingFile) {
			if (brandingFile.size > MAX_UPLOAD_BYTES) {
				toast.error(t('documentWorkflow.branding.toast.invalidSize'));
				return;
			}
			if (!brandingFile.type || !ALLOWED_UPLOAD_TYPES.has(brandingFile.type)) {
				toast.error(t('documentWorkflow.branding.toast.invalidType'));
				return;
			}
		}

		let objectKey: string | undefined;
		let contentType: string | undefined;
		let fileName: string | undefined;
		let sizeBytes: number | undefined;
		let sha256: string | undefined;

		if (brandingFile) {
			const presignResult = await presignLegalBrandingAction({
				fileName: brandingFile.name,
				contentType: brandingFile.type,
				sizeBytes: brandingFile.size,
			});
			if (!presignResult.success || !presignResult.data) {
				toast.error(presignResult.error ?? t('documentWorkflow.branding.toast.uploadError'));
				return;
			}

			await uploadToPresignedPost({
				url: presignResult.data.url,
				fields: presignResult.data.fields,
				file: brandingFile,
			});

			objectKey = presignResult.data.objectKey;
			contentType = brandingFile.type;
			fileName = brandingFile.name;
			sizeBytes = brandingFile.size;
			sha256 = await computeFileSha256(brandingFile);
		}

		const result = await brandingMutation.mutateAsync({
			objectKey,
			fileName,
			contentType,
			sizeBytes,
			sha256,
			displayName: brandingDisplayName.trim() || undefined,
			headerText: brandingHeaderText.trim() || undefined,
		});

		if (!result.success) {
			toast.error(result.error ?? t('documentWorkflow.branding.toast.saveError'));
			return;
		}

		setBrandingFile(null);
		toast.success(t('documentWorkflow.branding.toast.saveSuccess'));
		await queryClient.invalidateQueries({ queryKey: queryKeys.documentWorkflow.branding });
	}, [
		brandingDisplayName,
		brandingFile,
		brandingHeaderText,
		brandingMutation,
		queryClient,
		t,
	]);

	if (!canManage) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t('documentWorkflow.title')}</CardTitle>
					<CardDescription>{t('documentWorkflow.forbidden')}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('documentWorkflow.title')}</CardTitle>
				<CardDescription>{t('documentWorkflow.description')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-3 rounded-md border bg-muted/20 p-4">
					<h3 className="text-sm font-semibold">{t('documentWorkflow.config.title')}</h3>
					<div className="max-w-xs space-y-2">
						<Label htmlFor="legal-threshold-input">
							{t('documentWorkflow.config.threshold')}
						</Label>
						<Input
							id="legal-threshold-input"
							type="number"
							min={1}
							value={threshold}
							onChange={(event) => setThreshold(event.target.value)}
							disabled={updateConfigMutation.isPending}
						/>
					</div>

					<div className="space-y-2">
						<Label>{t('documentWorkflow.config.requirements')}</Label>
						<div className="space-y-2">
							{requirements
								.slice()
								.sort((left, right) => left.displayOrder - right.displayOrder)
								.map((requirement) => (
									<div
										key={requirement.requirementKey}
										className="grid gap-2 rounded border border-border/70 bg-card/80 p-3 md:grid-cols-[1fr_120px_120px]"
									>
										<div className="flex items-center gap-2">
											{requirement.activationStage === 'LEGAL_AFTER_GATE' ? (
												<Badge variant="secondary">
													{t('documentWorkflow.config.badges.legal')}
												</Badge>
											) : (
												<Badge variant="outline">
													{t('documentWorkflow.config.badges.base')}
												</Badge>
											)}
											<span className="text-sm">
												{t(
													`documentWorkflow.requirements.${requirement.requirementKey}`,
												)}
											</span>
										</div>
										<Input
											type="number"
											min={1}
											value={requirement.displayOrder}
											onChange={(event) =>
												patchRequirement(requirement.requirementKey, {
													displayOrder: Math.max(1, Number(event.target.value) || 1),
												})
											}
											disabled={updateConfigMutation.isPending}
										/>
										<label className="inline-flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={requirement.isRequired}
												onChange={(event) =>
													patchRequirement(requirement.requirementKey, {
														isRequired: event.target.checked,
													})
												}
												disabled={updateConfigMutation.isPending}
											/>
											{t('documentWorkflow.config.required')}
										</label>
									</div>
								))}
						</div>
					</div>

					<Button type="button" onClick={() => void handleSaveWorkflowConfig()}>
						{updateConfigMutation.isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{tCommon('saving')}
							</>
						) : (
							t('documentWorkflow.actions.saveConfig')
						)}
					</Button>
				</div>

				<div className="space-y-3 rounded-md border bg-muted/20 p-4">
					<h3 className="text-sm font-semibold">{t('documentWorkflow.branding.title')}</h3>
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-2">
							<Label>{t('documentWorkflow.branding.fields.displayName')}</Label>
							<Input
								value={brandingDisplayName}
								onChange={(event) => setBrandingDisplayName(event.target.value)}
								disabled={brandingMutation.isPending}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t('documentWorkflow.branding.fields.logo')}</Label>
							<Input
								type="file"
								accept=".pdf,image/jpeg,image/png"
								onChange={(event) => setBrandingFile(event.target.files?.[0] ?? null)}
								disabled={brandingMutation.isPending}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label>{t('documentWorkflow.branding.fields.headerText')}</Label>
						<Textarea
							value={brandingHeaderText}
							onChange={(event) => setBrandingHeaderText(event.target.value)}
							rows={4}
							disabled={brandingMutation.isPending}
						/>
					</div>
					{brandingQuery.data?.url ? (
						<div className="rounded-md border border-border/70 bg-card/80 p-3">
							<p className="mb-2 text-xs text-muted-foreground">
								{t('documentWorkflow.branding.preview')}
							</p>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={brandingQuery.data.url}
								alt={t('documentWorkflow.branding.logoAlt')}
								className="max-h-24 rounded object-contain"
							/>
						</div>
					) : null}
					<Button type="button" onClick={() => void handleSaveBranding()}>
						{brandingMutation.isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{tCommon('saving')}
							</>
						) : (
							<>
								<Upload className="mr-2 h-4 w-4" />
								{t('documentWorkflow.actions.saveBranding')}
							</>
						)}
					</Button>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					{DOCUMENT_TEMPLATE_KINDS.map((kind) => {
						const latestTemplate = latestTemplateByKind[kind];
						const htmlValue = templateHtmlByKind[kind] ?? buildDefaultTemplateHtml(kind);

						return (
							<div key={kind} className="space-y-3 rounded-md border bg-muted/20 p-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="space-y-1">
										<h3 className="text-sm font-semibold">
											{t(`documentWorkflow.templates.${kind}.title`)}
										</h3>
										<div className="flex flex-wrap gap-2">
											{latestTemplate ? (
												<>
													<Badge variant="outline">
														{t('documentWorkflow.templates.version', {
															version: latestTemplate.versionNumber,
														})}
													</Badge>
													<Badge
														variant={
															latestTemplate.status === 'PUBLISHED'
																? 'default'
																: 'secondary'
														}
													>
														{t(
															`documentWorkflow.templates.status.${latestTemplate.status}`,
														)}
													</Badge>
												</>
											) : (
												<Badge variant="outline">
													{t('documentWorkflow.templates.noTemplate')}
												</Badge>
											)}
										</div>
									</div>
								</div>

								<LegalTemplateEditor
									title={t(`documentWorkflow.templates.${kind}.editorTitle`)}
									description={t(`documentWorkflow.templates.${kind}.editorDescription`)}
									value={htmlValue}
									onChange={(nextValue) =>
										setTemplateHtmlByKind((previous) => ({
											...previous,
											[kind]: nextValue,
										}))
									}
									tokens={TEMPLATE_TOKENS}
									disabled={
										createDraftMutation.isPending ||
										updateTemplateMutation.isPending ||
										publishTemplateMutation.isPending
									}
								/>

								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => void handleCreateDraft(kind)}
										disabled={createDraftMutation.isPending}
									>
										{t('documentWorkflow.actions.createDraft')}
									</Button>
									<Button
										type="button"
										onClick={() => void handleSaveTemplate(kind)}
										disabled={updateTemplateMutation.isPending}
									>
										{updateTemplateMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{tCommon('saving')}
											</>
										) : (
											t('documentWorkflow.actions.saveTemplate')
										)}
									</Button>
									<Button
										type="button"
										variant="secondary"
										onClick={() => void handlePublishTemplate(kind)}
										disabled={publishTemplateMutation.isPending}
									>
										{publishTemplateMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{t('documentWorkflow.actions.publishing')}
											</>
										) : (
											<>
												<CheckCircle2 className="mr-2 h-4 w-4" />
												{t('documentWorkflow.actions.publishTemplate')}
											</>
										)}
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
