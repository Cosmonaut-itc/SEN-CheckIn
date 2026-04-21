import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WeatherRecord } from '@/lib/client-functions';

import { WeatherCard } from './weather-card';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

/**
 * Builds a weather record fixture for the dashboard card tests.
 *
 * @param overrides - Partial weather fields to override.
 * @returns Weather record fixture.
 */
function createWeatherFixture(overrides: Partial<WeatherRecord> = {}): WeatherRecord {
	return {
		locationId: 'location-1',
		locationName: 'Sucursal Centro',
		temperature: 28,
		condition: 'cielo claro',
		high: 31,
		low: 24,
		humidity: 42,
		...overrides,
	};
}

/**
 * Renders the weather card with the shared Spanish intl provider.
 *
 * @param props - Weather card props.
 * @returns Rendered weather card.
 */
function renderWeatherCard(props: React.ComponentProps<typeof WeatherCard>): ReturnType<typeof render> {
	return render(<WeatherCard {...props} />);
}

describe('WeatherCard', () => {
	it('renders weather by location', () => {
		renderWeatherCard({
			isLoading: false,
			weather: [
				createWeatherFixture({
					locationId: 'location-1',
					locationName: 'Sucursal Centro',
					temperature: 28,
					high: 31,
					low: 24,
					condition: 'cielo claro',
				}),
				createWeatherFixture({
					locationId: 'location-2',
					locationName: 'Sucursal Norte',
					temperature: 22,
					high: 25,
					low: 19,
					condition: 'nubes',
				}),
			],
		});

		expect(screen.getByText('Sucursal Centro')).toBeInTheDocument();
		expect(screen.getByText('Sucursal Norte')).toBeInTheDocument();
		expect(screen.getByText('28°C')).toBeInTheDocument();
		expect(screen.getByText('22°C')).toBeInTheDocument();
		expect(screen.getByText('24° - 31°')).toBeInTheDocument();
		expect(screen.getByText('19° - 25°')).toBeInTheDocument();
	});

	it('renders the correct icon by condition', () => {
		renderWeatherCard({
			isLoading: false,
			weather: [
				createWeatherFixture({
					locationId: 'location-1',
					locationName: 'Cielo claro',
					condition: 'cielo claro',
				}),
				createWeatherFixture({
					locationId: 'location-2',
					locationName: 'Parcialmente nublado',
					condition: 'sunny intervals',
				}),
				createWeatherFixture({
					locationId: 'location-3',
					locationName: 'Nublado',
					condition: 'nubes',
				}),
				createWeatherFixture({
					locationId: 'location-4',
					locationName: 'Lluvia',
					condition: 'lluvia',
				}),
			],
		});

		expect(screen.getByTestId('weather-icon-cielo-claro-svg')).toBeInTheDocument();
		expect(screen.getByTestId('weather-icon-parcialmente-nublado-svg')).toBeInTheDocument();
		expect(screen.getByTestId('weather-icon-nubes-svg')).toBeInTheDocument();
		expect(screen.getByTestId('weather-icon-lluvia-svg')).toBeInTheDocument();

		expect(screen.getByTestId('weather-icon-cielo-claro')).toHaveClass('text-amber-500');
		expect(screen.getByTestId('weather-icon-parcialmente-nublado')).toHaveClass('text-amber-500');
		expect(screen.getByTestId('weather-icon-nubes')).toHaveClass('text-slate-500');
		expect(screen.getByTestId('weather-icon-lluvia')).toHaveClass('text-sky-500');
	});

	it('renders loading skeleton and empty state', () => {
		const { container, rerender } = renderWeatherCard({
			isLoading: true,
			weather: [],
		});

		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);

		rerender(<WeatherCard isLoading={false} weather={[]} />);

		expect(screen.getByText('Datos de clima no disponibles.')).toBeInTheDocument();
	});
});
