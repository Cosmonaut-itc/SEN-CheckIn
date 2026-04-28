import { describe, expect, it } from 'bun:test';

import { SETTINGS_PIN_REGEX } from './index';

describe('SETTINGS_PIN_REGEX', () => {
	it('matches exactly four numeric digits', () => {
		expect(SETTINGS_PIN_REGEX.test('0000')).toBe(true);
		expect(SETTINGS_PIN_REGEX.test('1234')).toBe(true);
		expect(SETTINGS_PIN_REGEX.test('9999')).toBe(true);
	});

	it('rejects values that are not exactly four numeric digits', () => {
		expect(SETTINGS_PIN_REGEX.test('123')).toBe(false);
		expect(SETTINGS_PIN_REGEX.test('12345')).toBe(false);
		expect(SETTINGS_PIN_REGEX.test('12a4')).toBe(false);
		expect(SETTINGS_PIN_REGEX.test(' 1234')).toBe(false);
		expect(SETTINGS_PIN_REGEX.test('1234 ')).toBe(false);
	});
});
