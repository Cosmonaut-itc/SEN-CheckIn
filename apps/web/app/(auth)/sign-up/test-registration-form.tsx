'use client';

import { createOrganization } from '@/actions/organizations';
import { createOrganizationUser } from '@/actions/users';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { signOut, signUp } from '@/lib/auth-client';
import { useAppForm } from '@/lib/forms';
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useState } from 'react';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Form values for provisioning test registration data.
 */
interface TestRegistrationFormValues {
	organizationName: string;
	organizationSlug: string;
	adminName: string;
	adminEmail: string;
	adminPassword: string;
	adminConfirmPassword: string;
	memberName: string;
	memberEmail: string;
	memberPassword: string;
	memberConfirmPassword: string;
}

/**
 * Provisioning summary used for success state rendering.
 */
interface ProvisionedAccounts {
	organizationName: string;
	organizationSlug: string;
	adminEmail: string;
	memberEmail: string;
}

/**
 * Extracts a readable error message from BetterAuth responses.
 *
 * @param error - Error payload returned by BetterAuth client
 * @returns Normalized error message when present
 */
function extractAuthErrorMessage(error: unknown): string | null {
	if (!error) {
		return null;
	}

	if (typeof error === 'string') {
		return error.trim() ? error : null;
	}

	if (typeof error === 'object') {
		const record = error as { message?: unknown; code?: unknown; error?: unknown };
		if (typeof record.message === 'string' && record.message.trim()) {
			return record.message;
		}
		if (typeof record.code === 'string' && record.code.trim()) {
			return record.code;
		}
		if (typeof record.error === 'string' && record.error.trim()) {
			return record.error;
		}
	}

	return null;
}

/**
 * Builds a URL-friendly slug from user input.
 *
 * @param value - Raw slug or organization name
 * @returns Normalized slug value
 */
function normalizeSlug(value: string): string {
	const base = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return base;
}

/**
 * Builds a username from an email address.
 *
 * @param email - Email address to derive from
 * @returns Sanitized username string
 */
function buildUsernameFromEmail(email: string): string {
	const prefix = email.split('@')[0] ?? '';
	const normalized = prefix
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (normalized.length >= 3) {
		return normalized;
	}
	return `user_${normalized || 'test'}`;
}

/**
 * Extracts an organization id from a create response payload.
 *
 * @param payload - Response data from organization creation
 * @returns Organization id or null when unavailable
 */
function extractOrganizationId(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}
	const record = payload as { id?: unknown; organization?: unknown };
	if (typeof record.id === 'string') {
		return record.id;
	}
	if (record.organization && typeof record.organization === 'object') {
		const nested = record.organization as { id?: unknown };
		if (typeof nested.id === 'string') {
			return nested.id;
		}
	}
	return null;
}

/**
 * Test registration form component for dev/test environments.
 *
 * @returns The test registration form JSX element
 */
