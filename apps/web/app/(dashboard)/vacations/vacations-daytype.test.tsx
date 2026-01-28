import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import type React from 'react';
import { describe, expect, it } from 'vitest';

import rawMessages from '@/messages/es.json';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

/**
 * Renders UI wrapped with the NextIntl provider.
 *
 * @param ui - React element to render
 * @returns Render result
 */
function renderWithIntl(ui: React.ReactElement) {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			{ui}
		</NextIntlClientProvider>,
	);
}

/**
 * Simple renderer for vacation day type labels.
 *
 * @returns JSX element for the INCAPACITY day type
 */
function DayTypeLabel(): React.ReactElement {
	const t = useTranslations('Vacations');
	return <span>{t('dayTypes.INCAPACITY')}</span>;
}

describe('Vacations day types', () => {
	it('renders the INCAPACITY day type label', () => {
		renderWithIntl(<DayTypeLabel />);
		expect(screen.getByText('dayTypes.INCAPACITY')).toBeInTheDocument();
	});
});
