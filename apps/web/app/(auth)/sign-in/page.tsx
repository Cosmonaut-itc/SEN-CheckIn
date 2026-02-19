'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { Mail, Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useAppForm } from '@/lib/forms';

/**
 * Loading fallback component for the sign-in form.
 *
 * @returns A loading skeleton for the sign-in page
 */
function SignInLoading(): React.ReactElement {
	const t = useTranslations('Auth');
	return (
		<div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<ShieldCheck className="h-6 w-6" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">{t('signIn.title')}</h1>
				<p className="text-balance text-sm text-muted-foreground">{t('signIn.subtitle')}</p>
			</div>
			<Card className="border-[color:var(--border-default)] shadow-[var(--shadow-lg)]">
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</CardContent>
			</Card>
		</div>
	);
}

/**
 * Sign In content component containing the actual form logic.
 * Uses useSearchParams which requires Suspense boundary.
 *
 * @returns The sign in form content
 */
function SignInContent(): React.ReactElement {
	const t = useTranslations('Auth');
	const router = useRouter();
	const searchParams = useSearchParams();
	const [error, setError] = useState<string | null>(null);
	const isProduction = process.env.NODE_ENV === 'production';
	const callbackParam = searchParams.get('callbackUrl');
	const callbackUrl = useMemo(() => {
		if (!callbackParam) {
			return '/dashboard';
		}

		return callbackParam.startsWith('/') ? callbackParam : '/dashboard';
	}, [callbackParam]);

	const form = useAppForm({
		defaultValues: {
			email: '',
			password: '',
		},
		onSubmit: async ({ value }) => {
			setError(null);
			const result = await signIn.email({
				email: value.email,
				password: value.password,
			});

			if (result.error) {
				setError(t('signIn.errors.failed'));
				return;
			}

			router.push(callbackUrl);
		},
	});

	/**
	 * Handles form submission for sign in.
	 * Authenticates user with email and password via better-auth.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	};

	return (
		<div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<ShieldCheck className="h-6 w-6" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">{t('signIn.title')}</h1>
				<p className="text-balance text-sm text-muted-foreground">{t('signIn.subtitle')}</p>
			</div>
			<Card className="border-[color:var(--border-default)] shadow-[var(--shadow-lg)]">
				{/* <CardHeader> removed as we have header outside */}
				<form onSubmit={handleSubmit} data-testid="sign-in-form">
					<CardContent className="space-y-4 pt-6">
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
							<form.AppField
								name="email"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signIn.validation.emailRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signIn.fields.email')}
										type="email"
										placeholder="m@example.com"
										orientation="vertical"
										startIcon={Mail}
										autoComplete="email"
										spellCheck={false}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="password"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signIn.validation.passwordRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signIn.fields.password')}
										type="password"
										placeholder="••••••••"
										orientation="vertical"
										startIcon={Lock}
										autoComplete="current-password"
										spellCheck={false}
									/>
								)}
							</form.AppField>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 pb-6 mt-6">
						<form.AppForm>
							<form.SubmitButton
								label={t('signIn.actions.submit')}
								loadingLabel={t('signIn.actions.submitting')}
								className="w-full"
								dataTestId="sign-in-submit"
							/>
						</form.AppForm>
						{/* TODO: Remove this after initial setup - re-add: process.env.NODE_ENV === 'development' && */}
						<p className="text-center text-sm text-muted-foreground">
							{t('signIn.footer.noAccount')}{' '}
							{isProduction ? (
								<span className="text-muted-foreground">
									{t('signIn.footer.signUpDisabled')}
								</span>
							) : (
								<Link
									href="/sign-up"
									className="text-primary underline-offset-4 hover:underline"
								>
									{t('signIn.footer.signUp')}
								</Link>
							)}
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}

/**
 * Sign In page component.
 * Provides email/password authentication form using better-auth.
 * Wrapped in Suspense to support useSearchParams hook.
 *
 * @returns The sign in page JSX element
 */
export default function SignInPage(): React.ReactElement {
	return (
		<section className="relative isolate">
			<div
				aria-hidden="true"
				className="pointer-events-none fixed inset-0 -z-10"
			>
				<BackgroundBeams className="opacity-55" />
			</div>
			<Suspense fallback={<SignInLoading />}>
				<SignInContent />
			</Suspense>
		</section>
	);
}