export function TestRegistrationForm(): React.ReactElement {
	const t = useTranslations('Auth');
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
	const [provisioned, setProvisioned] = useState<ProvisionedAccounts | null>(null);
	const isProduction = process.env.NODE_ENV === 'production';

	/**
	 * Handles provisioning form submission.
	 *
	 * @param values - Form values with organization and user credentials
	 * @returns Promise that resolves after provisioning completes
	 */
	const handleProvision = useCallback(
		async (values: TestRegistrationFormValues): Promise<void> => {
			setError(null);

			if (values.adminPassword !== values.adminConfirmPassword) {
				setError(t('testRegistration.errors.adminPasswordMismatch'));
				return;
			}

			if (values.memberPassword !== values.memberConfirmPassword) {
				setError(t('testRegistration.errors.memberPasswordMismatch'));
				return;
			}

			if (
				values.adminPassword.length < MIN_PASSWORD_LENGTH ||
				values.memberPassword.length < MIN_PASSWORD_LENGTH
			) {
				setError(t('testRegistration.errors.passwordTooShort'));
				return;
			}

			const organizationName = values.organizationName.trim();
			const rawSlug = values.organizationSlug.trim() || organizationName;
			const organizationSlug = normalizeSlug(rawSlug);

			if (!organizationName || !organizationSlug) {
				setError(t('testRegistration.errors.organizationRequired'));
				return;
			}

			setIsProvisioning(true);

			const adminEmail = values.adminEmail.trim();
			const adminUsername = buildUsernameFromEmail(adminEmail);
			const signUpResult = await signUp.email({
				name: values.adminName.trim(),
				email: adminEmail,
				password: values.adminPassword,
				username: adminUsername,
			});

			if (signUpResult.error) {
				const signUpErrorMessage = extractAuthErrorMessage(signUpResult.error);
				setError(
					signUpErrorMessage
						? t('testRegistration.errors.signUpFailedDetailed', {
								detail: signUpErrorMessage,
							})
						: t('testRegistration.errors.signUpFailed'),
				);
				setIsProvisioning(false);
				return;
			}

			const organizationResult = await createOrganization({
				name: organizationName,
				slug: organizationSlug,
			});

			if (!organizationResult.success || !organizationResult.data) {
				setError(t('testRegistration.errors.organizationFailed'));
				setIsProvisioning(false);
				return;
			}

			const organizationId = extractOrganizationId(organizationResult.data);

			if (!organizationId) {
				setError(t('testRegistration.errors.organizationFailed'));
				setIsProvisioning(false);
				return;
			}

			const memberUsername = buildUsernameFromEmail(values.memberEmail.trim());
			const memberResult = await createOrganizationUser({
				name: values.memberName.trim(),
				email: values.memberEmail.trim(),
				username: memberUsername,
				password: values.memberPassword,
				role: 'member',
				organizationId,
			});

			if (!memberResult.success) {
				setError(t('testRegistration.errors.memberProvisionFailed'));
				setIsProvisioning(false);
				return;
			}

			setProvisioned({
				organizationName,
				organizationSlug,
				adminEmail: values.adminEmail.trim(),
				memberEmail: values.memberEmail.trim(),
			});
			setIsProvisioning(false);
		},
		[t],
	);

	/**
	 * Handles form submission for provisioning.
	 *
	 * @param value - Form value payload
	 * @returns Promise that resolves after submission completes
	 */
	const handleSubmit = useCallback(
		async ({ value }: { value: TestRegistrationFormValues }): Promise<void> => {
			await handleProvision(value);
		},
		[handleProvision],
	);

	/**
	 * Navigates to the sign-in screen after signing out.
	 *
	 * @returns Promise that resolves after navigation is initiated
	 */
	const handleGoToSignIn = useCallback(async (): Promise<void> => {
		try {
			await signOut();
		} catch (signOutError) {
			void signOutError;
		}
		router.push('/sign-in');
	}, [router]);

	const form = useAppForm({
		defaultValues: {
			organizationName: '',
			organizationSlug: '',
			adminName: '',
			adminEmail: '',
			adminPassword: '',
			adminConfirmPassword: '',
			memberName: '',
			memberEmail: '',
			memberPassword: '',
			memberConfirmPassword: '',
		},
		onSubmit: handleSubmit,
	});

	if (isProduction) {
		return (
			<div className="flex items-center justify-center text-center">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						{t('testRegistration.productionDisabled')}
					</p>
					<Link
						href="/sign-in"
						className="text-primary underline-offset-4 hover:underline"
					>
						{t('testRegistration.returnToSignIn')}
					</Link>
				</div>
			</div>
		);
	}

	if (provisioned) {
		return (
			<div
				className="flex flex-col gap-6 w-full max-w-md mx-auto"
				data-testid="test-registration-success"
			>
				<div className="flex flex-col items-center gap-2 text-center">
					<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<UserPlus className="h-6 w-6" />
					</div>
					<h1 className="text-2xl font-bold tracking-tight">
						{t('testRegistration.success.title')}
					</h1>
					<p className="text-balance text-sm text-muted-foreground">
						{t('testRegistration.success.description')}
					</p>
				</div>
				<Card className="border-[color:var(--border-default)] shadow-[var(--shadow-lg)]">
					<CardContent className="space-y-3 pt-6 text-sm">
						<div>
							<p className="text-muted-foreground">
								{t('testRegistration.success.organization')}
							</p>
							<p className="font-medium">
								{provisioned.organizationName} ({provisioned.organizationSlug})
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">
								{t('testRegistration.success.admin')}
							</p>
							<p className="font-medium">{provisioned.adminEmail}</p>
						</div>
						<div>
							<p className="text-muted-foreground">
								{t('testRegistration.success.member')}
							</p>
							<p className="font-medium">{provisioned.memberEmail}</p>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 pb-6">
						<button
							type="button"
							className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
							onClick={handleGoToSignIn}
							data-testid="test-registration-go-sign-in"
						>
							{t('testRegistration.actions.goToSignIn')}
						</button>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<ShieldCheck className="h-6 w-6" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">{t('testRegistration.title')}</h1>
				<p className="text-balance text-sm text-muted-foreground">
					{t('testRegistration.subtitle')}
				</p>
			</div>
			<Card className="border-[color:var(--border-default)] shadow-[var(--shadow-lg)]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
					data-testid="test-registration-form"
				>
					<CardContent className="space-y-6 pt-6">
						{error && (
							<div
								role="alert"
								aria-live="assertive"
								className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
							>
								{error}
							</div>
						)}

						<div className="space-y-4">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{t('testRegistration.sections.organization')}
							</p>
							<form.AppField
								name="organizationName"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t(
													'testRegistration.validation.organizationNameRequired',
												)
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.organizationName')}
										placeholder={t(
											'testRegistration.placeholders.organizationName',
										)}
										orientation="vertical"
									/>
								)}
							</form.AppField>
							<form.AppField
								name="organizationSlug"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t(
													'testRegistration.validation.organizationSlugRequired',
												)
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.organizationSlug')}
										placeholder={t(
											'testRegistration.placeholders.organizationSlug',
										)}
										orientation="vertical"
									/>
								)}
							</form.AppField>
						</div>

						<div className="space-y-4">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{t('testRegistration.sections.admin')}
							</p>
							<form.AppField
								name="adminName"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('testRegistration.validation.adminNameRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.adminName')}
										placeholder={t('testRegistration.placeholders.adminName')}
										orientation="vertical"
									/>
								)}
							</form.AppField>
							<form.AppField
								name="adminEmail"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('testRegistration.validation.adminEmailRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.adminEmail')}
										type="email"
										placeholder={t('testRegistration.placeholders.adminEmail')}
										orientation="vertical"
										autoComplete="email"
										spellCheck={false}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="adminPassword"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('testRegistration.validation.adminPasswordRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.adminPassword')}
										type="password"
										placeholder={t(
											'testRegistration.placeholders.adminPassword',
										)}
										orientation="vertical"
										autoComplete="new-password"
										spellCheck={false}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="adminConfirmPassword"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t(
													'testRegistration.validation.adminConfirmPasswordRequired',
												)
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.adminConfirmPassword')}
										type="password"
										placeholder={t(
											'testRegistration.placeholders.adminConfirmPassword',
										)}
										orientation="vertical"
										autoComplete="new-password"
										spellCheck={false}
									/>
								)}
							</form.AppField>
						</div>

						<div className="space-y-4">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{t('testRegistration.sections.member')}
							</p>
							<form.AppField
								name="memberName"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('testRegistration.validation.memberNameRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.memberName')}
										placeholder={t('testRegistration.placeholders.memberName')}
										orientation="vertical"
									/>
								)}
							</form.AppField>
							<form.AppField
								name="memberEmail"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('testRegistration.validation.memberEmailRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.memberEmail')}
										type="email"
										placeholder={t('testRegistration.placeholders.memberEmail')}
										orientation="vertical"
										autoComplete="email"
										spellCheck={false}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="memberPassword"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t(
													'testRegistration.validation.memberPasswordRequired',
												)
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.memberPassword')}
										type="password"
										placeholder={t(
											'testRegistration.placeholders.memberPassword',
										)}
										orientation="vertical"
										autoComplete="new-password"
										spellCheck={false}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="memberConfirmPassword"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t(
													'testRegistration.validation.memberConfirmPasswordRequired',
												)
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('testRegistration.fields.memberConfirmPassword')}
										type="password"
										placeholder={t(
											'testRegistration.placeholders.memberConfirmPassword',
										)}
										orientation="vertical"
										autoComplete="new-password"
										spellCheck={false}
									/>
								)}
							</form.AppField>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 pb-6 mt-6">
						<form.AppForm>
							<form.SubmitButton
								label={t('testRegistration.actions.submit')}
								loadingLabel={t('testRegistration.actions.submitting')}
								className="w-full"
								dataTestId="test-registration-submit"
							/>
						</form.AppForm>
						{isProvisioning && (
							<p className="text-xs text-muted-foreground text-center">
								{t('testRegistration.helper')}
							</p>
						)}
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
