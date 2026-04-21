/// <reference types="bun-types" />

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { michoacanShared, michoacanTokens } from './index.js';

const cssContent = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/**
 * Extracts the CSS declarations block for a selector from the token stylesheet.
 *
 * @param selector - CSS selector to match
 * @returns The declarations block for the selector
 * @throws {Error} When the selector is not found in the stylesheet
 */
function getCssBlock(selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = cssContent.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));

	if (!match?.[1]) {
		throw new Error(`Missing CSS block for selector: ${selector}`);
	}

	return match[1];
}

/**
 * Reads a CSS custom property value from a declarations block.
 *
 * @param cssBlock - CSS declarations block to inspect
 * @param variableName - CSS custom property name including the `--` prefix
 * @returns The extracted variable value
 * @throws {Error} When the variable is not present in the block
 */
function getCssVariable(cssBlock: string, variableName: string): string {
	const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = cssBlock.match(new RegExp(`${escapedVariableName}:\\s*([^;]+);`));

	if (!match?.[1]) {
		throw new Error(`Missing CSS variable: ${variableName}`);
	}

	return match[1].trim();
}

/**
 * Normalizes CSS token values so equivalent formatting compares equal.
 *
 * @param value - Raw CSS token value
 * @returns Normalized comparable token value
 */
function normalizeCssValue(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/(\.\d*?[1-9])0+(?=[,)])/g, '$1')
		.replace(/\.0+(?=[,)])/g, '');
}

describe('Design System Token Compliance — Michoacan', () => {
	describe('Light mode semantic colors', () => {
		const status = michoacanTokens.light.colors.status;

		it('success matches DS canonical #4A7C3F', () => {
			expect(status.success).toBe('#4A7C3F');
		});

		it('warning matches DS canonical #C98A16', () => {
			expect(status.warning).toBe('#C98A16');
		});

		it('error matches DS canonical #B03A2E', () => {
			expect(status.error).toBe('#B03A2E');
		});

		it('info matches DS canonical #2E6DB4 (blue, not green)', () => {
			expect(status.info).toBe('#2E6DB4');
		});
	});

	describe('Light mode border-strong', () => {
		it('matches DS canonical #D3C5B8', () => {
			expect(michoacanTokens.light.colors.border.strong).toBe('#D3C5B8');
		});
	});

	describe('Dark mode brand tokens', () => {
		const dark = michoacanTokens.dark.colors;

		it('foreground matches DS canonical #F1E9DE', () => {
			expect(dark.text.primary).toBe('#F1E9DE');
		});

		it('muted-fg matches DS canonical #B4A090', () => {
			expect(dark.text.tertiary).toBe('#B4A090');
		});

		it('border matches DS canonical #2E241E', () => {
			expect(dark.border.default).toBe('#2E241E');
		});

		it('border-strong matches DS canonical #3E312A', () => {
			expect(dark.border.strong).toBe('#3E312A');
		});

		it('primary-hover matches DS canonical #E09672', () => {
			expect(dark.accent.primaryHover).toBe('#E09672');
		});
	});

	describe('Dark mode semantic colors derive from correct DS base', () => {
		const status = michoacanTokens.dark.colors.status;

		it('info is blue-derived, not green', () => {
			expect(status.info).not.toBe('#7FB573');
			expect(status.info).not.toBe('#4A7C3F');
		});

		it('success is green-derived from DS #4A7C3F', () => {
			expect(status.success).toBe('#7FB573');
		});
	});

	describe('Radius scale', () => {
		const radius = michoacanShared.radius;

		it('sm is 6px', () => {
			expect(radius.sm).toBe('6px');
		});

		it('md is 10px', () => {
			expect(radius.md).toBe('10px');
		});

		it('lg is 14px', () => {
			expect(radius.lg).toBe('14px');
		});

		it('xl is 20px', () => {
			expect(radius.xl).toBe('20px');
		});
	});

	describe('CSS token file stays aligned with the TypeScript source', () => {
		const lightBlock = getCssBlock(':root');
		const darkBlock = getCssBlock('.dark');

		it('keeps light semantic status colors in sync', () => {
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-success'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.success),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-success-bg'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.successBg),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-warning'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.warning),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-warning-bg'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.warningBg),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-error'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.error),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-error-bg'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.errorBg),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-info'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.info),
			);
			expect(normalizeCssValue(getCssVariable(lightBlock, '--status-info-bg'))).toBe(
				normalizeCssValue(michoacanTokens.light.colors.status.infoBg),
			);
		});

		it('keeps dark brand tokens in sync', () => {
			expect(normalizeCssValue(getCssVariable(darkBlock, '--text-primary'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.text.primary),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--text-tertiary'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.text.tertiary),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--border-default'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.border.default),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--border-strong'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.border.strong),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--accent-primary-hover'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.accent.primaryHover),
			);
		});

		it('keeps dark semantic status colors in sync', () => {
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-success'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.success),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-success-bg'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.successBg),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-warning'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.warning),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-warning-bg'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.warningBg),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-error'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.error),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-error-bg'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.errorBg),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-info'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.info),
			);
			expect(normalizeCssValue(getCssVariable(darkBlock, '--status-info-bg'))).toBe(
				normalizeCssValue(michoacanTokens.dark.colors.status.infoBg),
			);
		});
	});
});
