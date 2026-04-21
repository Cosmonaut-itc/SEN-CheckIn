// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HourlyActivity } from '@/lib/client-functions';

import { HourlyHeatmap, buildHourlySlots } from './hourly-heatmap';

vi.mock('next-intl', () => {
	return {
		useTranslations: () => {
			const messages: Record<string, string> = {
				'hourly.title': 'Actividad por hora',
				'hourly.empty': 'Sin datos de actividad.',
			};

			return (key: string) => messages[key] ?? key;
		},
	};
});

describe('HourlyHeatmap', () => {
	it('aggregates duplicate hours before scaling the bars', () => {
		const slots = buildHourlySlots([
			{ hour: 6, count: 4 },
			{ hour: 6, count: 8 },
			{ hour: 7, count: 6 },
		]);

		const sixAmSlot = slots.find((slot) => slot.hour === 6);
		const sevenAmSlot = slots.find((slot) => slot.hour === 7);

		expect(sixAmSlot?.count).toBe(12);
		expect(sevenAmSlot?.count).toBe(6);
		expect(sixAmSlot?.height).toBe(100);
		expect(sevenAmSlot?.height).toBe(50);
	});

	it('renders bars proportionally to data', () => {
		const data: HourlyActivity[] = [
			{ hour: 6, count: 12 },
			{ hour: 7, count: 6 },
			{ hour: 12, count: 3 },
		];

		render(<HourlyHeatmap data={data} isLoading={false} />);

		const tallBar = screen.getByTestId('hourly-heatmap-bar-6');
		const mediumBar = screen.getByTestId('hourly-heatmap-bar-7');
		const smallBar = screen.getByTestId('hourly-heatmap-bar-12');

		expect(tallBar).toHaveStyle({ height: '100%' });
		expect(mediumBar).toHaveStyle({ height: '50%' });
		expect(smallBar).toHaveStyle({ height: '25%' });
		expect(Number.parseFloat(tallBar.style.opacity)).toBeGreaterThan(
			Number.parseFloat(mediumBar.style.opacity),
		);
		expect(Number.parseFloat(mediumBar.style.opacity)).toBeGreaterThan(
			Number.parseFloat(smallBar.style.opacity),
		);
		expect(screen.getByText('6:00 - 20:00')).toBeInTheDocument();
		expect(screen.getByText('6:00: 12')).toBeInTheDocument();
	});

	it('renders a loading skeleton state', () => {
		render(<HourlyHeatmap data={[]} isLoading={true} />);

		expect(screen.getByTestId('hourly-heatmap-loading')).toBeInTheDocument();
		expect(screen.getAllByTestId('hourly-heatmap-loading-bar')).toHaveLength(15);
		expect(screen.queryByTestId('hourly-heatmap-empty')).not.toBeInTheDocument();
	});

	it('renders an empty state when there is no data', () => {
		render(<HourlyHeatmap data={[]} isLoading={false} />);

		expect(screen.getByTestId('hourly-heatmap-empty')).toBeInTheDocument();
		expect(screen.getByText('Sin datos de actividad.')).toBeInTheDocument();
		expect(screen.queryByTestId('hourly-heatmap-chart')).not.toBeInTheDocument();
	});

	it('renders an empty state when all data is outside the visible range', () => {
		const data: HourlyActivity[] = [
			{ hour: 3, count: 8 },
			{ hour: 21, count: 5 },
		];

		render(<HourlyHeatmap data={data} isLoading={false} />);

		expect(screen.getByTestId('hourly-heatmap-empty')).toBeInTheDocument();
		expect(screen.getByText('Sin datos de actividad.')).toBeInTheDocument();
		expect(screen.queryByTestId('hourly-heatmap-chart')).not.toBeInTheDocument();
		expect(screen.queryByTestId('hourly-heatmap-bar-6')).not.toBeInTheDocument();
	});
});
