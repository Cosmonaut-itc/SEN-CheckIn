/** @type {import('jest').Config} */
module.exports = {
	preset: 'jest-expo',
	testMatch: ['**/*.test.ts', '**/*.test.tsx'],
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
	},
	transformIgnorePatterns: [
		'node_modules/(?!(react-native|@react-native|expo(nent)?|@expo(nent)?/.*|expo-router|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
	],
};
