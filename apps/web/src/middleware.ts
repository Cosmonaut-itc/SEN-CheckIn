import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protected routes that require authentication.
 * All routes under /dashboard require a valid session.
 */
const PROTECTED_ROUTES = ["/dashboard", "/employees", "/devices", "/locations", "/clients", "/attendance", "/api-keys"];

/**
 * Public routes that don't require authentication.
 * Auth pages should be accessible without a session.
 */
const PUBLIC_ROUTES = ["/sign-in", "/sign-up"];

/**
 * Middleware function to handle route protection.
 * Redirects unauthenticated users to sign-in page.
 * Redirects authenticated users away from auth pages to dashboard.
 *
 * @param request - The incoming request
 * @returns NextResponse with redirect or next() to continue
 */
export function middleware(request: NextRequest): NextResponse {
	const { pathname } = request.nextUrl;

	// Get session token from cookies
	const sessionToken = request.cookies.get("better-auth.session_token")?.value;
	const hasSession = Boolean(sessionToken);

	// Check if the current path is protected
	const isProtectedRoute = PROTECTED_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`)
	);

	// Check if the current path is a public auth route
	const isPublicRoute = PUBLIC_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`)
	);

	// Redirect unauthenticated users from protected routes to sign-in
	if (isProtectedRoute && !hasSession) {
		const signInUrl = new URL("/sign-in", request.url);
		signInUrl.searchParams.set("callbackUrl", pathname);
		return NextResponse.redirect(signInUrl);
	}

	// Redirect authenticated users from auth pages to dashboard
	if (isPublicRoute && hasSession) {
		return NextResponse.redirect(new URL("/dashboard", request.url));
	}

	// Redirect root to dashboard if authenticated, otherwise to sign-in
	if (pathname === "/") {
		if (hasSession) {
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	return NextResponse.next();
}

/**
 * Middleware configuration.
 * Matches all routes except static files, API routes, and Next.js internals.
 */
export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public folder files
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
