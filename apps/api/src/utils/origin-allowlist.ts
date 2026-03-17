const DEFAULT_CONFIGURED_ORIGINS: readonly string[] = [
	'http://localhost:3000',
	'http://localhost:3001',
	'http://127.0.0.1:3000',
	'http://127.0.0.1:3001',
	'http://10.0.2.2:3000',
	'http://10.0.3.2:3000',
	'http://0.0.0.0:3000',
	'http://localhost:19000',
	'http://127.0.0.1:19000',
	'https://sen-check-in.vercel.app',
	'sen-checkin://',
	'null',
];

const SCHEME_ONLY_ORIGIN_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/$/i;
const CORS_PROTOCOLS = new Set(['http:', 'https:']);
const DEV_PROTOCOLS = new Set(['http:', 'https:', 'exp:', 'exps:']);
const LOCAL_LINK_LOCAL_IPV6_PATTERN = /^fe[89ab][0-9a-f]:/i;
const LOCAL_UNIQUE_LOCAL_IPV6_PATTERN = /^(?:fc|fd)[0-9a-f]{2}:/i;

export interface OriginAllowlistConfig {
	authBaseUrl?: string;
	corsOrigin?: string;
}

export interface OriginRuntimeOptions {
	configuredOrigins: readonly string[];
	nodeEnv?: string;
}

/**
 * Normalize an origin-like string into a stable comparable value.
 *
 * @param origin - Raw origin or URL-like value.
 * @returns Normalized origin string or `null` when absent.
 */
export function normalizeOrigin(origin?: string | null): string | null {
	if (!origin) {
		return null;
	}

	const trimmedOrigin = origin.trim();
	if (!trimmedOrigin) {
		return null;
	}

	if (trimmedOrigin === 'null' || SCHEME_ONLY_ORIGIN_PATTERN.test(trimmedOrigin)) {
		return trimmedOrigin;
	}

	try {
		const parsedOrigin = new URL(trimmedOrigin);
		if (parsedOrigin.origin !== 'null') {
			return parsedOrigin.origin;
		}

		if (parsedOrigin.host) {
			return `${parsedOrigin.protocol}//${parsedOrigin.host}`;
		}

		return `${parsedOrigin.protocol}//`;
	} catch {
		return trimmedOrigin.replace(/\/+$/, '');
	}
}

/**
 * Build the static configured origin allowlist from defaults and environment values.
 *
 * @param config - Authentication/CORS configuration values.
 * @returns Unique normalized origin allowlist.
 */
export function buildConfiguredOriginAllowlist(config: OriginAllowlistConfig): string[] {
	const configuredOrigins = new Set<string>();

	for (const defaultOrigin of DEFAULT_CONFIGURED_ORIGINS) {
		const normalizedOrigin = normalizeOrigin(defaultOrigin);
		if (normalizedOrigin) {
			configuredOrigins.add(normalizedOrigin);
		}
	}

	const authBaseOrigin = normalizeOrigin(config.authBaseUrl);
	if (authBaseOrigin) {
		configuredOrigins.add(authBaseOrigin);
	}

	for (const rawOrigin of (config.corsOrigin ?? '').split(',')) {
		const normalizedOrigin = normalizeOrigin(rawOrigin);
		if (normalizedOrigin) {
			configuredOrigins.add(normalizedOrigin);
		}
	}

	return Array.from(configuredOrigins);
}

/**
 * Build the subset of configured origins that are valid for browser CORS checks.
 *
 * @param config - Authentication/CORS configuration values.
 * @returns Unique normalized HTTP(S) origins only.
 */
export function buildCorsOriginAllowlist(config: OriginAllowlistConfig): string[] {
	return buildConfiguredOriginAllowlist(config).filter((origin) => {
		try {
			return CORS_PROTOCOLS.has(new URL(origin).protocol);
		} catch {
			return false;
		}
	});
}

/**
 * Determine whether the current runtime should relax origin checks for local development.
 *
 * @param nodeEnv - Node environment string.
 * @returns `true` only for explicit development and test runtimes.
 */
export function isDevelopmentRuntime(nodeEnv?: string): boolean {
	return nodeEnv === 'development' || nodeEnv === 'test';
}

