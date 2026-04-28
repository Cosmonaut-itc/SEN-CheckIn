import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { PDFDocument } from 'pdf-lib';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import type { AttendanceRecord, Employee } from '@/lib/client-functions';
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

vi.mock('@/lib/attendance/build-attendance-report-pdf', () => ({
	buildAttendanceReportPdf: (...args: unknown[]) => mockBuildAttendanceReportPdf(...args),
}));

const mockFetchAttendanceRecords = vi.fn();
const mockFetchEmployeeById = vi.fn();
const mockFetchEmployeesList = vi.fn();
const mockFetchLocationsList = vi.fn();
const mockFetchPayrollSettings = vi.fn();
const mockFetchServerTime = vi.fn();
const mockFetchVacationRequestsList = vi.fn();
let expectedPdfBytes: Uint8Array | null = null;

/**
 * Freezes Date reads without replacing async timers used by React tests.
 *
 * @param timestamp - Current instant exposed to code under test
 */
function freezeDate(timestamp: string): void {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(timestamp));
}

/**
 * Restores real Date reads after a frozen-time test.
 */
function restoreDate(): void {
	vi.useRealTimers();
}

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

/**
 * Builds a test employee record with an optional schedule.
 *
 * @param overrides - Employee fields to override for the scenario
 * @returns Fully-typed employee record
 */
