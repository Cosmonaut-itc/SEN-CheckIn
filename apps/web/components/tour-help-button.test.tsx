import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockRestartTour = vi.fn();

vi.mock('@/components/tour-provider', () => ({
	useOptionalTourContext: () => ({
		startTour: mockRestartTour,
	}),
}));

import { TourHelpButton } from './tour-help-button';

const messages = {
	Tours: {
		helpButtonTooltip: 'Repetir tutorial de esta sección',
	},
};

describe('TourHelpButton', () => {
	it('restarts the section tour when the help button is clicked', () => {
		mockRestartTour.mockReset();

		render(
			<NextIntlClientProvider locale="es" messages={messages}>
				<TourHelpButton tourId="dashboard" />
			</NextIntlClientProvider>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'helpButtonTooltip' }));

		expect(mockRestartTour).toHaveBeenCalledTimes(1);
	});
});
