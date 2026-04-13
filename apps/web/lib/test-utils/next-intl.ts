import React from 'react';
import { createTranslator } from 'use-intl';

import rawMessages from '@/messages/es.json';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

type TranslationValues = Record<string, string | number>;

/**
 * Resolves a dot-notated translation key from the Spanish test fixture.
 *
 * @param path - Translation namespace and key path
 * @returns Localized string when present, otherwise the original path
 */
export function resolveTestTranslation(path: string): string {
	const resolved = path.split('.').reduce<unknown>((currentValue, segment) => {
		if (!currentValue || typeof currentValue !== 'object' || !(segment in currentValue)) {
			return undefined;
		}

		return (currentValue as Record<string, unknown>)[segment];
	}, messages);

	return typeof resolved === 'string' ? resolved : path;
}

/**
 * Creates a translation function backed by the shared Spanish test fixture.
 *
 * @param namespace - Optional translation namespace
 * @returns Translator function compatible with `next-intl`
 */
export function createTestTranslator(namespace?: string) {
	const baseTranslatorConfig = {
		locale: 'es',
		messages,
		onError: () => undefined,
	};
	const translator = namespace
		? createTranslator({
				...baseTranslatorConfig,
				namespace: namespace as never,
			})
		: createTranslator(baseTranslatorConfig);

	return (key: string, values?: TranslationValues): string => {
		const translationPath = namespace ? `${namespace}.${key}` : key;
		const localizedMessage = resolveTestTranslation(translationPath);

		if (localizedMessage === translationPath) {
			return translationPath;
		}

		if (!values) {
			return localizedMessage;
		}

		return translator(key as never, values as never);
	};
}

/**
 * Creates a translation function backed by the shared Spanish test fixture.
 *
 * @param namespace - Optional translation namespace
 * @returns Translator function compatible with `next-intl`
 */
export function useTranslations(namespace?: string) {
	return createTestTranslator(namespace);
}

/**
 * Pass-through intl provider for unit tests.
 *
 * @param props - Provider props including children
 * @returns Rendered children without additional behavior
 */
export function NextIntlClientProvider(props: {
	children: React.ReactNode;
	locale?: string;
	messages?: Record<string, unknown>;
}): React.ReactElement {
	return React.createElement(React.Fragment, null, props.children);
}
