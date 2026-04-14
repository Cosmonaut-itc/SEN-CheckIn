import React from 'react';
import { describe, expect, it } from 'vitest';

import {
	NextIntlClientProvider,
	resolveTestTranslation,
	useTranslations,
} from '@/lib/test-utils/next-intl';

/**
 * Renders a translated service year label for test assertions.
 *
 * @returns React element with localized copy
 */
function ServiceYearLabel(): React.ReactElement {
	const t = useTranslations('Employees');

	return <span>{t('summary.serviceYearShort', { number: 2 })}</span>;
}

describe('web next-intl test utils', () => {
	it('resolves nested messages from the spanish fixture', () => {
		expect(resolveTestTranslation('Vacations.dayTypes.INCAPACITY')).toBe('Incapacidad IMSS');
	});

	it('interpolates placeholders through the translator mock', () => {
		const element = ServiceYearLabel();

		if (!React.isValidElement<{ children: string }>(element)) {
			throw new Error('ServiceYearLabel should return a React element.');
		}

		expect(element.props.children).toBe('Año vacacional 2');
	});

	it('formats ICU plurals through the shared translator', () => {
		const t = useTranslations('Employees.import.preview');

		expect(t('summary', { count: 1 })).toBe('1 fila incluida para importar');
		expect(t('summary', { count: 3 })).toBe('3 filas incluidas para importar');
	});

	it('passes provider children through unchanged', () => {
		const child = React.createElement('span', null, 'contenido de prueba');
		const providerElement = NextIntlClientProvider({
			locale: 'es',
			messages: {},
			children: child,
		});

		if (!React.isValidElement<{ children: React.ReactNode }>(providerElement)) {
			throw new Error('NextIntlClientProvider should return a React element.');
		}

		expect(providerElement.props.children).toBe(child);
	});
});
