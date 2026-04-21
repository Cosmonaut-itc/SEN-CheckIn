import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmployeeDetailDialog, EmployeePageActions } from './employee-detail-dialog';
import { createEmployeeFixture } from './employee-test-fixtures';

const mockPush = vi.fn();

vi.mock('next-intl', async () => import('@/lib/test-utils/next-intl'));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
	}),
}));

vi.mock('@/components/ui/dialog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/components/ui/dialog')>();

	return {
		...actual,
		Dialog: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogContent: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogHeader: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogTitle: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogDescription: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogFooter: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<div>{children}</div>
		),
		DialogTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<>{children}</>
		),
	};
});

vi.mock('@/components/ui/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
	}): React.ReactElement => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

describe('EmployeePageActions', () => {
	beforeEach(() => {
		mockPush.mockReset();
	});

	it('routes to the bulk import page from the split button menu', () => {
		render(<EmployeePageActions onCreateNew={vi.fn()} />);

		expect(screen.getByTestId('employees-add-button')).toBeInTheDocument();
		expect(screen.getByTestId('employees-import-button')).toBeInTheDocument();
		expect(screen.getByTestId('employees-add-menu-button')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('employees-import-button'));
		expect(mockPush).toHaveBeenCalledWith('/employees/import');

		fireEvent.click(screen.getAllByText('Importar desde documento')[1]);

		expect(mockPush).toHaveBeenCalledTimes(2);
	});
});

describe('EmployeeDetailDialog', () => {
	it('renders the vacations panel with controlled scrolling wrappers', () => {
		render(
			<EmployeeDetailDialog
				isOpen
				mode="view"
				activeEmployee={createEmployeeFixture({ id: 'emp-1' })}
				detailTab="vacations"
				form={{}}
				schedule={[]}
				upsertScheduleEntry={vi.fn()}
				handlers={{
					handleCreateNew: vi.fn(),
					onOpenChange: vi.fn(),
					handleEditFromDetails: vi.fn(),
					handleDetailTabChange: vi.fn(),
					markTabAsVisited: vi.fn(),
					registerTabScrollContainer: () => vi.fn(),
					handleTabScroll: () => vi.fn(),
					isTabVisited: (tab) => tab === 'vacations',
					closeEmployeeDialog: vi.fn(),
					setShowMobileDiscardFromOutside: vi.fn(),
					setMobileWizardStepIndex: vi.fn(),
					handleMobileWizardSubmit: vi.fn(),
					handlePtuHistorySave: vi.fn(),
					setPtuHistoryYearInput: vi.fn(),
					setPtuHistoryAmountInput: vi.fn(),
					refetchInsights: vi.fn(),
					refetchPtuHistory: vi.fn(),
					refetchAudit: vi.fn(),
					updateTerminationForm: vi.fn(),
					setIsTerminateDialogOpen: vi.fn(),
					handleTerminationPreview: vi.fn(),
					handleTerminateEmployee: vi.fn(),
					setHasCustomCode: vi.fn(),
				}}
				lookups={{
					activeEmployeeLocation: 'CDMX',
					isMobile: false,
					canUseDisciplinaryModule: false,
					secondaryDetailTabs: [],
					vacationBalance: {
						employeeId: 'emp-1',
						hireDate: new Date('2024-01-10T00:00:00.000Z'),
						entitledDays: 12,
						accruedDays: 8.5,
						usedDays: 2,
						pendingDays: 1,
						availableDays: 5.5,
						serviceYearNumber: 2,
						serviceYearStartDateKey: '2026-01-10',
						serviceYearEndDateKey: '2027-01-09',
						asOfDateKey: '2026-04-13',
					},
					attendanceSummary: null,
					leaveItems: [],
					attendanceCurrentMonthKey: '2026-04',
					attendanceDrilldownHref: null,
					isLoadingInsights: false,
					insightsError: false,
					vacationRequests: [
						{
							id: 'vac-1',
							startDateKey: '2026-04-10',
							endDateKey: '2026-04-12',
							vacationDays: 2,
							totalDays: 3,
							status: 'APPROVED',
							requestedNotes: null,
							decisionNotes: null,
							createdAt: new Date('2026-04-01T00:00:00.000Z'),
						},
					],
					payrollRuns: [],
					upcomingExceptions: [],
					isLoadingPtuHistory: false,
					ptuHistoryError: false,
					ptuHistory: [],
					isLoadingAudit: false,
					auditError: false,
					auditEvents: [],
					auditFieldLabels: {},
					mobileWizardSteps: [],
					isMobileWizardDirty: false,
					mobileWizardErrorSteps: [],
					mobileWizardStepIndex: 0,
					showMobileDiscardFromOutside: false,
					createMutationPending: false,
					updateMutationPending: false,
					memberOptions: [],
					isLoadingMembers: false,
					locations: [],
					isLoadingLocations: false,
					jobPositions: [],
					isLoadingJobPositions: false,
					periodPayLabel: 'Semanal',
					computedDailyPay: 0,
					canManageDualPayrollCompensation: false,
					fiscalDailyPayPreviewFeedbackKey: '',
					parsedFiscalDailyPayPreview: null,
					fiscalDailyComplementPreview: 0,
					activeEmployeeDailyComplement: 0,
					ptuAguinaldoOptionHelp: [],
					ptuHistoryYearInput: '',
					ptuHistoryAmountInput: '',
					ptuHistoryMutationPending: false,
					isScheduleLoading: false,
					terminationForm: {
						terminationDateKey: '',
						lastDayWorkedDateKey: '',
						terminationReason: 'voluntary_resignation',
						contractType: 'indefinite',
						unpaidDays: '',
						otherDue: '',
						vacationBalanceDays: '',
						dailySalaryIndemnizacion: '',
						terminationNotes: '',
					},
					isTerminationLocked: false,
					terminationPreview: null,
					isTerminateDialogOpen: false,
					canDownloadTerminationReceipt: false,
					isLoadingTerminationSettlement: false,
					canConfirmTermination: false,
					finiquitoLines: [],
					liquidacionLines: [],
					terminationPreviewPending: false,
					terminationMutationPending: false,
				}}
			/>,
		);

		expect(screen.getByTestId('employee-detail-dialog-body')).toBeInTheDocument();
		expect(screen.getByTestId('employee-vacations-panel')).toHaveClass('overscroll-contain');
		expect(screen.getByTestId('employee-vacations-table-container')).toHaveClass(
			'overflow-x-auto',
		);
		expect(screen.getByText('Balance de vacaciones')).toBeInTheDocument();
		expect(screen.getByText(/10 abr 2026/)).toBeInTheDocument();
	});
});
