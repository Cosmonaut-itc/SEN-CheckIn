import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import DeviceSetupScreen from '@/app/(auth)/device-setup';

const mockReplace = jest.fn();
const mockUseDeviceContext = jest.fn();
const mockHandleSubmit = jest.fn();

jest.mock('@tanstack/react-query', () => ({
	useQuery: () => ({
		data: null,
		isError: false,
		isPending: false,
	}),
}));

jest.mock('expo-device', () => ({
	deviceName: 'iPhone de pruebas',
	modelName: 'iPhone 17 Pro',
}));

jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({}),
	useRouter: () => ({
		replace: mockReplace,
	}),
}));

jest.mock('heroui-native', () => {
	const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
	const { Pressable, Text, View } = ReactNativeActual;

	const Button = function MockButton({
		children,
		onPress,
		isDisabled,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		isDisabled?: boolean;
	}) {
		return (
			<Pressable onPress={isDisabled ? undefined : onPress} accessibilityRole="button">
				<View>{children}</View>
			</Pressable>
		);
	};
	Button.Label = function MockButtonLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	const Card = function MockCard({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Body = function MockCardBody({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Header = function MockCardHeader({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Title = function MockCardTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Card.Description = function MockCardDescription({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <Text>{children}</Text>;
	};

	return {
		Button,
		Card,
		Select: () => null,
		Spinner: () => null,
	};
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: () => null,
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: () => ['#C4302B', '#B8602A', '#F0B840'],
}));

jest.mock('@/lib/client-functions', () => ({
	fetchLocationsList: jest.fn(),
	updateDeviceSettings: jest.fn(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

jest.mock('@/lib/forms', () => ({
	useAppForm: () => ({
		handleSubmit: mockHandleSubmit,
		setFieldValue: jest.fn(),
		AppField: () => null,
		AppForm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	}),
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

jest.mock('@/lib/query-keys', () => ({
	queryKeys: {
		locations: {
			list: () => ['locations'],
		},
	},
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		session: null,
	}),
}));

describe('DeviceSetupScreen fallback state', () => {
	beforeEach(() => {
		mockReplace.mockReset();
		mockHandleSubmit.mockReset();
		mockUseDeviceContext.mockReset();
		mockUseDeviceContext.mockReturnValue({
			settings: null,
			updateLocalSettings: jest.fn(),
		});
	});

	it('renders without crashing and routes back to login when no deviceId is available', () => {
		render(<DeviceSetupScreen />);

		expect(screen.getByText('DeviceSetup.errors.deviceNotFound.title')).toBeOnTheScreen();

		fireEvent.press(screen.getByText('DeviceSetup.errors.deviceNotFound.backToLogin'));

		expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
	});

	it('shows a localized inline error when setup submission fails', async () => {
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: 'org-1',
			},
			updateLocalSettings: jest.fn(),
		});
		mockHandleSubmit.mockRejectedValue(new Error('network failed'));

		render(<DeviceSetupScreen />);

		fireEvent.press(screen.getByText('DeviceSetup.form.actions.saveAndContinue'));

		await waitFor(() => {
			expect(screen.getByText('DeviceSetup.form.errors.saveFailed')).toBeOnTheScreen();
		});
	});
});
