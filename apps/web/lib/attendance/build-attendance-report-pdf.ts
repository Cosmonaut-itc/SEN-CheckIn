import {
	PDFDocument,
	PageSizes,
	StandardFonts,
	rgb,
	type PDFFont,
	type PDFPage,
} from 'pdf-lib';

import type { AttendanceEmployeePdfGroup } from '@/app/(dashboard)/attendance/attendance-export-helpers';

type PdfTextAlignment = 'left' | 'center' | 'right';

interface AttendanceReportDateRange {
	startDateKey: string;
	endDateKey: string;
}

export interface AttendanceReportTableLabels {
	day: string;
	entry: string;
	exit: string;
	workHours: string;
	signature: string;
}

export interface AttendanceReportLabels {
	periodPrefix: string;
	employeeIdPrefix: string;
	missingEmployeeName: string;
	missingEmployeeId: string;
	tableHeaders: AttendanceReportTableLabels;
	totalLabel: string;
}

export interface BuildAttendanceReportPdfInput {
	title: string;
	dateRange: AttendanceReportDateRange;
	groups: AttendanceEmployeePdfGroup[];
	labels?: AttendanceReportLabels;
}

interface AttendanceTableColumn {
	label: string;
	width: number;
	alignment: PdfTextAlignment;
}

const PAGE_MARGIN = 48;
const TITLE_FONT_SIZE = 18;
const PERIOD_FONT_SIZE = 10;
const EMPLOYEE_FONT_SIZE = 13;
const META_FONT_SIZE = 9.5;
const TABLE_HEADER_FONT_SIZE = 8.5;
const ROW_FONT_SIZE = 9.25;
const TITLE_LINE_GAP = 8;
const BLOCK_HEADER_GAP = 8;
const TABLE_ROW_HEIGHT = 20;
const TABLE_HEADER_HEIGHT = 22;
const TABLE_TOTAL_HEIGHT = 20;
const SECTION_GAP = 14;
const SECTION_HEADER_HEIGHT =
	EMPLOYEE_FONT_SIZE +
	6 +
	META_FONT_SIZE +
	5 +
	META_FONT_SIZE +
	BLOCK_HEADER_GAP +
	TABLE_HEADER_HEIGHT;
const MINIMUM_BLOCK_OPENING_HEIGHT =
	SECTION_HEADER_HEIGHT + TABLE_ROW_HEIGHT + TABLE_TOTAL_HEIGHT + SECTION_GAP;
const CELL_HORIZONTAL_PADDING = 6;
const TABLE_BORDER_COLOR = rgb(0.83, 0.83, 0.83);
const TABLE_HEADER_FILL_COLOR = rgb(0.96, 0.96, 0.96);
const TABLE_TOTAL_FILL_COLOR = rgb(0.98, 0.98, 0.98);
const TEXT_COLOR = rgb(0.12, 0.12, 0.12);
const MUTED_TEXT_COLOR = rgb(0.35, 0.35, 0.35);

const DEFAULT_ATTENDANCE_REPORT_LABELS: AttendanceReportLabels = {
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
};

/**
 * Formats a local date key into dd/MM/yyyy.
 *
 * @param dateKey - Local date key in YYYY-MM-DD format
 * @returns Human-readable date string
 */
function formatDateKey(dateKey: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
	if (!match) {
		return dateKey;
	}

	const [, year, month, day] = match;
	return `${day}/${month}/${year}`;
}

/**
 * Formats a worked-minute total as HH:mm.
 *
 * @param totalMinutes - Total minutes worked across the block
 * @returns Duration string
 */
function formatWorkedMinutes(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Truncates text with an ellipsis so it fits within a width.
 *
 * @param text - Text value to fit
 * @param font - Font used to measure width
 * @param fontSize - Font size in points
 * @param maxWidth - Maximum width in points
 * @returns Fitted text
 */
function fitTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
	if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
		return text;
	}

	const ellipsis = '...';
	if (font.widthOfTextAtSize(ellipsis, fontSize) > maxWidth) {
		return '';
	}

	let low = 0;
	let high = text.length;

	while (low < high) {
		const midpoint = Math.ceil((low + high) / 2);
		const candidate = `${text.slice(0, midpoint)}${ellipsis}`;
		if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
			low = midpoint;
			continue;
		}
		high = midpoint - 1;
	}

	return `${text.slice(0, low)}${ellipsis}`;
}

