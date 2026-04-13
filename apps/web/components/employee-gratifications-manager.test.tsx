import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeeGratification } from '@/lib/client-functions';
import { OrgProvider } from '@/lib/org-client-context';
import { queryKeys } from '@/lib/query-keys';

import { EmployeeGratificationsManager } from './employee-gratifications-manager';

const mockFetchEmployeesList = vi.fn();
const mockFetchEmployeeGratificationsList = vi.fn();
const mockFetchOrganizationGratificationsList = vi.fn();
const mockCreateEmployeeGratificationAction = vi.fn();
const mockUpdateEmployeeGratificationAction = vi.fn();
const mockCancelEmployeeGratificationAction = vi.fn();

vi.mock('next-intl', () => ({
	useTranslations: () => (key: string, values?: Record<string, unknown>) => {
		if (key === 'pagination.summary') {
			return `${values?.current ?? 0}/${values?.total ?? 0}/${values?.count ?? 0}`;
		}
		if (key === 'table.visibleCount') {
			return `table.visibleCount:${values?.count ?? 0}`;
		}
		return key;
	},
}));

vi.mock('@/lib/client-functions', () => ({
	fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
	fetchEmployeeGratificationsList: (...args: unknown[]) =>
		mockFetchEmployeeGratificationsList(...args),
	fetchOrganizationGratificationsList: (...args: unknown[]) =>
		mockFetchOrganizationGratificationsList(...args),
}));

vi.mock('@/actions/employee-gratifications', () => ({
	createEmployeeGratificationAction: (...args: unknown[]) =>
		mockCreateEmployeeGratificationAction(...args),
	updateEmployeeGratificationAction: (...args: unknown[]) =>
		mockUpdateEmployeeGratificationAction(...args),
	cancelEmployeeGratificationAction: (...args: unknown[]) =>
		mockCancelEmployeeGratificationAction(...args),
}));

vi.mock('sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('@/components/ui/select', async () => {
	const ReactModule = await import('react');
	const React = ReactModule.default;

	interface MockSelectItemProps {
		value: string;
		children: React.ReactNode;
		disabled?: boolean;
	}

	interface MockSelectProps {
		value?: string;
		onValueChange?: (value: string) => void;
		children: React.ReactNode;
	}

	function MockSelectItem({
		value,
		children,
		disabled,
	}: MockSelectItemProps): React.ReactElement {
		return (
			<option value={value} disabled={disabled}>
				{children}
			</option>
		);
	}

	MockSelectItem.displayName = 'MockSelectItem';

	function extractOptions(children: React.ReactNode): React.ReactNode[] {
		return React.Children.toArray(children).flatMap((child) => {
			if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
				return [];
			}
			if (child.type === MockSelectItem) {
				return [child];
			}
			return extractOptions(child.props.children);
		});
	}

	function MockSelect({
		value = '',
		onValueChange,
		children,
	}: MockSelectProps): React.ReactElement {
		return (
			<select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
				{extractOptions(children)}
			</select>
		);
	}

	return {
		Select: MockSelect,
		SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		SelectItem: MockSelectItem,
		SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		SelectValue: () => null,
	};
});

/**
 * Renders the gratifications manager with required providers.
 *
 * @returns Render result
 */
function renderWithProviders(queryClient?: QueryClient): ReturnType<typeof render> {
	const resolvedQueryClient =
		queryClient ??
		new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

	return render(
		<QueryClientProvider client={resolvedQueryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationName: 'Org Test',
					organizationSlug: 'org-test',
					organizationTimeZone: 'America/Mexico_City',
					organizationRole: 'admin',
					userRole: 'admin',
				}}
			>
				<EmployeeGratificationsManager mode="organization" />
			</OrgProvider>
		</QueryClientProvider>,
	);
}

/**
 * Creates a query client for component tests.
 *
 * @returns Query client configured without retries
 */
function createTestQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
}

/**
 * Builds a minimal employee fixture for selector tests.
 *
 * @param index - Numeric suffix used in ids and names
 * @returns Employee payload fixture
 */
function buildEmployee(
	index: number,
): Awaited<ReturnType<typeof mockFetchEmployeesList>>['data'][number] {
	return {
		id: `emp-${index}`,
		code: `EMP-${index}`,
		firstName: `Empleado ${index}`,
		lastName: 'Prueba',
		email: null,
		phone: null,
		jobPositionId: null,
		jobPositionName: null,
		department: null,
		status: 'ACTIVE',
		hireDate: null,
		locationId: null,
		organizationId: 'org-1',
		userId: null,
		dailyPay: 400,
		paymentFrequency: 'WEEKLY',
		employmentType: 'PERMANENT',
		isTrustEmployee: false,
		isDirectorAdminGeneralManager: false,
		isDomesticWorker: false,
		isPlatformWorker: false,
		platformHoursYear: 0,
		ptuEligibilityOverride: 'DEFAULT',
		aguinaldoDaysOverride: null,
		sbcDailyOverride: null,
		rekognitionUserId: null,
		shiftType: 'DIURNA',
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
	};
}

