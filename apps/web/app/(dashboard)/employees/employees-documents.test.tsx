import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';

import { EmployeeDocumentsTab } from '@/components/employee-documents-tab';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchEmployeeDocumentsSummary = vi.fn();
const mockFetchEmployeeDocumentsHistory = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchEmployeeDocumentsSummary: (...args: unknown[]) =>
			mockFetchEmployeeDocumentsSummary(...args),
		fetchEmployeeDocumentsHistory: (...args: unknown[]) =>
			mockFetchEmployeeDocumentsHistory(...args),
		fetchEmployeeDocumentUrl: vi.fn().mockResolvedValue('https://example.com/doc.pdf'),
	};
});

vi.mock('@/actions/employee-documents', () => ({
	presignEmployeeDocumentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmEmployeeDocumentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	reviewEmployeeDocumentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	generateEmployeeLegalDocumentAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	signEmployeeLegalDigitalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	presignEmployeeLegalPhysicalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmEmployeeLegalPhysicalAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

/**
 * Builds a Query Client Provider + org/i18n wrappers for tests.
 *
 * @param ui - React element
 * @param role - Organization role
 * @returns Render result
 */
function renderWithProviders(
	ui: React.ReactElement,
	role: 'owner' | 'admin' | 'member',
) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationSlug: 'org-1',
					organizationName: 'Org 1',
					organizationRole: role,
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					{ui}
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('Employee documents tab', () => {
	beforeEach(() => {
		mockFetchEmployeeDocumentsSummary.mockReset();
		mockFetchEmployeeDocumentsHistory.mockReset();
	});

	it('renders checklist and legal gate state', async () => {
		mockFetchEmployeeDocumentsSummary.mockResolvedValue({
			employeeId: 'emp-1',
			employeeName: 'Persona Prueba',
			baseApprovedThresholdForLegal: 1,
			gateUnlocked: false,
			baseApprovedCount: 0,
			documentProgressPercent: 0,
			documentMissingCount: 2,
			documentWorkflowStatus: 'INCOMPLETE',
			approvedRequiredActive: 0,
			totalRequiredActive: 2,
			requirements: [
				{
					requirementKey: 'IDENTIFICATION',
					isRequired: true,
					displayOrder: 1,
					activationStage: 'BASE',
					isActive: true,
					currentVersion: null,
				},
				{
					requirementKey: 'TAX_CONSTANCY',
					isRequired: true,
					displayOrder: 2,
					activationStage: 'BASE',
					isActive: true,
					currentVersion: null,
				},
			],
			latestGenerations: {},
		});
		mockFetchEmployeeDocumentsHistory.mockResolvedValue({
			current: [],
			history: [],
			pagination: { total: 0, limit: 50, offset: 0 },
		});

		renderWithProviders(<EmployeeDocumentsTab employeeId="emp-1" />, 'owner');

		await waitFor(() => {
			expect(screen.getByText('documents.progress.title')).toBeInTheDocument();
		});

		expect(screen.getByText('documents.requirements.IDENTIFICATION.title')).toBeInTheDocument();
		expect(screen.getByText('documents.requirements.TAX_CONSTANCY.title')).toBeInTheDocument();
		expect(screen.getByText('documents.legal.locked')).toBeInTheDocument();
	});

	it('hides review actions for member role', async () => {
		mockFetchEmployeeDocumentsSummary.mockResolvedValue({
			employeeId: 'emp-1',
			employeeName: 'Persona Prueba',
			baseApprovedThresholdForLegal: 1,
			gateUnlocked: true,
			baseApprovedCount: 1,
			documentProgressPercent: 30,
			documentMissingCount: 2,
			documentWorkflowStatus: 'IN_REVIEW',
			approvedRequiredActive: 1,
			totalRequiredActive: 3,
			requirements: [
				{
					requirementKey: 'IDENTIFICATION',
					isRequired: true,
					displayOrder: 1,
					activationStage: 'BASE',
					isActive: true,
					currentVersion: {
						id: 'doc-1',
						organizationId: 'org-1',
						employeeId: 'emp-1',
						requirementKey: 'IDENTIFICATION',
						versionNumber: 1,
						isCurrent: true,
						reviewStatus: 'PENDING_REVIEW',
						reviewComment: null,
						reviewedByUserId: null,
						reviewedAt: null,
						source: 'UPLOAD',
						generationId: null,
						identificationSubtype: 'INE',
						employmentProfileSubtype: null,
						signedAtDateKey: null,
						verifiedByUserId: null,
						bucket: 'bucket',
						objectKey: 'object',
						fileName: 'ine.pdf',
						contentType: 'application/pdf',
						sizeBytes: 1024,
						sha256: 'abc',
						uploadedByUserId: 'user-1',
						uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
						metadata: null,
						createdAt: new Date('2026-01-01T00:00:00.000Z'),
						updatedAt: new Date('2026-01-01T00:00:00.000Z'),
					},
				},
			],
			latestGenerations: {},
		});
		mockFetchEmployeeDocumentsHistory.mockResolvedValue({
			current: [],
			history: [],
			pagination: { total: 0, limit: 50, offset: 0 },
		});

		renderWithProviders(<EmployeeDocumentsTab employeeId="emp-1" />, 'member');

		await waitFor(() => {
			expect(screen.getByText('documents.checklist.title')).toBeInTheDocument();
		});

		expect(screen.queryByText('documents.actions.approve')).toBeNull();
		expect(screen.queryByText('documents.actions.reject')).toBeNull();
	});
});
