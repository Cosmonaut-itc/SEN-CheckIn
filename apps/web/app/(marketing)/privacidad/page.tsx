import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

/**
 * Data model for a policy list item.
 */
interface PolicyListItem {
	/** Main text for the list item */
	text: string;
	/** Optional nested bullet points */
	subItems?: string[];
}

/**
 * Render a nested list item in the privacy policy.
 *
 * @param item - Nested list text to render
 * @param index - Index used for the React key
 * @returns The nested list item JSX element
 */
function renderPolicySubItem(item: string, index: number): React.ReactElement {
	return (
		<li key={`${item}-${index}`} className="text-sm text-muted-foreground">
			{item}
		</li>
	);
}

/**
 * Render a list item for the privacy policy.
 *
 * @param item - List item data to render
 * @param index - Index used for the React key
 * @returns The list item JSX element
 */
function renderPolicyItem(item: PolicyListItem, index: number): React.ReactElement {
	return (
		<li key={`${item.text}-${index}`} className="space-y-2">
			<p className="text-sm text-muted-foreground">{item.text}</p>
			{item.subItems && item.subItems.length > 0 ? (
				<ul className="ml-5 list-disc space-y-1">{item.subItems.map(renderPolicySubItem)}</ul>
			) : null}
		</li>
	);
}

/**
 * Privacy policy page component.
 *
 * @returns The privacy policy page JSX element
 */
