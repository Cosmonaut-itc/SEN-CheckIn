import { render, screen } from '@testing-library/react-native';
import React from 'react';

import PreviewLoginScreen from '@/app/preview/login';

const mockQrCodeProps = jest.fn<void, [Record<string, unknown>]>();

jest.mock('heroui-native', () => {
	const mockReactNative = require('react-native') as typeof import('react-native');
	const { Text, View } = mockReactNative;

	const Button = function MockButton({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
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
	Card.Description = function MockCardDescription({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	return {
		Button,
		Card,
		Spinner: () => <View testID="spinner" />,
	};
});

jest.mock('react-qr-code', () => {
	const React = require('react') as typeof import('react');
	const { View } = require('react-native') as typeof import('react-native');

	return function MockQrCode(props: Record<string, unknown>) {
		mockQrCodeProps(props);
		return <View testID="preview-login-qr" />;
	};
});

jest.mock('@/providers/theme-provider', () => ({
	useTheme: () => ({
		isDarkMode: false,
	}),
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: (colorKey: string | string[]) => {
		if (Array.isArray(colorKey)) {
			return ['#16a34a', '#111827', '#ffffff'];
		}

		return '#111827';
	},
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) =>
			(
				{
					'Login.header.subtitle': 'Escanea el código o usa el enlace',
					'Login.code.label': 'Código',
					'Login.accessibility.qrCode': 'Código QR de vinculación',
					'Login.qr.caption': 'Escanea para vincular el dispositivo',
					'Login.status.connecting': 'Esperando conexión',
					'Login.actions.newCode': 'Generar nuevo código',
					'Login.actions.openLink': 'Abrir enlace',
					'Preview.userCode': 'FDZV-NDLH',
				} as Record<string, string>
			)[key] ?? key,
	},
}));

describe('PreviewLoginScreen', () => {
	beforeEach(() => {
		mockQrCodeProps.mockClear();
	});

	it('shows the formatted preview code while using a normalized QR payload', () => {
		render(<PreviewLoginScreen />);

		expect(screen.getByText('FDZV-NDLH')).toBeTruthy();
		expect(mockQrCodeProps).toHaveBeenCalledWith(
			expect.objectContaining({
				value: 'https://sen-checkin.app/device?user_code=FDZVNDLH',
			}),
		);
	});
});