/**
 * Builds the attendance table columns for the given labels.
 *
 * @param labels - Localized table labels
 * @returns Table column definitions
 */
function getAttendanceTableColumns(labels: AttendanceReportLabels): AttendanceTableColumn[] {
	return [
		{ label: labels.tableHeaders.day, width: 88, alignment: 'left' },
		{ label: labels.tableHeaders.entry, width: 86, alignment: 'left' },
		{ label: labels.tableHeaders.exit, width: 86, alignment: 'left' },
		{ label: labels.tableHeaders.workHours, width: 116, alignment: 'center' },
		{ label: labels.tableHeaders.signature, width: 140, alignment: 'center' },
	];
}

/**
 * Draws a single text line without a border.
 *
 * @param page - PDF page to render on
 * @param options - Text drawing options
 * @returns void
 */
function drawTextLine(
	page: PDFPage,
	options: {
		x: number;
		y: number;
		width: number;
		text: string;
		font: PDFFont;
		fontSize: number;
		alignment: PdfTextAlignment;
		textColor?: ReturnType<typeof rgb>;
	},
): void {
	const {
		x,
		y,
		width,
		text,
		font,
		fontSize,
		alignment,
		textColor = TEXT_COLOR,
	} = options;

	const fittedText = fitTextToWidth(text, font, fontSize, width);
	const textWidth = font.widthOfTextAtSize(fittedText, fontSize);
	let textX = x;
	if (alignment === 'center') {
		textX = x + (width - textWidth) / 2;
	} else if (alignment === 'right') {
		textX = x + width - textWidth;
	}

	page.drawText(fittedText, {
		x: textX,
		y,
		size: fontSize,
		font,
		color: textColor,
	});
}

/**
 * Draws a labeled cell rectangle and optional text.
 *
 * @param page - PDF page to render on
 * @param options - Cell drawing options
 * @returns void
 */
function drawCell(
	page: PDFPage,
	options: {
		x: number;
		y: number;
		width: number;
		height: number;
		text?: string;
		font: PDFFont;
		fontSize: number;
		alignment: PdfTextAlignment;
		fillColor?: ReturnType<typeof rgb>;
		textColor?: ReturnType<typeof rgb>;
		isBold?: boolean;
	},
): void {
	const {
		x,
		y,
		width,
		height,
		text,
		font,
		fontSize,
		alignment,
		fillColor,
		textColor = TEXT_COLOR,
	} = options;

	page.drawRectangle({
		x,
		y,
		width,
		height,
		borderColor: TABLE_BORDER_COLOR,
		borderWidth: 1,
		...(fillColor ? { color: fillColor } : {}),
	});

	if (!text || text.length === 0) {
		return;
	}

	const fittedText = fitTextToWidth(text, font, fontSize, width - CELL_HORIZONTAL_PADDING * 2);
	const textWidth = font.widthOfTextAtSize(fittedText, fontSize);
	let textX = x + CELL_HORIZONTAL_PADDING;
	if (alignment === 'center') {
		textX = x + (width - textWidth) / 2;
	} else if (alignment === 'right') {
		textX = x + width - CELL_HORIZONTAL_PADDING - textWidth;
	}

	page.drawText(fittedText, {
		x: textX,
		y: y + (height - fontSize) / 2 + 2,
		size: fontSize,
		font,
		color: textColor,
	});
}

/**
 * Draws the document title area.
 *
 * @param page - PDF page to render on
 * @param font - Regular font
 * @param fontBold - Bold font
 * @param title - Report title
 * @param periodLabel - Selected date range label
 * @param labels - Localized report copy
 * @returns Cursor Y after rendering the title block
 */
function drawReportHeader(
	page: PDFPage,
	font: PDFFont,
	fontBold: PDFFont,
	title: string,
	periodLabel: string,
	labels: AttendanceReportLabels,
): number {
	const { height, width } = page.getSize();
	const contentWidth = width - PAGE_MARGIN * 2;
	let cursorY = height - PAGE_MARGIN;

	drawTextLine(page, {
		x: PAGE_MARGIN,
		y: cursorY - TITLE_FONT_SIZE,
		width: contentWidth,
		text: title,
		font: fontBold,
		fontSize: TITLE_FONT_SIZE,
		alignment: 'left',
	});
	cursorY -= TITLE_FONT_SIZE + TITLE_LINE_GAP;

	drawTextLine(page, {
		x: PAGE_MARGIN,
		y: cursorY - PERIOD_FONT_SIZE,
		width: contentWidth,
		text: `${labels.periodPrefix}: ${periodLabel}`,
		font,
		fontSize: PERIOD_FONT_SIZE,
		alignment: 'left',
		textColor: MUTED_TEXT_COLOR,
	});

	return cursorY - PERIOD_FONT_SIZE - 18;
}

