import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CheckOutReasonSheet } from './check-out-reason-sheet';

const mockOnClose = jest.fn();
const mockOnSelectReason = jest.fn();

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
	}: {
		children: React.ReactNode;
	}) {
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
});
