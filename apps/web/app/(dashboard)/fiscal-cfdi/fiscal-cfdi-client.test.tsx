import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { describe, expect, it } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';

import { FiscalCfdiClient } from './fiscal-cfdi-client';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

/**
 * Renders the fiscal CFDI client with organization context.
 *
 * @param ui - Component under test
 * @returns Render result
 */
function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationSlug: 'org-1',
					organizationName: 'Organización demo',
					organizationRole: 'owner',
					userRole: 'user',
				}}
			>
				{ui}
			</OrgProvider>
		</NextIntlClientProvider>,
	);
}

describe('FiscalCfdiClient', () => {
	it('shows blocked preflight issues and disables voucher preparation', () => {
		renderWithProviders(
			<FiscalCfdiClient
				initialPreflight={{
					organizationId: 'org-1',
					payrollRunId: 'run-1',
					canPrepareFiscalVouchers: false,
					organizationIssues: [
						{
							code: 'ORG_RFC_REQUIRED',
							field: 'organizationProfile.rfc',
							message: 'Organization RFC is required.',
							severity: 'ERROR',
							source: 'ORGANIZATION',
						},
					],
					employeeResults: [],
					summary: {
						employeesTotal: 1,
						employeesReady: 0,
						employeesBlocked: 1,
						unsupportedConcepts: 0,
					},
				}}
			/>,
		);

		expect(screen.getByText('BLOCKED')).toBeInTheDocument();
		expect(screen.getByText('organizationProfile.rfc')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'actions.prepare' })).toBeDisabled();
	});
});
