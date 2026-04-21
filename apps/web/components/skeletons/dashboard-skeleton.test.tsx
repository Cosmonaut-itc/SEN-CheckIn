// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardSkeleton } from './dashboard-skeleton';

describe('DashboardSkeleton', () => {
	it('renders the Variant B editorial loading layout', () => {
		render(<DashboardSkeleton />);

		expect(screen.getByTestId('dashboard-skeleton-hero')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-skeleton-grid')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-skeleton-map')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-skeleton-location-rail')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-skeleton-timeline')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-skeleton-aux')).toBeInTheDocument();
	});
});
