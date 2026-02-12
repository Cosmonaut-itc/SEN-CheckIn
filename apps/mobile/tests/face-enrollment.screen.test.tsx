import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import FaceEnrollmentScreen from '@/app/(main)/face-enrollment';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockUseDeviceContext = jest.fn();
const mockFullEnrollmentFlow: jest.Mock = jest.fn();
const mockIsFaceEnrollmentApiError: jest.Mock = jest.fn();
const mockTakePictureAsync: jest.Mock = jest.fn();
const mockRequestPermission = jest.fn();

jest.mock('@tanstack/react-query', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
	useMutation: (...args: unknown[]) => mockUseMutation(...args),
	useQueryClient: () => ({
		invalidateQueries: mockInvalidateQueries,
	}),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: mockReplace,
	}),
	useNavigation: () => ({
		canGoBack: mockCanGoBack,
		goBack: mockGoBack,
	}),
	Stack: {
		Screen: () => null,
	},
}));

jest.mock('expo-camera', () => {
	const mockReact = require('react') as typeof React;
	const mockReactNative = require('react-native') as typeof import('react-native');

	const CameraView = mockReact.forwardRef(
		(
			props: unknown,
			ref: React.Ref<{ takePictureAsync: () => Promise<{ base64: string }> }>,
		) => {
			mockReact.useImperativeHandle(ref, () => ({
				takePictureAsync: mockTakePictureAsync,
			}));
			return (
				<mockReactNative.View
					testID="camera-view"
					{...(props as Record<string, unknown>)}
				/>
			);
		},
	);
	CameraView.displayName = 'MockCameraView';

	return {
		CameraView,
		useCameraPermissions: () => [{ granted: true }, mockRequestPermission],
	};
});

