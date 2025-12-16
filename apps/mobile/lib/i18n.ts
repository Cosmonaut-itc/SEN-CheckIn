import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

import es from '@/lib/translations/es.json';

/**
 * Determines the best supported locale for the app.
 *
 * The mobile app currently ships Spanish (Latin American / MX) UI only, so we
 * always return `es` while keeping the logic flexible for future locales.
 *
 * @returns Supported locale code
 */
function getAppLocale(): 'es' {
	const locales = Localization.getLocales();
	const firstLocale = locales[0]?.languageTag ?? locales[0]?.languageCode ?? 'es';
	const normalized = firstLocale.toLowerCase();

	// If we ever add more locales, extend this selection logic.
	return normalized.startsWith('es') ? 'es' : 'es';
}

/**
 * Shared i18n instance for the mobile app.
 */
export const i18n = new I18n();

i18n.store({ es });
i18n.enableFallback = true;
i18n.defaultLocale = 'es';
i18n.locale = getAppLocale();
