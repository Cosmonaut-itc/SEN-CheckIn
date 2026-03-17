import { describe, expect, it } from 'bun:test';

import {
	buildCorsOriginAllowlist,
	buildConfiguredOriginAllowlist,
	isDevelopmentRuntime,
	isOriginAllowed,
	normalizeOrigin,
	resolveTrustedOrigins,
} from './origin-allowlist.js';

describe('origin allowlist', () => {
	const configuredOrigins = buildConfiguredOriginAllowlist({
		authBaseUrl: 'http://localhost:3000',
		corsOrigin: 'http://localhost:3001/, https://sen-check-in.vercel.app/',
	});

	it('allows LAN and Tailscale development origins for auth and CORS checks', () => {
		const request = new Request('http://localhost:3000/api/auth/device/code', {
			headers: {
				origin: 'http://100.111.159.14:3000',
			},
		});

		const trustedOrigins = resolveTrustedOrigins(request.headers.get('origin'), {
			configuredOrigins,
			nodeEnv: 'development',
		});

		expect(trustedOrigins).toContain('http://100.111.159.14:3000');
		expect(isOriginAllowed('http://100.111.159.14:3000', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(true);
		expect(isOriginAllowed('exp://192.168.0.106:8081', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(true);
	});

	it('normalizes configured origins from auth and CORS configuration', () => {
		expect(configuredOrigins).toContain('http://localhost:3000');
		expect(configuredOrigins).toContain('http://localhost:3001');
		expect(configuredOrigins).toContain('https://sen-check-in.vercel.app');
	});

	it('builds a web-only allowlist for CORS checks', () => {
		const corsOrigins = buildCorsOriginAllowlist({
			authBaseUrl: 'sen-checkin://',
			corsOrigin: 'null, sen-checkin://, https://admin.example.com/, http://localhost:3001/',
		});

		expect(corsOrigins).toContain('https://admin.example.com');
		expect(corsOrigins).toContain('http://localhost:3001');
		expect(corsOrigins).not.toContain('null');
		expect(corsOrigins).not.toContain('sen-checkin://');
	});

	it('rejects public internet origins in development', () => {
		expect(isOriginAllowed('http://8.8.8.8:3000', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(false);
	});

	it('does not auto-allow local network origins in production', () => {
		const trustedOrigins = resolveTrustedOrigins('http://100.111.159.14:3000', {
			configuredOrigins,
			nodeEnv: 'production',
		});

		expect(trustedOrigins).not.toContain('http://100.111.159.14:3000');
		expect(isOriginAllowed('http://100.111.159.14:3000', {
			configuredOrigins,
			nodeEnv: 'production',
		})).toBe(false);
	});

	it('treats missing node env as non-development for origin checks', () => {
		expect(isDevelopmentRuntime(undefined)).toBe(false);
		expect(isOriginAllowed('http://192.168.0.106:3000', {
			configuredOrigins,
			nodeEnv: undefined,
		})).toBe(false);
	});

	it('does not collapse opaque development origins into the configured null origin', () => {
		expect(normalizeOrigin('exp://192.168.0.106:8081')).toBe('exp://192.168.0.106:8081');
		expect(isOriginAllowed('exp://192.168.0.106:8081', {
			configuredOrigins,
			nodeEnv: 'production',
		})).toBe(false);
		expect(isOriginAllowed('file:///tmp/check-in.html', {
			configuredOrigins,
			nodeEnv: 'production',
		})).toBe(false);
	});

	it('only auto-allows IPv6 development hosts when they are actual local addresses', () => {
		expect(isOriginAllowed('http://fc.attacker.com:3000', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(false);
		expect(isOriginAllowed('http://fd-server.internal.example.org:3000', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(false);
		expect(isOriginAllowed('http://[fd12:3456::1]:3000', {
			configuredOrigins,
			nodeEnv: 'development',
		})).toBe(true);
	});
});
