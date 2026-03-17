import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Voz SEN en traducciones móviles', () => {
	const translations = readFileSync(
		resolve(__dirname, '../lib/translations/es.json'),
		'utf-8',
	);

	it('evita anglicismos y trato formal en textos visibles', () => {
		expect(translations).not.toContain('Tip:');
		expect(translations).not.toContain('usted');
		expect(translations).not.toContain('Usted');
		expect(translations).not.toContain('ustedes');
		expect(translations).not.toContain('Ustedes');
	});
});