function buildEmployee(overrides: Partial<Employee> = {}): Employee {
	const timestamp = new Date('2026-01-01T00:00:00.000Z');

	return {
		id: 'EMP-001',
		code: 'EMP-001',
		firstName: 'Ada',
		lastName: 'Lovelace',
		nss: null,
		rfc: null,
		email: null,
		phone: null,
		jobPositionId: null,
		jobPositionName: null,
		department: null,
		status: 'ACTIVE',
		hireDate: null,
		dailyPay: 500,
		fiscalDailyPay: null,
		paymentFrequency: 'WEEKLY',
		employmentType: 'PERMANENT',
		isTrustEmployee: false,
		isDirectorAdminGeneralManager: false,
		isDomesticWorker: false,
		isPlatformWorker: false,
		platformHoursYear: 0,
		ptuEligibilityOverride: 'DEFAULT',
		aguinaldoDaysOverride: null,
		sbcDailyOverride: null,
		locationId: 'location-1',
		organizationId: 'org-1',
		userId: null,
		rekognitionUserId: null,
		schedule: [
			{
				dayOfWeek: 5,
				startTime: '08:00',
				endTime: '16:00',
				isWorkingDay: true,
			},
		],
		shiftType: 'DIURNA',
		createdAt: timestamp,
		updatedAt: timestamp,
		...overrides,
	};
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
		fetchEmployeeById: (...args: unknown[]) => mockFetchEmployeeById(...args),
		fetchEmployeesList: (...args: unknown[]) => mockFetchEmployeesList(...args),
		fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
		fetchPayrollSettings: (...args: unknown[]) => mockFetchPayrollSettings(...args),
		fetchServerTime: (...args: unknown[]) => mockFetchServerTime(...args),
		fetchVacationRequestsList: (...args: unknown[]) => mockFetchVacationRequestsList(...args),
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
	let originalAnchorClick: typeof HTMLAnchorElement.prototype.click;

	beforeEach(() => {
		process.env.TZ = 'America/Mexico_City';
		originalCreateObjectURL = URL.createObjectURL;
		originalRevokeObjectURL = URL.revokeObjectURL;
		originalAnchorClick = HTMLAnchorElement.prototype.click;
		URL.createObjectURL = vi.fn(() => 'blob:attendance-export');
		URL.revokeObjectURL = vi.fn();
		HTMLAnchorElement.prototype.click = vi.fn();
		mockFetchAttendanceRecords.mockReset();
		mockFetchEmployeeById.mockReset();
		mockFetchEmployeesList.mockReset();
		mockFetchLocationsList.mockReset();
		mockFetchPayrollSettings.mockReset();
		mockFetchServerTime.mockReset();
		mockFetchVacationRequestsList.mockReset();
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
		mockFetchEmployeesList.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		});
		mockFetchEmployeeById.mockResolvedValue(null);
		mockFetchPayrollSettings.mockResolvedValue(null);
		mockFetchServerTime.mockResolvedValue(new Date('2026-04-24T16:30:00.000Z'));
		mockFetchVacationRequestsList.mockResolvedValue({
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
		HTMLAnchorElement.prototype.click = originalAnchorClick;
		restoreDate();
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

	it('renders aligned filter labels for search, preset, and custom date range controls', () => {
		renderAttendanceClient();

		expect(screen.getByLabelText('Buscar empleado')).toBeInTheDocument();
		expect(screen.getByLabelText('Periodo')).toBeInTheDocument();
		expect(screen.getByLabelText('Fecha de inicio')).toBeInTheDocument();
		expect(screen.getByLabelText('Fecha de fin')).toBeInTheDocument();
		expect(screen.getByLabelText('Tipo de registro')).toBeInTheDocument();
		expect(screen.getByLabelText('Clasificación RH')).toBeInTheDocument();
		expect(screen.getByLabelText('Ubicación')).toBeInTheDocument();
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

		expect(exportCall[0].fromDate.toISOString()).toBe(
			expectedStartRange.startUtc.toISOString(),
		);
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
					revokeObservedAtMicrotask =
						(URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length > 0;
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
						params.fromDate?.toISOString() ===
							expectedStartRange.startUtc.toISOString() &&
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

		expect(exportCall[0].fromDate.toISOString()).toBe(
			expectedStartRange.startUtc.toISOString(),
		);
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

	it('lazy-loads the PDF builder only when export starts', async () => {
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

		expect(mockBuildAttendanceReportPdf).not.toHaveBeenCalled();

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
			expect(anchorClickSpy).toHaveBeenCalled();
		});
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
						mealBreak: 'Comida',
						incompleteReason: 'Motivo',
						workHours: 'Horas trabajadas',
						signature: 'Firma',
					},
					totalLabel: 'Total',
				},
			}),
		);
	});

	it('includes automatic lunch break minutes in exported PDF groups when payroll settings enable them', async () => {
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);

		mockFetchPayrollSettings.mockResolvedValue({
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
		});
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-23T14:00:00.000Z'),
					type: 'CHECK_IN' as const,
					checkOutReason: null,
					metadata: null,
					createdAt: new Date('2026-02-23T14:00:00.000Z'),
					updatedAt: new Date('2026-02-23T14:00:00.000Z'),
				},
				{
					id: 'attendance-2',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-23T22:00:00.000Z'),
					type: 'CHECK_OUT' as const,
					checkOutReason: 'REGULAR' as const,
					metadata: null,
					createdAt: new Date('2026-02-23T22:00:00.000Z'),
					updatedAt: new Date('2026-02-23T22:00:00.000Z'),
				},
			],
			pagination: { total: 2, limit: 10, offset: 0 },
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
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					{
						employeeId: 'EMP-001',
						employeeName: 'Ada Lovelace',
						totalWorkedMinutes: 420,
						rows: [
							{
								day: '23/02/2026',
								firstEntry: '08:00',
								lastExit: '16:00',
								totalHours: '07:00',
								workMinutes: 420,
								mealBreakMinutes: 60,
							},
						],
					},
				],
			}),
		);
	});

	it('uses bulk list schedules during export without fetching every employee detail', async () => {
		freezeDate('2026-04-24T16:30:00.000Z');
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
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					schedule: [
						{
							dayOfWeek: 5,
							startTime: '08:00',
							endTime: '16:00',
							isWorkingDay: true,
						},
						{
							dayOfWeek: 6,
							startTime: '08:00',
							endTime: '16:00',
							isWorkingDay: false,
						},
					],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
			expect(anchorClickSpy).toHaveBeenCalled();
		});

		expect(mockFetchEmployeesList).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-1',
				includeSchedule: true,
				limit: 100,
				offset: 0,
			}),
		);
		expect(mockFetchEmployeesList).not.toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'ACTIVE',
				includeSchedule: true,
			}),
		);
		expect(mockFetchEmployeeById).not.toHaveBeenCalled();
		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: expect.arrayContaining([
							expect.objectContaining({
								day: '24/04/2026',
								totalHours: '08:00',
							}),
						]),
					}),
				],
			}),
		);
	});

	it('resolves payroll cutoff virtual rows with server time instead of browser time', async () => {
		freezeDate('2026-04-24T15:30:00.000Z');
		mockFetchServerTime.mockResolvedValue(new Date('2026-04-24T16:30:00.000Z'));
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					schedule: [
						{
							dayOfWeek: 5,
							startTime: '08:00',
							endTime: '16:00',
							isWorkingDay: true,
						},
					],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-24',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockFetchServerTime).toHaveBeenCalledTimes(1);
		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: [
							expect.objectContaining({
								day: '24/04/2026',
								lastExit: 'Asistencia por nómina',
								totalHours: '08:00',
							}),
						],
					}),
				],
			}),
		);
	});

	it('adds Saturday payroll cutoff attendance with default hours when Saturday is not scheduled', async () => {
		freezeDate('2026-04-24T15:30:00.000Z');
		mockFetchServerTime.mockResolvedValue(new Date('2026-04-24T16:30:00.000Z'));
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					schedule: [
						{
							dayOfWeek: 5,
							startTime: '08:00',
							endTime: '16:00',
							isWorkingDay: true,
						},
					],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: expect.arrayContaining([
							expect.objectContaining({
								day: '24/04/2026',
								lastExit: 'Asistencia por nómina',
								totalHours: '08:00',
							}),
							expect.objectContaining({
								day: '25/04/2026',
								firstEntry: 'Asistencia por nómina',
								lastExit: 'Asistencia por nómina',
								totalHours: '08:00',
							}),
						]),
					}),
				],
			}),
		);
	});

	it('keeps exporting the PDF when server time cannot be fetched', async () => {
		mockFetchServerTime.mockRejectedValueOnce(new Error('Failed to fetch server time'));
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [buildEmployee()],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-24',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Failed to fetch server time for attendance export:',
			expect.any(Error),
		);
		expect(mockToastError).not.toHaveBeenCalled();
	});

	it('resolves payroll cutoff server time in CDMX even when the report timezone differs', async () => {
		mockFetchServerTime.mockResolvedValue(new Date('2026-04-24T01:30:00.000Z'));
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-23T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-23T15:00:00.000Z'),
					updatedAt: new Date('2026-04-23T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [buildEmployee()],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'Asia/Tokyo',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-24',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: [
							expect.objectContaining({
								day: '24/04/2026',
								lastExit: 'Sin salida',
								totalHours: 'Incompleto',
							}),
						],
					}),
				],
			}),
		);
	});

	it('keeps virtual rows under a device-location export when the employee is assigned elsewhere', async () => {
		freezeDate('2026-04-24T16:30:00.000Z');
		HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
		HTMLElement.prototype.scrollIntoView = vi.fn();
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchLocationsList.mockResolvedValue({
			data: [
				{
					id: 'location-1',
					name: 'Oficina principal',
					code: 'HQ',
					address: null,
					latitude: null,
					longitude: null,
					organizationId: 'org-1',
					geographicZone: 'GENERAL',
					timeZone: 'America/Mexico_City',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					id: 'EMP-001',
					locationId: 'location-2',
				}),
				buildEmployee({
					id: 'EMP-002',
					code: 'EMP-002',
					firstName: 'Grace',
					lastName: 'Hopper',
					locationId: 'location-2',
				}),
			],
			pagination: { total: 2, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByRole('combobox', { name: 'Ubicación' }));
		fireEvent.click(await screen.findByRole('option', { name: 'Oficina principal' }));

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenLastCalledWith(
				expect.objectContaining({
					deviceLocationId: 'location-1',
				}),
			);
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });
		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						employeeName: 'Ada Lovelace',
						rows: expect.arrayContaining([
							expect.objectContaining({
								totalHours: '08:00',
							}),
						]),
					}),
				],
			}),
		);
	});

	it.each([
		{ searchTerm: 'ada', label: 'name' },
		{ searchTerm: 'SEN-104', label: 'code' },
	])(
		'keeps virtual export rows when a search matches the employee $label',
		async ({ searchTerm }) => {
			freezeDate('2026-04-24T16:30:00.000Z');
			mockFetchAttendanceRecords.mockResolvedValue({
				data: [
					{
						id: 'attendance-1',
						employeeId: 'employee-uuid-1',
						employeeName: 'Ada Lovelace',
						deviceId: 'device-1',
						deviceLocationId: 'location-1',
						deviceLocationName: 'Oficina principal',
						timestamp: new Date('2026-04-24T15:00:00.000Z'),
						type: 'CHECK_IN' as const,
						metadata: null,
						createdAt: new Date('2026-04-24T15:00:00.000Z'),
						updatedAt: new Date('2026-04-24T15:00:00.000Z'),
					},
				],
				pagination: { total: 1, limit: 10, offset: 0 },
			});
			mockFetchEmployeesList.mockResolvedValue({
				data: [
					buildEmployee({
						id: 'employee-uuid-1',
						code: 'SEN-104',
						firstName: 'Ada',
						lastName: 'Lovelace',
					}),
					buildEmployee({
						id: 'employee-uuid-2',
						code: 'SEN-205',
						firstName: 'Grace',
						lastName: 'Hopper',
					}),
				],
				pagination: { total: 2, limit: 100, offset: 0 },
			});

			renderAttendanceClient({
				organizationTimeZone: 'America/Mexico_City',
				initialFilters: {
					from: '2026-04-24',
					to: '2026-04-25',
				},
			});

			await waitFor(() => {
				expect(mockFetchAttendanceRecords).toHaveBeenCalled();
			});

			fireEvent.change(screen.getByLabelText('Buscar empleado'), {
				target: { value: searchTerm },
			});

			const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });
			await waitFor(() => {
				expect(exportButton).toBeEnabled();
			});

			fireEvent.click(exportButton);

			await waitFor(() => {
				expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
			});

			expect(mockFetchEmployeesList).toHaveBeenCalledWith(
				expect.objectContaining({
					search: searchTerm,
				}),
			);
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
				expect.objectContaining({
					groups: [
						expect.objectContaining({
							employeeName: 'Ada Lovelace',
							rows: expect.arrayContaining([
								expect.objectContaining({
									totalHours: '08:00',
								}),
							]),
						}),
					],
				}),
			);
		},
	);

	it('does not create selected-employee virtual rows when search does not match the employee', async () => {
		freezeDate('2026-04-24T16:30:00.000Z');
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'employee-uuid-1',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeeById.mockResolvedValue(
			buildEmployee({
				id: 'employee-uuid-1',
				code: 'SEN-104',
				firstName: 'Ada',
				lastName: 'Lovelace',
			}),
		);

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
				employeeId: 'employee-uuid-1',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		fireEvent.change(screen.getByLabelText('Buscar empleado'), {
			target: { value: 'grace' },
		});

		const exportButton = screen.getByRole('button', { name: 'Descargar PDF' });
		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						employeeName: 'Ada Lovelace',
						rows: [
							expect.objectContaining({
								totalHours: 'Incompleto',
							}),
						],
					}),
				],
			}),
		);
	});

	it('does not create cutoff virtual rows when an employee has no schedule', async () => {
		freezeDate('2026-04-24T16:30:00.000Z');
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					schedule: [],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: [
							expect.objectContaining({
								totalHours: 'Incompleto',
							}),
						],
					}),
				],
			}),
		);
	});

	it('does not create cutoff virtual rows for inactive employees without real attendance', async () => {
		freezeDate('2026-04-24T16:30:00.000Z');
		const anchorClickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => undefined);

		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-active',
					employeeId: 'EMP-ACTIVE',
					employeeName: 'Ada Activa',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					id: 'EMP-INACTIVE',
					firstName: 'Tomas',
					lastName: 'Terminado',
					status: 'INACTIVE',
					schedule: [
						{
							dayOfWeek: 5,
							startTime: '08:00',
							endTime: '16:00',
							isWorkingDay: true,
						},
					],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-25',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: expect.not.arrayContaining([
					expect.objectContaining({
						employeeId: 'EMP-INACTIVE',
					}),
				]),
			}),
		);
		expect(anchorClickSpy).toHaveBeenCalled();
	});

	it('keeps approved vacation virtual rows when an employee has no schedule', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-04-24T15:00:00.000Z'),
					type: 'CHECK_IN' as const,
					metadata: null,
					createdAt: new Date('2026-04-24T15:00:00.000Z'),
					updatedAt: new Date('2026-04-24T15:00:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});
		mockFetchEmployeesList.mockResolvedValue({
			data: [
				buildEmployee({
					status: 'INACTIVE',
					schedule: [],
				}),
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});
		mockFetchVacationRequestsList.mockResolvedValue({
			data: [
				{
					id: 'vacation-1',
					organizationId: 'org-1',
					employeeId: 'EMP-001',
					requestedByUserId: null,
					status: 'APPROVED',
					startDateKey: '2026-04-24',
					endDateKey: '2026-04-24',
					requestedNotes: null,
					decisionNotes: null,
					approvedByUserId: 'user-1',
					approvedAt: new Date('2026-04-20T15:00:00.000Z'),
					rejectedByUserId: null,
					rejectedAt: null,
					cancelledByUserId: null,
					cancelledAt: null,
					createdAt: new Date('2026-04-20T15:00:00.000Z'),
					updatedAt: new Date('2026-04-20T15:00:00.000Z'),
					employeeName: 'Ada',
					employeeLastName: 'Lovelace',
					days: [
						{
							dateKey: '2026-04-24',
							countsAsVacationDay: true,
							dayType: 'SCHEDULED_WORKDAY',
							serviceYearNumber: 1,
						},
					],
					summary: {
						totalDays: 1,
						vacationDays: 1,
					},
				},
			],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-04-24',
				to: '2026-04-24',
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
			expect(mockBuildAttendanceReportPdf).toHaveBeenCalledTimes(1);
		});

		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						rows: [
							expect.objectContaining({
								firstEntry: 'Vacaciones',
								lastExit: 'Vacaciones',
								totalHours: '08:00',
							}),
						],
					}),
				],
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

	it('exports same-day incomplete rows for spillover exits without same-day entries', async () => {
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
						params.fromDate?.toISOString() ===
							expectedStartRange.startUtc.toISOString() &&
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

		expect(createObjectURLMock).toHaveBeenCalledTimes(1);
		expect(anchorClickSpy).toHaveBeenCalledTimes(1);
		expect(mockBuildAttendanceReportPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				groups: [
					expect.objectContaining({
						employeeName: 'Grace Hopper',
						rows: [
							expect.objectContaining({
								day: '10/04/2026',
								firstEntry: 'Sin entrada',
								lastExit: '07:00',
								totalHours: 'Incompleto',
							}),
						],
					}),
				],
			}),
		);
	});
});
