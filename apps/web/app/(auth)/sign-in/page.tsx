'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
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
 * Sign In page component.
 * Provides email/password authentication form using better-auth.
 *
 * @returns The sign in page JSX element
 */
export default function SignInPage(): React.ReactElement {
	const router = useRouter();
	const [email, setEmail] = useState<string>('');
	const [password, setPassword] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);

	/**
	 * Handles form submission for sign in.
	 * Authenticates user with email and password via better-auth.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		try {
			const result = await signIn.email({
				email,
				password,
			});

			if (result.error) {
				setError(result.error.message ?? 'Failed to sign in');
				setIsLoading(false);
				return;
			}

			router.push('/dashboard');
		} catch (err) {
			console.error('Failed to sign in', err);
			setError('An unexpected error occurred');
			setIsLoading(false);
		}
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
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Signing in...
							</>
						) : (
							'Sign In'
						)}
					</Button>
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
