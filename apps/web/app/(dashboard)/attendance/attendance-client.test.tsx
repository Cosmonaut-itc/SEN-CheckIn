import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { PDFDocument } from 'pdf-lib';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import type { AttendanceRecord } from '@/lib/client-functions';
import { getUtcDayRangeFromDateKey } from '@/lib/time-zone';
import { AttendancePageClient, getPresetDateRangeKeys } from './attendance-client';

vi.mock('next-intl', async () => {
	return import('@/lib/test-utils/next-intl');
});

const mockBuildAttendanceReportPdf = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
	toast: {
		error: (...args: unknown[]) => mockToastError(...args),
	},
}));

vi.mock('@/lib/attendance/build-attendance-report-pdf', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/attendance/build-attendance-report-pdf')>();
	return {
		...actual,
		buildAttendanceReportPdf: (...args: unknown[]) => mockBuildAttendanceReportPdf(...args),
	};
});

const mockFetchAttendanceRecords = vi.fn();
const mockFetchLocationsList = vi.fn();
let expectedPdfBytes: Uint8Array | null = null;

/**
 * Reads a Blob into a byte array.
 *
 * @param blob - Blob to read
 * @returns Blob bytes
 */
function readBlobBytes(blob: Blob): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error);
		reader.onload = () => {
			const result = reader.result;
			if (!(result instanceof ArrayBuffer)) {
				reject(new Error('Expected blob bytes to resolve as an ArrayBuffer.'));
				return;
			}
			resolve(new Uint8Array(result));
		};
		reader.readAsArrayBuffer(blob);
	});
}

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
	}),
	usePathname: () => '/attendance',
	useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchAttendanceRecords: (...args: unknown[]) => mockFetchAttendanceRecords(...args),
		fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
		fetchEmployeesList: vi.fn().mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		}),
	};
});

/**
 * Renders the attendance client with required providers.
 *
 * @param options - Optional overrides for org context and initial filters
 * @returns Render result
 */