/**
 * Draws the employee heading and table header.
 *
 * @param page - PDF page to render on
 * @param font - Regular font
 * @param fontBold - Bold font
 * @param group - Employee PDF group
 * @param periodLabel - Selected date range label
 * @param labels - Localized report copy
 * @param cursorY - Current top cursor position
 * @returns Updated cursor Y after the block header
 */
function drawEmployeeSectionHeader(
	page: PDFPage,
	font: PDFFont,
	fontBold: PDFFont,
	group: AttendanceEmployeePdfGroup,
	periodLabel: string,
	labels: AttendanceReportLabels,
	cursorY: number,
): number {
	const { width } = page.getSize();
	const contentWidth = width - PAGE_MARGIN * 2;
	const employeeName =
		group.employeeName.trim().length > 0 ? group.employeeName : labels.missingEmployeeName;
	const employeeId = group.employeeId.trim().length > 0 ? group.employeeId : labels.missingEmployeeId;

	drawTextLine(page, {
		x: PAGE_MARGIN,
		y: cursorY - EMPLOYEE_FONT_SIZE,
		width: contentWidth,
		text: employeeName,
		font: fontBold,
		fontSize: EMPLOYEE_FONT_SIZE,
		alignment: 'left',
	});
	cursorY -= EMPLOYEE_FONT_SIZE + 6;

	drawTextLine(page, {
		x: PAGE_MARGIN,
		y: cursorY - META_FONT_SIZE,
		width: contentWidth,
		text: `${labels.employeeIdPrefix}: ${employeeId}`,
		font,
		fontSize: META_FONT_SIZE,
		alignment: 'left',
		textColor: MUTED_TEXT_COLOR,
	});
	cursorY -= META_FONT_SIZE + 5;

	drawTextLine(page, {
		x: PAGE_MARGIN,
		y: cursorY - META_FONT_SIZE,
		width: contentWidth,
		text: `${labels.periodPrefix}: ${periodLabel}`,
		font,
		fontSize: META_FONT_SIZE,
		alignment: 'left',
		textColor: MUTED_TEXT_COLOR,
	});
	cursorY -= META_FONT_SIZE + BLOCK_HEADER_GAP;

	return drawTableHeader(page, fontBold, labels, cursorY);
}

/**
 * Draws the table header row.
 *
 * @param page - PDF page to render on
 * @param fontBold - Bold font
 * @param labels - Localized report copy
 * @param cursorY - Current top cursor position
 * @returns Updated cursor Y after the header row
 */
function drawTableHeader(
	page: PDFPage,
	fontBold: PDFFont,
	labels: AttendanceReportLabels,
	cursorY: number,
): number {
	let columnX = PAGE_MARGIN;
	for (const column of getAttendanceTableColumns(labels)) {
		drawCell(page, {
			x: columnX,
			y: cursorY - TABLE_HEADER_HEIGHT,
			width: column.width,
			height: TABLE_HEADER_HEIGHT,
			text: column.label,
			font: fontBold,
			fontSize: TABLE_HEADER_FONT_SIZE,
			alignment: column.alignment,
			fillColor: TABLE_HEADER_FILL_COLOR,
		});
		columnX += column.width;
	}

	return cursorY - TABLE_HEADER_HEIGHT;
}

/**
 * Draws one attendance day row.
 *
 * @param page - PDF page to render on
 * @param font - Regular font
 * @param row - Daily attendance row
 * @param labels - Localized report copy
 * @param cursorY - Current top cursor position
 * @returns Updated cursor Y after the row
 */
