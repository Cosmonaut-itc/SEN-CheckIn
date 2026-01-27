import { type NextRequest, NextResponse } from 'next/server';

const LOCAL_API_ORIGIN = 'http://localhost:3000';

/**
 * Determines if a URL points to a localhost/loopback origin.
 *
 * @param value - URL string to evaluate
 * @returns True when the URL hostname is local
 */
function isLocalhostUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
	} catch {
		return false;
	}
}

/**
 * Resolves the upstream BetterAuth origin, forcing local API usage in dev/test.
 *
 * @returns Upstream API origin URL
 */
function resolveApiOrigin(): string {
	const envUrl = process.env.NEXT_PUBLIC_API_URL;
	if (!envUrl) {
		return LOCAL_API_ORIGIN;
	}

	if (process.env.NODE_ENV !== 'production' && !isLocalhostUrl(envUrl)) {
		return LOCAL_API_ORIGIN;
	}

	return envUrl;
}

/**
 * Upstream BetterAuth base URL (API service).
 * Falls back to localhost for local development.
 */
const API_ORIGIN: string = resolveApiOrigin();
const API_AUTH_BASE: string = API_ORIGIN.endsWith('/api/auth')
	? API_ORIGIN
	: `${API_ORIGIN}/api/auth`;

type RouteParams = {
	path?: string[];
};

/**
 * Normalizes a host header value into a cookie-safe domain by stripping scheme
 * and port information. Avoids invalid Domain attributes such as
 * `localhost:3001` which would be rejected by browsers.
 *
 * @param host - Raw host header value from the incoming request
 * @returns Hostname safe for cookie Domain attribute usage
 */
function getCookieDomain(host: string): string {
	try {
		const normalizedHost = host.includes('://') ? host : `http://${host}`;
		const parsed = new URL(normalizedHost);
		return parsed.hostname;
	} catch (error) {
		console.error('Failed to parse host for cookie domain', error);
		return host.replace(/:\d+$/, '');
	}
}

/**
 * Determines whether the Domain attribute should be attached for a cookie.
 * For localhost and loopback addresses, omitting Domain yields host-only
 * cookies that browsers will accept during local development.
 *
 * @param cookieDomain - Parsed cookie domain value
 * @returns True when a Domain attribute should be set
 */
function shouldAttachDomain(cookieDomain: string): boolean {
	const lower = cookieDomain.toLowerCase();
	return lower !== 'localhost' && lower !== '127.0.0.1' && lower !== '::1';
}

/**
 * Rewrite Set-Cookie headers so they are scoped to the web host.
 * Removes any upstream Domain attribute and enforces Secure + SameSite=None
 * to keep the session available when the API is on a different host.
 *
 * @param cookies - Raw Set-Cookie header values from the upstream response
 * @param host - The current web host (e.g., app.example.com)
 * @param isSecureRequest - Whether the incoming request was over HTTPS
 * @returns Sanitized Set-Cookie header values for the client response
 */
function rewriteSetCookieHeaders(
	cookies: string[],
	host: string,
	isSecureRequest: boolean,
): string[] {
	const cookieDomain = getCookieDomain(host);
	return cookies.map((cookie) => {
		const segments = cookie.split(';').map((segment) => segment.trim());

		// Remove upstream domain scoping
		const filtered = segments.filter((segment) => !segment.toLowerCase().startsWith('domain='));

		const hasSecure = filtered.some((segment) => segment.toLowerCase() === 'secure');
		const sameSiteIndex = filtered.findIndex((segment) =>
			segment.toLowerCase().startsWith('samesite='),
		);

		// Enforce host-only cookies on the web domain
		if (shouldAttachDomain(cookieDomain)) {
			filtered.push(`Domain=${cookieDomain}`);
		}

		// Ensure cross-site compatibility for auth redirects
		if (sameSiteIndex >= 0) {
			filtered[sameSiteIndex] = isSecureRequest ? 'SameSite=None' : 'SameSite=Lax';
		} else {
			filtered.push(isSecureRequest ? 'SameSite=None' : 'SameSite=Lax');
		}

		// Only enforce Secure when the incoming request was over HTTPS.
		if (isSecureRequest) {
			if (!hasSecure) {
				filtered.push('Secure');
			}
		} else {
			// Strip Secure for local HTTP dev to allow the cookie to be set.
			for (let i = filtered.length - 1; i >= 0; i -= 1) {
				if (filtered[i].toLowerCase() === 'secure') {
					filtered.splice(i, 1);
				}
			}
		}

		return filtered.join('; ');
	});
}

