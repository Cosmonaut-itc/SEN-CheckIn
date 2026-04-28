import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import { queryKeys } from '@/lib/query-keys';
import rawMessages from '@/messages/es.json';

import { DevicesPageClient } from './devices-client';

const messages =
	(rawMessages as unknown as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchDevicesList = vi.fn();
const mockFetchLocationsList = vi.fn();
const mockFetchDeviceSettingsPinConfig = vi.fn();
const mockUpdateDeviceSettingsPinConfig = vi.fn();
const mockUpdateDeviceSettingsPin = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockUseTour = vi.fn();

vi.mock('next-intl', async () => {
	return import('@/lib/test-utils/next-intl');
});

vi.mock('@/lib/client-functions', () => ({
	fetchDevicesList: (...args: unknown[]) => mockFetchDevicesList(...args),
	fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
	fetchDeviceSettingsPinConfig: (...args: unknown[]) => mockFetchDeviceSettingsPinConfig(...args),
}));

vi.mock('@/actions/devices', () => ({
	updateDevice: vi.fn(),
	deleteDevice: vi.fn(),
	updateDeviceSettingsPinConfig: (...args: unknown[]) =>
		mockUpdateDeviceSettingsPinConfig(...args),
	updateDeviceSettingsPin: (...args: unknown[]) => mockUpdateDeviceSettingsPin(...args),
}));

vi.mock('@/hooks/use-tour', () => ({
	useTour: (...args: unknown[]) => mockUseTour(...args),
}));

vi.mock('sonner', () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
	},
}));

vi.mock('date-fns', () => ({
	format: () => '10/01/2026',
}));

const devicesFixture = [
	{
		id: 'device-1',
		code: 'CHK-001',
		name: 'Kiosco Norte',
		deviceType: 'KIOSK',
		status: 'ONLINE',
		lastHeartbeat: new Date('2026-04-28T12:00:00.000Z'),
		locationId: null,
		organizationId: 'org-1',
		createdAt: new Date('2026-04-01T00:00:00.000Z'),
		updatedAt: new Date('2026-04-01T00:00:00.000Z'),
	},
	{
		id: 'device-2',
		code: 'CHK-002',
		name: 'Tablet Sur',
		deviceType: 'TABLET',
		status: 'OFFLINE',
		lastHeartbeat: null,
		locationId: null,
		organizationId: 'org-1',
		createdAt: new Date('2026-04-02T00:00:00.000Z'),
		updatedAt: new Date('2026-04-02T00:00:00.000Z'),
	},
] as const;

const settingsPinConfigFixture = {
	mode: 'PER_DEVICE',
	globalPinConfigured: true,
	devices: [
		{
			id: 'device-1',
			code: 'CHK-001',
			name: 'Kiosco Norte',
			deviceStatus: 'ONLINE',
			overrideConfigured: true,
			pinRequired: true,
			pinSource: 'DEVICE',
			status: 'OWN_PIN',
		},
		{
			id: 'device-2',
			code: 'CHK-002',
			name: 'Tablet Sur',
			deviceStatus: 'OFFLINE',
			overrideConfigured: false,
			pinRequired: true,
			pinSource: 'GLOBAL',
			status: 'USES_GLOBAL',
		},
		{
			id: 'device-3',
			code: 'CHK-003',
			name: 'Kiosco Poniente',
			deviceStatus: 'MAINTENANCE',
			overrideConfigured: false,
			pinRequired: false,
			pinSource: 'NONE',
			status: 'NOT_CONFIGURED',
		},
	],
} as const;

/**
 * Builds the devices page provider tree for a specific organization.
 *
 * @param organizationId - Active organization identifier
 * @param queryClient - Query client shared across renders
 * @returns Devices page wrapped in required providers
 */
