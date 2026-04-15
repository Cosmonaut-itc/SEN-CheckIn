import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

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
		render(<DayTypeLabel />);
		expect(screen.getByText('Incapacidad IMSS')).toBeInTheDocument();
	});
});
