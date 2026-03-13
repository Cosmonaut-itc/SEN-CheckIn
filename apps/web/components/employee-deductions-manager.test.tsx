import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';

import { EmployeeDeductionsManager } from './employee-deductions-manager';

const mockFetchEmployeesList = vi.fn();
const mockFetchEmployeeDeductionsList = vi.fn();
const mockFetchOrganizationDeductionsList = vi.fn();
const mockCreateEmployeeDeductionAction = vi.fn();
const mockUpdateEmployeeDeductionAction = vi.fn();

vi.mock('next-intl', () => ({
	useTranslations: () => (key: string, values?: Record<string, unknown>) => {
		if (key === 'pagination.summary') {
			return `${values?.current ?? 0}/${values?.total ?? 0}/${values?.count ?? 0}`;
		}
		return key;
	},
}));

vi.mock('@/lib/client-functions', () => ({
	fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
	fetchEmployeeDeductionsList: (...args: unknown[]) => mockFetchEmployeeDeductionsList(...args),
	fetchOrganizationDeductionsList: (...args: unknown[]) =>
		mockFetchOrganizationDeductionsList(...args),
}));

vi.mock('@/actions/employee-deductions', () => ({
	createEmployeeDeductionAction: (...args: unknown[]) =>
		mockCreateEmployeeDeductionAction(...args),
	updateEmployeeDeductionAction: (...args: unknown[]) =>
		mockUpdateEmployeeDeductionAction(...args),
}));

vi.mock('sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock('@/components/ui/select', async () => {
	const ReactModule = await import('react');
	const React = ReactModule.default;

	interface MockSelectItemProps {
		value: string;
		children: React.ReactNode;
	}

	interface MockSelectProps {
		value?: string;
		onValueChange?: (value: string) => void;
		children: React.ReactNode;
	}

	function MockSelectItem({ value, children }: MockSelectItemProps): React.ReactElement {
		return <option value={value}>{children}</option>;
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
 * Renders the employee deductions manager with required providers.
 *
 * @returns Render result
 */
function renderWithProviders(): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
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
				<EmployeeDeductionsManager mode="organization" />
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('EmployeeDeductionsManager', () => {
	beforeEach(() => {
		mockFetchEmployeesList.mockReset();
		mockFetchEmployeeDeductionsList.mockReset();
		mockFetchOrganizationDeductionsList.mockReset();
		mockCreateEmployeeDeductionAction.mockReset();
		mockUpdateEmployeeDeductionAction.mockReset();

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
					rekognitionUserId: null,
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

		mockFetchOrganizationDeductionsList.mockResolvedValue({
			data: [
				{
					id: 'ded-1',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					type: 'OTHER',
					label: 'Caja de ahorro',
					calculationMethod: 'FIXED_AMOUNT',
					value: 150,
					frequency: 'RECURRING',
					totalInstallments: null,
					completedInstallments: 0,
					totalAmount: 150,
					remainingAmount: 150,
					status: 'ACTIVE',
					startDateKey: '2026-03-01',
					endDateKey: null,
					referenceNumber: null,
					satDeductionCode: null,
					notes: null,
					createdByUserId: 'user-1',
					createdAt: new Date('2026-03-01T00:00:00.000Z'),
					updatedAt: new Date('2026-03-01T00:00:00.000Z'),
				},
				{
					id: 'ded-2',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					type: 'INFONAVIT',
					label: 'Infonavit',
					calculationMethod: 'PERCENTAGE_GROSS',
					value: 10,
					frequency: 'RECURRING',
					totalInstallments: null,
					completedInstallments: 0,
					totalAmount: null,
					remainingAmount: 5000,
					status: 'ACTIVE',
					startDateKey: '2026-03-01',
					endDateKey: null,
					referenceNumber: null,
					satDeductionCode: null,
					notes: null,
					createdByUserId: 'user-1',
					createdAt: new Date('2026-03-01T00:00:00.000Z'),
					updatedAt: new Date('2026-03-01T00:00:00.000Z'),
				},
				{
					id: 'ded-3',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					type: 'OTHER',
					label: 'Saldo cancelado',
					calculationMethod: 'FIXED_AMOUNT',
					value: 75,
					frequency: 'INSTALLMENTS',
					totalInstallments: 4,
					completedInstallments: 1,
					totalAmount: 300,
					remainingAmount: 900,
					status: 'CANCELLED',
					startDateKey: '2026-03-01',
					endDateKey: null,
					referenceNumber: null,
					satDeductionCode: null,
					notes: null,
					createdByUserId: 'user-1',
					createdAt: new Date('2026-03-01T00:00:00.000Z'),
					updatedAt: new Date('2026-03-01T00:00:00.000Z'),
				},
				{
					id: 'ded-4',
					organizationId: 'org-1',
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					type: 'OTHER',
					label: 'Saldo completado',
					calculationMethod: 'FIXED_AMOUNT',
					value: 50,
					frequency: 'INSTALLMENTS',
					totalInstallments: 2,
					completedInstallments: 2,
					totalAmount: 100,
					remainingAmount: 700,
					status: 'COMPLETED',
					startDateKey: '2026-03-01',
					endDateKey: null,
					referenceNumber: null,
					satDeductionCode: null,
					notes: null,
					createdByUserId: 'user-1',
					createdAt: new Date('2026-03-01T00:00:00.000Z'),
					updatedAt: new Date('2026-03-01T00:00:00.000Z'),
				},
			],
			pagination: {
				total: 41,
				limit: 20,
				offset: 0,
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resets organization pagination when deduction filters change', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(mockFetchOrganizationDeductionsList).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'org-1',
					offset: 0,
				}),
			);
		});

		const nextButton = screen.getByRole('button', { name: 'next' });
		await waitFor(() => {
			expect(nextButton.hasAttribute('disabled')).toBe(false);
		});

		fireEvent.click(nextButton);

		await waitFor(() => {
			expect(mockFetchOrganizationDeductionsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 20,
				}),
			);
		});

		const selects = screen.getAllByRole('combobox');
		fireEvent.change(selects[0] as HTMLSelectElement, {
			target: { value: 'OTHER' },
		});

		await waitFor(() => {
			expect(mockFetchOrganizationDeductionsList).toHaveBeenLastCalledWith(
				expect.objectContaining({
					offset: 0,
					type: 'OTHER',
				}),
			);
		});
	});

	it('labels organization summaries as visible-only and excludes non-fixed values from the currency total', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(
				screen
					.getByText('summary.activeFixedAmount')
					.closest('div')
					?.parentElement?.textContent,
			).toContain('150');
		});

		expect(screen.getAllByText('summary.visibleScope')).toHaveLength(2);
		const configuredCardText =
			screen.getByText('summary.activeFixedAmount').closest('div')?.parentElement
				?.textContent ?? '';
		expect(configuredCardText).toContain('150');
		expect(configuredCardText).not.toContain('160');
		expect(screen.getByText(/\$5,150\.00/)).toBeTruthy();
		expect(screen.queryByText(/\$6,750\.00/)).toBeNull();
	});
});
