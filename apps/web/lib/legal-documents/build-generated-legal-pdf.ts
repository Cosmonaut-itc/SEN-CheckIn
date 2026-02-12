import type { PDFFont } from 'pdf-lib';

const PDF_PAGE_MARGIN = 48;
const PDF_DEFAULT_FONT_SIZE = 11;
const PDF_DEFAULT_LINE_HEIGHT_FACTOR = 1.35;
const PDF_TEXT_COLOR = { red: 0.1, green: 0.1, blue: 0.1 } as const;

type PdfTextAlignment = 'left' | 'center' | 'right';

interface PdfParagraphBlock {
	text: string;
	alignment: PdfTextAlignment;
	fontSize: number;
	isBold: boolean;
	lineHeight: number;
	marginTop: number;
	marginBottom: number;
}

interface ActaClassicContent {
	title: string;
	intro: string;
	notice: string;
	reason: string;
	closing: string;
	dateLine: string;
	workerLabel: string;
	workerName: string;
	witnessLeftLabel: string;
	witnessRightLabel: string;
	witnessLeftName: string;
	witnessRightName: string;
}

const ACTA_CLASSIC_LAYOUT_SELECTOR = '[data-layout="acta-classic-v1"]';

/**
 * Normalizes reason text so it always starts with a dash prefix.
 *
 * @param value - Raw reason text
 * @returns Normalized reason text
 */
function normalizeActaReason(value: string): string {
	const cleaned = sanitizePdfText(value);
	if (cleaned.length === 0) {
		return '';
	}
	if (cleaned.startsWith('-')) {
		return cleaned;
	}
	return `-${cleaned}`;
}

/**
 * Extracts plain text for a semantic acta role from template HTML.
 *
 * @param root - Root acta template element
 * @param role - Semantic role key
 * @returns Text value or empty string
 */
function extractActaRoleText(root: HTMLElement, role: string): string {
	const element = root.querySelector(`[data-acta-role="${role}"]`);
	if (!(element instanceof HTMLElement)) {
		return '';
	}
	return extractElementText(element);
}

/**
 * Extracts semantic content for the classic acta layout, when present.
 *
 * @param html - Rendered legal HTML
 * @returns Acta content payload or null for non-classic layouts
 */
export function extractActaClassicContent(html: string): ActaClassicContent | null {
	const parser = new DOMParser();
	const parsed = parser.parseFromString(html, 'text/html');
	const root = parsed.querySelector(ACTA_CLASSIC_LAYOUT_SELECTOR);
	if (!(root instanceof HTMLElement)) {
		return null;
	}

	const title = extractActaRoleText(root, 'title');
	const intro = extractActaRoleText(root, 'intro');
	const notice = extractActaRoleText(root, 'notice');
	const reason = normalizeActaReason(extractActaRoleText(root, 'reason'));
	const closing = extractActaRoleText(root, 'closing');
	const dateLine = extractActaRoleText(root, 'date');
	const workerLabel = extractActaRoleText(root, 'worker-label') || 'TRABAJADOR.';
	const workerName = extractActaRoleText(root, 'worker-name');
	const witnessLeftLabel = extractActaRoleText(root, 'witness-left-label') || 'Testigo.';
	const witnessRightLabel = extractActaRoleText(root, 'witness-right-label') || 'Testigo.';
	const witnessLeftName = extractActaRoleText(root, 'witness-left-name');
	const witnessRightName = extractActaRoleText(root, 'witness-right-name');

	if (
		title.length === 0 ||
		intro.length === 0 ||
		notice.length === 0 ||
		reason.length === 0 ||
		closing.length === 0 ||
		dateLine.length === 0 ||
		workerName.length === 0
	) {
		return null;
	}

	return {
		title,
		intro,
		notice,
		reason,
		closing,
		dateLine,
		workerLabel,
		workerName,
		witnessLeftLabel,
		witnessRightLabel,
		witnessLeftName,
		witnessRightName,
	};
}

/**
 * Replaces HTML tags with text separators to preserve readable blocks.
 *
 * @param html - Raw HTML content
 * @returns HTML string with newline separators
 */
function normalizeHtmlBlocks(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(
			/<\/(p|div|section|article|header|footer|li|h1|h2|h3|h4|h5|h6|blockquote|tr)>/gi,
			'\n',
		)
		.replace(/<li[^>]*>/gi, '- ');
}

/**
 * Cleans plain text for PDF rendering.
 *
 * @param value - Raw text value
 * @returns Sanitized plain text
 */
