import globals from "globals";
import { config as baseConfig } from "./base.js";

// Elysia/Bun preset keeps things minimal for server-side TypeScript.
export const config = [
	...baseConfig,
	{
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2021,
			},
		},
	},
];
