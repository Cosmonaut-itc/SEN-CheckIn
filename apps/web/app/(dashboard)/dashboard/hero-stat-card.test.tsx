// @vitest-environment jsdom

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

import { HeroStatCard } from './hero-stat-card';

describe('HeroStatCard', () => {
	it('renders the dashboard summary values', () => {
		render(
			<HeroStatCard
				onTime={12}
				total={20}
				late={3}
				absent={1}
				offsite={4}
				isLoading={false}
			/>,
		);

		expect(screen.getByText('12')).toBeVisible();
		expect(screen.getByText('/ 20')).toBeVisible();
		expect(screen.getByTestId('hero-stat-on-time')).toBeVisible();
		expect(within(screen.getByTestId('hero-stat-chip-late')).getByText(/^3\b/)).toBeVisible();
		expect(within(screen.getByTestId('hero-stat-chip-absent')).getByText(/^1\b/)).toBeVisible();
		expect(within(screen.getByTestId('hero-stat-chip-offsite')).getByText(/^4\b/)).toBeVisible();
	});

	it('renders a loading skeleton', () => {
		const { container } = render(
			<HeroStatCard
				onTime={0}
				total={0}
				late={0}
				absent={0}
				offsite={0}
				isLoading
			/>,
		);

		expect(screen.queryByTestId('hero-stat-on-time')).not.toBeInTheDocument();
		expect(screen.queryByText('0')).not.toBeInTheDocument();
		expect(screen.queryByText('/ 0')).not.toBeInTheDocument();
		expect(screen.queryByTestId('hero-stat-chip-late')).not.toBeInTheDocument();
		expect(screen.queryByTestId('hero-stat-chip-absent')).not.toBeInTheDocument();
		expect(screen.queryByTestId('hero-stat-chip-offsite')).not.toBeInTheDocument();
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
	});
});
