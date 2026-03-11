import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import rawMessages from '@/messages/es.json';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;
import { signOut, useSession } from '@/lib/auth-client';

const push = vi.fn();
const refresh = vi.fn();
let mockPathname = '/dashboard';

interface SidebarMenuButtonStubProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Whether the component should render as child */
	asChild?: boolean;
	/** Whether the menu item is active */
	isActive?: boolean;
	/** Tooltip content (ignored in stubs) */
	tooltip?: string | React.ReactNode;
}

/**
 * Renders a generic div wrapper for sidebar stubs.
 *
 * @param props - Div props to render
 * @returns Stub element
 */
function SidebarStub(props: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	const { children, ...rest } = props;
	return <div {...rest}>{children}</div>;
}

/**
 * Renders a stubbed sidebar menu button.
 *
 * @param props - Button-like props for the stub
 * @returns Stub element
 */
function SidebarMenuButtonStub(props: SidebarMenuButtonStubProps): React.ReactElement {
	const { children, asChild, isActive, tooltip, ...rest } = props;
	void asChild;
	void isActive;
	void tooltip;
	return <div {...rest}>{children}</div>;
}

/**
 * Renders a stubbed sidebar provider wrapper.
 *
 * @param props - Provider props
 * @returns Stub element
 */
function SidebarProviderStub(props: { children: React.ReactNode }): React.ReactElement {
	return <div>{props.children}</div>;
}

/**
 * Renders a stubbed avatar image element.
 *
 * @param props - Image props
 * @returns Stub element
 */
function AvatarImageStub(props: React.ImgHTMLAttributes<HTMLImageElement>): React.ReactElement {
	void props;
	return <span />;
}

vi.mock('@/lib/auth-client', () => ({
	useSession: vi.fn(),
	signOut: vi.fn(),
}));

vi.mock('@/components/ui/avatar', () => ({
	Avatar: SidebarStub,
	AvatarFallback: SidebarStub,
	AvatarImage: AvatarImageStub,
}));

vi.mock('@/components/ui/sidebar', () => ({
	Sidebar: SidebarStub,
	SidebarContent: SidebarStub,
	SidebarFooter: SidebarStub,
	SidebarGroup: SidebarStub,
	SidebarGroupContent: SidebarStub,
	SidebarGroupLabel: SidebarStub,
	SidebarHeader: SidebarStub,
	SidebarMenu: SidebarStub,
	SidebarMenuButton: SidebarMenuButtonStub,
	SidebarMenuItem: SidebarStub,
	SidebarSeparator: SidebarStub,
	SidebarProvider: SidebarProviderStub,
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
	default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
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
					id: 'user-test-id',
					name: 'Usuario',
					email: 'user@example.com',
					image: null,
					createdAt: new Date('2024-01-01T00:00:00.000Z'),
					updatedAt: new Date('2024-01-01T00:00:00.000Z'),
					emailVerified: true,
					banned: false,
				},
				session: {
					id: 'session-test-id',
					userId: 'user-test-id',
					createdAt: new Date('2024-01-01T00:00:00.000Z'),
					updatedAt: new Date('2024-01-01T00:00:00.000Z'),
					expiresAt: new Date('2099-01-01T00:00:00.000Z'),
					token: 'session-token',
					ipAddress: null,
					userAgent: null,
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
		renderWithIntl(
			<AppSidebar
				isSuperUser={true}
				organizationRole="member"
				enableDisciplinaryMeasures={true}
			/>,
		);

		expect(screen.getByTestId('app-sidebar-admin-group')).toBeInTheDocument();
		expect(screen.getByText('disciplinaryMeasures')).toBeInTheDocument();
		expect(screen.getByText('overtimeAuthorizations')).toBeInTheDocument();
	});

	it('hides admin navigation for standard members', () => {
		renderWithIntl(
			<AppSidebar
				isSuperUser={false}
				organizationRole="member"
				enableDisciplinaryMeasures={true}
			/>,
		);

		expect(screen.queryByTestId('app-sidebar-admin-group')).toBeNull();
		expect(screen.queryByText('disciplinaryMeasures')).toBeNull();
	});

	it('hides disciplinary nav item when feature flag is disabled', () => {
		renderWithIntl(
			<AppSidebar
				isSuperUser={true}
				organizationRole="owner"
				enableDisciplinaryMeasures={false}
			/>,
		);

		expect(screen.queryByText('disciplinaryMeasures')).toBeNull();
	});
});