/**
 * Determine whether a hostname belongs to a local development network.
 *
 * @param hostname - URL hostname to evaluate.
 * @returns `true` for loopback, RFC1918, CGNAT/Tailscale, `.local`, or local IPv6 ranges.
 */
export function isLocalDevelopmentHostname(hostname: string): boolean {
	const normalizedHostname = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

	if (!normalizedHostname) {
		return false;
	}

	if (
		normalizedHostname === 'localhost' ||
		normalizedHostname === '0.0.0.0' ||
		normalizedHostname === '::1' ||
		normalizedHostname.endsWith('.local')
	) {
		return true;
	}

	if (
		LOCAL_LINK_LOCAL_IPV6_PATTERN.test(normalizedHostname) ||
		LOCAL_UNIQUE_LOCAL_IPV6_PATTERN.test(normalizedHostname)
	) {
		return true;
	}

	const ipv4Octets = parseIpv4Octets(normalizedHostname);
	if (!ipv4Octets) {
		return false;
	}

	const [first, second] = ipv4Octets;

	return (
		first === 127 ||
		first === 10 ||
		(first === 192 && second === 168) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 100 && second >= 64 && second <= 127)
	);
}

/**
 * Determine whether an origin should be trusted automatically during local development.
 *
 * @param origin - Raw incoming request origin.
 * @param nodeEnv - Node environment string.
 * @returns `true` when the origin points to a local development host.
 */
export function isDevelopmentOrigin(origin: string | null | undefined, nodeEnv?: string): boolean {
	if (!isDevelopmentRuntime(nodeEnv)) {
		return false;
	}

	const normalizedOrigin = normalizeOrigin(origin);
	if (!normalizedOrigin || normalizedOrigin === 'null') {
		return false;
	}

	try {
		const parsedOrigin = new URL(normalizedOrigin);
		return (
			DEV_PROTOCOLS.has(parsedOrigin.protocol) &&
			isLocalDevelopmentHostname(parsedOrigin.hostname)
		);
	} catch {
		return false;
	}
}

/**
 * Resolve the origin list to hand to Better Auth for a given request.
 *
 * @param requestOrigin - Origin header from the incoming request.
 * @param options - Static configured origins plus runtime environment.
 * @returns Unique trusted origin list for the request.
 */
export function resolveTrustedOrigins(
	requestOrigin: string | null | undefined,
	options: OriginRuntimeOptions,
): string[] {
	const trustedOrigins = new Set<string>(options.configuredOrigins);
	const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

	if (normalizedRequestOrigin && isDevelopmentOrigin(normalizedRequestOrigin, options.nodeEnv)) {
		trustedOrigins.add(normalizedRequestOrigin);
	}

	return Array.from(trustedOrigins);
}

/**
 * Check whether a request origin is allowed for CORS responses.
 *
 * @param origin - Origin header from the incoming request.
 * @param options - Static configured origins plus runtime environment.
 * @returns `true` when the origin is explicitly configured or is a local dev origin.
 */
export function isOriginAllowed(
	origin: string | null | undefined,
	options: OriginRuntimeOptions,
): boolean {
	const normalizedOrigin = normalizeOrigin(origin);
	if (!normalizedOrigin) {
		return false;
	}

	return (
		options.configuredOrigins.includes(normalizedOrigin) ||
		isDevelopmentOrigin(normalizedOrigin, options.nodeEnv)
	);
}

/**
 * Parse an IPv4 hostname into octets.
 *
 * @param hostname - Hostname to parse.
 * @returns Four numeric octets or `null` when the hostname is not IPv4.
 */
function parseIpv4Octets(hostname: string): [number, number, number, number] | null {
	const segments = hostname.split('.');
	if (segments.length !== 4) {
		return null;
	}

	const octets = segments.map((segment) => Number.parseInt(segment, 10));
	if (
		octets.some(
			(octet, index) =>
				!Number.isInteger(octet) ||
				octet < 0 ||
				octet > 255 ||
				segments[index] !== String(octet),
		)
	) {
		return null;
	}

	return octets as [number, number, number, number];
}
