import { format } from 'date-fns';
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

import type { PtuRun, PtuRunEmployee } from '@/lib/client-functions';

type ReceiptLine = {
	label: string;
	value: number;
};

type ReceiptSummary = {
	label: string;
	value: number;
	color: { r: number; g: number; b: number };
};

type PtuReceiptInput = {
	run: PtuRun;
	employee: PtuRunEmployee;
	organizationName?: string | null;
	t: (key: string, values?: Record<string, string | number>) => string;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
});

const SUMMARY_COLOR_POSITIVE = { r: 0.06, g: 0.5, b: 0.3 };
const SUMMARY_COLOR_WARNING = { r: 0.8, g: 0.5, b: 0.1 };
const SUMMARY_COLOR_NEGATIVE = { r: 0.78, g: 0.2, b: 0.2 };
const COLOR_MUTED = rgb(0.42, 0.42, 0.42);
const COLOR_BORDER = rgb(0.85, 0.85, 0.85);

/**
 * Converts a value into a safe number.
 *
 * @param value - Incoming numeric value or string
 * @returns Normalized numeric value
 */
function toNumber(value: number | string | null | undefined): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return 0;
}

/**
 * Formats a currency value, falling back to a dash when missing.
 *
 * @param value - Numeric value to format
 * @param placeholder - Placeholder text when value is missing
 * @returns MXN formatted string or placeholder
 */
function formatCurrency(value: number | null | undefined, placeholder: string): string {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return placeholder;
	}
	return CURRENCY_FORMATTER.format(value);
}

/**
 * Formats a date value for display.
 *
 * @param value - Date instance or ISO string
 * @param placeholder - Placeholder text when date is missing
 * @param dateFormat - date-fns format string
 * @returns Formatted date or placeholder
 */
function formatDate(
	value: Date | string | null | undefined,
	placeholder: string,
	dateFormat: string,
): string {
	if (!value) {
		return placeholder;
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return placeholder;
	}
	return format(date, dateFormat);
}

/**
 * Wraps text into multiple lines based on font width.
 *
 * @param text - Source text to wrap
 * @param font - PDF font used to measure width
 * @param fontSize - Font size in points
 * @param maxWidth - Max width allowed per line
 * @returns Array of wrapped lines
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		const candidate = currentLine ? `${currentLine} ${word}` : word;
		const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);
		if (candidateWidth <= maxWidth) {
			currentLine = candidate;
			continue;
		}
		if (currentLine) {
			lines.push(currentLine);
		}
		currentLine = word;
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
}

/**
 * Draws a right-aligned text value.
 *
 * @param page - Target PDF page
 * @param text - Text content to draw
 * @param font - Font for measuring and drawing
 * @param fontSize - Font size in points
 * @param rightX - Right edge alignment coordinate
 * @param y - Baseline Y coordinate
 * @param color - Optional text color
 * @returns Nothing
 */
function drawRightAlignedText(
	page: PDFPage,
	text: string,
	font: PDFFont,
	fontSize: number,
	rightX: number,
	y: number,
	color = rgb(0, 0, 0),
): void {
	const textWidth = font.widthOfTextAtSize(text, fontSize);
	page.drawText(text, {
		x: rightX - textWidth,
		y,
		size: fontSize,
		font,
		color,
	});
}

/**
 * Draws a labeled summary row with a color accent bar.
 *
 * @param page - PDF page to render on
 * @param row - Summary row definition
 * @param font - Regular font
 * @param fontBold - Bold font
 * @param x - Left coordinate
 * @param y - Baseline coordinate
 * @param width - Available row width
 * @param formatValue - Formats currency values
 * @returns Nothing
 */
function drawSummaryRow(
	page: PDFPage,
	row: ReceiptSummary,
	font: PDFFont,
	fontBold: PDFFont,
	x: number,
	y: number,
	width: number,
	formatValue: (value: number) => string,
): void {
	page.drawRectangle({
		x,
		y: y - 2,
		width: 4,
		height: 10,
		color: rgb(row.color.r, row.color.g, row.color.b),
	});
	page.drawText(row.label, {
		x: x + 10,
		y,
		size: 10,
		font,
		color: COLOR_MUTED,
	});
	drawRightAlignedText(page, formatValue(row.value), fontBold, 10, x + width, y);
}

