import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { AttendanceEmployeePdfGroup } from '@/app/(dashboard)/attendance/attendance-export-helpers';

import { buildAttendanceReportPdf } from './build-attendance-report-pdf';

const PDFJS_STANDARD_FONT_DATA_URL = `${pathToFileURL(
	resolve(process.cwd(), '../../node_modules/pdfjs-dist/standard_fonts/'),
).href}`.replace(/\/?$/, '/');

/**
 * Converts PDF header bytes to string.
 *
 * @param bytes - PDF byte array
 * @returns Header string
 */
function readPdfHeader(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes.slice(0, 5));
}

/**
 * Extracts text content from each rendered PDF page.
 *
 * @param bytes - PDF byte array
 * @returns Extracted page texts in order
 */
async function extractPdfPageTexts(bytes: Uint8Array): Promise<string[]> {
	const pdfBytes = bytes.slice();
	const loadingTask = pdfjsLib.getDocument({
		data: pdfBytes,
		standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
		useWorkerFetch: false,
		isEvalSupported: false,
		disableFontFace: true,
		disableStream: true,
		disableAutoFetch: true,
	});
	const pdfDocument = await loadingTask.promise;
	const pageTexts: string[] = [];

	for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
		const page = await pdfDocument.getPage(pageNumber);
		const textContent = await page.getTextContent();
		const text = textContent.items
			.map((item) => ('str' in item ? item.str : ''))
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		pageTexts.push(text);
	}

	await loadingTask.destroy();
	return pageTexts;
}

/**
 * Builds a test attendance group fixture.
 *
 * @param overrides - Partial group values
 * @returns Attendance group payload
 */
function buildAttendanceGroup(
	overrides: Partial<AttendanceEmployeePdfGroup> = {},
): AttendanceEmployeePdfGroup {
	return {
		employeeId: 'emp-1',
		employeeName: 'Ana López',
		totalWorkedMinutes: 570,
		rows: [
			{
				day: '10/04/2026',
				firstEntry: '08:00',
				lastExit: '16:00',
				totalHours: '08:00',
				workMinutes: 480,
			},
			{
				day: '11/04/2026',
				firstEntry: '08:00',
				lastExit: '09:30',
				totalHours: '01:30',
				workMinutes: 90,
			},
			{
				day: '12/04/2026',
				firstEntry: 'Fuera de oficina',
				lastExit: 'Fuera de oficina',
				totalHours: 'Fuera de oficina',
				workMinutes: null,
			},
		],
		...overrides,
	};
}

/**
 * Loads a PDF and returns the number of pages.
 *
 * @param bytes - PDF byte array
 * @returns Number of pages in the PDF
 */
async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
	const pdfDocument = await PDFDocument.load(bytes);
	return pdfDocument.getPageCount();
}

describe('buildAttendanceReportPdf', () => {
	it('builds a valid PDF with the title, range, employee block, headers, and total row', async () => {
		const pdfBytes = await buildAttendanceReportPdf({
			title: 'Reporte de asistencia',
			dateRange: {
				startDateKey: '2026-04-10',
				endDateKey: '2026-04-12',
			},
			groups: [
				buildAttendanceGroup({
					employeeId: 'emp-1',
					employeeName: 'Ana López',
				}),
			],
		});

		const pageTexts = await extractPdfPageTexts(pdfBytes);
		const documentText = pageTexts.join(' ');

		expect(readPdfHeader(pdfBytes)).toBe('%PDF-');
		expect(pdfBytes.length).toBeGreaterThan(500);
		expect(await getPdfPageCount(pdfBytes)).toBe(1);
		expect(documentText).toContain('Reporte de asistencia');
		expect(documentText).toContain('Periodo: 10/04/2026 - 12/04/2026');
		expect(documentText).toContain('Ana López');
		expect(documentText).toContain('ID: emp-1');
		expect(documentText).toContain('Día');
		expect(documentText).toContain('Entrada');
		expect(documentText).toContain('Salida');
		expect(documentText).toContain('Horas trabajadas');
		expect(documentText).toContain('Firma');
		expect(documentText).toContain('Total');
		expect(documentText).toContain('09:30');
	});

	it('creates repeated table headers when an employee block spans multiple pages', async () => {
		const longRows: AttendanceEmployeePdfGroup['rows'] = Array.from({ length: 28 }, (_, index) => ({
			day: `${String(index + 1).padStart(2, '0')}/04/2026`,
			firstEntry: '08:00',
			lastExit: '17:00',
			totalHours: '09:00',
			workMinutes: 540,
		}));

		const pdfBytes = await buildAttendanceReportPdf({
			title: 'Reporte de asistencia',
			dateRange: {
				startDateKey: '2026-04-01',
				endDateKey: '2026-04-28',
			},
			groups: [
				{
					employeeId: 'emp-1',
					employeeName: 'Ana López',
					totalWorkedMinutes: 28 * 540,
					rows: longRows,
				},
			],
		});

		const pageTexts = await extractPdfPageTexts(pdfBytes);

		expect(await getPdfPageCount(pdfBytes)).toBeGreaterThan(1);
		expect(pageTexts.some((text) => text.includes('Día'))).toBe(true);
		expect(pageTexts.some((text) => text.includes('Entrada'))).toBe(true);
		expect(pageTexts.some((text) => text.includes('Salida'))).toBe(true);
		expect(pageTexts.some((text) => text.includes('Horas trabajadas'))).toBe(true);
		expect(pageTexts.some((text) => text.includes('Firma'))).toBe(true);
		expect(pageTexts.filter((text) => text.includes('Día'))).toHaveLength(2);
	});

	it('moves a near-bottom block to the next page before its first row and total can split apart', async () => {
		const firstGroupRows: AttendanceEmployeePdfGroup['rows'] = Array.from(
			{ length: 22 },
			(_, index) => ({
				day: `${String(index + 1).padStart(2, '0')}/04/2026`,
				firstEntry: '08:00',
				lastExit: '17:00',
				totalHours: '09:00',
				workMinutes: 540,
			}),
		);

		const pdfBytes = await buildAttendanceReportPdf({
			title: 'Reporte de asistencia',
			dateRange: {
				startDateKey: '2026-04-01',
				endDateKey: '2026-04-30',
			},
			groups: [
				{
					employeeId: 'emp-1',
					employeeName: 'Ana López',
					totalWorkedMinutes: 21 * 540,
					rows: firstGroupRows,
				},
				{
					employeeId: 'emp-2',
					employeeName: 'Bruno Ruiz',
					totalWorkedMinutes: 60,
					rows: [
						{
							day: '23/04/2026',
							firstEntry: '08:00',
							lastExit: '09:00',
							totalHours: '01:00',
							workMinutes: 60,
						},
					],
				},
			],
		});

		const pageTexts = await extractPdfPageTexts(pdfBytes);

		expect(await getPdfPageCount(pdfBytes)).toBe(2);
		expect(pageTexts[0] ?? '').not.toContain('Bruno Ruiz');
		expect(pageTexts[0] ?? '').not.toContain('23/04/2026');
		expect(pageTexts[1] ?? '').toContain('Bruno Ruiz');
		expect(pageTexts[1] ?? '').toContain('23/04/2026');
	});
});
