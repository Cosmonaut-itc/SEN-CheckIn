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
});
