import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

describe('test bootstrap script', () => {
	it('recreates the public schema with an explicit grant for PostgreSQL 15+', () => {
		const bootstrapScript = readFileSync(
			resolve(import.meta.dir, '../../scripts/test/bootstrap.ts'),
			'utf8',
		);

		expect(bootstrapScript).toContain('CREATE SCHEMA public;');
		expect(bootstrapScript).toContain('GRANT ALL ON SCHEMA public TO PUBLIC;');
		expect(bootstrapScript.indexOf('CREATE SCHEMA public;')).toBeLessThan(
			bootstrapScript.indexOf('GRANT ALL ON SCHEMA public TO PUBLIC;'),
		);
	});
});
