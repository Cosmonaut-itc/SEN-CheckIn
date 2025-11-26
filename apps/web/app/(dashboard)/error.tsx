'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

/**
 * Props for the DashboardError component.
 */
interface DashboardErrorProps {
	/** The error that was thrown */
	error: Error & { digest?: string };
	/** Function to attempt recovery by re-rendering */
	reset: () => void;
}

/**
 * Error boundary for the dashboard routes.
 * Catches errors from child components during rendering.
 * Provides a user-friendly error UI with recovery options.
 *
 * @param props - The component props
 * @returns The dashboard error UI
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
	useEffect(() => {
		// Log the error to an error reporting service
		console.error('Dashboard error:', error);
	}, [error]);

	return (
		<div className="flex min-h-[50vh] items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
						<AlertTriangle className="h-6 w-6 text-destructive" />
					</div>
					<CardTitle className="text-xl">Something went wrong</CardTitle>
					<CardDescription>
						An error occurred while loading this page. Please try again.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{process.env.NODE_ENV === 'development' && (
						<div className="rounded-md bg-muted p-3">
							<p className="text-xs font-medium text-muted-foreground">Error details:</p>
							<p className="mt-1 text-sm text-destructive">{error.message}</p>
							{error.digest && (
								<p className="mt-1 text-xs text-muted-foreground">
									Digest: {error.digest}
								</p>
							)}
						</div>
					)}
				</CardContent>
				<CardFooter className="flex flex-col gap-2 sm:flex-row">
					<Button onClick={reset} className="w-full sm:w-auto">
						<RefreshCw className="mr-2 h-4 w-4" />
						Try again
					</Button>
					<Button variant="outline" asChild className="w-full sm:w-auto">
						<Link href="/dashboard">
							<Home className="mr-2 h-4 w-4" />
							Go to Dashboard
						</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}

