import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateOrganizationMemberRole } from '@/actions/users';

const updateMemberRolePostMock = vi.fn();

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
		organization: {
			'update-member-role-direct': {
				post: updateMemberRolePostMock,
			},
		},
	})),
}));

vi.mock('@/lib/server-auth-client', () => ({
	getServerFetchOptions: vi.fn(),
	serverAuthClient: {
		admin: {
			setRole: vi.fn(),
			banUser: vi.fn(),
			unbanUser: vi.fn(),
		},
	},
}));

describe('user actions', () => {
	beforeEach(() => {
		updateMemberRolePostMock.mockReset();
	});

	it('propagates nested role-update codes and messages from treaty errors', async () => {
		updateMemberRolePostMock.mockResolvedValue({
			error: {
				message: '[object Object]',
				value: {
					error: {
						message: 'Only organization admins can update member roles',
						code: 'ORGANIZATION_ADMIN_REQUIRED',
					},
				},
			},
		});

		const result = await updateOrganizationMemberRole({
			memberId: 'member-1',
			organizationId: 'org-1',
			role: 'admin',
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Only organization admins can update member roles');
		expect(result.errorCode).toBe('ORGANIZATION_ADMIN_REQUIRED');
	});

	it('preserves the organization-required code from standardized API payloads', async () => {
		updateMemberRolePostMock.mockResolvedValue({
			error: {
				message: '[object Object]',
				value: {
					error: {
						message: 'Organization is required',
						code: 'ORGANIZATION_REQUIRED',
					},
				},
			},
		});

		const result = await updateOrganizationMemberRole({
			memberId: 'member-1',
			organizationId: 'org-1',
			role: 'admin',
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Organization is required');
		expect(result.errorCode).toBe('ORGANIZATION_REQUIRED');
	});

	it('falls back to unknown when the API error omits a role-update code', async () => {
		updateMemberRolePostMock.mockResolvedValue({
			error: {
				message: '[object Object]',
				value: {
					error: {
						message: 'Unexpected backend failure',
					},
				},
			},
		});

		const result = await updateOrganizationMemberRole({
			memberId: 'member-1',
			organizationId: 'org-1',
			role: 'admin',
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Unexpected backend failure');
		expect(result.errorCode).toBe('UNKNOWN');
	});
});
