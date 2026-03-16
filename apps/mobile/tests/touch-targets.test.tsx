import { readFileSync } from 'fs';
import { resolve } from 'path';

import { render } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';

import { Collapsible } from '@/components/ui/collapsible';

jest.mock('@/components/themed-text', () => ({
	ThemedText: function MockThemedText({
		children,
	}: {
		children: React.ReactNode;
	}) {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		return <ReactNativeActual.Text>{children}</ReactNativeActual.Text>;
	},
}));

jest.mock('@/components/themed-view', () => ({
	ThemedView: function MockThemedView({
		children,
		style,
	}: {
		children: React.ReactNode;
		style?: object;
	}) {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		return <ReactNativeActual.View style={style}>{children}</ReactNativeActual.View>;
	},
}));

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: function MockIconSymbol() {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		return <ReactNativeActual.View testID="icon-symbol" />;
	},
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: () => '#7A6558',
}));

describe('Minimum touch targets', () => {
	it('gives the collapsible header a 48x48 touch target with hit slop', () => {
		const { UNSAFE_getByType } = render(
			<Collapsible title="Detalles">
				<></>
			</Collapsible>,
		);

		const touchable = UNSAFE_getByType(TouchableOpacity);
		expect(touchable.props.hitSlop).toBe(8);
		expect(touchable.props.style).toEqual(
			expect.objectContaining({
				minHeight: 48,
				minWidth: 48,
			}),
		);
	});

	it('uses 48dp floating back buttons on settings and face enrollment screens', () => {
		const settingsContent = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const faceEnrollmentContent = readFileSync(
			resolve(__dirname, '../app/(main)/face-enrollment.tsx'),
			'utf-8',
		);

		expect(settingsContent).toContain('const floatingBackButtonSize = 48;');
		expect(settingsContent).toContain("className=\"w-12 h-12 rounded-full\"");
		expect(faceEnrollmentContent).toContain('const floatingBackButtonSize = 48;');
		expect(faceEnrollmentContent).toContain("className=\"w-12 h-12 rounded-full\"");
	});
});
