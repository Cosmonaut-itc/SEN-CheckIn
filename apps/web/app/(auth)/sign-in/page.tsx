'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { Mail, Lock, ShieldCheck } from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useAppForm } from '@/lib/forms';

/**
 * Sign In page component.
 * Provides email/password authentication form using better-auth.
 *
 * @returns The sign in page JSX element
 */
export default function SignInPage(): React.ReactElement {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

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
				setError(result.error.message ?? 'Failed to sign in');
				return;
			}

			router.push('/dashboard');
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
				<h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
				<p className="text-balance text-sm text-muted-foreground">
					Enter your credentials to access the admin portal
				</p>
			</div>
			<Card className="border-zinc-200 shadow-lg dark:border-zinc-800">
				{/* <CardHeader> removed as we have header outside */}
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4 pt-6">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}
						<div className="space-y-4">
							<form.AppField
								name="email"
								validators={{
									onChange: ({ value }) => (!value.trim() ? 'Email is required' : undefined),
								}}
							>
								{(field) => (
									<field.TextField
										label="Email"
										type="email"
										placeholder="m@example.com"
										orientation="vertical"
										startIcon={Mail}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="password"
								validators={{
									onChange: ({ value }) => (!value.trim() ? 'Password is required' : undefined),
								}}
							>
								{(field) => (
									<field.TextField
										label="Password"
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
							<form.SubmitButton label="Sign In" loadingLabel="Signing in..." className="w-full" />
						</form.AppForm>
						{process.env.NODE_ENV === 'development' && (
							<p className="text-center text-sm text-muted-foreground">
								Don&apos;t have an account?{' '}
								<Link
									href="/sign-up"
									className="text-primary underline-offset-4 hover:underline"
								>
									Sign up
								</Link>
							</p>
						)}
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
