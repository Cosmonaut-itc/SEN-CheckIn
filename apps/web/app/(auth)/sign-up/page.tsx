'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { User, Mail, Lock, ShieldCheck } from 'lucide-react';
import {
	Card,
	CardContent,
	CardFooter,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useAppForm } from '@/lib/forms';

/**
 * Sign Up page component.
 * DEV ONLY - This page is only accessible in development mode.
 * Provides registration form for new admin users.
 *
 * @returns The sign up page JSX element
 */
export default function SignUpPage(): React.ReactElement {
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
				setError('Passwords do not match');
				return;
			}

			if (value.password.length < 8) {
				setError('Password must be at least 8 characters');
				return;
			}

			const result = await signUp.email({
				name: value.name,
				email: value.email,
				password: value.password,
			});

			if (result.error) {
				setError(result.error.message ?? 'Failed to create account');
				return;
			}

			router.push('/dashboard');
		},
	});

	/**
	 * Check environment on mount to handle production redirect.
	 */
	useEffect(() => {
		if (isProduction) {
			router.replace('/sign-in');
		}
	}, [isProduction, router]);

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

	// Don't render in production
	if (isProduction) {
		return (
			<div className="flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
			<div className="flex flex-col items-center gap-2 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<ShieldCheck className="h-6 w-6" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
				<p className="text-balance text-sm text-muted-foreground">
					Enter your details below to create your admin account
				</p>
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
								validators={{ onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined) }}
							>
								{(field) => (
									<field.TextField
										label="Name"
										placeholder="John Doe"
										orientation="vertical"
										startIcon={User}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="email"
								validators={{ onChange: ({ value }) => (!value.trim() ? 'Email is required' : undefined) }}
							>
								{(field) => (
									<field.TextField
										label="Email"
										type="email"
										placeholder="admin@example.com"
										orientation="vertical"
										startIcon={Mail}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="password"
								validators={{ onChange: ({ value }) => (!value.trim() ? 'Password is required' : undefined) }}
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
							<form.AppField
								name="confirmPassword"
								validators={{ onChange: ({ value }) => (!value.trim() ? 'Confirm password is required' : undefined) }}
							>
								{(field) => (
									<field.TextField
										label="Confirm Password"
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
							<form.SubmitButton label="Create Account" loadingLabel="Creating account..." className="w-full" />
						</form.AppForm>
						<p className="text-center text-sm text-muted-foreground">
							Already have an account?{' '}
							<Link
								href="/sign-in"
								className="text-primary underline-offset-4 hover:underline"
							>
								Sign in
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
