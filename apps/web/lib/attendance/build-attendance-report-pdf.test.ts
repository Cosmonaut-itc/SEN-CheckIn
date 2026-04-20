import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';

import type { AttendanceEmployeePdfGroup } from '@/app/(dashboard)/attendance/attendance-export-helpers';

import { buildAttendanceReportPdf } from './build-attendance-report-pdf';

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
 * Finds the first index of a token inside a byte array.
 *
 * @param bytes - Source byte array
 * @param token - Byte token to search
 * @returns Index or -1 when not found
 */
function findTokenIndex(bytes: Uint8Array, token: Uint8Array): number {
	for (let index = 0; index <= bytes.length - token.length; index += 1) {
		let matched = true;
		for (let tokenIndex = 0; tokenIndex < token.length; tokenIndex += 1) {
			if (bytes[index + tokenIndex] !== token[tokenIndex]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			return index;
		}
	}
	return -1;
}

/**
 * Extracts every Flate-compressed PDF stream.
 *
 * @param bytes - PDF byte array
 * @returns Decoded stream texts
 */
function decodeAllFlateStreams(bytes: Uint8Array): string[] {
	const streamToken = new TextEncoder().encode('stream\n');
	const endStreamToken = new TextEncoder().encode('\nendstream');
	const streamTexts: string[] = [];
	let searchIndex = 0;

	while (searchIndex < bytes.length) {
		const streamIndex = findTokenIndex(bytes.slice(searchIndex), streamToken);
		if (streamIndex === -1) {
			break;
		}

		const absoluteStreamIndex = searchIndex + streamIndex;
		const streamStart = absoluteStreamIndex + streamToken.length;
		const streamEnd = findTokenIndex(bytes.slice(streamStart), endStreamToken);
		if (streamEnd === -1) {
			break;
		}

		const compressed = bytes.slice(streamStart, streamStart + streamEnd);
		try {
			const inflated = inflateSync(compressed);
			streamTexts.push(new TextDecoder('latin1').decode(inflated));
		} catch {
			// Ignore streams that are not Flate-compressed.
		}

		searchIndex = streamStart + streamEnd + endStreamToken.length;
	}

	return streamTexts;
}

/**
 * Encodes plain text into uppercase hexadecimal representation.
 *
 * @param value - Plain text
 * @returns Hexadecimal text
 */
function encodeTextToHex(value: string): string {
	return Array.from(value)
		.map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
	.join('')
	.toUpperCase();
}

/**
 * Checks whether any decoded PDF stream contains a text token.
 *
 * @param streams - Decoded PDF streams
 * @param text - Human-readable text to search for
 * @returns True when the token exists in at least one stream
 */
function streamContainsText(streams: readonly string[], text: string): boolean {
	const encodedText = `<${encodeTextToHex(text)}>`;
	return streams.some((stream) => stream.includes(encodedText));
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

		const streams = decodeAllFlateStreams(pdfBytes);

		expect(readPdfHeader(pdfBytes)).toBe('%PDF-');
		expect(pdfBytes.length).toBeGreaterThan(500);
		expect(await getPdfPageCount(pdfBytes)).toBe(1);
		expect(streamContainsText(streams, 'Reporte de asistencia')).toBe(true);
		expect(streamContainsText(streams, 'Periodo: 10/04/2026 - 12/04/2026')).toBe(true);
		expect(streamContainsText(streams, 'Ana López')).toBe(true);
		expect(streamContainsText(streams, 'ID: emp-1')).toBe(true);
		expect(streamContainsText(streams, 'Día')).toBe(true);
		expect(streamContainsText(streams, 'Entrada')).toBe(true);
		expect(streamContainsText(streams, 'Salida')).toBe(true);
		expect(streamContainsText(streams, 'Horas trabajadas')).toBe(true);
		expect(streamContainsText(streams, 'Firma')).toBe(true);
		expect(streamContainsText(streams, 'Total')).toBe(true);
		expect(streamContainsText(streams, '09:30')).toBe(true);
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

		const streams = decodeAllFlateStreams(pdfBytes);

		expect(await getPdfPageCount(pdfBytes)).toBeGreaterThan(1);
		expect(streamContainsText(streams, 'Día')).toBe(true);
		expect(streamContainsText(streams, 'Entrada')).toBe(true);
		expect(streamContainsText(streams, 'Salida')).toBe(true);
		expect(streamContainsText(streams, 'Horas trabajadas')).toBe(true);
		expect(streamContainsText(streams, 'Firma')).toBe(true);
		expect(streams.filter((stream) => stream.includes(`<${encodeTextToHex('Día')}>`))).toHaveLength(2);
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

		const streams = decodeAllFlateStreams(pdfBytes);

		expect(await getPdfPageCount(pdfBytes)).toBe(2);
		expect(streamContainsText([streams[0] ?? ''], 'Bruno Ruiz')).toBe(false);
		expect(streamContainsText([streams[0] ?? ''], '23/04/2026')).toBe(false);
		expect(streamContainsText([streams[1] ?? ''], 'Bruno Ruiz')).toBe(true);
		expect(streamContainsText([streams[1] ?? ''], '23/04/2026')).toBe(true);
	});
});
