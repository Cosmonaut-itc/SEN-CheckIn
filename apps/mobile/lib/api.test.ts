/**
 * Reset cached mobile env/api modules between environment permutations.
 *
 * @returns {void}
 */
function resetMobileApiModules(): void {
	jest.resetModules();
}

/**
 * Load the mobile API module after environment changes.
 *
 * @returns {{ API_BASE_URL: string; API_ENV_VALID: boolean }} Runtime API config exports.
 */
function loadApiModule(): { API_BASE_URL: string; API_ENV_VALID: boolean } {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require('./api') as { API_BASE_URL: string; API_ENV_VALID: boolean };
}

jest.mock('./auth-client', () => ({
	getAccessToken: () => null,
}));

describe('mobile API environment resolution', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		const mutableEnv = process.env as Record<string, string | undefined>;

		resetMobileApiModules();
		process.env = { ...originalEnv };
		delete mutableEnv.EXPO_PUBLIC_API_URL;
		delete mutableEnv.EXPO_PUBLIC_WEB_VERIFY_URL;
		delete mutableEnv.EXPO_PUBLIC_VERIFY_URL;
		delete mutableEnv.VERIFY_URL;
		delete mutableEnv.NODE_ENV;
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	it('keeps the API URL when optional verification envs are empty', () => {
		const mutableEnv = process.env as Record<string, string | undefined>;

		mutableEnv.NODE_ENV = 'production';
		mutableEnv.EXPO_PUBLIC_API_URL = 'https://sen-checkin-production.up.railway.app';
		mutableEnv.EXPO_PUBLIC_WEB_VERIFY_URL = '';
		mutableEnv.VERIFY_URL = '';

		const { API_BASE_URL, API_ENV_VALID } = loadApiModule();

		expect(API_BASE_URL).toBe('https://sen-checkin-production.up.railway.app');
		expect(API_ENV_VALID).toBe(true);
	});

	it('falls back to the production API host for release builds when env injection fails', () => {
		const mutableEnv = process.env as Record<string, string | undefined>;

		mutableEnv.NODE_ENV = 'production';

		const { API_BASE_URL, API_ENV_VALID } = loadApiModule();

		expect(API_BASE_URL).toBe('https://sen-checkin-production.up.railway.app');
		expect(API_ENV_VALID).toBe(true);
	});
});