function sanitizePdfText(value: string): string {
	return value
		.replace(/\u00a0/g, ' ')
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Converts pixel values to PDF points.
 *
 * @param pxValue - Pixel value
 * @returns Point value
 */
function pxToPt(pxValue: number): number {
	return pxValue * 0.75;
}

/**
 * Parses a CSS inline style string.
 *
 * @param styleValue - Raw style attribute
 * @returns Style map
 */
function parseInlineStyles(styleValue: string | null): Record<string, string> {
	if (!styleValue) {
		return {};
	}

	return styleValue
		.split(';')
		.map((segment) => segment.trim())
		.filter((segment) => segment.includes(':'))
		.reduce<Record<string, string>>((accumulator, segment) => {
			const [rawKey, ...rawValue] = segment.split(':');
			const key = rawKey.trim().toLowerCase();
			const value = rawValue.join(':').trim().toLowerCase();
			if (key.length > 0 && value.length > 0) {
				accumulator[key] = value;
			}
			return accumulator;
		}, {});
}

/**
 * Parses numeric CSS sizes expressed as px or pt.
 *
 * @param value - CSS size value
 * @returns Point size or null when unsupported
 */
function parseCssSizeToPt(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	const pxMatch = normalized.match(/^(-?\d+(?:\.\d+)?)px$/);
	if (pxMatch) {
		return pxToPt(Number(pxMatch[1]));
	}

	const ptMatch = normalized.match(/^(-?\d+(?:\.\d+)?)pt$/);
	if (ptMatch) {
		return Number(ptMatch[1]);
	}

	const unitlessMatch = normalized.match(/^(-?\d+(?:\.\d+)?)$/);
	if (unitlessMatch) {
		return Number(unitlessMatch[1]);
	}

	return null;
}

/**
 * Resolves text alignment from inline styles.
 *
 * @param styleMap - Inline style map
 * @param fallback - Fallback alignment
 * @returns Alignment value
 */
function resolveTextAlignment(
	styleMap: Record<string, string>,
	fallback: PdfTextAlignment,
): PdfTextAlignment {
	const value = styleMap['text-align'];
	if (value === 'center') {
		return 'center';
	}
	if (value === 'right') {
		return 'right';
	}
	return fallback;
}

/**
 * Resolves paragraph font size from semantic tag and inline styles.
 *
 * @param tagName - HTML tag name
 * @param styleMap - Inline style map
 * @returns Font size in points
 */
function resolveFontSize(tagName: string, styleMap: Record<string, string>): number {
	const inlineFontSize = parseCssSizeToPt(styleMap['font-size']);
	if (inlineFontSize && inlineFontSize > 0) {
		return inlineFontSize;
	}

	if (tagName === 'h1') {
		return 16;
	}
	if (tagName === 'h2') {
		return 14;
	}
	if (tagName === 'h3') {
		return 13;
	}
	return PDF_DEFAULT_FONT_SIZE;
}

/**
 * Resolves whether the paragraph should use bold font.
 *
 * @param tagName - HTML tag name
 * @param styleMap - Inline style map
 * @returns True when bold weight should be applied
 */
function resolveBold(tagName: string, styleMap: Record<string, string>): boolean {
	if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
		return true;
	}

	const fontWeight = styleMap['font-weight'];
	if (!fontWeight) {
		return false;
	}
	if (fontWeight === 'bold') {
		return true;
	}
	const numericWeight = Number(fontWeight);
	return Number.isFinite(numericWeight) && numericWeight >= 600;
}

/**
 * Extracts text content preserving explicit line breaks.
 *
 * @param element - HTML element
 * @returns Sanitized text content
 */
function extractElementText(element: HTMLElement): string {
	const withBreaks = element.innerHTML.replace(/<br\s*\/?>/gi, '\n');
	const plainText = withBreaks.replace(/<[^>]+>/g, '');
	return sanitizePdfText(plainText);
}

/**
 * Resolves top/bottom paragraph margins from inline styles.
 *
 * @param styleMap - Inline style map
 * @returns Margins in points
 */
function resolveParagraphMargins(styleMap: Record<string, string>): {
	marginTop: number;
	marginBottom: number;
} {
	return {
		marginTop: parseCssSizeToPt(styleMap['margin-top']) ?? 0,
		marginBottom: parseCssSizeToPt(styleMap['margin-bottom']) ?? 6,
	};
}

/**
 * Resolves paragraph line height from inline styles.
 *
 * @param styleMap - Inline style map
 * @param fontSize - Font size in points
 * @returns Line height in points
 */
