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

		expect(settingsScreenSource).toContain(
			"Settings.form.fields.location.accessibilityLabel",
		);
		expect(settingsScreenSource).toContain(
			"Settings.form.fields.location.accessibilityHint",
		);
		expect(deviceSetupSource).toContain(
			"DeviceSetup.form.fields.location.accessibilityLabel",
		);
		expect(deviceSetupSource).toContain(
			"DeviceSetup.form.fields.location.accessibilityHint",
		);
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
		expect(settingsScreenSource).toContain("text-danger-500");
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
		const settingsSource = readFileSync(resolve(__dirname, '../app/(main)/settings.tsx'), 'utf-8');

		expect(settingsSource).toContain('queryKeys.locations.list({ organizationId: activeOrganizationId ?? undefined })');
		expect(settingsSource).toContain(
			'fetchLocationsList({ limit: 100, organizationId: activeOrganizationId ?? undefined })',
		);
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
});
