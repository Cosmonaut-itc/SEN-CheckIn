import { describe, expect, it } from 'bun:test';

import {
	flattenTemplateVariables,
	renderLegalHtml,
} from './legal-document-rendering.js';

describe('legal-document-rendering', () => {
	it('flattens nested variables into escaped template tokens', () => {
		const flattened = flattenTemplateVariables({
			employee: {
				fullName: 'Ana & Luis',
			},
		});

		expect(flattened['{{employee.fullName}}']).toBe('Ana &amp; Luis');
	});

	it('does not emit an empty token when root snapshot is not an object', () => {
		const flattened = flattenTemplateVariables(
			null as unknown as Record<string, unknown>,
		);

		expect(flattened['{{}}']).toBeUndefined();
		expect(Object.keys(flattened)).toHaveLength(0);
		expect(renderLegalHtml('Inicio {{}} fin', null as unknown as Record<string, unknown>)).toBe(
			'Inicio {{}} fin',
		);
	});
});
