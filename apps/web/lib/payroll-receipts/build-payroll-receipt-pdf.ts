import { format } from 'date-fns';
import {
	PDFDocument,
	PageSizes,
	StandardFonts,
	rgb,
	type PDFPage,
	type PDFFont,
} from 'pdf-lib';

import type { PayrollRun, PayrollRunEmployee } from '@/lib/client-functions';

type PayrollReceiptLine = {
	label: string;
	value: number;
};

type PayrollReceiptSummary = {
	label: string;
	value: number;
	color: { r: number; g: number; b: number };
};

type PayrollReceiptInput = {
	run: PayrollRun;
	employee: PayrollRunEmployee;
	organizationName?: string | null;
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
 * @returns MXN formatted string or placeholder
 */
function formatCurrency(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return '—';
	}
	return CURRENCY_FORMATTER.format(value);
}

/**
 * Formats a date value for display.
 *
 * @param value - Date instance or ISO string
 * @returns Formatted date or placeholder
 */
function formatDate(value: Date | string | null | undefined): string {
	if (!value) {
		return '—';
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return '—';
	}
	return format(date, 'dd/MM/yyyy');
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
function wrapText(
	text: string,
	font: PDFFont,
	fontSize: number,
	maxWidth: number,
): string[] {
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
 * @returns Nothing
 */
function drawSummaryRow(
	page: PDFPage,
	row: PayrollReceiptSummary,
	font: PDFFont,
	fontBold: PDFFont,
	x: number,
	y: number,
	width: number,
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
	drawRightAlignedText(
		page,
		formatCurrency(row.value),
		fontBold,
		10,
		x + width,
		y,
	);
}

/**
 * Draws a line-item column (Ingresos or Deducciones).
 *
 * @param page - PDF page to render on
 * @param title - Column title
 * @param lines - Line items to render
 * @param totalValue - Column total
 * @param x - Left coordinate
 * @param y - Top baseline coordinate
 * @param width - Column width
 * @param font - Regular font
 * @param fontBold - Bold font
 * @returns Y coordinate after rendering
 */
function drawLineItemsColumn(
	page: PDFPage,
	title: string,
	lines: PayrollReceiptLine[],
	totalValue: number,
	x: number,
	y: number,
	width: number,
	font: PDFFont,
	fontBold: PDFFont,
): number {
	let cursorY = y;
	page.drawText(title, {
		x,
		y: cursorY,
		size: 11,
		font: fontBold,
	});
	cursorY -= 16;

	const resolvedLines = lines.length > 0 ? lines : [{ label: 'Sin conceptos', value: 0 }];

	for (const line of resolvedLines) {
		page.drawText(line.label, {
			x,
			y: cursorY,
			size: 9.5,
			font,
			color: COLOR_MUTED,
		});
		drawRightAlignedText(
			page,
			formatCurrency(line.value),
			font,
			9.5,
			x + width,
			cursorY,
			COLOR_MUTED,
		);
		cursorY -= 14;
	}

	page.drawRectangle({
		x,
		y: cursorY + 6,
		width,
		height: 0.6,
		color: COLOR_BORDER,
	});
	cursorY -= 8;

	page.drawText('Total', {
		x,
		y: cursorY,
		size: 10,
		font: fontBold,
	});
	drawRightAlignedText(
		page,
		formatCurrency(totalValue),
		fontBold,
		10,
		x + width,
		cursorY,
	);
	cursorY -= 16;

	return cursorY;
}

/**
 * Builds a payroll receipt PDF for a single employee line.
 *
 * @param input - Receipt data including run + employee line
 * @returns Serialized PDF bytes
 */
export async function buildPayrollReceiptPdf(
	input: PayrollReceiptInput,
): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	const page = pdfDoc.addPage(PageSizes.Letter);
	const { width, height } = page.getSize();
	const margin = 40;
	const contentWidth = width - margin * 2;

	const taxBreakdown = input.employee.taxBreakdown ?? null;
	const grossPay = toNumber(taxBreakdown?.grossPay ?? input.employee.totalPay);
	const employeeWithholdingsTotal = toNumber(taxBreakdown?.employeeWithholdings?.total);
	const employerCostsTotal = toNumber(taxBreakdown?.employerCosts?.total);
	const netPay = toNumber(taxBreakdown?.netPay ?? grossPay - employeeWithholdingsTotal);
	const companyCost = toNumber(taxBreakdown?.companyCost ?? grossPay + employerCostsTotal);

	let cursorY = height - margin;
	page.drawText('Recibo de nómina', {
		x: margin,
		y: cursorY,
		size: 16,
		font: fontBold,
	});
	if (input.organizationName) {
		page.drawText(input.organizationName, {
			x: margin,
			y: cursorY - 16,
			size: 10,
			font,
			color: COLOR_MUTED,
		});
		cursorY -= 18;
	}
	cursorY -= 20;

	page.drawText('Resumen fiscal', {
		x: margin,
		y: cursorY,
		size: 12,
		font: fontBold,
	});
	cursorY -= 16;

	const summaryRows: PayrollReceiptSummary[] = [
		{
			label: 'Tu trabajo vale para la empresa',
			value: companyCost,
			color: SUMMARY_COLOR_POSITIVE,
		},
		{
			label: 'La empresa te paga',
			value: grossPay,
			color: SUMMARY_COLOR_POSITIVE,
		},
		{
			label: 'La empresa le paga al gobierno por tu cuenta',
			value: employerCostsTotal,
			color: SUMMARY_COLOR_WARNING,
		},
		{
			label: 'Después, el gobierno te quita',
			value: employeeWithholdingsTotal,
			color: SUMMARY_COLOR_NEGATIVE,
		},
		{
			label: 'Te quedan',
			value: netPay,
			color: SUMMARY_COLOR_POSITIVE,
		},
	];

	for (const row of summaryRows) {
		drawSummaryRow(page, row, font, fontBold, margin, cursorY, contentWidth);
		cursorY -= 14;
	}

	cursorY -= 12;

	const detailsHeight = 82;
	page.drawRectangle({
		x: margin,
		y: cursorY - detailsHeight,
		width: contentWidth,
		height: detailsHeight,
		borderWidth: 1,
		borderColor: COLOR_BORDER,
	});

	const detailLeftX = margin + 12;
	const detailRightX = margin + contentWidth / 2 + 6;
	let detailY = cursorY - 18;

	const employeeName = input.employee.employeeName || '—';
	const employeeCode = input.employee.employeeCode || '—';
	const employeeNss = input.employee.employeeNss || '—';
	const employeeRfc = input.employee.employeeRfc || '—';

	page.drawText(`Empleado: ${employeeName}`, {
		x: detailLeftX,
		y: detailY,
		size: 10,
		font,
	});
	detailY -= 14;
	page.drawText(`Clave: ${employeeCode}`, {
		x: detailLeftX,
		y: detailY,
		size: 10,
		font,
	});
	detailY -= 14;
	page.drawText(`NSS: ${employeeNss}`, {
		x: detailLeftX,
		y: detailY,
		size: 10,
		font,
	});
	detailY -= 14;
	page.drawText(`RFC: ${employeeRfc}`, {
		x: detailLeftX,
		y: detailY,
		size: 10,
		font,
	});

	let detailRightY = cursorY - 18;
	const periodLabel = `${formatDate(input.run.periodStart)} - ${formatDate(input.run.periodEnd)}`;
	const processedAt = formatDate(input.run.processedAt ?? input.run.createdAt);

	page.drawText(`Periodo: ${periodLabel}`, {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText(`Fecha de pago: ${processedAt}`, {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText('Forma de pago: Efectivo (100%)', {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});
	detailRightY -= 14;
	page.drawText('Pago tarjeta: 0.00', {
		x: detailRightX,
		y: detailRightY,
		size: 10,
		font,
	});

	cursorY -= detailsHeight + 20;

	const incomeLines: PayrollReceiptLine[] = [
		{ label: 'Sueldo normal', value: toNumber(input.employee.normalPay) },
		{ label: 'Horas extra dobles', value: toNumber(input.employee.overtimeDoublePay) },
		{ label: 'Horas extra triples', value: toNumber(input.employee.overtimeTriplePay) },
		{ label: 'Prima dominical', value: toNumber(input.employee.sundayPremiumAmount) },
		{
			label: 'Descanso obligatorio',
			value: toNumber(input.employee.mandatoryRestDayPremiumAmount),
		},
		{ label: 'Vacaciones', value: toNumber(input.employee.vacationPayAmount) },
		{ label: 'Prima vacacional', value: toNumber(input.employee.vacationPremiumAmount) },
		{
			label: 'Séptimo día',
			value: toNumber(taxBreakdown?.seventhDayPay),
		},
	].filter((line) => line.value > 0);

	if (incomeLines.length === 0) {
		incomeLines.push({ label: 'Sueldo', value: grossPay });
	}

	const deductionLines: PayrollReceiptLine[] = [
		{
			label: 'ISR',
			value: toNumber(taxBreakdown?.employeeWithholdings?.isrWithheld),
		},
		{
			label: 'IMSS',
			value: toNumber(taxBreakdown?.employeeWithholdings?.imssEmployee?.total),
		},
		{
			label: 'INFONAVIT',
			value: toNumber(taxBreakdown?.employeeWithholdings?.infonavitCredit),
		},
	].filter((line) => line.value > 0);

	const incomeTotal = incomeLines.reduce((acc, line) => acc + line.value, 0);
	const deductionTotal = deductionLines.reduce((acc, line) => acc + line.value, 0);

	const columnGap = 24;
	const columnWidth = (contentWidth - columnGap) / 2;
	const leftBottom = drawLineItemsColumn(
		page,
		'Ingresos',
		incomeLines,
		incomeTotal,
		margin,
		cursorY,
		columnWidth,
		font,
		fontBold,
	);
	const rightBottom = drawLineItemsColumn(
		page,
		'Deducciones',
		deductionLines,
		deductionTotal,
		margin + columnWidth + columnGap,
		cursorY,
		columnWidth,
		font,
		fontBold,
	);

	cursorY = Math.min(leftBottom, rightBottom) - 8;

	page.drawText('Neto recibido', {
		x: margin,
		y: cursorY,
		size: 12,
		font: fontBold,
	});
	drawRightAlignedText(page, formatCurrency(netPay), fontBold, 12, margin + contentWidth, cursorY);
	cursorY -= 26;

	const receiptMessage = `Recibí de ${input.organizationName ?? 'la empresa'} la cantidad descrita en este recibo, correspondiente al periodo ${periodLabel}.`;
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
	page.drawText('Firma del empleado', {
		x: margin,
		y: signatureY - 12,
		size: 9,
		font,
		color: COLOR_MUTED,
	});

	return pdfDoc.save();
}
