import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationGate } from '@/components/organization-gate';
import messages from '@/messages/es.json';

const replace = vi.fn();
let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
	usePathname: () => mockPathname,
	useRouter: () => ({
		replace,
		push: vi.fn(),
		refresh: vi.fn(),
	}),
}));

vi.mock('next/link', () => ({
	default: ({
		href,
		children,
		...props
	}: {
		href: string;
		children: React.ReactNode;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

/**
 * Renders UI wrapped with the NextIntl provider.
 *
 * @param ui - React element to render
 * @returns Render result
 */
function renderWithIntl(ui: React.ReactElement) {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			{ui}
		</NextIntlClientProvider>,
	);
}

describe('OrganizationGate', () => {
	beforeEach(() => {
		replace.mockClear();
		mockPathname = '/dashboard';
	});

	it('renders children when access is allowed', () => {
		renderWithIntl(
			<OrganizationGate
				role="user"
				organizationRole="member"
				hasOrganization={true}
			>
				<div data-testid="gate-content" />
			</OrganizationGate>,
		);

		expect(screen.getByTestId('gate-content')).toBeInTheDocument();
	});

	it('redirects non-admin users away from admin routes', async () => {
		mockPathname = '/users';

		renderWithIntl(
			<OrganizationGate
				role="user"
				organizationRole="member"
				hasOrganization={true}
			>
				<div data-testid="gate-content" />
			</OrganizationGate>,
		);

		await waitFor(() => {
			expect(replace).toHaveBeenCalledWith('/acceso-restringido');
		});
		expect(screen.queryByTestId('gate-content')).toBeNull();
	});

	it('hides content when no organization is selected', () => {
		renderWithIntl(
			<OrganizationGate
				role="user"
				organizationRole={null}
				hasOrganization={false}
			>
				<div data-testid="gate-content" />
			</OrganizationGate>,
		);

		expect(screen.queryByTestId('gate-content')).toBeNull();
		expect(replace).not.toHaveBeenCalled();
	});

	it('allows superusers to access organizations without an active org', () => {
		mockPathname = '/organizations';

		renderWithIntl(
			<OrganizationGate
				role="admin"
				organizationRole={null}
				hasOrganization={false}
			>
				<div data-testid="gate-content" />
			</OrganizationGate>,
		);

		expect(screen.getByTestId('gate-content')).toBeInTheDocument();
	});
});
