import { describe, expect, it } from 'vitest';
import { buildDefaultLegalTemplateHtml } from '@sen-checkin/types';
import { inflateSync } from 'node:zlib';

import {
	buildGeneratedLegalPdfFromHtml,
	extractActaClassicContent,
} from '@/lib/legal-documents/build-generated-legal-pdf';

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
 * Renders tokens into a legal template HTML string.
 *
 * @param html - Raw template HTML
 * @param values - Token replacements
 * @returns Rendered HTML
 */
function renderTemplateTokens(html: string, values: Record<string, string>): string {
	let rendered = html;
	Object.entries(values).forEach(([token, value]) => {
		rendered = rendered.replaceAll(token, value);
	});
	return rendered;
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
 * Extracts and inflates the first Flate-compressed PDF stream.
 *
 * @param bytes - PDF byte array
 * @returns Decoded stream text
 */
function decodeFirstFlateStream(bytes: Uint8Array): string {
	const streamToken = new TextEncoder().encode('stream\n');
	const endStreamToken = new TextEncoder().encode('\nendstream');
	const streamIndex = findTokenIndex(bytes, streamToken);
	if (streamIndex === -1) {
		throw new Error('PDF stream token was not found.');
	}
	const streamStart = streamIndex + streamToken.length;
	const streamEnd = findTokenIndex(bytes.slice(streamStart), endStreamToken);
	if (streamEnd === -1) {
		throw new Error('PDF endstream token was not found.');
	}
	const compressed = bytes.slice(streamStart, streamStart + streamEnd);
	const inflated = inflateSync(compressed);
	return new TextDecoder('latin1').decode(inflated);
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

describe('buildGeneratedLegalPdfFromHtml', () => {
	it('builds a valid PDF document from legal HTML', async () => {
		const pdfBytes = await buildGeneratedLegalPdfFromHtml({
			title: 'Acta administrativa',
			html: '<h1>Acta</h1><p>Motivo: incumplimiento.</p><p>Fecha: 2026-02-09</p>',
		});

		expect(readPdfHeader(pdfBytes)).toBe('%PDF-');
		expect(pdfBytes.length).toBeGreaterThan(500);
	});

	it('extracts semantic content for acta classic layout', () => {
		const defaultActaTemplate = buildDefaultLegalTemplateHtml('ACTA_ADMINISTRATIVA');
		expect(defaultActaTemplate).not.toContain('(nombre escrito a mano)');

		const renderedActaHtml = renderTemplateTokens(
			defaultActaTemplate,
			{
				'{{employee.locationName}}': 'Tenango del Valle',
				'{{acta.state}}': 'Estado de México',
				'{{document.generatedTimeLabel}}': '11:00 am',
				'{{document.generatedDateLong}}': '19 de julio del 2023',
				'{{acta.companyName}}': 'Molinos Don Ramón',
				'{{acta.employerTreatment}}': 'Sr.',
				'{{acta.employerName}}': 'David Soto Valencia',
				'{{acta.employerPosition}}': 'propietario',
				'{{acta.employeeTreatment}}': 'Sra',
				'{{employee.fullName}}': 'Tania Margarita Sebastián Saucedo',
				'{{disciplinary.reason}}':
					'La Sra Tania Margarita Sebastián no se presentó a trabajar.',
			},
		);

		const content = extractActaClassicContent(renderedActaHtml);
		expect(content).not.toBeNull();
		expect(content?.title).toBe('ACTA ADMINISTRATIVA');
		expect(content?.workerLabel).toBe('TRABAJADOR.');
		expect(content?.reason.startsWith('-')).toBeTruthy();
		expect(content?.witnessLeftName).toBe('');
		expect(content?.witnessRightName).toBe('');
	});

	it('renders classic acta with line operators for signature sections', async () => {
		const renderedActaHtml = renderTemplateTokens(
			buildDefaultLegalTemplateHtml('ACTA_ADMINISTRATIVA'),
			{
				'{{employee.locationName}}': 'Tenango del Valle',
				'{{acta.state}}': 'Estado de México',
				'{{document.generatedTimeLabel}}': '11:00 am',
				'{{document.generatedDateLong}}': '19 de julio del 2023',
				'{{acta.companyName}}': 'Molinos Don Ramón',
				'{{acta.employerTreatment}}': 'Sr.',
				'{{acta.employerName}}': 'David Soto Valencia',
				'{{acta.employerPosition}}': 'propietario',
				'{{acta.employeeTreatment}}': 'Sra',
				'{{employee.fullName}}': 'Tania Margarita Sebastián Saucedo',
				'{{disciplinary.reason}}':
					'La Sra Tania Margarita Sebastián no se presentó a trabajar.',
			},
		);

		const pdfBytes = await buildGeneratedLegalPdfFromHtml({
			title: 'Acta administrativa',
			html: renderedActaHtml,
		});

		const inflatedStream = decodeFirstFlateStream(pdfBytes);
		expect(inflatedStream).toContain(`<${encodeTextToHex('ACTA ADMINISTRATIVA')}>`);
		expect(inflatedStream).toContain(`<${encodeTextToHex('TRABAJADOR.')}>`);
		expect((inflatedStream.match(/ l\r?\nS/g) ?? []).length).toBeGreaterThanOrEqual(3);
	});
});