export default async function PrivacyPolicyPage(): Promise<React.ReactElement> {
	const t = await getTranslations('PrivacyPolicy');

	const responsibleItems: PolicyListItem[] = [
		{ text: t('sections.responsible.fields.name') },
		{ text: t('sections.responsible.fields.address') },
		{ text: t('sections.responsible.fields.phone') },
		{ text: t('sections.responsible.fields.website') },
		{ text: t('sections.responsible.fields.privacyDepartment') },
		{ text: t('sections.responsible.fields.privacyEmail') },
	];

	const scopeItems: PolicyListItem[] = [
		{ text: t('sections.scope.items.mobile') },
		{ text: t('sections.scope.items.web') },
	];

	const accountItems: PolicyListItem[] = [
		{ text: t('sections.data.account.items.fullName') },
		{ text: t('sections.data.account.items.email') },
		{ text: t('sections.data.account.items.identifiers') },
		{ text: t('sections.data.account.items.organization') },
	];

	const operationalItems: PolicyListItem[] = [
		{ text: t('sections.data.operational.items.employees') },
		{ text: t('sections.data.operational.items.attendance') },
	];

	const biometricItems: PolicyListItem[] = [
		{
			text: t('sections.data.biometric.items.images'),
			subItems: [
				t('sections.data.biometric.items.enrollment'),
				t('sections.data.biometric.items.verification'),
			],
		},
		{ text: t('sections.data.biometric.items.templates') },
	];

	const technicalItems: PolicyListItem[] = [
		{ text: t('sections.data.technical.items.sessions') },
		{ text: t('sections.data.technical.items.logs') },
	];

	const primaryPurposeItems: PolicyListItem[] = [
		{ text: t('sections.purposes.primary.items.operation') },
		{ text: t('sections.purposes.primary.items.management') },
		{ text: t('sections.purposes.primary.items.reports') },
		{ text: t('sections.purposes.primary.items.security') },
		{ text: t('sections.purposes.primary.items.support') },
		{ text: t('sections.purposes.primary.items.legal') },
	];

	const consentPurposeItems: PolicyListItem[] = [
		{ text: t('sections.purposes.consent.items.enrollment') },
		{ text: t('sections.purposes.consent.items.verification') },
		{ text: t('sections.purposes.consent.items.fraud') },
	];

	const consentMethodItems: PolicyListItem[] = [
		{ text: t('sections.consent.express.items.signature') },
		{ text: t('sections.consent.express.items.electronic') },
		{ text: t('sections.consent.express.items.authentication') },
	];

	const cameraMobileItems: PolicyListItem[] = [
		{ text: t('sections.camera.mobile.items.identify') },
		{ text: t('sections.camera.mobile.items.attendance') },
	];

	const retentionItems: PolicyListItem[] = [
		{ text: t('sections.retention.items.verification') },
		{ text: t('sections.retention.items.biometric') },
		{ text: t('sections.retention.items.attendance') },
	];

	const processorItems: PolicyListItem[] = [
		{ text: t('sections.transfers.processors.items.aws') },
		{ text: t('sections.transfers.processors.items.infrastructure') },
	];

	const thirdPartyItems: PolicyListItem[] = [
		{ text: t('sections.transfers.thirdParties.items.service') },
		{ text: t('sections.transfers.thirdParties.items.authority') },
		{ text: t('sections.transfers.thirdParties.items.legal') },
	];

	const arcoContactItems: PolicyListItem[] = [
		{ text: t('sections.arco.contact.channel') },
		{ text: t('sections.arco.contact.subject') },
	];

	const arcoRequirementItems: PolicyListItem[] = [
		{ text: t('sections.arco.requirements.items.identity') },
		{ text: t('sections.arco.requirements.items.documents') },
		{ text: t('sections.arco.requirements.items.description') },
		{ text: t('sections.arco.requirements.items.right') },
		{ text: t('sections.arco.requirements.items.location') },
	];

	const limitationItems: PolicyListItem[] = [
		{ text: t('sections.limitation.items.biometrics') },
		{ text: t('sections.limitation.items.communications') },
		{ text: t('sections.limitation.items.cookies') },
	];

	return (
		<div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-16">
			<header className="space-y-4">
				<Badge className="w-fit bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
					{t('badge')}
				</Badge>
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
						{t('title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t('lastUpdatedLabel')} {t('lastUpdatedDate')}
					</p>
					<p className="text-sm text-muted-foreground">{t('intro')}</p>
				</div>
			</header>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.responsible.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">
					{t('sections.responsible.description')}
				</p>
				<ul className="mt-4 space-y-2">{responsibleItems.map(renderPolicyItem)}</ul>
				<p className="mt-4 text-sm text-muted-foreground">
					{t('sections.responsible.note')}
				</p>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.scope.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.scope.description')}</p>
				<ul className="mt-4 space-y-2">{scopeItems.map(renderPolicyItem)}</ul>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.data.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.data.description')}</p>

				<div className="mt-5 space-y-4">
					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.data.account.title')}
						</h3>
						<ul className="mt-3 space-y-2">{accountItems.map(renderPolicyItem)}</ul>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.data.operational.title')}
						</h3>
						<ul className="mt-3 space-y-2">{operationalItems.map(renderPolicyItem)}</ul>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.data.biometric.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.data.biometric.description')}
						</p>
						<ul className="mt-3 space-y-2">{biometricItems.map(renderPolicyItem)}</ul>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.data.biometric.note')}
						</p>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.data.technical.title')}
						</h3>
						<ul className="mt-3 space-y-2">{technicalItems.map(renderPolicyItem)}</ul>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.purposes.title')}
				</h2>

				<div className="mt-4 space-y-4">
					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.purposes.primary.title')}
						</h3>
						<ul className="mt-3 space-y-2">{primaryPurposeItems.map(renderPolicyItem)}</ul>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.purposes.consent.title')}
						</h3>
						<ul className="mt-3 space-y-2">{consentPurposeItems.map(renderPolicyItem)}</ul>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.purposes.consent.notice')}
						</p>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.purposes.consent.noMarketing')}
						</p>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.consent.title')}
				</h2>

				<div className="mt-4 space-y-4">
					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.consent.express.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.consent.express.description')}
						</p>
						<ul className="mt-3 space-y-2">{consentMethodItems.map(renderPolicyItem)}</ul>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.consent.revocation.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.consent.revocation.description')}
						</p>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.consent.revocation.note')}
						</p>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.consent.opposition.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.consent.opposition.description')}
						</p>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.camera.title')}
				</h2>
				<div className="mt-4 space-y-4">
					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.camera.mobile.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.camera.mobile.description')}
						</p>
						<ul className="mt-3 space-y-2">{cameraMobileItems.map(renderPolicyItem)}</ul>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.camera.mobile.note')}
						</p>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.camera.web.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.camera.web.description')}
						</p>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.retention.title')}
				</h2>
				<ul className="mt-4 space-y-2">{retentionItems.map(renderPolicyItem)}</ul>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.transfers.title')}
				</h2>

				<div className="mt-4 space-y-4">
					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.transfers.processors.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.transfers.processors.description')}
						</p>
						<ul className="mt-3 space-y-2">{processorItems.map(renderPolicyItem)}</ul>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.transfers.processors.note')}
						</p>
					</div>

					<div>
						<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
							{t('sections.transfers.thirdParties.title')}
						</h3>
						<p className="mt-2 text-sm text-muted-foreground">
							{t('sections.transfers.thirdParties.description')}
						</p>
						<ul className="mt-3 space-y-2">{thirdPartyItems.map(renderPolicyItem)}</ul>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.transfers.thirdParties.consentNotice')}
						</p>
						<p className="mt-3 text-sm text-muted-foreground">
							{t('sections.transfers.thirdParties.noSelling')}
						</p>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.security.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.security.description')}</p>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.security.confidentiality')}</p>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.security.breachNotice')}</p>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.arco.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.arco.description')}</p>
				<ul className="mt-4 space-y-2">{arcoContactItems.map(renderPolicyItem)}</ul>
				<h3 className="mt-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.arco.requirements.title')}
				</h3>
				<ul className="mt-3 space-y-2">{arcoRequirementItems.map(renderPolicyItem)}</ul>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.arco.timeline')}</p>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.arco.biometricsNote')}</p>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.limitation.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">
					{t('sections.limitation.description')}
				</p>
				<ul className="mt-4 space-y-2">{limitationItems.map(renderPolicyItem)}</ul>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.changes.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.changes.description')}</p>
			</section>

			<section className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-800/70 dark:bg-zinc-950/60">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t('sections.minors.title')}
				</h2>
				<p className="mt-3 text-sm text-muted-foreground">{t('sections.minors.description')}</p>
			</section>
		</div>
	);
}