function resolveLineHeight(styleMap: Record<string, string>, fontSize: number): number {
	const styleLineHeight = styleMap['line-height']?.trim();
	if (!styleLineHeight) {
		return fontSize * PDF_DEFAULT_LINE_HEIGHT_FACTOR;
	}

	const ptValue = parseCssSizeToPt(styleLineHeight);
	if (ptValue && ptValue > 0) {
		return ptValue;
	}

	const multiplierMatch = styleLineHeight.match(/^(\d+(?:\.\d+)?)$/);
	if (multiplierMatch) {
		return fontSize * Number(multiplierMatch[1]);
	}

	return fontSize * PDF_DEFAULT_LINE_HEIGHT_FACTOR;
}

/**
 * Extracts renderable paragraph blocks from template HTML.
 *
 * @param html - Rendered legal HTML
 * @returns Paragraph blocks for PDF rendering
 */
function extractParagraphBlocksFromHtml(html: string): PdfParagraphBlock[] {
	const parser = new DOMParser();
	const parsed = parser.parseFromString(normalizeHtmlBlocks(html), 'text/html');
	const blocks: PdfParagraphBlock[] = [];

	/**
	 * Traverses DOM nodes and collects paragraph-like blocks.
	 *
	 * @param node - Current node
	 * @param inheritedAlignment - Alignment inherited from parent
	 * @returns Nothing
	 */
	const walk = (node: Node, inheritedAlignment: PdfTextAlignment): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = sanitizePdfText(node.textContent ?? '');
			if (text.length > 0) {
				blocks.push({
					text,
					alignment: inheritedAlignment,
					fontSize: PDF_DEFAULT_FONT_SIZE,
					isBold: false,
					lineHeight: PDF_DEFAULT_FONT_SIZE * PDF_DEFAULT_LINE_HEIGHT_FACTOR,
					marginTop: 0,
					marginBottom: 4,
				});
			}
			return;
		}

		if (!(node instanceof HTMLElement)) {
			return;
		}

		const styleMap = parseInlineStyles(node.getAttribute('style'));
		const resolvedAlignment = resolveTextAlignment(styleMap, inheritedAlignment);
		const tagName = node.tagName.toLowerCase();

		if (tagName === 'p' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
			const text = extractElementText(node);
			if (text.length === 0) {
				return;
			}

			const fontSize = resolveFontSize(tagName, styleMap);
			const { marginTop, marginBottom } = resolveParagraphMargins(styleMap);
			const lineHeight = resolveLineHeight(styleMap, fontSize);
			blocks.push({
				text,
				alignment: resolvedAlignment,
				fontSize,
				isBold: resolveBold(tagName, styleMap),
				lineHeight,
				marginTop,
				marginBottom,
			});
			return;
		}

		Array.from(node.childNodes).forEach((childNode) => {
			walk(childNode, resolvedAlignment);
		});
	};

	walk(parsed.body, 'left');
	return blocks;
}

/**
 * Splits a long word into chunks that fit the available width.
 *
 * @param args - Word split parameters
 * @returns Width-safe chunks
 */
function splitWordToFit(args: {
	word: string;
	font: PDFFont;
	fontSize: number;
	maxWidth: number;
}): string[] {
	const chunks: string[] = [];
	let buffer = '';

	for (const character of args.word) {
		const candidate = `${buffer}${character}`;
		const candidateWidth = args.font.widthOfTextAtSize(candidate, args.fontSize);
		if (candidateWidth <= args.maxWidth) {
			buffer = candidate;
			continue;
		}

		if (buffer.length > 0) {
			chunks.push(buffer);
			buffer = character;
			continue;
		}

		chunks.push(character);
		buffer = '';
	}

	if (buffer.length > 0) {
		chunks.push(buffer);
	}

	return chunks;
}

/**
 * Wraps paragraph text into lines that fit the PDF content width.
 *
 * @param args - Wrapping parameters
 * @returns Wrapped lines
 */
function wrapParagraphLines(args: {
	text: string;
	font: PDFFont;
	fontSize: number;
	maxWidth: number;
}): string[] {
	const words = args.text.split(/\s+/).filter((word) => word.length > 0);
	if (words.length === 0) {
		return [];
	}

	const lines: string[] = [];
	let currentLine = '';

	/**
	 * Pushes current line and resets working buffer.
	 *
	 * @returns Nothing
	 */
	function pushCurrentLine(): void {
		if (currentLine.length === 0) {
			return;
		}
		lines.push(currentLine);
		currentLine = '';
	}

	for (const rawWord of words) {
		const wordChunks = splitWordToFit({
			word: rawWord,
			font: args.font,
			fontSize: args.fontSize,
			maxWidth: args.maxWidth,
		});

		for (const wordChunk of wordChunks) {
			const candidateLine =
				currentLine.length === 0 ? wordChunk : `${currentLine} ${wordChunk}`;
			const candidateWidth = args.font.widthOfTextAtSize(candidateLine, args.fontSize);

			if (candidateWidth <= args.maxWidth) {
				currentLine = candidateLine;
				continue;
			}

			pushCurrentLine();
			currentLine = wordChunk;
		}
	}

	pushCurrentLine();
	return lines;
}

