import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Next.js middleware for handling authentication and route protection.
 * Redirects users based on their authentication status:
 * - Authenticated users accessing auth pages -> Dashboard
 * - Unauthenticated users accessing protected routes -> Sign In
 *
 * @param request - The incoming Next.js request
 * @returns NextResponse with appropriate redirect or continuation
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
	const sessionCookie = getSessionCookie(request);
	const { pathname } = request.nextUrl;

	/** Auth pages that authenticated users should be redirected away from */
	const authPages: string[] = ['/sign-in', '/sign-up'];

	/** Protected routes that require authentication */
	const protectedPaths: string[] = [
		'/dashboard',
		'/employees',
		'/devices',
		'/locations',
		'/clients',
		'/attendance',
		'/api-keys',
		'/users',
		'/organizations',
	];

	// Redirect authenticated users away from auth pages
	if (sessionCookie && authPages.includes(pathname)) {
		return NextResponse.redirect(new URL('/dashboard', request.url));
	}

	// Redirect unauthenticated users from protected routes to sign in
	const isProtectedRoute = protectedPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`)
	);

	if (!sessionCookie && isProtectedRoute) {
		return NextResponse.redirect(new URL('/sign-in', request.url));
	}

	return NextResponse.next();
}

/**
 * Middleware configuration - defines which routes the middleware applies to.
 */
export const config = {
	matcher: [
		'/sign-in',
		'/sign-up',
		'/dashboard/:path*',
		'/employees/:path*',
		'/devices/:path*',
		'/locations/:path*',
		'/clients/:path*',
		'/attendance/:path*',
		'/api-keys/:path*',
		'/users/:path*',
		'/organizations/:path*',
	],
};

