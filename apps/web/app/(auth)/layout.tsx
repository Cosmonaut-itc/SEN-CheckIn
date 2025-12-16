import React, { type ReactNode } from 'react';

/**
 * Props for the AuthLayout component.
 */
interface AuthLayoutProps {
	/** Child components to render within the auth layout */
	children: ReactNode;
}

/**
 * Layout component for authentication pages (sign-in, sign-up).
 * Centers the auth forms on the page with a clean, minimal design.
 *
 * @param props - Component props containing children
 * @returns The auth layout JSX element
 */
export default function AuthLayout({ children }: AuthLayoutProps): React.ReactElement {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
			<div className="w-full max-w-md px-4">{children}</div>
		</div>
	);
}
