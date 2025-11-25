'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/**
 * Sign Up page component.
 * DEV ONLY - This page is only accessible in development mode.
 * Provides registration form for new admin users.
 *
 * @returns The sign up page JSX element
 */
export default function SignUpPage(): React.ReactElement {
	const router = useRouter();
	const [name, setName] = useState<string>('');
	const [email, setEmail] = useState<string>('');
	const [password, setPassword] = useState<string>('');
	const [confirmPassword, setConfirmPassword] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const isProduction = process.env.NODE_ENV === 'production';

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
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setError(null);

		// Validate passwords match
		if (password !== confirmPassword) {
			setError('Passwords do not match');
			return;
		}

		// Validate password strength
		if (password.length < 8) {
			setError('Password must be at least 8 characters');
			return;
		}

		setIsLoading(true);

		try {
			const result = await signUp.email({
				name,
				email,
				password,
			});

			if (result.error) {
				setError(result.error.message ?? 'Failed to create account');
				setIsLoading(false);
				return;
			}

			router.push('/dashboard');
		} catch (err) {
			console.error('Failed to sign up', err);
			setError('An unexpected error occurred');
			setIsLoading(false);
		}
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
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="John Doe"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="admin@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={isLoading}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							placeholder="••••••••"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={isLoading}
							minLength={8}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							id="confirmPassword"
							type="password"
							placeholder="••••••••"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							required
							disabled={isLoading}
							minLength={8}
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Creating account...
							</>
						) : (
							'Create Account'
						)}
					</Button>
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
