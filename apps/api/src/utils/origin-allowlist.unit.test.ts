import { describe, expect, it } from 'bun:test';

import {
	buildConfiguredOriginAllowlist,
	isOriginAllowed,
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
});
