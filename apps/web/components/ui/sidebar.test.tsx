import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { SidebarInset } from './sidebar';

describe('SidebarInset', () => {
	it('allows dashboard content to shrink without propagating horizontal overflow', () => {
		render(<SidebarInset>Contenido</SidebarInset>);

		expect(screen.getByText('Contenido').closest('main')).toHaveClass('min-w-0');
	});
});
