import type { ReactNode } from "react";

/**
 * Auth layout props interface.
 */
interface AuthLayoutProps {
	children: ReactNode;
}

/**
 * Auth layout component for sign-in and sign-up pages.
 * Centers the auth form in the viewport with a clean design.
 *
 * @param props - Layout props containing children
 * @returns Rendered auth layout
 */
export default function AuthLayout({ children }: AuthLayoutProps): React.JSX.Element {
	return (
		<div className="min-h-screen flex items-center justify-center bg-muted/40">
			<div className="w-full max-w-md p-4">
				{children}
			</div>
		</div>
	);
}
