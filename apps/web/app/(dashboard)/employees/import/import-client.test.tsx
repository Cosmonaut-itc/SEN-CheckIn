import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';

import { ImportClient } from './import-client';

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
});
