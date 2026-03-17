import { render } from '@testing-library/react-native';
import type { JSX } from 'react';

import Index from '@/app/index';

const mockRedirect = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseDeviceContext = jest.fn();

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => {
		mockRedirect(href);
		return null;
	},
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

describe('Index route gating', () => {
	beforeEach(() => {
		mockRedirect.mockReset();
		mockUseAuthContext.mockReset();
		mockUseDeviceContext.mockReset();
		mockUseDeviceContext.mockReturnValue({
			settings: null,
			isHydrated: true,
		});
	});

	it('redirects authenticated kiosks without a location to device setup', () => {
		mockUseAuthContext.mockReturnValue({
			session: { session: { id: 'session-1' } },
			isLoading: false,
			authState: 'ok',
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				organizationId: 'org-1',
			},
			isHydrated: true,
		});

		render(<Index />);

		expect(mockRedirect).toHaveBeenCalledWith('/(auth)/device-setup');
	});

	it('keeps authenticated kiosks with full setup on scanner', () => {
		mockUseAuthContext.mockReturnValue({
			session: { session: { id: 'session-1' } },
			isLoading: false,
			authState: 'ok',
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				organizationId: 'org-1',
			},
			isHydrated: true,
		});

		render(<Index />);

		expect(mockRedirect).toHaveBeenCalledWith('/(main)/scanner');
	});

	it('sends signed-out kiosks to login even if a stale device setup is still persisted', () => {
		mockUseAuthContext.mockReturnValue({
			session: null,
			isLoading: false,
			authState: 'signed_out',
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				organizationId: 'org-1',
			},
			isHydrated: true,
		});

		render(<Index />);

		expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
	});
});
