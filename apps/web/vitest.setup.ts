import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
