'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useAppForm, TextField, SubmitButton } from '@/lib/forms';

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
		<Card className="border-zinc-200 shadow-lg dark:border-zinc-800">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold tracking-tight">
					Sign In
				</CardTitle>
				<CardDescription>
					Enter your credentials to access the admin portal
				</CardDescription>
			</CardHeader>
			<form onSubmit={handleSubmit}>
				<CardContent className="space-y-4">
					{error && (
						<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					)}
					<div className="space-y-4">
						<form.Field
							name="email"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Email is required' : undefined),
							}}
						>
							{() => (
								<TextField
									label="Email"
									type="email"
									placeholder="admin@example.com"
								/>
							)}
						</form.Field>
						<form.Field
							name="password"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Password is required' : undefined),
							}}
						>
							{() => (
								<TextField
									label="Password"
									type="password"
									placeholder="••••••••"
								/>
							)}
						</form.Field>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<SubmitButton label="Sign In" loadingLabel="Signing in..." className="w-full" />
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
	);
}
