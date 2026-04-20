/**
 * Lazily loads the attendance PDF builder so the report stack only ships on demand.
 *
 * @returns Module containing the attendance PDF builder
 */
export async function loadAttendanceReportPdfBuilder(): Promise<
	typeof import('@/lib/attendance/build-attendance-report-pdf')
> {
	return import('@/lib/attendance/build-attendance-report-pdf');
}
