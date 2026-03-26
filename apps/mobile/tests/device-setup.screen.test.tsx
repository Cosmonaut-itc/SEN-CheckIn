import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import DeviceSetupScreen from '@/app/(auth)/device-setup';

const mockReplace = jest.fn();
const mockUseDeviceContext = jest.fn();
const mockHandleSubmit = jest.fn();
const mockUseQuery = jest.fn();
const mockUseAuthContext = jest.fn();
const mockFetchLocationsList = jest.fn();

jest.mock('@tanstack/react-query', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
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
	Card.Description = function MockCardDescription({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	const Select = function MockSelect({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Trigger = function MockSelectTrigger({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Value = function MockSelectValue({ placeholder }: { placeholder?: string }) {
		return placeholder ? <Text>{placeholder}</Text> : <View />;
	};
	Select.Portal = function MockSelectPortal({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Overlay = function MockSelectOverlay() {
		return <View />;
	};
	Select.Content = function MockSelectContent({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.ListLabel = function MockSelectListLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Select.Item = function MockSelectItem({ children }: { children?: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.TriggerIndicator = function MockSelectTriggerIndicator() {
		return <View />;
	};

	return {
		Button,
		Card,
		Select,
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
	fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
	updateDeviceSettings: jest.fn(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

jest.mock('@/lib/forms', () => ({
	useAppForm: () => ({
		handleSubmit: mockHandleSubmit,
		setFieldValue: jest.fn(),
		AppField: ({
			children,
		}: {
			children: (field: {
				state: { value: string; meta: { errors: string[] } };
				handleChange: (value: string) => void;
				TextField: (props: {
					label: string;
					placeholder?: string;
					description?: string;
				}) => React.JSX.Element;
			}) => React.ReactNode;
		}) =>
			children({
				state: {
					value: '',
					meta: { errors: [] },
				},
				handleChange: jest.fn(),
				TextField: ({ label, placeholder, description }) => {
					const ReactNativeActual =
						jest.requireActual<typeof import('react-native')>('react-native');

					return (
						<>
							<ReactNativeActual.Text>{label}</ReactNativeActual.Text>
							{placeholder ? (
								<ReactNativeActual.Text>{placeholder}</ReactNativeActual.Text>
							) : null}
							{description ? (
								<ReactNativeActual.Text>{description}</ReactNativeActual.Text>
							) : null}
						</>
					);
				},
			}),
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
	useAuthContext: () => mockUseAuthContext(),
}));

describe('DeviceSetupScreen fallback state', () => {
	beforeEach(() => {
		mockReplace.mockReset();
		mockHandleSubmit.mockReset();
		mockUseDeviceContext.mockReset();
		mockUseQuery.mockReset();
		mockUseAuthContext.mockReset();
		mockFetchLocationsList.mockReset();
		mockUseQuery.mockReturnValue({
			data: null,
			isError: false,
			isPending: false,
		});
		mockUseAuthContext.mockReturnValue({
			session: null,
		});
		mockUseDeviceContext.mockReturnValue({
			settings: null,
			updateLocalSettings: jest.fn(),
		});
	});

	it('renders without crashing and routes back to login when no deviceId is available', () => {
		render(<DeviceSetupScreen />);

		expect(mockUseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				enabled: false,
			}),
		);
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

	it('keeps the locations query disabled when organization context is missing', () => {
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: null,
			},
			updateLocalSettings: jest.fn(),
		});

		render(<DeviceSetupScreen />);

		const queryOptions = mockUseQuery.mock.calls[0]?.[0] as
			| { enabled?: boolean; queryFn?: () => Promise<unknown> }
			| undefined;

		expect(queryOptions?.enabled).toBe(false);
		expect(mockFetchLocationsList).not.toHaveBeenCalled();
	});

	it('loads locations when both device and organization context are available', () => {
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: 'org-1',
			},
			updateLocalSettings: jest.fn(),
		});

		render(<DeviceSetupScreen />);

		const queryOptions = mockUseQuery.mock.calls[0]?.[0] as
			| { enabled?: boolean; queryFn?: () => Promise<unknown> }
			| undefined;

		expect(queryOptions?.enabled).toBe(true);
		void queryOptions?.queryFn?.();
		expect(mockFetchLocationsList).toHaveBeenCalledWith({
			limit: 100,
			organizationId: 'org-1',
		});
	});

	it('renders a bounded nested scroll view for long location lists', () => {
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: 'org-1',
			},
			updateLocalSettings: jest.fn(),
		});
		mockUseQuery.mockReturnValue({
			data: {
				data: Array.from({ length: 8 }, (_, index) => ({
					id: `location-${index}`,
					name: `Ubicacion ${index}`,
					code: `LOC-${index}`,
				})),
			},
			isError: false,
			isPending: false,
		});

		render(<DeviceSetupScreen />);

		const optionsScrollView = screen.getByTestId('device-setup-location-options-scroll');

		expect(optionsScrollView.props.nestedScrollEnabled).toBe(true);
		expect(optionsScrollView.props.showsVerticalScrollIndicator).toBe(true);
		expect(optionsScrollView.props.style).toEqual({
			maxHeight: 320,
		});
	});
});