/**
 * Generates a PDF document from legal HTML content.
 *
 * @param args - PDF build parameters
 * @returns Serialized PDF bytes
 */
export async function buildGeneratedLegalPdfFromHtml(args: {
	title: string;
	html: string;
}): Promise<Uint8Array> {
	const { PDFDocument, PageSizes, StandardFonts, rgb } = await import('pdf-lib');
	const pdfDoc = await PDFDocument.create();
	const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	let page = pdfDoc.addPage(PageSizes.Letter);
	let cursorY = page.getHeight() - PDF_PAGE_MARGIN;

	/**
	 * Returns current writable width for the active page.
	 *
	 * @returns Content width in points
	 */
	function getContentWidth(): number {
		return page.getWidth() - PDF_PAGE_MARGIN * 2;
	}

	/**
	 * Ensures there is enough vertical space for the next line, otherwise adds a page.
	 *
	 * @param lineHeight - Line height to reserve
	 * @returns Nothing
	 */
	function ensurePageCapacity(lineHeight: number): void {
		if (cursorY - lineHeight >= PDF_PAGE_MARGIN) {
			return;
		}
		page = pdfDoc.addPage(PageSizes.Letter);
		cursorY = page.getHeight() - PDF_PAGE_MARGIN;
	}

	/**
	 * Resolves aligned X coordinate constrained to a custom horizontal segment.
	 *
	 * @param args - Segment alignment arguments
	 * @returns X position in points
	 */
	function resolveAlignedXInSegment(args: {
		text: string;
		font: PDFFont;
		fontSize: number;
		alignment: PdfTextAlignment;
		startX: number;
		width: number;
	}): number {
		const textWidth = args.font.widthOfTextAtSize(args.text, args.fontSize);
		if (args.alignment === 'center') {
			return args.startX + (args.width - textWidth) / 2;
		}
		if (args.alignment === 'right') {
			return args.startX + args.width - textWidth;
		}
		return args.startX;
	}

	/**
	 * Draws a text block with wrapping and custom segment alignment.
	 *
	 * @param args - Drawing arguments
	 * @returns Nothing
	 */
	function drawTextBlock(args: {
		text: string;
		font: PDFFont;
		fontSize: number;
		lineHeight: number;
		alignment: PdfTextAlignment;
		startX?: number;
		width?: number;
		marginTop: number;
		marginBottom: number;
	}): void {
		cursorY -= args.marginTop;
		const startX = args.startX ?? PDF_PAGE_MARGIN;
		const width = args.width ?? getContentWidth();
		const textChunks = args.text.split('\n').map((chunk) => chunk.trim()).filter(Boolean);

		textChunks.forEach((chunk) => {
			const wrappedLines = wrapParagraphLines({
				text: chunk,
				font: args.font,
				fontSize: args.fontSize,
				maxWidth: width,
			});

			wrappedLines.forEach((line) => {
				ensurePageCapacity(args.lineHeight);
				page.drawText(line, {
					x: resolveAlignedXInSegment({
						text: line,
						font: args.font,
						fontSize: args.fontSize,
						alignment: args.alignment,
						startX,
						width,
					}),
					y: cursorY,
					size: args.fontSize,
					font: args.font,
					color: rgb(PDF_TEXT_COLOR.red, PDF_TEXT_COLOR.green, PDF_TEXT_COLOR.blue),
				});
				cursorY -= args.lineHeight;
			});
		});

		cursorY -= args.marginBottom;
	}

	/**
	 * Draws the classic acta administrative layout with fixed signature/witness structure.
	 *
	 * @param content - Semantic acta content
	 * @returns Nothing
	 */
	function drawActaClassicLayout(content: ActaClassicContent): void {
		const bodyFontSize = 12;
		const bodyLineHeight = 14.2;
		const sectionGap = 30;
		const lineColor = rgb(PDF_TEXT_COLOR.red, PDF_TEXT_COLOR.green, PDF_TEXT_COLOR.blue);

		drawTextBlock({
			text: content.title,
			font: boldFont,
			fontSize: 16,
			lineHeight: 19,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 50,
		});

		drawTextBlock({
			text: content.intro,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 22,
		});

		drawTextBlock({
			text: content.notice,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 24,
		});

		drawTextBlock({
			text: content.reason,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 26,
		});

		drawTextBlock({
			text: content.closing,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 30,
		});

		drawTextBlock({
			text: content.dateLine,
			font: boldFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 24,
		});

		drawTextBlock({
			text: content.workerLabel,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: 16,
		});

		ensurePageCapacity(120);

		const workerLineWidth = 230;
		const workerLineStartX = (page.getWidth() - workerLineWidth) / 2;
		page.drawLine({
			start: { x: workerLineStartX, y: cursorY },
			end: { x: workerLineStartX + workerLineWidth, y: cursorY },
			thickness: 1,
			color: lineColor,
		});
		cursorY -= 16;

		drawTextBlock({
			text: content.workerName,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'center',
			marginTop: 0,
			marginBottom: sectionGap,
		});

		ensurePageCapacity(120);

		const witnessGap = 40;
		const witnessColumnWidth = (getContentWidth() - witnessGap) / 2;
		const witnessLeftStartX = PDF_PAGE_MARGIN;
		const witnessRightStartX = witnessLeftStartX + witnessColumnWidth + witnessGap;

		drawTextBlock({
			text: content.witnessLeftLabel,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'left',
			startX: witnessLeftStartX,
			width: witnessColumnWidth,
			marginTop: 0,
			marginBottom: 0,
		});
		drawTextBlock({
			text: content.witnessRightLabel,
			font: bodyFont,
			fontSize: bodyFontSize,
			lineHeight: bodyLineHeight,
			alignment: 'left',
			startX: witnessRightStartX,
			width: witnessColumnWidth,
			marginTop: -bodyLineHeight,
			marginBottom: 0,
		});

		cursorY -= 26;

		page.drawLine({
			start: { x: witnessLeftStartX, y: cursorY },
			end: { x: witnessLeftStartX + witnessColumnWidth, y: cursorY },
			thickness: 1,
			color: lineColor,
		});
		page.drawLine({
			start: { x: witnessRightStartX, y: cursorY },
			end: { x: witnessRightStartX + witnessColumnWidth, y: cursorY },
			thickness: 1,
			color: lineColor,
		});

		cursorY -= 18;

		if (content.witnessLeftName.trim().length > 0) {
			drawTextBlock({
				text: content.witnessLeftName,
				font: bodyFont,
				fontSize: bodyFontSize,
				lineHeight: bodyLineHeight,
				alignment: 'left',
				startX: witnessLeftStartX,
				width: witnessColumnWidth,
				marginTop: 0,
				marginBottom: 0,
			});
		}
		if (content.witnessRightName.trim().length > 0) {
			drawTextBlock({
				text: content.witnessRightName,
				font: bodyFont,
				fontSize: bodyFontSize,
				lineHeight: bodyLineHeight,
				alignment: 'left',
				startX: witnessRightStartX,
				width: witnessColumnWidth,
				marginTop: content.witnessLeftName.trim().length > 0 ? -bodyLineHeight : 0,
				marginBottom: 0,
			});
		}
	}

	const actaClassicContent = extractActaClassicContent(args.html);
	if (actaClassicContent) {
		drawActaClassicLayout(actaClassicContent);
		return pdfDoc.save({ useObjectStreams: false });
	}

	const parsedBlocks = extractParagraphBlocksFromHtml(args.html);
	const blocks = parsedBlocks.length
		? parsedBlocks
		: [
				{
					text: sanitizePdfText(args.title),
					alignment: 'center' as const,
					fontSize: 16,
					isBold: true,
					lineHeight: 22,
					marginTop: 0,
					marginBottom: 12,
				},
				{
					text: sanitizePdfText(args.html),
					alignment: 'left' as const,
					fontSize: PDF_DEFAULT_FONT_SIZE,
					isBold: false,
					lineHeight: PDF_DEFAULT_FONT_SIZE * PDF_DEFAULT_LINE_HEIGHT_FACTOR,
					marginTop: 0,
					marginBottom: 6,
				},
		  ];

	blocks.forEach((block) => {
		drawTextBlock({
			text: block.text,
			font: block.isBold ? boldFont : bodyFont,
			fontSize: block.fontSize,
			lineHeight: block.lineHeight,
			alignment: block.alignment,
			marginTop: block.marginTop,
			marginBottom: block.marginBottom,
		});
	});

	return pdfDoc.save({ useObjectStreams: false });
}
