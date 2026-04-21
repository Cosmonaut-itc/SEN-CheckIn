// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

import { HeroStatCard } from './hero-stat-card';

describe('HeroStatCard', () => {
	it('renders the dashboard summary values', () => {
		const expectedValues = ['a tiempo hoy', '12', '/ 20', '3 retardos', '1 falta', '4 en campo'];

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

		for (const value of expectedValues) {
			expect(screen.getByText(value)).toBeVisible();
		}
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

		expect(screen.queryByText('a tiempo hoy')).not.toBeInTheDocument();
		expect(screen.queryByText('0')).not.toBeInTheDocument();
		expect(screen.queryByText('/ 0')).not.toBeInTheDocument();
		expect(screen.queryByText('0 retardos')).not.toBeInTheDocument();
		expect(screen.queryByText('0 falta')).not.toBeInTheDocument();
		expect(screen.queryByText('0 en campo')).not.toBeInTheDocument();
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
	});
});