/**
 * Draws a line-item column (Ingresos or Deducciones).
 *
 * @param page - PDF page to render on
 * @param title - Column title
 * @param lines - Line items for the column
 * @param total - Column total value
 * @param x - Left coordinate
 * @param y - Starting Y coordinate
 * @param width - Column width
 * @param font - Regular font
 * @param fontBold - Bold font
 * @param totalLabel - Total label
 * @param emptyLabel - Empty placeholder label
 * @param formatValue - Currency formatter
 * @returns Final Y coordinate after rendering
 */
function drawLineItemsColumn(
	page: PDFPage,
	title: string,
	lines: ReceiptLine[],
	total: number,
	x: number,
	y: number,
	width: number,
	font: PDFFont,
	fontBold: PDFFont,
	totalLabel: string,
	emptyLabel: string,
	formatValue: (value: number) => string,
): number {
	let cursorY = y;
	page.drawText(title, { x, y: cursorY, size: 11, font: fontBold });
	cursorY -= 14;

	if (lines.length === 0) {
		page.drawText(emptyLabel, { x, y: cursorY, size: 9, font, color: COLOR_MUTED });
		cursorY -= 12;
	} else {
		for (const line of lines) {
			page.drawText(line.label, { x, y: cursorY, size: 9, font });
			drawRightAlignedText(page, formatValue(line.value), font, 9, x + width, cursorY);
			cursorY -= 12;
		}
	}

	page.drawLine({
		start: { x, y: cursorY },
		end: { x: x + width, y: cursorY },
		thickness: 0.6,
		color: COLOR_BORDER,
	});
	cursorY -= 12;
	page.drawText(totalLabel, { x, y: cursorY, size: 9, font: fontBold });
	drawRightAlignedText(page, formatValue(total), fontBold, 9, x + width, cursorY);
	return cursorY - 8;
}

/**
 * Builds a PTU receipt PDF document.
 *
 * @param input - PTU receipt inputs
 * @returns Serialized PDF bytes
 */
