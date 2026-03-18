/**
 * Loads the current resolveFallbackSymbol implementation from the module.
 *
 * @returns Fallback resolver function
 */
function loadResolveFallbackSymbol(): typeof import('@/components/ui/icon-symbol-fallbacks').resolveFallbackSymbol {
	jest.resetModules();

	return require('@/components/ui/icon-symbol-fallbacks')
		.resolveFallbackSymbol as typeof import('@/components/ui/icon-symbol-fallbacks').resolveFallbackSymbol;
}

describe('resolveFallbackSymbol', () => {
	it('maps sparkles to an Android-safe Material icon', () => {
		const resolveFallbackSymbol = loadResolveFallbackSymbol();

		expect(resolveFallbackSymbol('sparkles')).toBe('auto-awesome');
	});

	it('maps person.crop.circle to an Android-safe Material icon', () => {
		const resolveFallbackSymbol = loadResolveFallbackSymbol();

		expect(resolveFallbackSymbol('person.crop.circle')).toBe('account-circle');
	});

	it('keeps the generic fallback for unsupported symbols', () => {
		const resolveFallbackSymbol = loadResolveFallbackSymbol();

		expect(resolveFallbackSymbol('unsupported.symbol')).toBe('radio-button-unchecked');
	});
});
