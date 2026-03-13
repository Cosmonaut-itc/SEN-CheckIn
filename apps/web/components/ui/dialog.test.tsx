import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

describe('DialogContent', () => {
	it('keeps the shared tablet-and-up width constraint', () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Titulo</DialogTitle>
					<DialogDescription>Descripcion</DialogDescription>
					Contenido
				</DialogContent>
			</Dialog>,
		);

		const dialog = screen.getByRole('dialog');

		expect(dialog.className).toContain('min-[640px]:max-w-lg');
	});
});
