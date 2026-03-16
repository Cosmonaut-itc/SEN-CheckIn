import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarInset } from './sidebar';

describe('SidebarInset', () => {
	it('allows the dashboard content column to shrink beside the desktop sidebar', () => {
		render(
			<SidebarInset>
				<div>Contenido</div>
			</SidebarInset>,
		);

		const inset = screen.getByText('Contenido').closest('main');
		if (!(inset instanceof HTMLElement)) {
			throw new Error('Expected SidebarInset to render a main element.');
		}

		expect(inset.className).toContain('min-w-0');
		expect(inset.className).not.toContain('w-full');
	});
});
