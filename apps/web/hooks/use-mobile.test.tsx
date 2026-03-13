import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { useIsMobile } from './use-mobile';

type MatchMediaListener = (event: MediaQueryListEvent) => void;
type MatchMediaCallback = NonNullable<MediaQueryList['onchange']>;

type MockMediaQueryList = MediaQueryList & {
	dispatchChange: (matches: boolean) => void;
};

/**
 * Builds a controllable matchMedia mock for viewport tests.
 *
 * @param matches - Initial match state
 * @returns Media query list mock with a change dispatcher
 */
function createMockMediaQueryList(matches: boolean): MockMediaQueryList {
	const listeners = new Set<MatchMediaListener>();
	const listenerMap = new Map<
		MatchMediaCallback | EventListenerOrEventListenerObject,
		MatchMediaListener
	>();
	const registerListener = (
		listener: MatchMediaCallback | EventListenerOrEventListenerObject | null,
	): void => {
		if (typeof listener === 'function') {
			const wrappedListener = (event: MediaQueryListEvent) => {
				listener.call(mockMediaQueryList, event);
			};
			listenerMap.set(listener, wrappedListener);
			listeners.add(wrappedListener);
		}
	};
	const unregisterListener = (
		listener: MatchMediaCallback | EventListenerOrEventListenerObject | null,
	): void => {
		if (!listener) {
			return;
		}
		const wrappedListener = listenerMap.get(listener);
		if (!wrappedListener) {
			return;
		}
		listeners.delete(wrappedListener);
		listenerMap.delete(listener);
	};

	const mockMediaQueryList: MockMediaQueryList = {
		matches,
		media: '(max-width: 1024px)',
		onchange: null,
		addEventListener: (
			_type: string,
			listener: MatchMediaCallback | EventListenerOrEventListenerObject | null,
		) => {
			registerListener(listener);
		},
		removeEventListener: (
			_type: string,
			listener: MatchMediaCallback | EventListenerOrEventListenerObject | null,
		) => {
			unregisterListener(listener);
		},
		addListener: (listener: MatchMediaCallback | null) => {
			registerListener(listener);
		},
		removeListener: (listener: MatchMediaCallback | null) => {
			unregisterListener(listener);
		},
		dispatchEvent: () => true,
		dispatchChange: (nextMatches) => {
			for (const listener of listeners) {
				listener({ matches: nextMatches } as MediaQueryListEvent);
			}
		},
	} as MockMediaQueryList;

	return mockMediaQueryList;
}

/**
 * Renders the current hook state into a small text node.
 *
 * @returns Mobile/desktop label from the hook result
 */
function HookProbe(): React.JSX.Element {
	return <span>{useIsMobile() ? 'mobile' : 'desktop'}</span>;
}

describe('useIsMobile', () => {
	let container: HTMLDivElement;
	let root: Root;
	let originalInnerWidth: number;
	let originalMatchMedia: typeof window.matchMedia | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		originalInnerWidth = window.innerWidth;
		originalMatchMedia = window.matchMedia;
	});

	afterEach(() => {
		flushSync(() => {
			root.unmount();
		});
		container.remove();
		window.innerWidth = originalInnerWidth;
		if (originalMatchMedia) {
			window.matchMedia = originalMatchMedia;
			return;
		}
		delete (window as Partial<Window>).matchMedia;
	});

	it('renders mobile state on the first committed paint for mobile widths', () => {
		window.innerWidth = 1024;
		window.matchMedia = vi.fn().mockImplementation(() => createMockMediaQueryList(true));

		flushSync(() => {
			root.render(<HookProbe />);
		});

		expect(container.textContent).toBe('mobile');
	});
});
