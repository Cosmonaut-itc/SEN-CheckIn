import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { config as baseConfig } from "./base.js";

// Expo preset extends the base rules with React/React Native awareness.
export const config = [
	...baseConfig,
	{
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooks,
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.es2021,
			},
		},
		settings: {
			react: {
				version: "detect",
			},
		},
		rules: {
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/exhaustive-deps": "warn",
		},
	},
];
