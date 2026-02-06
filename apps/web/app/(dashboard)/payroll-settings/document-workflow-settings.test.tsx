import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { DocumentWorkflowSettingsSection } from '@/components/document-workflow-settings-section';
import { OrgProvider } from '@/lib/org-client-context';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchDocumentWorkflowConfig = vi.fn();
const mockFetchLegalTemplates = vi.fn();
const mockFetchLegalBranding = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchDocumentWorkflowConfig: (...args: unknown[]) => mockFetchDocumentWorkflowConfig(...args),
		fetchLegalTemplates: (...args: unknown[]) => mockFetchLegalTemplates(...args),
		fetchLegalBranding: (...args: unknown[]) => mockFetchLegalBranding(...args),
	};
});

vi.mock('@/actions/employee-documents', () => ({
	updateDocumentWorkflowConfigAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	createLegalTemplateDraftAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	updateLegalTemplateAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	publishLegalTemplateAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	presignLegalBrandingAction: vi.fn().mockResolvedValue({ success: true, data: null }),
	confirmLegalBrandingAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

vi.mock('@/components/legal-template-editor', () => ({
	LegalTemplateEditor: ({
		title,
	}: {
		title: string;
	}): React.ReactElement => <div>{title}</div>,
}));

/**
 * Renders the document workflow settings section with providers.
 *
 * @param role - Organization role
 * @returns Render result
 */
function renderWithProviders(role: 'owner' | 'admin' | 'member') {
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
					<DocumentWorkflowSettingsSection />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('Document workflow settings section', () => {
	beforeEach(() => {
		mockFetchDocumentWorkflowConfig.mockReset();
		mockFetchLegalTemplates.mockReset();
		mockFetchLegalBranding.mockReset();

		mockFetchDocumentWorkflowConfig.mockResolvedValue({
			config: {
				id: 'cfg-1',
				organizationId: 'org-1',
				baseApprovedThresholdForLegal: 1,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
			requirements: [
				{
					id: 'req-1',
					organizationId: 'org-1',
					requirementKey: 'IDENTIFICATION',
					isRequired: true,
					displayOrder: 1,
					activationStage: 'BASE',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
				{
					id: 'req-2',
					organizationId: 'org-1',
					requirementKey: 'SIGNED_CONTRACT',
					isRequired: true,
					displayOrder: 2,
					activationStage: 'LEGAL_AFTER_GATE',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
		});
		mockFetchLegalTemplates.mockResolvedValue([]);
		mockFetchLegalBranding.mockResolvedValue({ branding: null, url: null });
	});

	it('renders workflow config for owner role', async () => {
		renderWithProviders('owner');

		await waitFor(() => {
			expect(screen.getByText('documentWorkflow.requirements.IDENTIFICATION')).toBeInTheDocument();
		});

		expect(screen.getByText('documentWorkflow.title')).toBeInTheDocument();
		expect(screen.getByText('documentWorkflow.config.title')).toBeInTheDocument();
		expect(screen.getByText('documentWorkflow.requirements.IDENTIFICATION')).toBeInTheDocument();
		expect(screen.getByText('documentWorkflow.config.badges.base')).toBeInTheDocument();
		expect(screen.getByText('documentWorkflow.config.badges.legal')).toBeInTheDocument();
	});

	it('shows forbidden state for member role', async () => {
		renderWithProviders('member');

		await waitFor(() => {
			expect(screen.getByText('documentWorkflow.title')).toBeInTheDocument();
		});

		expect(screen.getByText('documentWorkflow.forbidden')).toBeInTheDocument();
	});
});