/**
 * Builds a gratification fixture for organization table tests.
 *
 * @param overrides - Per-test gratification overrides
 * @returns Gratification payload fixture
 */
function buildGratification(
	overrides: Partial<EmployeeGratification> = {},
): EmployeeGratification {
	return {
		id: 'grat-1',
		organizationId: 'org-1',
		employeeId: 'emp-1',
		employeeName: 'Ada Lovelace',
		concept: 'Cumpleaños',
		amount: 500,
		periodicity: 'ONE_TIME',
		applicationMode: 'MANUAL',
		status: 'ACTIVE',
		startDateKey: '2026-04-01',
		endDateKey: null,
		notes: 'Bono especial',
		createdByUserId: 'user-1',
		createdAt: new Date('2026-04-01T00:00:00.000Z'),
		updatedAt: new Date('2026-04-01T00:00:00.000Z'),
		...overrides,
	};
}

describe('EmployeeGratificationsManager', () => {
	beforeEach(() => {
		mockFetchEmployeesList.mockReset();
		mockFetchEmployeeGratificationsList.mockReset();
		mockFetchOrganizationGratificationsList.mockReset();
		mockCreateEmployeeGratificationAction.mockReset();
		mockUpdateEmployeeGratificationAction.mockReset();
		mockCancelEmployeeGratificationAction.mockReset();

		mockFetchEmployeesList.mockResolvedValue({
			data: [
				{
					id: 'emp-1',
					code: 'EMP-1',
					firstName: 'Ada',
					lastName: 'Lovelace',
					email: null,
					phone: null,
					jobPositionId: null,
					jobPositionName: null,
					department: null,
					status: 'ACTIVE',
					hireDate: null,
					locationId: null,
					organizationId: 'org-1',
					userId: null,
					dailyPay: 400,
					paymentFrequency: 'WEEKLY',
					employmentType: 'PERMANENT',
					isTrustEmployee: false,
					isDirectorAdminGeneralManager: false,
					isDomesticWorker: false,
					isPlatformWorker: false,
					platformHoursYear: 0,
					ptuEligibilityOverride: 'DEFAULT',
					aguinaldoDaysOverride: null,
					sbcDailyOverride: null,
					rekognitionUserId: null,
					shiftType: 'DIURNA',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 1,
				limit: 100,
				offset: 0,
			},
		});

		mockFetchOrganizationGratificationsList.mockResolvedValue({
			data: [
				{
					id: 'grat-1',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					concept: 'Cumpleaños',
					amount: 500,
					periodicity: 'ONE_TIME',
					applicationMode: 'MANUAL',
					status: 'ACTIVE',
					startDateKey: '2026-04-01',
					endDateKey: null,
					notes: 'Bono especial',
					createdByUserId: 'user-1',
					createdAt: new Date('2026-04-01T00:00:00.000Z'),
					updatedAt: new Date('2026-04-01T00:00:00.000Z'),
				},
				{
					id: 'grat-2',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					concept: 'Puntualidad',
					amount: 250,
					periodicity: 'RECURRING',
					applicationMode: 'AUTOMATIC',
					status: 'PAUSED',
					startDateKey: '2026-04-01',
					endDateKey: null,
					notes: null,
					createdByUserId: 'user-1',
					createdAt: new Date('2026-04-01T00:00:00.000Z'),
					updatedAt: new Date('2026-04-01T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 21,
				limit: 20,
				offset: 0,
			},
		});
	});

	it('resets organization pagination when filters change', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(mockFetchOrganizationGratificationsList).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'org-1',
					offset: 0,
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText('Cumpleaños')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'next' }));

		await waitFor(() => {
			expect(mockFetchOrganizationGratificationsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 20,
				}),
			);
		});

		const selects = screen.getAllByRole('combobox');
		fireEvent.change(selects[0] as HTMLSelectElement, {
			target: { value: 'ACTIVE' },
		});

		await waitFor(() => {
			expect(mockFetchOrganizationGratificationsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 0,
					status: 'ACTIVE',
				}),
			);
		});
	});

	it('renders gratification summaries and rows', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Cumpleaños')).toBeInTheDocument();
		});

		expect(screen.getAllByText('summary.countValue').length).toBeGreaterThan(0);
		expect(screen.getAllByText(/\$500\.00/).length).toBeGreaterThan(0);
		expect(screen.getAllByText('applicationMode.MANUAL').length).toBeGreaterThan(0);
		expect(screen.getAllByText('applicationMode.AUTOMATIC').length).toBeGreaterThan(0);
	});

	it('labels summary cards as visible-only when the organization view is paginated', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Cumpleaños')).toBeInTheDocument();
		});

		expect(screen.getByText('summary.activeGratificationsVisible')).toBeInTheDocument();
		expect(screen.getByText('summary.activeAmountVisible')).toBeInTheDocument();
		expect(screen.getByText('summary.automaticVisible')).toBeInTheDocument();
		expect(screen.getByText('summary.manualVisible')).toBeInTheDocument();
	});

	it('shows the number of visible rows instead of the total paginated count', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Cumpleaños')).toBeInTheDocument();
		});

		expect(screen.getByText('table.visibleCount:2')).toBeInTheDocument();
		expect(screen.queryByText('table.visibleCount:21')).not.toBeInTheDocument();
	});

	it('asks for confirmation before cancelling a gratification', async () => {
		mockCancelEmployeeGratificationAction.mockResolvedValue({
			success: true,
			data: null,
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Cumpleaños')).toBeInTheDocument();
		});

		fireEvent.click(screen.getAllByRole('button', { name: 'actions.cancel' })[0]!);

		expect(mockCancelEmployeeGratificationAction).not.toHaveBeenCalled();
		expect(screen.getByText('cancelDialog.title')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'cancelDialog.confirm' }));

		await waitFor(() => {
			expect(mockCancelEmployeeGratificationAction).toHaveBeenCalledWith(
				{
					employeeId: 'emp-1',
					id: 'grat-1',
					organizationId: 'org-1',
				},
				expect.anything(),
			);
		});
	});

	it('returns to the first page when the current page becomes out of range after a cancellation', async () => {
		let hasShrunkToSinglePage = false;

		mockFetchOrganizationGratificationsList.mockImplementation(async (params) => {
			if (params.offset === 20) {
				return hasShrunkToSinglePage
					? {
							data: [],
							pagination: {
								total: 1,
								limit: 20,
								offset: 20,
							},
						}
					: {
							data: [
								buildGratification({
									id: 'grat-last',
									concept: 'Ultima gratificacion',
								}),
							],
							pagination: {
								total: 21,
								limit: 20,
								offset: 20,
							},
						};
			}

			return {
				data: [
					buildGratification({
						id: 'grat-survivor',
						concept: 'Gratificacion vigente',
					}),
				],
				pagination: {
					total: hasShrunkToSinglePage ? 1 : 21,
					limit: 20,
					offset: 0,
				},
			};
		});

		mockCancelEmployeeGratificationAction.mockImplementation(async () => {
			hasShrunkToSinglePage = true;
			return {
				success: true,
				data: null,
			};
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('Gratificacion vigente')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'next' }));

		await waitFor(() => {
			expect(mockFetchOrganizationGratificationsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 20,
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText('Ultima gratificacion')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
		fireEvent.click(screen.getByRole('button', { name: 'cancelDialog.confirm' }));

		await waitFor(() => {
			expect(mockCancelEmployeeGratificationAction).toHaveBeenCalledWith(
				{
					employeeId: 'emp-1',
					id: 'grat-last',
					organizationId: 'org-1',
				},
				expect.anything(),
			);
		});

		await waitFor(() => {
			expect(mockFetchOrganizationGratificationsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 0,
				}),
			);
		});

		expect(screen.getByText('Gratificacion vigente')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument();
	});

	it('loads employees beyond the first employees page into organization selectors', async () => {
		const queryClient = createTestQueryClient();
		const firstEmployeesPage = Array.from({ length: 100 }, (_, index) =>
			buildEmployee(index + 1),
		);
		const cachedEmployeesPage = {
			data: firstEmployeesPage,
			pagination: {
				total: 101,
				limit: 100,
				offset: 0,
			},
		};

		mockFetchEmployeesList.mockReset();
		mockFetchEmployeesList.mockResolvedValueOnce(cachedEmployeesPage).mockResolvedValueOnce({
			data: [buildEmployee(101)],
			pagination: {
				total: 101,
				limit: 100,
				offset: 100,
			},
		});

		queryClient.setQueryData(
			queryKeys.employees.list({
				organizationId: 'org-1',
				limit: 100,
				offset: 0,
			}),
			cachedEmployeesPage,
		);

		renderWithProviders(queryClient);

		await waitFor(() => {
			expect(mockFetchEmployeesList).toHaveBeenNthCalledWith(1, {
				limit: 100,
				offset: 0,
				organizationId: 'org-1',
			});
		});

		await waitFor(() => {
			expect(mockFetchEmployeesList).toHaveBeenNthCalledWith(2, {
				limit: 100,
				offset: 100,
				organizationId: 'org-1',
			});
		});

		expect(
			queryClient.getQueryData(
				queryKeys.employees.listAll({
					organizationId: 'org-1',
				}),
			),
		).toEqual({
			data: [...firstEmployeesPage, buildEmployee(101)],
			pagination: {
				total: 101,
				limit: 101,
				offset: 0,
			},
		});
		expect(
			queryClient.getQueryData(
				queryKeys.employees.list({
					organizationId: 'org-1',
					limit: 100,
					offset: 0,
				}),
			),
		).toEqual(cachedEmployeesPage);

		expect(screen.getByRole('option', { name: 'Empleado 101 Prueba' })).toBeInTheDocument();
	});
});