function createDevicesPageElement(
	organizationId: string,
	queryClient: QueryClient,
): React.ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId,
					organizationName: 'Organización Demo',
					organizationSlug: 'organizacion-demo',
					organizationRole: 'admin',
					userRole: 'user',
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<DevicesPageClient />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>
	);
}

/**
 * Renders the devices page with query, organization, and i18n providers.
 *
 * @param organizationId - Active organization identifier
 * @returns Render result with the query client and invalidation spy
 */
function renderDevicesPage(organizationId = 'org-1') {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

	const renderResult = render(createDevicesPageElement(organizationId, queryClient));

	return {
		...renderResult,
		queryClient,
		invalidateSpy,
	};
}

describe('DevicesPageClient settings PIN management', () => {
	beforeEach(() => {
		mockFetchDevicesList.mockReset();
		mockFetchLocationsList.mockReset();
		mockFetchDeviceSettingsPinConfig.mockReset();
		mockUpdateDeviceSettingsPinConfig.mockReset();
		mockUpdateDeviceSettingsPin.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockUseTour.mockReset();

		mockFetchDevicesList.mockResolvedValue({
			data: devicesFixture,
			pagination: { total: devicesFixture.length, limit: 10, offset: 0 },
		});
		mockFetchLocationsList.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		});
		mockFetchDeviceSettingsPinConfig.mockResolvedValue(settingsPinConfigFixture);
		mockUpdateDeviceSettingsPinConfig.mockResolvedValue({
			success: true,
			data: settingsPinConfigFixture,
		});
		mockUpdateDeviceSettingsPin.mockResolvedValue({
			success: true,
			data: {
				deviceId: 'device-1',
				mode: 'PER_DEVICE',
				pinRequired: true,
				source: 'DEVICE',
				globalPinConfigured: true,
				deviceOverrideConfigured: true,
			},
		});
	});

	it('displays settings PIN management status from the config query', async () => {
		renderDevicesPage();

		await waitFor(() => {
			expect(mockFetchDeviceSettingsPinConfig).toHaveBeenCalledWith({
				organizationId: 'org-1',
			});
		});

		expect(screen.getByText('PIN de configuración')).toBeInTheDocument();
		expect(await screen.findByText('PIN global configurado')).toBeInTheDocument();
		expect(screen.getByText('PIN propio')).toBeInTheDocument();
		expect(screen.getByText('Usa PIN global')).toBeInTheDocument();
		expect(screen.getByText('Sin PIN configurado')).toBeInTheDocument();
	});

	it('keeps settings PIN controls in a loading state while config is pending', async () => {
		mockFetchDeviceSettingsPinConfig.mockReturnValue(new Promise(() => undefined));

		renderDevicesPage();

		await screen.findByText('PIN de configuración');

		expect(screen.getAllByText('Cargando configuración de PIN...').length).toBeGreaterThan(0);
		expect(screen.queryByText('PIN global configurado')).not.toBeInTheDocument();
		expect(screen.queryByText('PIN global no configurado')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Guardar configuración de PIN' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Cambiar PIN de Kiosco Norte' })).toBeNull();
	});

	it('blocks invalid or mismatched global PIN values before mutation', async () => {
		renderDevicesPage();

		await screen.findByText('PIN global configurado');

		fireEvent.change(screen.getByLabelText('Nuevo PIN global'), {
			target: { value: '12a4' },
		});
		fireEvent.change(screen.getByLabelText('Confirmar PIN global'), {
			target: { value: '12a4' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de PIN' }));

		expect(
			await screen.findByText('El PIN debe tener 4 dígitos numéricos.'),
		).toBeInTheDocument();
		expect(mockUpdateDeviceSettingsPinConfig).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText('Nuevo PIN global'), {
			target: { value: '1234' },
		});
		fireEvent.change(screen.getByLabelText('Confirmar PIN global'), {
			target: { value: '4321' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de PIN' }));

		expect(await screen.findByText('La confirmación del PIN no coincide.')).toBeInTheDocument();
		expect(mockUpdateDeviceSettingsPinConfig).not.toHaveBeenCalled();
	});

	it('clears global PIN inputs and invalidates device queries after saving', async () => {
		const { invalidateSpy } = renderDevicesPage();

		await screen.findByText('PIN global configurado');

		fireEvent.change(screen.getByLabelText('Nuevo PIN global'), {
			target: { value: '1234' },
		});
		fireEvent.change(screen.getByLabelText('Confirmar PIN global'), {
			target: { value: '1234' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de PIN' }));

		await waitFor(() => {
			expect(mockUpdateDeviceSettingsPinConfig.mock.calls[0]?.[0]).toEqual({
				mode: 'PER_DEVICE',
				globalPin: '1234',
				organizationId: 'org-1',
			});
		});

		expect(screen.getByLabelText('Nuevo PIN global')).toHaveValue('');
		expect(screen.getByLabelText('Confirmar PIN global')).toHaveValue('');
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.devices.all });
		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: queryKeys.devices.settingsPinConfig({ organizationId: 'org-1' }),
		});
	});

	it('uses the new organization config mode after an unsaved mode change and organization switch', async () => {
		const organizationAConfig = {
			...settingsPinConfigFixture,
			mode: 'GLOBAL',
			globalPinConfigured: true,
		} as const;
		const organizationBConfig = {
			...settingsPinConfigFixture,
			mode: 'GLOBAL',
			globalPinConfigured: false,
			devices: [],
		} as const;
		mockFetchDeviceSettingsPinConfig.mockImplementation(
			(params?: { organizationId?: string | null }) =>
				Promise.resolve(
					params?.organizationId === 'org-2' ? organizationBConfig : organizationAConfig,
				),
		);

		const { queryClient, rerender } = renderDevicesPage('org-1');

		await screen.findByText('PIN global configurado');

		fireEvent.click(screen.getByRole('button', { name: 'PIN por dispositivo' }));

		expect(screen.getByRole('button', { name: 'PIN por dispositivo' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);

		rerender(createDevicesPageElement('org-2', queryClient));

		await waitFor(() => {
			expect(mockFetchDeviceSettingsPinConfig).toHaveBeenCalledWith({
				organizationId: 'org-2',
			});
		});
		await screen.findByText('PIN global no configurado');

		expect(screen.getByRole('button', { name: 'Mismo PIN para todos' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);

		fireEvent.change(screen.getByLabelText('Nuevo PIN global'), {
			target: { value: '1357' },
		});
		fireEvent.change(screen.getByLabelText('Confirmar PIN global'), {
			target: { value: '1357' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de PIN' }));

		await waitFor(() => {
			expect(mockUpdateDeviceSettingsPinConfig.mock.calls[0]?.[0]).toEqual({
				mode: 'GLOBAL',
				globalPin: '1357',
				organizationId: 'org-2',
			});
		});
	});

	it('clears device PIN inputs and invalidates device queries after saving', async () => {
		const { invalidateSpy } = renderDevicesPage();

		await screen.findByText('PIN global configurado');

		fireEvent.click(await screen.findByRole('button', { name: 'Cambiar PIN de Kiosco Norte' }));
		fireEvent.change(screen.getByLabelText('Nuevo PIN del dispositivo'), {
			target: { value: '2468' },
		});
		fireEvent.change(screen.getByLabelText('Confirmar PIN del dispositivo'), {
			target: { value: '2468' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN del dispositivo' }));

		await waitFor(() => {
			expect(mockUpdateDeviceSettingsPin.mock.calls[0]?.[0]).toEqual({
				deviceId: 'device-1',
				pin: '2468',
			});
		});

		expect(screen.queryByLabelText('Nuevo PIN del dispositivo')).not.toBeInTheDocument();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.devices.all });
		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: queryKeys.devices.settingsPinConfig({ organizationId: 'org-1' }),
		});
	});
});
