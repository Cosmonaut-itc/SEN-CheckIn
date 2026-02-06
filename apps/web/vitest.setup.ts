import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';

/**
 * Creates a matchMedia-compatible mock response.
 *
 * @param query - Media query string
 * @returns Mocked MediaQueryList object
 */
function createMatchMedia(query: string): MediaQueryList {
	return {
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	} as MediaQueryList;
}

if (!window.matchMedia) {
	window.matchMedia = vi.fn().mockImplementation(createMatchMedia);
}

afterEach(cleanup);

/**
 * Minimal ResizeObserver mock for jsdom tests.
 */
class ResizeObserverMock {
	/**
	 * Observes an element (no-op).
	 *
	 * @returns Nothing
	 */
	observe(): void {
		// no-op
	}
	/**
	 * Stops observing an element (no-op).
	 *
	 * @returns Nothing
	 */
	unobserve(): void {
		// no-op
	}
	/**
	 * Disconnects the observer (no-op).
	 *
	 * @returns Nothing
	 */
	disconnect(): void {
		// no-op
	}
}

globalThis.ResizeObserver = ResizeObserverMock;

/**
 * Builds a translation function that echoes keys.
 *
 * @returns Translator function for tests
 */
function createMockTranslator(): (key: string) => string {
	return (key: string) => key;
}

/**
 * Pass-through intl provider for unit tests.
 *
 * @param props - Provider props with children
 * @returns Rendered children
 */
function MockNextIntlProvider(props: { children: React.ReactNode }): React.ReactElement {
	return React.createElement(React.Fragment, null, props.children);
}

vi.mock('next-intl', () => ({
	NextIntlClientProvider: MockNextIntlProvider,
	useTranslations: () => createMockTranslator(),
}));

/**
 * Creates a permissive proxy for typed API clients in unit tests.
 *
 * @returns Proxy that supports chained property access and async calls
 */
function createApiClientProxy(): unknown {
	const response = Promise.resolve({
		data: null,
		error: null,
		status: 200,
	});

	const handler: ProxyHandler<(...args: unknown[]) => Promise<unknown>> = {
		get: () => new Proxy(() => response, handler),
		apply: () => response,
	};

	return new Proxy(() => response, handler);
}

vi.mock('@sen-checkin/api-contract', () => ({
	createApiClient: () => createApiClientProxy(),
}));
