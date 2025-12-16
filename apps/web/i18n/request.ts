import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import esMessages from '../messages/es.json';

const SUPPORTED_LOCALES = ['es'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: SupportedLocale = 'es';

const MESSAGES_BY_LOCALE: Record<SupportedLocale, AbstractIntlMessages> = {
	es: esMessages as unknown as AbstractIntlMessages,
};

/**
 * Loads the translated message catalog for a supported locale.
 *
 * @param locale - Locale code to load
 * @returns The corresponding message catalog
 */
async function loadMessages(locale: SupportedLocale): Promise<AbstractIntlMessages> {
	return MESSAGES_BY_LOCALE[locale];
}

/**
 * Creates the request configuration for next-intl.
 *
 * The app currently only supports Spanish (`es`) and defaults to it if an
 * unsupported locale is requested.
 *
 * @param params - Request parameters provided by next-intl
 * @returns Locale and messages for the current request
 */
async function createRequestConfig(params: {
	requestLocale: Promise<string | undefined>;
}): Promise<{ locale: SupportedLocale; messages: AbstractIntlMessages }> {
	const requestedLocale = await params.requestLocale;
	const locale = SUPPORTED_LOCALES.includes(requestedLocale as SupportedLocale)
		? (requestedLocale as SupportedLocale)
		: DEFAULT_LOCALE;

	return { locale, messages: await loadMessages(locale) };
}

export default getRequestConfig(createRequestConfig);