function drawAttendanceRow(
	page: PDFPage,
	font: PDFFont,
	row: AttendanceEmployeePdfGroup['rows'][number],
	labels: AttendanceReportLabels,
	cursorY: number,
): number {
	let columnX = PAGE_MARGIN;
	const tableColumns = getAttendanceTableColumns(labels);
	const values = [row.day, row.firstEntry, row.lastExit, row.totalHours, ''];

	for (let index = 0; index < tableColumns.length; index += 1) {
		const column = tableColumns[index];
		const value = values[index];
		const isSignatureColumn = index === tableColumns.length - 1;
		drawCell(page, {
			x: columnX,
			y: cursorY - TABLE_ROW_HEIGHT,
			width: column.width,
			height: TABLE_ROW_HEIGHT,
			text: isSignatureColumn ? undefined : value,
			font,
			fontSize: ROW_FONT_SIZE,
			alignment: column.alignment,
		});
		columnX += column.width;
	}

	return cursorY - TABLE_ROW_HEIGHT;
}

/**
 * Draws the total row for an employee block.
 *
 * @param page - PDF page to render on
 * @param fontBold - Bold font
 * @param totalWorkedMinutes - Accumulated worked minutes
 * @param labels - Localized report copy
 * @param cursorY - Current top cursor position
 * @returns Updated cursor Y after the total row
 */
function drawTotalRow(
	page: PDFPage,
	fontBold: PDFFont,
	totalWorkedMinutes: number,
	labels: AttendanceReportLabels,
	cursorY: number,
): number {
	let columnX = PAGE_MARGIN;
	const tableColumns = getAttendanceTableColumns(labels);
	const values = [labels.totalLabel, '', '', formatWorkedMinutes(totalWorkedMinutes), ''];

	for (let index = 0; index < tableColumns.length; index += 1) {
		const column = tableColumns[index];
		const value = values[index];
		const isSignatureColumn = index === tableColumns.length - 1;
		drawCell(page, {
			x: columnX,
			y: cursorY - TABLE_TOTAL_HEIGHT,
			width: column.width,
			height: TABLE_TOTAL_HEIGHT,
			text: isSignatureColumn ? undefined : value,
			font: fontBold,
			fontSize: ROW_FONT_SIZE,
			alignment: column.alignment,
			fillColor: TABLE_TOTAL_FILL_COLOR,
			textColor: TEXT_COLOR,
		});
		columnX += column.width;
	}

	return cursorY - TABLE_TOTAL_HEIGHT;
}

/**
 * Builds a printable attendance report PDF grouped by employee.
 *
 * @param input - Attendance report payload
 * @returns Serialized PDF bytes
 */
export async function buildAttendanceReportPdf(
	input: BuildAttendanceReportPdfInput,
): Promise<Uint8Array> {
	const pdfDocument = await PDFDocument.create();
	const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
	const labels = input.labels ?? DEFAULT_ATTENDANCE_REPORT_LABELS;
	const periodLabel = `${formatDateKey(input.dateRange.startDateKey)} - ${formatDateKey(
		input.dateRange.endDateKey,
	)}`;

	let page = pdfDocument.addPage(PageSizes.Letter);
	let cursorY = drawReportHeader(page, font, fontBold, input.title, periodLabel, labels);

	for (const group of input.groups) {
		if (cursorY - MINIMUM_BLOCK_OPENING_HEIGHT < PAGE_MARGIN) {
			page = pdfDocument.addPage(PageSizes.Letter);
			cursorY = drawReportHeader(page, font, fontBold, input.title, periodLabel, labels);
		}

		cursorY = drawEmployeeSectionHeader(page, font, fontBold, group, periodLabel, labels, cursorY);

		for (const row of group.rows) {
			if (cursorY - TABLE_ROW_HEIGHT < PAGE_MARGIN) {
				page = pdfDocument.addPage(PageSizes.Letter);
				cursorY = drawReportHeader(page, font, fontBold, input.title, periodLabel, labels);
				cursorY = drawEmployeeSectionHeader(page, font, fontBold, group, periodLabel, labels, cursorY);
			}

			cursorY = drawAttendanceRow(page, font, row, labels, cursorY);
		}

		if (cursorY - TABLE_TOTAL_HEIGHT < PAGE_MARGIN) {
			page = pdfDocument.addPage(PageSizes.Letter);
			cursorY = drawReportHeader(page, font, fontBold, input.title, periodLabel, labels);
			cursorY = drawEmployeeSectionHeader(page, font, fontBold, group, periodLabel, labels, cursorY);
		}

		cursorY = drawTotalRow(page, fontBold, group.totalWorkedMinutes, labels, cursorY);
		cursorY -= SECTION_GAP;
	}

	return pdfDocument.save();
}
