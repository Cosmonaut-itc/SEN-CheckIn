import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';

import { EmployeePageActions } from './employee-detail-dialog';

const mockPush = vi.fn();

vi.mock('next-intl', async () => {
	const rawIntlMessages = await import('@/messages/es.json');
	const intlMessages =
		(rawIntlMessages as { default?: typeof rawMessages }).default ?? rawIntlMessages;

	/**
	 * Resolves a translation path from the Spanish messages fixture.
	 *
	 * @param path - Dot-notated translation path
	 * @returns Localized text or the original key when absent
	 */
	function resolveTranslation(path: string): string {
		const resolved = path.split('.').reduce<unknown>((currentValue, segment) => {
			if (!currentValue || typeof currentValue !== 'object' || !(segment in currentValue)) {
				return undefined;
			}

			return (currentValue as Record<string, unknown>)[segment];
		}, intlMessages);

		return typeof resolved === 'string' ? resolved : path;
	}

	return {
		useTranslations:
			(namespace?: string) =>
			(key: string, values?: Record<string, string | number>): string => {
				const translationPath = namespace ? `${namespace}.${key}` : key;
				const localizedMessage = resolveTranslation(translationPath);

				if (!values) {
					return localizedMessage;
				}

				return Object.entries(values).reduce(
					(currentMessage, [placeholder, value]) =>
						currentMessage.replace(`{${placeholder}}`, String(value)),
					localizedMessage,
				);
			},
	};
});

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
	}),
}));

vi.mock('@/components/ui/dialog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/components/ui/dialog')>();

	return {
		...actual,
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
		expect(screen.getByTestId('employees-add-menu-button')).toBeInTheDocument();

		fireEvent.click(screen.getByText('Importar desde documento'));

		expect(mockPush).toHaveBeenCalledWith('/employees/import');
	});
});
