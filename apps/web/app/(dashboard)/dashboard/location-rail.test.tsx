import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocationRail, type LocationRailProps } from './location-rail';

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

const defaultLocations: LocationRailProps['locations'] = [
	{
		id: 'loc-1',
		name: 'Planta Norte',
		code: 'NOR',
		latitude: 19.4326,
		longitude: -99.1332,
		presentCount: 18,
		employeeCount: 24,
	},
	{
		id: 'loc-2',
		name: 'Sucursal Centro',
		code: 'CTR',
		latitude: null,
		longitude: null,
		presentCount: 0,
		employeeCount: 12,
	},
];

const baseProps: LocationRailProps = {
	locations: defaultLocations,
	activeLocationId: 'loc-1',
	hoveredLocationId: null,
	onLocationClick: vi.fn(),
	onLocationHover: vi.fn(),
	isLoading: false,
	search: '',
	onSearchChange: vi.fn(),
};

/**
 * Controlled harness for testing search updates.
 *
 * @returns Harness element with internal search state.
 */
function SearchHarness(): React.ReactElement {
	const [search, setSearch] = useState<string>('');

	return (
		<LocationRail
			{...baseProps}
			search={search}
			onSearchChange={setSearch}
		/>
	);
}

/**
 * Renders the location rail with the provided overrides.
 *
 * @param overrides - Partial props used to customize the render.
 * @returns Rendered testing library utilities.
 */
function renderLocationRail(
	overrides: Partial<LocationRailProps> = {},
): ReturnType<typeof render> {
	return render(<LocationRail {...baseProps} {...overrides} />);
}

describe('LocationRail', () => {
	it('renders locations list', () => {
		renderLocationRail();

		expect(screen.getByTestId('location-rail')).toBeInTheDocument();
		expect(screen.getByRole('textbox')).toBeInTheDocument();
		expect(screen.getByTestId('location-rail-item-loc-1')).toBeInTheDocument();
		expect(screen.getByTestId('location-rail-item-loc-2')).toBeInTheDocument();
		expect(screen.getByText('18/24')).toBeInTheDocument();
		expect(screen.getByText('0/12')).toBeInTheDocument();
	});

	it('search filters locations', () => {
		render(<SearchHarness />);

		const searchInput = screen.getByRole('textbox');
		fireEvent.change(searchInput, { target: { value: 'centro' } });

		expect(screen.queryByTestId('location-rail-item-loc-1')).not.toBeInTheDocument();
		expect(screen.getByTestId('location-rail-item-loc-2')).toBeInTheDocument();
	});

	it('click selects location', () => {
		const handleLocationClick = vi.fn();

		renderLocationRail({
			onLocationClick: handleLocationClick,
		});

		fireEvent.click(screen.getByTestId('location-rail-item-loc-2'));

		expect(handleLocationClick).toHaveBeenCalledTimes(1);
		expect(handleLocationClick).toHaveBeenCalledWith('loc-2');
	});

	it('hover highlights location', () => {
		const handleLocationHover = vi.fn();

		renderLocationRail({
			activeLocationId: null,
			onLocationHover: handleLocationHover,
		});

		const locationCard = screen.getByTestId('location-rail-item-loc-2');
		fireEvent.mouseEnter(locationCard);
		fireEvent.mouseLeave(locationCard);

		expect(handleLocationHover).toHaveBeenNthCalledWith(1, 'loc-2');
		expect(handleLocationHover).toHaveBeenNthCalledWith(2, null);
	});

	it('renders loading skeleton and empty state', () => {
		const { rerender } = renderLocationRail({
			locations: [],
			isLoading: true,
		});

		expect(screen.getByTestId('location-rail-loading')).toBeInTheDocument();
		expect(screen.getAllByTestId('location-rail-skeleton-card')).toHaveLength(4);
		expect(screen.queryByTestId('location-rail-empty')).not.toBeInTheDocument();

		rerender(
			<LocationRail
				{...baseProps}
				locations={[]}
				isLoading={false}
			/>,
		);

		expect(screen.queryByTestId('location-rail-loading')).not.toBeInTheDocument();
		expect(screen.getByTestId('location-rail-empty')).toBeInTheDocument();
	});
});
