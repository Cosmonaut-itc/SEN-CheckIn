/// <reference types="bun-types" />

import { describe, expect, it } from 'bun:test';

import { michoacanShared, michoacanTokens } from './index.js';

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
});
