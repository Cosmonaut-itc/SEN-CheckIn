import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import onlyWarn from "eslint-plugin-only-warn";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

/**
 * A shared ESLint configuration for Next.js projects.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
	js.configs.recommended,
	eslintConfigPrettier,
	...tseslint.configs.recommended,
	{
		plugins: {
			turbo: turboPlugin,
		},
		rules: {
			"turbo/no-undeclared-env-vars": "warn",
		},
	},
	{
		plugins: {
			onlyWarn,
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		plugins: {
			react: pluginReact,
			"react-hooks": pluginReactHooks,
		},
		rules: {
			...pluginReact.configs.recommended.rules,
			...pluginReactHooks.configs.recommended.rules,
			"react/react-in-jsx-scope": "off",
			"react/prop-types": "off",
		},
		settings: {
			react: {
				version: "detect",
			},
		},
	},
	{
		ignores: ["dist/**", ".next/**", "node_modules/**"],
	},
];