/**
 * Build the upstream BetterAuth URL for the incoming request.
 *
 * @param request - The incoming Next.js request
 * @param params - Dynamic path params from the route
 * @returns Fully qualified URL to the BetterAuth endpoint
 */
function buildUpstreamUrl(request: NextRequest, params: RouteParams | undefined): URL {
	const path = params?.path?.join('/') ?? '';
	const search = request.nextUrl.search;
	return new URL(`${API_AUTH_BASE}/${path}${search}`);
}

/**
 * Proxy handler for BetterAuth routes.
 * Forwards all /api/auth/* requests to the API service, rewrites cookies
 * to the web host so session cookies are available to the proxy and pages.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns NextResponse proxied from the upstream BetterAuth service
 */
async function handleAuthProxy(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	try {
		const resolvedParams = await context.params;
		const targetUrl = buildUpstreamUrl(request, resolvedParams);
		const isSecureRequest =
			request.nextUrl.protocol === 'https:' ||
			request.headers.get('x-forwarded-proto') === 'https';
		const requestHeaders = new Headers(request.headers);

		// Remove hop-by-hop headers and let fetch compute content length
		requestHeaders.delete('host');
		requestHeaders.delete('connection');
		requestHeaders.delete('content-length');
		requestHeaders.set('origin', request.nextUrl.origin);

		const body =
			request.method === 'GET' || request.method === 'HEAD'
				? undefined
				: await request.arrayBuffer();

		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetch(targetUrl, {
				method: request.method,
				headers: requestHeaders,
				body,
				// Keep credentials to allow upstream to read cookies and issue new ones
				credentials: 'include',
			});
		} catch (error) {
			console.error('[auth-proxy] Upstream request failed', error);
			return NextResponse.json(
				{ error: 'Auth proxy upstream request failed' },
				{ status: 502 },
			);
		}

		const responseHeaders = new Headers(upstreamResponse.headers);
		// Capture and rewrite Set-Cookie headers for the web host
		const rawSetCookies =
			typeof upstreamResponse.headers.getSetCookie === 'function'
				? upstreamResponse.headers.getSetCookie()
				: (() => {
						const single = upstreamResponse.headers.get('set-cookie');
						return single ? [single] : [];
					})();
		responseHeaders.delete('set-cookie');

		const proxyResponse = new NextResponse(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		});

		if (rawSetCookies.length > 0) {
			const host = request.headers.get('host') ?? new URL(request.url).host;
			const rewritten = rewriteSetCookieHeaders(rawSetCookies, host, isSecureRequest);
			for (const cookie of rewritten) {
				proxyResponse.headers.append('Set-Cookie', cookie);
			}
		}

		return proxyResponse;
	} catch (error) {
		console.error('[auth-proxy] Unexpected error', error);
		return NextResponse.json({ error: 'Auth proxy failed' }, { status: 500 });
	}
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxies GET requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function GET(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies POST requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function POST(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies PUT requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function PUT(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies PATCH requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function PATCH(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies DELETE requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function DELETE(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies OPTIONS requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function OPTIONS(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}

/**
 * Proxies HEAD requests to the BetterAuth service.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied response from the BetterAuth service
 */
export async function HEAD(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleAuthProxy(request, context);
}
