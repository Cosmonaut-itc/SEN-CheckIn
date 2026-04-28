import '@testing-library/jest-native/extend-expect';

jest.mock(
	'expo-battery',
	() => ({
		getBatteryLevelAsync: jest.fn(async () => null),
	}),
	{ virtual: true },
);
