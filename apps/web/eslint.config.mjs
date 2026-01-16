import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const testGlobals = {
	describe: "readonly",
	it: "readonly",
	test: "readonly",
	expect: "readonly",
	beforeAll: "readonly",
	afterAll: "readonly",
	beforeEach: "readonly",
	afterEach: "readonly",
	vi: "readonly",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or vendored assets we don't lint:
    "types/**",
    "aws/**",
    "awscli-bundle/**",
  ]),
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
    languageOptions: {
      globals: testGlobals,
    },
  },
]);

export default eslintConfig;
