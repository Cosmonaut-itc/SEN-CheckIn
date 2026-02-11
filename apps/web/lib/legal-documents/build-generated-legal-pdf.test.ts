import { describe, expect, it } from 'vitest';

import { buildGeneratedLegalPdfFromHtml } from '@/lib/legal-documents/build-generated-legal-pdf';

/**
 * Converts PDF header bytes to string.
 *
 * @param bytes - PDF byte array
 * @returns Header string
 */
function readPdfHeader(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes.slice(0, 5));
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
});
