"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { signIn } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Sign-in form component.
 * Handles user authentication with email and password.
 *
 * @returns Rendered sign-in form
 */
function SignInForm(): React.JSX.Element {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { toast } = useToast();
	const [isLoading, setIsLoading] = React.useState<boolean>(false);

	const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

	/**
	 * Handles form submission for sign-in.
	 *
	 * @param event - Form submission event
	 */
	const handleSubmit = async (
		event: React.FormEvent<HTMLFormElement>
	): Promise<void> => {
		event.preventDefault();
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		try {
			const { data, error } = await signIn.email({
				email,
				password,
			});

			if (error) {
				toast({
					title: "Sign-in failed",
					description: error.message ?? "Invalid credentials. Please try again.",
					variant: "destructive",
				});
				return;
			}

			if (data) {
				toast({
					title: "Welcome back!",
					description: "You have been signed in successfully.",
				});
				router.push(callbackUrl);
				router.refresh();
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "An unexpected error occurred. Please try again.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card>
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold text-center">
					Sen Checkin
				</CardTitle>
				<CardDescription className="text-center">
					Sign in to access the admin portal
				</CardDescription>
			</CardHeader>
			<form onSubmit={handleSubmit}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="admin@example.com"
							required
							disabled={isLoading}
							autoComplete="email"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							name="password"
							type="password"
							placeholder="Enter your password"
							required
							disabled={isLoading}
							autoComplete="current-password"
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? "Signing in..." : "Sign In"}
					</Button>
					<p className="text-sm text-muted-foreground text-center">
						Don&apos;t have an account?{" "}
						<Link href="/sign-up" className="text-primary hover:underline">
							Sign up
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}

/**
 * Loading fallback for the sign-in form.
 *
 * @returns Rendered loading skeleton
 */
function SignInFormSkeleton(): React.JSX.Element {
	return (
		<Card>
			<CardHeader className="space-y-1">
				<Skeleton className="h-8 w-32 mx-auto" />
				<Skeleton className="h-4 w-48 mx-auto" />
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Skeleton className="h-4 w-12" />
					<Skeleton className="h-9 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-9 w-full" />
				</div>
			</CardContent>
			<CardFooter className="flex flex-col gap-4">
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-4 w-40 mx-auto" />
			</CardFooter>
		</Card>
	);
}

/**
 * Sign-in page component.
 * Wraps the form in a Suspense boundary for useSearchParams.
 *
 * @returns Rendered sign-in page
 */
export default function SignInPage(): React.JSX.Element {
	return (
		<Suspense fallback={<SignInFormSkeleton />}>
			<SignInForm />
		</Suspense>
	);
}
