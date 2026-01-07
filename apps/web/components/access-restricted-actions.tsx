'use client';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type React from 'react';

/**
 * Props for the AccessRestrictedActions component.
 */
interface AccessRestrictedActionsProps {
	/** Label for the sign out button */
	signOutLabel: string;
	/** Label for the back-home button */
	backHomeLabel: string;
}

/**
 * Action buttons for the access restricted page.
 *
 * @param props - Component props
 * @returns The action buttons JSX element
 */
export function AccessRestrictedActions({
	signOutLabel,
	backHomeLabel,
}: AccessRestrictedActionsProps): React.ReactElement {
	const router = useRouter();

	/**
	 * Handles sign out and redirects to sign-in.
	 *
	 * @returns Promise that resolves when the sign-out flow completes
	 */
	const handleSignOut = async (): Promise<void> => {
		const result = await signOut();
		if (result?.error) {
			console.error('Failed to sign out', result.error);
			return;
		}
		router.push('/sign-in');
		router.refresh();
	};

	return (
		<div className="flex flex-wrap items-center gap-3">
			<Button variant="outline" onClick={handleSignOut}>
				{signOutLabel}
			</Button>
			<Button asChild>
				<Link href="/">{backHomeLabel}</Link>
			</Button>
		</div>
	);
}