jest.mock('expo-image', () => ({
	Image: function MockExpoImage(props: unknown) {
		const mockReactNative = require('react-native') as typeof import('react-native');
		return (
			<mockReactNative.View testID="face-preview" {...(props as Record<string, unknown>)} />
		);
	},
}));

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('heroui-native', () => {
	const mockReactNative = require('react-native') as typeof import('react-native');
	const { Pressable, Text, View } = mockReactNative;

	const Button = function MockButton({
		children,
		onPress,
		isDisabled,
		accessibilityLabel,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		isDisabled?: boolean;
		accessibilityLabel?: string;
	}) {
		return (
			<Pressable
				disabled={isDisabled}
				onPress={isDisabled ? undefined : onPress}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
			>
				<View>{children}</View>
			</Pressable>
		);
	};

	const ButtonLabel = function MockButtonLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Button.Label = ButtonLabel;

	const Card = function MockCard({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	const CardBody = function MockCardBody({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	const CardTitle = function MockCardTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	const CardDescription = function MockCardDescription({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <Text>{children}</Text>;
	};
	Card.Body = CardBody;
	Card.Title = CardTitle;
	Card.Description = CardDescription;

	const Spinner = function MockSpinner() {
		return <Text>Cargando...</Text>;
	};

	return {
		Button,
		Card,
		Spinner,
		useThemeColor: () => '#111827',
	};
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: function MockIconSymbol() {
		const mockReactNative = require('react-native') as typeof import('react-native');
		return <mockReactNative.View testID="icon" />;
	},
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

jest.mock('@/lib/client-functions', () => ({
	fetchFaceEnrollmentEmployees: jest.fn(),
	fullEnrollmentFlow: (...args: unknown[]) => mockFullEnrollmentFlow(...args),
	isFaceEnrollmentApiError: (error: unknown) => mockIsFaceEnrollmentApiError(error),
}));

/**
 * UI coverage for mobile face enrollment screen.
 */
describe('FaceEnrollmentScreen', () => {
	beforeEach(() => {
		mockPush.mockReset();
		mockReplace.mockReset();
		mockUseQuery.mockReset();
		mockUseMutation.mockReset();
		mockInvalidateQueries.mockReset();
		mockGoBack.mockReset();
		mockCanGoBack.mockReset();
		mockCanGoBack.mockReturnValue(false);
		mockUseDeviceContext.mockReset();
		mockFullEnrollmentFlow.mockReset();
		mockIsFaceEnrollmentApiError.mockReset();
		mockTakePictureAsync.mockReset();
		mockRequestPermission.mockReset();

		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
			},
		});

		mockUseMutation.mockImplementation((options: any) => ({
			isPending: false,
			mutateAsync: async () => {
				try {
					await options.mutationFn();
				} catch (error: unknown) {
					options.onError?.(error);
				}
			},
		}));

		mockUseQuery.mockReturnValue({
			data: {
				data: [
					{
						id: 'employee-1',
						code: 'EMP-001',
						firstName: 'Ana',
						lastName: 'Ruiz',
						status: 'ACTIVE',
						rekognitionUserId: null,
					},
					{
						id: 'employee-2',
						code: 'EMP-002',
						firstName: 'Carlos',
						lastName: 'Ramos',
						status: 'ACTIVE',
						rekognitionUserId: 'employee-2',
					},
				],
				pagination: {
					total: 2,
					limit: 200,
					offset: 0,
				},
			},
			isPending: false,
			isError: false,
		});

		mockTakePictureAsync.mockResolvedValue({ base64: 'base64-image' });
		mockIsFaceEnrollmentApiError.mockReturnValue(false);
	});

	it('renders employee selector and allows local selection before capture', async () => {
		render(<FaceEnrollmentScreen />);

		expect(screen.getByText('Empleados activos')).toBeTruthy();
		fireEvent.press(screen.getByText('Ana Ruiz'));
		fireEvent.press(screen.getByText('Capturar'));

		await waitFor(() => {
			expect(screen.getByText('Confirmar registro')).toBeTruthy();
		});
	});

	it('submits enrollment flow and shows success summary', async () => {
		mockFullEnrollmentFlow.mockResolvedValue({
			success: true,
			faceId: 'face-1',
			employeeId: 'employee-1',
			associated: true,
			message: 'Face enrolled and associated successfully',
		});

		render(<FaceEnrollmentScreen />);

		fireEvent.press(screen.getByText('Ana Ruiz'));
		fireEvent.press(screen.getByText('Capturar'));
		await waitFor(() => {
			expect(screen.getByText('Confirmar registro')).toBeTruthy();
		});
		fireEvent.press(screen.getByText('Confirmar registro'));

		await waitFor(() => {
			expect(screen.getByText('Registro completado')).toBeTruthy();
		});

		expect(mockFullEnrollmentFlow).toHaveBeenCalledWith({
			employeeId: 'employee-1',
			imageBase64: 'base64-image',
			hasRekognitionUser: false,
		});
		expect(mockInvalidateQueries).toHaveBeenCalled();
	});

	it('keeps capture tied to the originally selected employee', async () => {
		mockFullEnrollmentFlow.mockResolvedValue({
			success: true,
			faceId: 'face-1',
			employeeId: 'employee-1',
			associated: true,
			message: 'Face enrolled and associated successfully',
		});

		render(<FaceEnrollmentScreen />);

		fireEvent.press(screen.getByText('Ana Ruiz'));
		fireEvent.press(screen.getByText('Capturar'));
		await waitFor(() => {
			expect(screen.getByText('Confirmar registro')).toBeTruthy();
		});
		fireEvent.press(screen.getByText('Carlos Ramos'));
		fireEvent.press(screen.getByText('Confirmar registro'));

		await waitFor(() => {
			expect(screen.getByText('Registro completado')).toBeTruthy();
		});

		expect(mockFullEnrollmentFlow).toHaveBeenCalledWith({
			employeeId: 'employee-1',
			imageBase64: 'base64-image',
			hasRekognitionUser: false,
		});
	});

	it('shows an error when enrollment is not associated to the Rekognition user', async () => {
		mockFullEnrollmentFlow.mockResolvedValue({
			success: true,
			faceId: 'face-1',
			employeeId: 'employee-1',
			associated: false,
			message: 'No se pudo asociar el rostro al empleado',
		});

		render(<FaceEnrollmentScreen />);

		fireEvent.press(screen.getByText('Ana Ruiz'));
		fireEvent.press(screen.getByText('Capturar'));
		await waitFor(() => {
			expect(screen.getByText('Confirmar registro')).toBeTruthy();
		});
		fireEvent.press(screen.getByText('Confirmar registro'));

		await waitFor(() => {
			expect(screen.getByText('No se pudo asociar el rostro al empleado')).toBeTruthy();
		});
		expect(screen.queryByText('Registro completado')).toBeNull();
	});

	it('shows API error message when enrollment fails', async () => {
		mockFullEnrollmentFlow.mockRejectedValue(new Error('Imagen inválida para enrolamiento'));
		mockIsFaceEnrollmentApiError.mockImplementation(
			(error: unknown) => error instanceof Error && error.message.includes('inválida'),
		);

		render(<FaceEnrollmentScreen />);

		fireEvent.press(screen.getByText('Ana Ruiz'));
		fireEvent.press(screen.getByText('Capturar'));
		await waitFor(() => {
			expect(screen.getByText('Confirmar registro')).toBeTruthy();
		});
		fireEvent.press(screen.getByText('Confirmar registro'));

		await waitFor(() => {
			expect(screen.getByText('Imagen inválida para enrolamiento')).toBeTruthy();
		});
	});
});
