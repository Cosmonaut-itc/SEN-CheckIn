import { getSessionCookie } from 'better-auth/cookies';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolve a safe callback URL from the incoming request search params.
 *
 * @param request - The incoming Next.js request with potential callbackUrl
 * @returns Sanitized callback path that remains within the application
 */
function getCallbackTarget(request: NextRequest): string {
	const callbackParam = request.nextUrl.searchParams.get('callbackUrl');

	if (!callbackParam) {
		return '/dashboard';
	}

	if (callbackParam.startsWith('/')) {
		return callbackParam;
	}

	try {
		const parsed = new URL(callbackParam, request.nextUrl.origin);
		if (parsed.origin === request.nextUrl.origin) {
			return `${parsed.pathname}${parsed.search}${parsed.hash}`;
		}
	} catch {
		// ignore malformed callback values
	}

	return '/dashboard';
}

/**
 * Next.js proxy for handling authentication and route protection.
 * Redirects authenticated users away from auth pages and unauthenticated users
 * away from protected dashboard routes.
 *
 * @param request - The incoming Next.js request
 * @returns A NextResponse that redirects or allows the request to proceed
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
	const sessionCookie = getSessionCookie(request);
	const { pathname } = request.nextUrl;

	/** Auth pages that authenticated users should be redirected away from */
	const authPages: string[] = ['/sign-in', '/sign-up'];

	/** Protected routes that require authentication (routes inside the (dashboard) group) */
	const protectedPaths: string[] = [
		'/dashboard',
		'/employees',
		'/devices',
		'/locations',
		'/attendance',
		'/api-keys',
		'/users',
		'/organizations',
		'/job-positions',
	];

	// Redirect authenticated users away from auth pages to dashboard
	if (sessionCookie && authPages.includes(pathname)) {
		const target = getCallbackTarget(request);
		return NextResponse.redirect(new URL(target, request.url));
	}

	// Redirect unauthenticated users from protected routes to sign in
	const isProtectedRoute = protectedPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);

	if (!sessionCookie && isProtectedRoute) {
		return NextResponse.redirect(new URL('/sign-in', request.url));
	}

	return NextResponse.next();
}

/**
 * Proxy configuration - defines which routes the proxy applies to.
 */
export const config = {
	matcher: [
		'/sign-in',
		'/sign-up',
		'/dashboard/:path*',
		'/employees/:path*',
		'/devices/:path*',
		'/locations/:path*',
		'/attendance/:path*',
		'/api-keys/:path*',
		'/users/:path*',
		'/organizations/:path*',
		'/job-positions/:path*',
	],
};