function renderAttendanceClient(options?: {
	organizationTimeZone?: string | null;
	initialFilters?: React.ComponentProps<typeof AttendancePageClient>['initialFilters'];
}): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationName: 'Org 1',
					organizationSlug: 'org-1',
					organizationRole: 'member',
					organizationTimeZone: options?.organizationTimeZone ?? null,
				}}
			>
				<AttendancePageClient
					initialFilters={
						options?.initialFilters ?? {
							from: '2026-02-23',
							to: '2026-03-01',
						}
					}
				/>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('AttendancePageClient', () => {
	const originalTimeZone = process.env.TZ;
	let originalCreateObjectURL: typeof URL.createObjectURL;
	let originalRevokeObjectURL: typeof URL.revokeObjectURL;

	beforeEach(() => {
		process.env.TZ = 'America/Mexico_City';
		originalCreateObjectURL = URL.createObjectURL;
		originalRevokeObjectURL = URL.revokeObjectURL;
		URL.createObjectURL = vi.fn(() => 'blob:attendance-export');
		URL.revokeObjectURL = vi.fn();
		mockFetchAttendanceRecords.mockReset();
		mockFetchLocationsList.mockReset();
		mockBuildAttendanceReportPdf.mockReset();
		mockToastError.mockReset();
		expectedPdfBytes = null;
		mockBuildAttendanceReportPdf.mockImplementation(async () => {
			const pdfDocument = await PDFDocument.create();
			const bytes = await pdfDocument.save();
			expectedPdfBytes = bytes;
			const backingBytes = new Uint8Array(bytes.length + 16);
			backingBytes.set(bytes, 16);
			return backingBytes.subarray(16);
		});
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 10, offset: 0 },
		});
		mockFetchLocationsList.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		});
	});

	afterEach(() => {
		if (originalTimeZone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTimeZone;
		}
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
		vi.restoreAllMocks();
	});

	it('uses exact custom start/end dates when querying attendance records', async () => {
		renderAttendanceClient();

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const firstCall = mockFetchAttendanceRecords.mock.calls[0] as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];

		expect(format(firstCall[0].fromDate, 'yyyy-MM-dd')).toBe('2026-02-23');
		expect(format(firstCall[0].toDate, 'yyyy-MM-dd')).toBe('2026-03-01');
	});

	it('preserves the deep-link timezone when parsing URL date keys', async () => {
		renderAttendanceClient({
			organizationTimeZone: 'America/Tijuana',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
				timeZone: 'America/Mexico_City',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const firstCall = mockFetchAttendanceRecords.mock.calls[0] as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];
		const expectedRange = getUtcDayRangeFromDateKey('2026-02-23', 'America/Mexico_City');

		expect(firstCall[0].fromDate.toISOString()).toBe(expectedRange.startUtc.toISOString());
		expect(firstCall[0].toDate.toISOString()).toBe(expectedRange.endUtc.toISOString());
	});

	it('renders attendance rows in the deep-link timezone used for filtering', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-22T16:30:00.000Z'),
					type: 'CHECK_IN',
					metadata: null,
					createdAt: new Date('2026-02-22T16:30:00.000Z'),
					updatedAt: new Date('2026-02-22T16:30:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
				timeZone: 'Asia/Tokyo',
			},
		});

		expect(await screen.findByText('01:30:00')).toBeInTheDocument();
		expect((await screen.findAllByText('23/02/2026')).length).toBeGreaterThan(0);
		expect(screen.queryByText('10:30:00')).not.toBeInTheDocument();
		expect(screen.queryByText('22/02/2026')).not.toBeInTheDocument();
	});

	it('uses the organization timezone when fetching spillover export records without a deep-link timezone', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Tijuana',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(
				mockFetchAttendanceRecords.mock.calls.some(
					([params]) => (params as { limit?: number }).limit === 100,
				),
			).toBe(true);
		});

		const exportCall = mockFetchAttendanceRecords.mock.calls.find(
			([params]) => (params as { limit?: number }).limit === 100,
		) as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];
		const expectedStartRange = getUtcDayRangeFromDateKey('2026-02-22', 'America/Tijuana');
		const expectedEndRange = getUtcDayRangeFromDateKey('2026-02-24', 'America/Tijuana');

		expect(exportCall[0].fromDate.toISOString()).toBe(expectedStartRange.startUtc.toISOString());
		expect(exportCall[0].toDate.toISOString()).toBe(expectedEndRange.endUtc.toISOString());
	});

	it('builds preset date keys in the target timezone instead of the browser timezone', () => {
		const result = getPresetDateRangeKeys({
			preset: 'today',
			now: new Date('2026-02-22T16:30:00.000Z'),
			timeZone: 'Asia/Tokyo',
		});

		expect(result.startDateKey).toBe('2026-02-23');
		expect(result.endDateKey).toBe('2026-02-23');
	});

	it('renders attendance rows in the organization timezone when no deep-link timezone is provided', async () => {
		const attendanceRecord: AttendanceRecord = {
			id: 'attendance-1',
			employeeId: 'employee-1',
			employeeName: 'Ada Lovelace',
			deviceId: 'device-1',
			deviceLocationId: 'location-1',
			deviceLocationName: 'Lobby',
			timestamp: new Date('2026-02-22T15:30:00.000Z'),
			type: 'CHECK_IN',
			offsiteDateKey: null,
			offsiteDayKind: null,
			offsiteReason: null,
			offsiteCreatedByUserId: null,
			offsiteUpdatedByUserId: null,
			offsiteUpdatedAt: null,
			metadata: null,
			createdAt: new Date('2026-02-22T15:30:00.000Z'),
			updatedAt: new Date('2026-02-22T15:30:00.000Z'),
		};

		mockFetchAttendanceRecords.mockResolvedValue({
			data: [attendanceRecord],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'Asia/Tokyo',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(screen.getAllByText('23/02/2026').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByText('00:30:00').length).toBeGreaterThan(0);
		expect(screen.queryByText('22/02/2026')).not.toBeInTheDocument();
		expect(screen.queryByText('15:30:00')).not.toBeInTheDocument();
	});

	it('fetches overnight spillover records around the selected local day before PDF export', async () => {
		let capturedBlob: Blob | null = null;
		let revokeObservedAtMicrotask: boolean | null = null;
		const appendChildSpy = vi.spyOn(document.body, 'appendChild');
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => {
				queueMicrotask(() => {
					revokeObservedAtMicrotask = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock
						.calls.length > 0;
				});
			});
		const createObjectURLMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
		createObjectURLMock.mockImplementation((blob: Blob | MediaSource) => {
			if (blob instanceof Blob) {
				capturedBlob = blob;
			}
			return 'blob:attendance-export';
		});
		const expectedStartRange = getUtcDayRangeFromDateKey('2026-04-09', 'America/Mexico_City');
		const expectedEndRange = getUtcDayRangeFromDateKey('2026-04-11', 'America/Mexico_City');

		mockFetchAttendanceRecords.mockImplementation(
			async (params?: { fromDate?: Date; toDate?: Date; limit?: number }) => {
				if (params?.limit === 100) {
					const isExpandedRange =
						params.fromDate?.toISOString() === expectedStartRange.startUtc.toISOString() &&
						params.toDate?.toISOString() === expectedEndRange.endUtc.toISOString();

					return {
						data: isExpandedRange
							? [
									{
										id: 'attendance-previous-in',
										employeeId: 'EMP-000',
										employeeName: 'Grace Hopper',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-10T05:00:00.000Z'),
										type: 'CHECK_IN' as const,
										metadata: null,
										createdAt: new Date('2026-04-10T05:00:00.000Z'),
										updatedAt: new Date('2026-04-10T05:00:00.000Z'),
									},
									{
										id: 'attendance-previous-out',
										employeeId: 'EMP-000',
										employeeName: 'Grace Hopper',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-10T13:00:00.000Z'),
										type: 'CHECK_OUT' as const,
										metadata: null,
										createdAt: new Date('2026-04-10T13:00:00.000Z'),
										updatedAt: new Date('2026-04-10T13:00:00.000Z'),
									},
									{
										id: 'attendance-selected-in',
										employeeId: 'EMP-001',
										employeeName: 'Ada Lovelace',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-11T05:00:00.000Z'),
										type: 'CHECK_IN' as const,
										metadata: null,
										createdAt: new Date('2026-04-11T05:00:00.000Z'),
										updatedAt: new Date('2026-04-11T05:00:00.000Z'),
									},
									{
										id: 'attendance-selected-out',
										employeeId: 'EMP-001',
										employeeName: 'Ada Lovelace',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-11T13:00:00.000Z'),
										type: 'CHECK_OUT' as const,
										metadata: null,
										createdAt: new Date('2026-04-11T13:00:00.000Z'),
										updatedAt: new Date('2026-04-11T13:00:00.000Z'),
									},
								]
							: [
									{
										id: 'attendance-previous-out',
										employeeId: 'EMP-000',
										employeeName: 'Grace Hopper',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-10T13:00:00.000Z'),
										type: 'CHECK_OUT' as const,
										metadata: null,
										createdAt: new Date('2026-04-10T13:00:00.000Z'),
										updatedAt: new Date('2026-04-10T13:00:00.000Z'),
									},
									{
										id: 'attendance-selected-in',
										employeeId: 'EMP-001',
										employeeName: 'Ada Lovelace',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-11T05:00:00.000Z'),
										type: 'CHECK_IN' as const,
										metadata: null,
										createdAt: new Date('2026-04-11T05:00:00.000Z'),
										updatedAt: new Date('2026-04-11T05:00:00.000Z'),
									},
								],
						pagination: { total: isExpandedRange ? 4 : 2, limit: 100, offset: 0 },
					};
				}

				return {
					data: [
						{
							id: 'attendance-initial-row',
							employeeId: 'EMP-001',
							employeeName: 'Ada Lovelace',
							deviceId: 'device-1',
							deviceLocationId: 'location-1',
							deviceLocationName: 'Oficina principal',
							timestamp: new Date('2026-04-10T15:00:00.000Z'),
							type: 'CHECK_IN' as const,
							metadata: null,
							createdAt: new Date('2026-04-10T15:00:00.000Z'),
							updatedAt: new Date('2026-04-10T15:00:00.000Z'),
						},
					],
					pagination: { total: 1, limit: 10, offset: 0 },
				};
			},
		);

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-10',
				to: '2026-04-10',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(anchorClickSpy).toHaveBeenCalled();
			expect(capturedBlob).not.toBeNull();
		});

		const appendedAnchor = appendChildSpy.mock.calls.find(
			([node]) => node instanceof HTMLAnchorElement,
		)?.[0];
		if (!(appendedAnchor instanceof HTMLAnchorElement)) {
			throw new Error('Expected the export flow to append an anchor element.');
		}

		const exportCall = mockFetchAttendanceRecords.mock.calls.find(
			([params]) => (params as { limit?: number }).limit === 100,
		) as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];

		expect(exportCall[0].fromDate.toISOString()).toBe(expectedStartRange.startUtc.toISOString());
		expect(exportCall[0].toDate.toISOString()).toBe(expectedEndRange.endUtc.toISOString());
		expect(capturedBlob).not.toBeNull();
		if (!capturedBlob) {
			throw new Error('Expected a PDF blob to be created.');
		}
		const pdfBlob = capturedBlob as Blob;
		expect(pdfBlob.type).toBe('application/pdf');
		expect(expectedPdfBytes).not.toBeNull();
		if (!expectedPdfBytes) {
			throw new Error('Expected mock PDF bytes to be initialized.');
		}
		const downloadedBytes = await readBlobBytes(pdfBlob);
		expect(downloadedBytes).toEqual(expectedPdfBytes);
		await Promise.resolve();
		expect(revokeObservedAtMicrotask).toBe(false);
		expect(appendedAnchor.download.endsWith('.pdf')).toBe(true);
		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
	});

	it('uses the export timezone date keys in the PDF filename', async () => {
		const appendChildSpy = vi.spyOn(document.body, 'appendChild');
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);
		const createObjectURLMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
		createObjectURLMock.mockReturnValue('blob:attendance-export');

		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-22T16:30:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-02-22T16:30:00.000Z'),
					updatedAt: new Date('2026-02-22T16:30:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
				timeZone: 'Asia/Tokyo',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(anchorClickSpy).toHaveBeenCalled();
		});

		const appendedAnchor = appendChildSpy.mock.calls.find(
			([node]) => node instanceof HTMLAnchorElement,
		)?.[0];
		if (!(appendedAnchor instanceof HTMLAnchorElement)) {
			throw new Error('Expected the export flow to append an anchor element.');
		}

		expect(appendedAnchor.download).toBe('asistencia_20260223_20260223.pdf');
	});

	it('passes localized PDF labels to the builder during export', async () => {
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);

		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-23T15:30:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-02-23T15:30:00.000Z'),
					updatedAt: new Date('2026-02-23T15:30:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient();

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(anchorClickSpy).toHaveBeenCalled();
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				labels: {
					periodPrefix: 'Periodo',
					employeeIdPrefix: 'ID',
					missingEmployeeName: 'Sin nombre',
					missingEmployeeId: 'Sin ID',
					tableHeaders: {
						day: 'Día',
						entry: 'Entrada',
						exit: 'Salida',
						workHours: 'Horas trabajadas',
						signature: 'Firma',
					},
					totalLabel: 'Total',
				},
			}),
		);
	});

	it('shows a localized toast when PDF export fails', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-23T15:30:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-02-23T15:30:00.000Z'),
					updatedAt: new Date('2026-02-23T15:30:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockBuildAttendanceReportPdf.mockRejectedValueOnce(new Error('pdf boom'));

		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		renderAttendanceClient();

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Failed to export attendance PDF:',
				expect.any(Error),
			);
		});

		expect(mockToastError).toHaveBeenCalledWith('No se pudo exportar el PDF.');
		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});
	});

	it('skips PDF download when spillover fetch has no rows inside the selected local range', async () => {
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);
		const createObjectURLMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
		const expectedStartRange = getUtcDayRangeFromDateKey('2026-04-09', 'America/Mexico_City');
		const expectedEndRange = getUtcDayRangeFromDateKey('2026-04-11', 'America/Mexico_City');

		mockFetchAttendanceRecords.mockImplementation(
			async (params?: { fromDate?: Date; toDate?: Date; limit?: number }) => {
				if (params?.limit === 100) {
					const isExpandedRange =
						params.fromDate?.toISOString() === expectedStartRange.startUtc.toISOString() &&
						params.toDate?.toISOString() === expectedEndRange.endUtc.toISOString();

					return {
						data: isExpandedRange
							? [
									{
										id: 'attendance-previous-in',
										employeeId: 'EMP-000',
										employeeName: 'Grace Hopper',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-10T05:00:00.000Z'),
										type: 'CHECK_IN' as const,
										metadata: null,
										createdAt: new Date('2026-04-10T05:00:00.000Z'),
										updatedAt: new Date('2026-04-10T05:00:00.000Z'),
									},
									{
										id: 'attendance-previous-out',
										employeeId: 'EMP-000',
										employeeName: 'Grace Hopper',
										deviceId: 'device-1',
										deviceLocationId: 'location-1',
										deviceLocationName: 'Oficina principal',
										timestamp: new Date('2026-04-10T13:00:00.000Z'),
										type: 'CHECK_OUT' as const,
										metadata: null,
										createdAt: new Date('2026-04-10T13:00:00.000Z'),
										updatedAt: new Date('2026-04-10T13:00:00.000Z'),
									},
								]
							: [],
						pagination: { total: isExpandedRange ? 2 : 0, limit: 100, offset: 0 },
					};
				}

				return {
					data: [
						{
							id: 'attendance-initial-row',
							employeeId: 'EMP-001',
							employeeName: 'Ada Lovelace',
							deviceId: 'device-1',
							deviceLocationId: 'location-1',
							deviceLocationName: 'Oficina principal',
							timestamp: new Date('2026-04-10T15:00:00.000Z'),
							type: 'CHECK_IN' as const,
							metadata: null,
							createdAt: new Date('2026-04-10T15:00:00.000Z'),
							updatedAt: new Date('2026-04-10T15:00:00.000Z'),
						},
					],
					pagination: { total: 1, limit: 10, offset: 0 },
				};
			},
		);

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-10',
				to: '2026-04-10',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(exportButton).toBeDisabled();
		});

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		expect(createObjectURLMock).not.toHaveBeenCalled();
		expect(anchorClickSpy).not.toHaveBeenCalled();
	});
});
