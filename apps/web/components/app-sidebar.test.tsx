import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import messages from '@/messages/es.json';
import { signOut, useSession } from '@/lib/auth-client';

const push = vi.fn();
const refresh = vi.fn();
let mockPathname = '/dashboard';

vi.mock('@/lib/auth-client', () => ({
	useSession: vi.fn(),
	signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
	usePathname: () => mockPathname,
	useRouter: () => ({
		push,
		refresh,
		replace: vi.fn(),
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
 * Renders the AppSidebar component with NextIntl provider.
 *
 * @param ui - React element to render
 * @returns Render result
 */
function renderWithIntl(ui: React.ReactElement) {
	return render(
		<NextIntlClientProvider locale="es" messages={messages}>
			<SidebarProvider>{ui}</SidebarProvider>
		</NextIntlClientProvider>,
	);
}

describe('AppSidebar', () => {
	beforeEach(() => {
		mockPathname = '/dashboard';
		vi.mocked(useSession).mockReturnValue({
			data: {
				user: {
					name: 'Usuario',
					email: 'user@example.com',
					image: null,
				},
			},
			isPending: false,
			isRefetching: false,
			error: null,
			refetch: vi.fn(),
		});
		vi.mocked(signOut).mockResolvedValue({ error: null });
	});

	it('shows admin navigation for superusers', () => {
		renderWithIntl(<AppSidebar isSuperUser={true} organizationRole="member" />);

		expect(screen.getByTestId('app-sidebar-admin-group')).toBeInTheDocument();
	});

	it('hides admin navigation for standard members', () => {
		renderWithIntl(<AppSidebar isSuperUser={false} organizationRole="member" />);

		expect(screen.queryByTestId('app-sidebar-admin-group')).toBeNull();
	});
});
