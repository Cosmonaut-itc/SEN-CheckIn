"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { signUp } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";

/**
 * Sign-up page component.
 * Handles new user registration with name, email, and password.
 *
 * @returns Rendered sign-up form
 */
export default function SignUpPage(): React.JSX.Element {
	const router = useRouter();
	const { toast } = useToast();
	const [isLoading, setIsLoading] = React.useState<boolean>(false);

	/**
	 * Handles form submission for sign-up.
	 *
	 * @param event - Form submission event
	 */
	const handleSubmit = async (
		event: React.FormEvent<HTMLFormElement>
	): Promise<void> => {
		event.preventDefault();
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		// Validate password match
		if (password !== confirmPassword) {
			toast({
				title: "Passwords don't match",
				description: "Please make sure your passwords match.",
				variant: "destructive",
			});
			setIsLoading(false);
			return;
		}

		// Validate password length
		if (password.length < 8) {
			toast({
				title: "Password too short",
				description: "Password must be at least 8 characters long.",
				variant: "destructive",
			});
			setIsLoading(false);
			return;
		}

		try {
			const { data, error } = await signUp.email({
				name,
				email,
				password,
			});

			if (error) {
				toast({
					title: "Sign-up failed",
					description: error.message ?? "Could not create account. Please try again.",
					variant: "destructive",
				});
				return;
			}

			if (data) {
				toast({
					title: "Account created!",
					description: "Your account has been created successfully.",
				});
				router.push("/dashboard");
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
					Create an Account
				</CardTitle>
				<CardDescription className="text-center">
					Enter your details to create your admin account
				</CardDescription>
			</CardHeader>
			<form onSubmit={handleSubmit}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Full Name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="John Doe"
							required
							disabled={isLoading}
							autoComplete="name"
						/>
					</div>
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
							placeholder="Create a password"
							required
							disabled={isLoading}
							autoComplete="new-password"
							minLength={8}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							placeholder="Confirm your password"
							required
							disabled={isLoading}
							autoComplete="new-password"
							minLength={8}
						/>
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-4">
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? "Creating account..." : "Create Account"}
					</Button>
					<p className="text-sm text-muted-foreground text-center">
						Already have an account?{" "}
						<Link href="/sign-in" className="text-primary hover:underline">
							Sign in
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
