import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSession = vi.fn();
const mockUseTour = vi.fn();
const mockFetchOrganizations = vi.fn();
const mockFetchAllOrganizations = vi.fn();
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();

vi.mock('next-intl', () => ({
	useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		refresh: vi.fn(),
		push: vi.fn(),
		replace: vi.fn(),
	}),
}));

vi.mock('@/lib/auth-client', () => ({
	useSession: (...args: unknown[]) => mockUseSession(...args),
}));

vi.mock('@/hooks/use-tour', () => ({
	useTour: (...args: unknown[]) => mockUseTour(...args),
}));

vi.mock('@/lib/client-functions', () => ({
	fetchOrganizations: (...args: unknown[]) => mockFetchOrganizations(...args),
	fetchAllOrganizations: (...args: unknown[]) => mockFetchAllOrganizations(...args),
}));

vi.mock('@/actions/organizations', () => ({
	createOrganization: vi.fn(),
	deleteOrganization: vi.fn(),
	updateOrganization: vi.fn(),
}));

vi.mock('@/lib/forms', () => ({
	useAppForm: () => ({
		AppField: () => null,
		AppForm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		SubmitButton: () => null,
		reset: vi.fn(),
		setFieldValue: vi.fn(),
		handleSubmit: vi.fn(),
	}),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: (...args: unknown[]) => mockUseQueryClient(...args),
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
	useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock('@/components/ui/responsive-data-view', () => ({
	ResponsiveDataView: () => <div data-testid="organizations-data-view" />,
}));

vi.mock('@/components/ui/responsive-page-header', () => ({
	ResponsivePageHeader: ({
		actions,
	}: {
		actions?: React.ReactNode;
	}): React.ReactElement => <div>{actions}</div>,
}));

vi.mock('@/components/tour-help-button', () => ({
	TourHelpButton: ({ tourId }: { tourId: string }) => (
		<button type="button" data-testid="tour-help-button">
			{tourId}
		</button>
	),
}));

vi.mock('@/components/ui/dialog', () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: () => null,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { OrganizationsPageClient } from './organizations-client';

describe('OrganizationsPageClient', () => {
	beforeEach(() => {
		mockUseSession.mockReset();
		mockUseTour.mockReset();
		mockFetchOrganizations.mockReset();
		mockFetchAllOrganizations.mockReset();
		mockUseQuery.mockReset();
		mockUseMutation.mockReset();
		mockUseQueryClient.mockReset();

		mockUseSession.mockReturnValue({
			data: {
				user: {
					id: 'user-1',
					role: 'member',
				},
				session: {
					activeOrganizationId: 'org-1',
				},
			},
			isPending: false,
		});
		mockUseTour.mockReturnValue({
			restartTour: vi.fn(),
			isTourRunning: false,
		});
		mockFetchOrganizations.mockResolvedValue([]);
		mockFetchAllOrganizations.mockResolvedValue({
			organizations: [],
			total: 0,
		});
		mockUseQuery.mockReturnValue({
			data: [],
			isFetching: false,
		});
		mockUseMutation.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mockUseQueryClient.mockReturnValue({
			invalidateQueries: vi.fn(),
		});
	});

	it('does not auto-launch or offer replay when the create button is unavailable', () => {
		render(<OrganizationsPageClient />);

		expect(mockUseTour).toHaveBeenCalledWith('organizations', false);
		expect(screen.queryByTestId('tour-help-button')).not.toBeInTheDocument();
		expect(screen.queryByTestId('organizations-create-button')).not.toBeInTheDocument();
	});

	it('keeps the tour entry points available when the user can create organizations', () => {
		mockUseSession.mockReturnValue({
			data: {
				user: {
					id: 'user-1',
					role: 'admin',
				},
				session: {
					activeOrganizationId: 'org-1',
				},
			},
			isPending: false,
		});

		render(<OrganizationsPageClient />);

		expect(mockUseTour).toHaveBeenCalledWith('organizations', true);
		expect(screen.getByTestId('tour-help-button')).toBeInTheDocument();
		expect(screen.getByTestId('organizations-create-button')).toBeInTheDocument();
	});
});
