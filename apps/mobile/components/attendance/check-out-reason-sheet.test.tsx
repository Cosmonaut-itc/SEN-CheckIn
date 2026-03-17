import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CheckOutReasonSheet } from './check-out-reason-sheet';

const mockOnClose = jest.fn();
const mockOnSelectReason = jest.fn();
const mockBottomSheetContent = jest.fn();
const mockImpactAsync = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
}));

jest.mock('heroui-native', () => {
	const mockReactNative = jest.requireActual<typeof import('react-native')>('react-native');
	const { Pressable, Text, View } = mockReactNative;

	const Button = function MockButton({
		children,
		onPress,
		accessibilityLabel,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		accessibilityLabel?: string;
	}) {
		return (
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
			>
				<View>{children}</View>
			</Pressable>
		);
	};

	Button.Label = function MockButtonLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	return {
		Button,
	};
});

jest.mock('heroui-native/bottom-sheet', () => {
	const mockReactNative = jest.requireActual<typeof import('react-native')>('react-native');
	const { Text, View } = mockReactNative;

	const BottomSheet = function MockBottomSheet({
		children,
		isOpen,
	}: {
		children: React.ReactNode;
		isOpen: boolean;
	}) {
		return isOpen ? <View>{children}</View> : null;
	};

	BottomSheet.Portal = function MockBottomSheetPortal({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <View>{children}</View>;
	};

	BottomSheet.Overlay = function MockBottomSheetOverlay() {
		return <View />;
	};

	BottomSheet.Content = function MockBottomSheetContent({
		children,
		...props
	}: {
		children: React.ReactNode;
		[key: string]: unknown;
	}) {
		mockBottomSheetContent(props);
		return <View>{children}</View>;
	};

	BottomSheet.Title = function MockBottomSheetTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	BottomSheet.Description = function MockBottomSheetDescription({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <Text>{children}</Text>;
	};

	return {
		BottomSheet,
	};
});

describe('CheckOutReasonSheet', () => {
	beforeEach(() => {
		mockOnClose.mockReset();
		mockOnSelectReason.mockReset();
		mockBottomSheetContent.mockReset();
		mockImpactAsync.mockReset();
	});

	it('renders all check-out reason options when open', () => {
		render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		expect(screen.getByText('Motivo de salida')).toBeOnTheScreen();
		expect(screen.getByText('Comida')).toBeOnTheScreen();
		expect(screen.getByText('Personal')).toBeOnTheScreen();
		expect(screen.getByText('Fin de jornada')).toBeOnTheScreen();
	});

	it('sends the selected reason when the user chooses an option', () => {
		render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		fireEvent.press(screen.getByText('Comida'));

		expect(mockOnSelectReason).toHaveBeenCalledWith('LUNCH_BREAK');
	});

	it('sends the regular reason when the user chooses end of day', () => {
		render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		fireEvent.press(screen.getByText('Fin de jornada'));

		expect(mockOnSelectReason).toHaveBeenCalledWith('REGULAR');
	});

	it('triggers light haptic feedback when the user chooses an option', () => {
		process.env.EXPO_OS = 'ios';

		render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		fireEvent.press(screen.getByText('Personal'));

		expect(mockImpactAsync).toHaveBeenCalledWith('light');
	});

	it('calls onClose when the user cancels the selector', () => {
		render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		fireEvent.press(screen.getByText('Cancelar'));

		expect(mockOnClose).toHaveBeenCalledTimes(1);
		expect(mockOnSelectReason).not.toHaveBeenCalled();
	});

	it('configures the Hero UI Native sheet sizing to keep three options visible without losing footer separation', () => {
		const { getByTestId } = render(
			<CheckOutReasonSheet
				isOpen
				onClose={mockOnClose}
				onSelectReason={mockOnSelectReason}
			/>,
		);

		expect(mockBottomSheetContent).toHaveBeenCalled();

		const [contentProps] = mockBottomSheetContent.mock.calls.at(-1) as [Record<string, unknown>];
		const footer = getByTestId('check-out-reason-footer');
		const scrollArea = getByTestId('check-out-reason-scroll');

		expect(contentProps.backgroundClassName).toEqual(expect.stringContaining('bg-background'));
		expect(contentProps.backgroundClassName).toEqual(expect.stringContaining('shadow-none'));
		expect(contentProps.contentContainerClassName).toEqual(expect.stringContaining('px-5'));
		expect(contentProps.snapPoints).toEqual(['74%']);
		expect(contentProps.contentContainerProps).toMatchObject({
			style: {
				paddingBottom: 36,
			},
		});
		expect(footer.props.className).toEqual(expect.stringContaining('border-t'));
		expect(footer.props.className).toEqual(expect.stringContaining('bg-background'));
		expect(footer.props.className).toEqual(expect.stringContaining('pt-4'));
		expect(scrollArea.props.showsVerticalScrollIndicator).toBe(false);
		expect(scrollArea.props.style).toMatchObject({
			maxHeight: 480,
		});
	});
});
