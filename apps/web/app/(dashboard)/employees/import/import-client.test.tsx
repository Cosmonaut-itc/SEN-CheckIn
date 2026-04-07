import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';

import {
	fetchExistingEmployeesForImport,
	ImportClient,
	resolveCurrentPreviewRowsForImport,
	resolveInitialNextCodeForImport,
	resolveNextCodeForImport,
	resolveTrackedFilesForImport,
} from './import-client';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockPush = vi.fn();
const mockFetchLocationsList = vi.fn();
const mockFetchJobPositionsList = vi.fn();
const mockFetchEmployeesList = vi.fn();

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
		NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
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

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
		fetchJobPositionsList: (...args: unknown[]) => mockFetchJobPositionsList(...args),
		fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
	};
});

vi.mock('@/actions/employee-import', () => ({
	importDocument: vi.fn(),
	bulkCreateEmployees: vi.fn(),
	undoBulkImport: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
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

	interface MockSelectTriggerProps {
		id?: string;
		'aria-label'?: string;
		children: React.ReactNode;
	}

	function MockSelectItem({ value, children }: MockSelectItemProps): React.ReactElement {
		return <option value={value}>{children}</option>;
	}

	MockSelectItem.displayName = 'MockSelectItem';

	function MockSelectTrigger({ children }: MockSelectTriggerProps): React.ReactElement {
		return <>{children}</>;
	}

	MockSelectTrigger.displayName = 'MockSelectTrigger';

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

	function extractTriggerProps(children: React.ReactNode): Omit<
		MockSelectTriggerProps,
		'children'
	> {
		for (const child of React.Children.toArray(children)) {
			if (!React.isValidElement<{ children?: React.ReactNode } & MockSelectTriggerProps>(child)) {
				continue;
			}

			if (child.type === MockSelectTrigger) {
				return {
					id: child.props.id,
					'aria-label': child.props['aria-label'],
				};
			}

			const nestedProps = extractTriggerProps(child.props.children);
			if (nestedProps.id || nestedProps['aria-label']) {
				return nestedProps;
			}
		}

		return {};
	}

	function MockSelect({
		value = '',
		onValueChange,
		children,
	}: MockSelectProps): React.ReactElement {
		const triggerProps = extractTriggerProps(children);

		return (
			<select
				id={triggerProps.id}
				aria-label={triggerProps['aria-label']}
				value={value}
				onChange={(event) => onValueChange?.(event.target.value)}
			>
				{extractOptions(children)}
			</select>
		);
	}

	return {
		Select: MockSelect,
		SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		SelectItem: MockSelectItem,
		SelectTrigger: MockSelectTrigger,
		SelectValue: () => null,
	};
});

/**
 * Renders the import client with production-like providers.
 *
 * @returns Render result
 */
function renderWithProviders(): ReturnType<typeof render> {
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
					organizationName: 'Org Test',
					organizationRole: 'owner',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<ImportClient />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('ImportClient', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		mockPush.mockReset();
		mockFetchLocationsList.mockReset();
		mockFetchJobPositionsList.mockReset();
		mockFetchEmployeesList.mockReset();

		mockFetchLocationsList.mockResolvedValue({
			data: [{ id: 'loc-1', name: 'Sucursal Centro' }],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		mockFetchJobPositionsList.mockResolvedValue({
			data: [{ id: 'job-1', name: 'Operador' }],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 1000, offset: 0 },
		});
	});

	it('renders the import configuration step', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Importar empleados desde documento' }),
			).toBeInTheDocument();
		});

		expect(
			screen.getByText(
				'Configura los valores por defecto y carga uno o más documentos para analizarlos con IA.',
			),
		).toBeInTheDocument();
		expect(screen.getByLabelText('Ubicación por defecto')).toBeInTheDocument();
		expect(screen.getByLabelText('Puesto por defecto')).toBeInTheDocument();
		expect(screen.getByLabelText('Frecuencia de pago')).toBeInTheDocument();
		expect(
			screen.getByText('Arrastra archivos aquí o haz clic para seleccionar'),
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Analizar documentos' })).toBeDisabled();
	});

	it('reads the latest preview rows from the ref when append mode is active', () => {
		const previewRowsRef = {
			current: ['row-1'],
		};

		previewRowsRef.current = ['row-1', 'row-2'];

		expect(resolveCurrentPreviewRowsForImport('append', previewRowsRef)).toEqual([
			'row-1',
			'row-2',
		]);
		expect(resolveCurrentPreviewRowsForImport('replace', previewRowsRef)).toEqual([]);
	});

	it('uses processed files as the dedupe source while appending from preview', () => {
		const processedFiles = [
			new File(['processed'], 'empleados.png', {
				type: 'image/png',
				lastModified: 100,
			}),
		];
		const selectedFiles = [
			new File(['queued'], 'pendiente.png', {
				type: 'image/png',
				lastModified: 200,
			}),
		];

		expect(
			resolveTrackedFilesForImport({
				step: 'preview',
				processedFiles,
				selectedFiles,
			}),
		).toEqual(processedFiles);
		expect(
			resolveTrackedFilesForImport({
				step: 'config',
				processedFiles,
				selectedFiles,
			}),
		).toEqual(selectedFiles);
	});

	it('reads the latest next code from the ref for append imports', () => {
		const nextCodeRef = {
			current: 1,
		};

		nextCodeRef.current = 3;

		expect(resolveNextCodeForImport(nextCodeRef)).toBe(3);
	});

	it('derives the next bulk-import code from the highest existing employee code', () => {
		expect(resolveInitialNextCodeForImport([])).toBe(1);
		expect(
			resolveInitialNextCodeForImport([
				{ code: 'EMP-001' },
				{ code: 'EMP-010' },
				{ code: 'EMP-XYZ' },
			]),
		).toBe(11);
	});

	it('loads all employee pages before deriving import defaults', async () => {
		const fetchEmployees = vi
			.fn()
			.mockResolvedValueOnce({
				data: [
					{ code: 'EMP-001' },
					{ code: 'EMP-002' },
				],
				pagination: { total: 3, limit: 2, offset: 0 },
			})
			.mockResolvedValueOnce({
				data: [{ code: 'EMP-015' }],
				pagination: { total: 3, limit: 2, offset: 2 },
			});

		const employees = await fetchExistingEmployeesForImport({
			organizationId: 'org-1',
			fetchEmployees,
			pageSize: 2,
		});

		expect(fetchEmployees).toHaveBeenNthCalledWith(1, {
			organizationId: 'org-1',
			limit: 2,
			offset: 0,
		});
		expect(fetchEmployees).toHaveBeenNthCalledWith(2, {
			organizationId: 'org-1',
			limit: 2,
			offset: 2,
		});
		expect(resolveInitialNextCodeForImport(employees)).toBe(16);
	});
});
