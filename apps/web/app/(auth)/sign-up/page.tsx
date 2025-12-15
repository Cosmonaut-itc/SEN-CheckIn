'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { signUp } from '@/lib/auth-client';
import { useAppForm } from '@/lib/forms';
import { Loader2, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Sign Up page component.
 * Provides registration form for new admin users.
 *
 * @returns The sign up page JSX element
 */
export default function SignUpPage(): React.ReactElement {
	const t = useTranslations('Auth');
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const isProduction = process.env.NODE_ENV === 'production';

	const form = useAppForm({
		defaultValues: {
			name: '',
			email: '',
			password: '',
			confirmPassword: '',
		},
		onSubmit: async ({ value }) => {
			setError(null);

			if (value.password !== value.confirmPassword) {
				setError(t('signUp.errors.passwordsDoNotMatch'));
				return;
			}

			if (value.password.length < 8) {
				setError(t('signUp.errors.passwordTooShort'));
				return;
			}

			const result = await signUp.email({
				name: value.name,
				email: value.email,
				password: value.password,
			});

			if (result.error) {
				setError(t('signUp.errors.failed'));
				return;
			}

			router.push('/dashboard');
		},
	});

	/**
	 * Handles form submission for sign up.
	 * Creates a new user account via better-auth.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	};

	// Disable sign up in production environments
	if (isProduction) {
		return (
			<div className="flex items-center justify-center text-center">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						{t('signUp.productionDisabled')}
					</p>
					<Link
						href="/sign-in"
						className="text-primary underline-offset-4 hover:underline"
					>
						{t('signUp.returnToSignIn')}
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<ShieldCheck className="h-6 w-6" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">{t('signUp.title')}</h1>
				<p className="text-balance text-sm text-muted-foreground">{t('signUp.subtitle')}</p>
			</div>
			<Card className="border-zinc-200 shadow-lg dark:border-zinc-800">
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4 pt-6">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}
						<div className="space-y-4">
							<form.AppField
								name="name"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signUp.validation.nameRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signUp.fields.name')}
										placeholder="John Doe"
										orientation="vertical"
										startIcon={User}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="email"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signUp.validation.emailRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signUp.fields.email')}
										type="email"
										placeholder="admin@example.com"
										orientation="vertical"
										startIcon={Mail}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="password"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signUp.validation.passwordRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signUp.fields.password')}
										type="password"
										placeholder="••••••••"
										orientation="vertical"
										startIcon={Lock}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="confirmPassword"
								validators={{
									onChange: ({ value }) =>
										!value.trim()
											? t('signUp.validation.confirmPasswordRequired')
											: undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={t('signUp.fields.confirmPassword')}
										type="password"
										placeholder="••••••••"
										orientation="vertical"
										startIcon={Lock}
									/>
								)}
							</form.AppField>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 pb-6 mt-6">
						<form.AppForm>
							<form.SubmitButton
								label={t('signUp.actions.submit')}
								loadingLabel={t('signUp.actions.submitting')}
								className="w-full"
							/>
						</form.AppForm>
						<p className="text-center text-sm text-muted-foreground">
							{t('signUp.footer.hasAccount')}{' '}
							<Link
								href="/sign-in"
								className="text-primary underline-offset-4 hover:underline"
							>
								{t('signUp.footer.signIn')}
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
