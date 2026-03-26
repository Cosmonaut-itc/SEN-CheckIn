import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Final review regressions', () => {
	it('resets settings form fields when local settings are cleared', () => {
		const settingsScreenSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);

		expect(settingsScreenSource).toContain("form.setFieldValue('name', settings?.name ?? '')");
		expect(settingsScreenSource).toContain(
			"form.setFieldValue('locationId', settings?.locationId ?? '')",
		);
	});

	it('adds explicit accessibility labels to location select triggers', () => {
		const settingsScreenSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);
		const translationsSource = readFileSync(
			resolve(__dirname, '../lib/translations/es.json'),
			'utf-8',
		);

		expect(settingsScreenSource).toContain('Settings.form.fields.location.accessibilityLabel');
		expect(settingsScreenSource).toContain('Settings.form.fields.location.accessibilityHint');
		expect(deviceSetupSource).toContain('DeviceSetup.form.fields.location.accessibilityLabel');
		expect(deviceSetupSource).toContain('DeviceSetup.form.fields.location.accessibilityHint');
		expect(translationsSource).toContain('"accessibilityLabel": "Seleccionar ubicación"');
		expect(translationsSource).toContain(
			'"accessibilityLabel": "Seleccionar ubicación del dispositivo"',
		);
	});

	it('clears persisted auth tokens during settings sign out and keeps iOS destructive styling text-only', () => {
		const settingsScreenSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);

		expect(settingsScreenSource).toContain('clearAuthStorage');
		expect(settingsScreenSource).toContain('await clearAuthStorage()');
		expect(settingsScreenSource).toContain("Platform.OS === 'ios' ? 'ghost' : 'danger'");
		expect(settingsScreenSource).toContain('text-danger-500');
	});

	it('removes unsupported link previews from the device setup fallback screen', () => {
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);

		expect(deviceSetupSource).not.toContain('<Link.Preview />');
		expect(deviceSetupSource).toContain("router.replace('/(auth)/login')");
	});

	it('makes animated dots respect reduce motion on the login screen', () => {
		const loginSource = readFileSync(resolve(__dirname, '../app/(auth)/login.tsx'), 'utf-8');

		expect(loginSource).toContain('function AnimatedDots(): JSX.Element');
		expect(loginSource).toContain('const shouldReduceMotion = useReducedMotion();');
		expect(loginSource).toContain("setDots('...');");
	});

	it('scopes settings locations to the active organization', () => {
		const settingsSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);

		expect(settingsSource).toContain(
			'const resolvedOrganizationId = activeOrganizationId ?? settings?.organizationId ?? null;',
		);
		expect(settingsSource).toContain(
			'queryKeys.locations.list({ organizationId: resolvedOrganizationId ?? undefined })',
		);
		expect(settingsSource).toContain(
			'fetchLocationsList({ limit: 100, organizationId: resolvedOrganizationId ?? undefined })',
		);
		expect(settingsSource).toContain('enabled: Boolean(resolvedOrganizationId)');
	});

	it('uses DS-compliant radius classes on device setup surfaces', () => {
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);

		expect(deviceSetupSource).not.toContain('rounded-3xl');
		expect(deviceSetupSource).not.toContain('rounded-2xl');
		expect(deviceSetupSource).toContain('rounded-xl');
		expect(deviceSetupSource).toContain('rounded-lg');
	});

	it('uses standard popover location selectors on mobile setup and settings screens', () => {
		const settingsSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);
		const formsSource = readFileSync(resolve(__dirname, '../lib/forms.tsx'), 'utf-8');

		expect(settingsSource).toContain('presentation="popover"');
		expect(settingsSource).toContain('Select.Value');
		expect(settingsSource).toContain('LOCATION_OPTIONS_MAX_HEIGHT = 320');
		expect(settingsSource).toContain('nestedScrollEnabled');
		expect(settingsSource).toContain('width="trigger"');
		expect(settingsSource).toContain('placement="bottom"');
		expect(deviceSetupSource).toContain('presentation="popover"');
		expect(deviceSetupSource).toContain('Select.Value');
		expect(deviceSetupSource).toContain('LOCATION_OPTIONS_MAX_HEIGHT = 320');
		expect(deviceSetupSource).toContain('nestedScrollEnabled');
		expect(deviceSetupSource).toContain('width="trigger"');
		expect(deviceSetupSource).toContain('placement="bottom"');
		expect(formsSource).toContain('SELECT_OPTIONS_MAX_HEIGHT = 320');
		expect(formsSource).toContain('nestedScrollEnabled');
	});

	it('keeps iOS select dialogs on the native full-window overlay', () => {
		const settingsSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);
		const formsSource = readFileSync(resolve(__dirname, '../lib/forms.tsx'), 'utf-8');

		expect(settingsSource).not.toContain("disableFullWindowOverlay={Platform.OS === 'ios'}");
		expect(deviceSetupSource).not.toContain("disableFullWindowOverlay={Platform.OS === 'ios'}");
		expect(formsSource).not.toContain("disableFullWindowOverlay={Platform.OS === 'ios'}");
	});

	it('keeps the screenshot blocker notes aligned with the current device-setup behavior', () => {
		const screenshotReadme = readFileSync(
			resolve(__dirname, '../tests/screenshots/README.md'),
			'utf-8',
		);

		expect(screenshotReadme).not.toContain('Using replace links with preview is not supported');
		expect(screenshotReadme).toContain('missing-device fallback state');
	});

	it('shows localized location load errors and setup submission failures', () => {
		const settingsSource = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const deviceSetupSource = readFileSync(
			resolve(__dirname, '../app/(auth)/device-setup.tsx'),
			'utf-8',
		);

		expect(settingsSource).toContain('Settings.form.fields.location.loadError');
		expect(deviceSetupSource).toContain('DeviceSetup.form.fields.location.loadError');
		expect(deviceSetupSource).toContain('DeviceSetup.form.errors.saveFailed');
	});

	it('keeps shared form surfaces on DS radii and elevated modal tokens', () => {
		const formsSource = readFileSync(resolve(__dirname, '../lib/forms.tsx'), 'utf-8');
		const faceEnrollmentSource = readFileSync(
			resolve(__dirname, '../app/(main)/face-enrollment.tsx'),
			'utf-8',
		);

		expect(formsSource).toContain('Platform.select({ ios: 10, android: 12, default: 10 })');
		expect(formsSource).toContain('Platform.select({ ios: 14, android: 16, default: 14 })');
		expect(formsSource).toContain('bg-popover');
		expect(formsSource).toContain("presentation = 'popover'");
		expect(formsSource).toContain('const selectPresentation = presentation;');
		expect(formsSource).not.toContain("const selectPresentation = presentation ?? 'popover';");
		expect(formsSource).toContain(
			"width={selectPresentation === 'popover' ? 'trigger' : undefined}",
		);
		expect(formsSource).toContain(
			"placement={selectPresentation === 'popover' ? 'bottom' : undefined}",
		);
		expect(formsSource).toContain('Select.Value');
		expect(formsSource).toContain('Select.TriggerIndicator');
		expect(formsSource).not.toContain('rounded-2xl');
		expect(faceEnrollmentSource).toContain('Input');
		expect(faceEnrollmentSource).toContain('bg-input border border-default-200');
	});

	it('avoids console.log in production auth and client helpers', () => {
		const authClientSource = readFileSync(resolve(__dirname, '../lib/auth-client.ts'), 'utf-8');
		const clientFunctionsSource = readFileSync(
			resolve(__dirname, '../lib/client-functions.ts'),
			'utf-8',
		);

		expect(authClientSource).not.toContain('console.log');
		expect(clientFunctionsSource).not.toContain('console.log');
	});
});
