import { render } from '@testing-library/react-native';
import type { JSX } from 'react';

import PreviewLayout from '@/app/preview/_layout';

const mockRedirect = jest.fn();
const mockStack = jest.fn();

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => {
		mockRedirect(href);
		return null;
	},
}));

jest.mock('expo-router/stack', () => {
	function MockStack(props: Record<string, unknown>): JSX.Element | null {
		mockStack(props);
		return null;
	}

	MockStack.displayName = 'MockPreviewStack';

	return { Stack: MockStack };
});

describe('PreviewLayout', () => {
	const originalPreviewFlag = process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES;

	beforeEach(() => {
		mockRedirect.mockReset();
		mockStack.mockReset();
		delete process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES;
	});

	afterAll(() => {
		if (originalPreviewFlag === undefined) {
			delete process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES;
			return;
		}

		process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES = originalPreviewFlag;
	});

	it('redirects to scanner when preview routes are not explicitly enabled', () => {
		render(<PreviewLayout />);

		expect(mockRedirect).toHaveBeenCalledWith('/(main)/scanner');
		expect(mockStack).not.toHaveBeenCalled();
	});

	it('renders the preview stack when preview routes are explicitly enabled', () => {
		process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES = 'true';

		render(<PreviewLayout />);

		expect(mockStack).toHaveBeenCalledWith(
			expect.objectContaining({
				screenOptions: expect.objectContaining({
					headerShown: false,
				}),
			}),
		);
		expect(mockRedirect).not.toHaveBeenCalled();
	});
});
