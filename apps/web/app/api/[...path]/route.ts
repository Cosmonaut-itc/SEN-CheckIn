import { type NextRequest, NextResponse } from 'next/server';

type RouteParams = {
	path?: string[];
};

/**
 * Upstream API base URL (BetterAuth host) for non-auth routes.
 * Defaults to localhost for local development.
 */
const API_ORIGIN: string = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3000').replace(
	/\/$/,
	'',
);

/**
 * Normalizes a request host into a safe cookie domain by removing scheme and
 * port components. Prevents invalid Domain attributes (e.g., localhost:3001)
 * that would cause browsers to drop the cookie.
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
 * Determines whether a Domain attribute should be attached for the provided
 * cookie domain. For localhost or loopback hosts, omitting Domain allows the
 * browser to accept host-only cookies during local development.
 *
 * @param cookieDomain - Parsed cookie domain value
 * @returns True when a Domain attribute should be set
 */
function shouldAttachDomain(cookieDomain: string): boolean {
	const lower = cookieDomain.toLowerCase();
	return lower !== 'localhost' && lower !== '127.0.0.1' && lower !== '::1';
}

/**
 * Rewrite Set-Cookie headers to scope them to the web host and ensure
 * cross-site compatibility.
 *
 * @param cookies - Raw Set-Cookie header values from the upstream response
 * @param host - Current web host (e.g., app.example.com)
 * @returns Rewritten Set-Cookie header values
 */
function rewriteSetCookieHeaders(
	cookies: string[],
	host: string,
	isSecureRequest: boolean,
): string[] {
	const cookieDomain = getCookieDomain(host);
	return cookies.map((cookie) => {
		const segments = cookie.split(';').map((segment) => segment.trim());

		const filtered = segments.filter((segment) => !segment.toLowerCase().startsWith('domain='));

		const hasSecure = filtered.some((segment) => segment.toLowerCase() === 'secure');
		const sameSiteIndex = filtered.findIndex((segment) =>
			segment.toLowerCase().startsWith('samesite='),
		);

		if (shouldAttachDomain(cookieDomain)) {
			filtered.push(`Domain=${cookieDomain}`);
		}

		if (sameSiteIndex >= 0) {
			filtered[sameSiteIndex] = isSecureRequest ? 'SameSite=None' : 'SameSite=Lax';
		} else {
			filtered.push(isSecureRequest ? 'SameSite=None' : 'SameSite=Lax');
		}

		if (isSecureRequest) {
			if (!hasSecure) {
				filtered.push('Secure');
			}
		} else {
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
 * Builds the upstream URL for a non-auth API request.
 *
 * @param request - Incoming Next.js request
 * @param params - Dynamic route params
 * @returns Fully qualified upstream URL
 */
function buildUpstreamUrl(request: NextRequest, params: RouteParams | undefined): URL {
	const path = params?.path?.join('/') ?? '';
	const search = request.nextUrl.search;
	return new URL(`${API_ORIGIN}/api/${path}${search}`);
}

/**
 * Proxies all non-BetterAuth API routes through the web host, preserving
 * credentialed requests and scoping cookies to the web domain.
 *
 * @param request - Incoming Next.js request
 * @param context - Route context containing dynamic params
 * @returns Proxied NextResponse from the upstream API
 */
async function handleApiProxy(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	const resolvedParams = await context.params;
	const targetUrl = buildUpstreamUrl(request, resolvedParams);
	const isSecureRequest =
		request.nextUrl.protocol === 'https:' ||
		request.headers.get('x-forwarded-proto') === 'https';

	// Prevent recursive proxying if someone points NEXT_PUBLIC_API_URL at the web host.
	const targetHost = targetUrl.host;
	const currentHost = request.headers.get('host') ?? new URL(request.url).host;
	if (targetHost === currentHost) {
		return NextResponse.json(
			{ error: 'API_ORIGIN must differ from web host for proxying' },
			{ status: 500 },
		);
	}

	const requestHeaders = new Headers(request.headers);
	requestHeaders.delete('host');
	requestHeaders.delete('connection');
	requestHeaders.delete('content-length');

	const body =
		request.method === 'GET' || request.method === 'HEAD'
			? undefined
			: await request.arrayBuffer();

	const upstreamResponse = await fetch(targetUrl, {
		method: request.method,
		headers: requestHeaders,
		body,
		credentials: 'include',
	});

	const responseHeaders = new Headers(upstreamResponse.headers);
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
		const rewritten = rewriteSetCookieHeaders(rawSetCookies, currentHost, isSecureRequest);
		for (const cookie of rewritten) {
			proxyResponse.headers.append('Set-Cookie', cookie);
		}
	}

	return proxyResponse;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function POST(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function PUT(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function PATCH(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function DELETE(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function OPTIONS(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}

export async function HEAD(
	request: NextRequest,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	return handleApiProxy(request, context);
}