export async function buildPtuReceiptPdf(input: PtuReceiptInput): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	const page = pdfDoc.addPage(PageSizes.A4);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	const { width, height } = page.getSize();
	const margin = 40;
	const contentWidth = width - margin * 2;

	const placeholder = input.t('placeholder');
	const formatCurrencyValue = (value: number): string =>
		formatCurrency(value, placeholder);
	const formatDateValue = (value: Date | string | null | undefined): string =>
		formatDate(value, placeholder, input.t('dateFormat'));

	let cursorY = height - margin;

	page.drawText(input.t('title'), {
		x: margin,
		y: cursorY,
		size: 16,
		font: fontBold,
	});

	cursorY -= 24;

	const grossAmount = toNumber(input.employee.ptuFinal);
	const withheldIsr = toNumber(input.employee.withheldIsr);
	const netAmount = toNumber(input.employee.netAmount);

	const summaryRows: ReceiptSummary[] = [
		{
			label: input.t('summary.rows.gross'),
			value: grossAmount,
			color: SUMMARY_COLOR_POSITIVE,
		},
		{
			label: input.t('summary.rows.withheld'),
			value: withheldIsr,
			color: SUMMARY_COLOR_WARNING,
		},
		{
			label: input.t('summary.rows.net'),
			value: netAmount,
			color: SUMMARY_COLOR_NEGATIVE,
		},
	];

	page.drawText(input.t('summary.title'), {
		x: margin,
		y: cursorY,
		size: 11,
		font: fontBold,
	});
	cursorY -= 14;

	for (const row of summaryRows) {
		drawSummaryRow(page, row, font, fontBold, margin, cursorY, contentWidth, formatCurrencyValue);
		cursorY -= 16;
	}

	cursorY -= 6;

	const detailsHeight = 70;
	const detailLeftX = margin;
	const detailRightX = margin + contentWidth * 0.5;
	const detailY = cursorY;

	page.drawRectangle({
		x: margin,
		y: detailY - detailsHeight + 6,
		width: contentWidth,
		height: detailsHeight,
		borderWidth: 0.6,
		borderColor: COLOR_BORDER,
	});

	const employeeName = input.employee.employeeName || placeholder;
	const employeeCode = input.employee.employeeCode || placeholder;
	const employeeNss = input.employee.employeeNss || placeholder;
	const employeeRfc = input.employee.employeeRfc || placeholder;
	const folio = `${input.t('concept')}-${input.run.id.slice(0, 8)}-${employeeCode}`;

	let detailLeftY = cursorY - 18;
	page.drawText(input.t('details.employee', { value: employeeName }), {
		x: detailLeftX,
		y: detailLeftY,
		size: 10,
		font,
	});
	detailLeftY -= 14;
	page.drawText(input.t('details.code', { value: employeeCode }), {
		x: detailLeftX,
		y: detailLeftY,
		size: 10,
		font,
	});
	detailLeftY -= 14;
	page.drawText(input.t('details.nss', { value: employeeNss }), {
		x: detailLeftX,
		y: detailLeftY,
		size: 10,
		font,
	});
	detailLeftY -= 14;
	page.drawText(input.t('details.rfc', { value: employeeRfc }), {
		x: detailLeftX,
		y: detailLeftY,
		size: 10,
		font,
	});

	let detailRightY = cursorY - 18;
	page.drawText(input.t('details.period', { value: String(input.run.fiscalYear) }), {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText(input.t('details.paymentDate', { value: formatDateValue(input.run.paymentDate) }), {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText(input.t('details.paymentMethod', { value: input.t('paymentMethods.cash') }), {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText(input.t('details.folio', { value: folio }), {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});

	cursorY -= detailsHeight + 20;

	const incomeLines: ReceiptLine[] = [
		{
			label: input.t('income.lines.ptu'),
			value: grossAmount,
		},
	];

	const deductionLines: ReceiptLine[] = [
		{
			label: input.t('deductions.lines.isr'),
			value: withheldIsr,
		},
	].filter((line) => line.value > 0);

	const incomeTotal = incomeLines.reduce((acc, line) => acc + line.value, 0);
	const deductionTotal = deductionLines.reduce((acc, line) => acc + line.value, 0);

	const columnGap = 24;
	const columnWidth = (contentWidth - columnGap) / 2;
	const leftBottom = drawLineItemsColumn(
		page,
		input.t('income.title'),
		incomeLines,
		incomeTotal,
		margin,
		cursorY,
		columnWidth,
		font,
		fontBold,
		input.t('total'),
		input.t('lineItems.empty'),
		formatCurrencyValue,
	);
	const rightBottom = drawLineItemsColumn(
		page,
		input.t('deductions.title'),
		deductionLines,
		deductionTotal,
		margin + columnWidth + columnGap,
		cursorY,
		columnWidth,
		font,
		fontBold,
		input.t('total'),
		input.t('lineItems.empty'),
		formatCurrencyValue,
	);

	cursorY = Math.min(leftBottom, rightBottom) - 8;

	page.drawText(input.t('netReceived'), {
		x: margin,
		y: cursorY,
		size: 12,
		font: fontBold,
	});
	drawRightAlignedText(
		page,
		formatCurrencyValue(netAmount),
		fontBold,
		12,
		margin + contentWidth,
		cursorY,
	);
	cursorY -= 26;

	const organizationLabel = input.organizationName ?? input.t('organizationFallback');
	const receiptMessage = input.t('receiptMessage', {
		organization: organizationLabel,
		period: String(input.run.fiscalYear),
	});
	const receiptLines = wrapText(receiptMessage, font, 9, contentWidth);
	for (const line of receiptLines) {
		page.drawText(line, {
			x: margin,
			y: cursorY,
			size: 9,
			font,
			color: COLOR_MUTED,
		});
		cursorY -= 12;
	}

	const signatureY = cursorY - 18;
	page.drawRectangle({
		x: margin,
		y: signatureY,
		width: contentWidth * 0.55,
		height: 0.6,
		color: COLOR_BORDER,
	});
	page.drawText(input.t('signature'), {
		x: margin,
		y: signatureY - 12,
		size: 9,
		font,
		color: COLOR_MUTED,
	});

	return pdfDoc.save();
}
