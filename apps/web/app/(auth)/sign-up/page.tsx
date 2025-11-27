'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useAppForm, TextField, SubmitButton } from '@/lib/forms';

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
		<Card className="border-zinc-200 shadow-lg dark:border-zinc-800">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold tracking-tight">
					Create Account
				</CardTitle>
				<CardDescription>
					Register a new admin account (development only)
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
							name="name"
							validators={{ onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined) }}
						>
							{() => <TextField label="Name" placeholder="John Doe" />}
						</form.Field>
						<form.Field
							name="email"
							validators={{ onChange: ({ value }) => (!value.trim() ? 'Email is required' : undefined) }}
						>
							{() => <TextField label="Email" type="email" placeholder="admin@example.com" />}
						</form.Field>
						<form.Field
							name="password"
							validators={{ onChange: ({ value }) => (!value.trim() ? 'Password is required' : undefined) }}
						>
							{() => <TextField label="Password" type="password" placeholder="••••••••" />}
						</form.Field>
						<form.Field
							name="confirmPassword"
							validators={{ onChange: ({ value }) => (!value.trim() ? 'Confirm password is required' : undefined) }}
						>
							{() => <TextField label="Confirm Password" type="password" placeholder="••••••••" />}
						</form.Field>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<SubmitButton label="Create Account" loadingLabel="Creating account..." className="w-full" />
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
	);
}
