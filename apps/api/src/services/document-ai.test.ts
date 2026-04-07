import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

const MAX_PDF_PAGES = 20;

let mockPdfPageCount = 0;
const mockPdfGetPage = mock(async (pageIndex: number) => {
	void pageIndex;

	return {
		getViewport: () => ({ width: 1, height: 1 }),
		render: () => ({
			promise: Promise.resolve(),
		}),
	};
});
const mockPdfGetDocument = mock(() => ({
	promise: Promise.resolve({
		numPages: mockPdfPageCount,
		getPage: mockPdfGetPage,
	}),
}));
const mockCreateCanvas = mock(() => ({
	getContext: () => ({}),
	toBuffer: () => Buffer.from('rendered-page'),
}));
const mockSharpRotate = mock(function () {
	return this;
});
const mockSharpResize = mock(function () {
	return this;
});
const mockSharpJpeg = mock(function () {
	return this;
});
const mockSharpToBuffer = mock(async () => Buffer.from('processed-image'));
const mockSharp = mock((buffer: Buffer) => {
	void buffer;

	return {
		rotate: mockSharpRotate,
		resize: mockSharpResize,
		jpeg: mockSharpJpeg,
		toBuffer: mockSharpToBuffer,
	};
});
let mockGenerateObjectPayload: {
	object: {
		employees: Array<{
			firstName: string | null;
			lastName: string | null;
			dailyPay: number | null;
			confidence: number;
			fieldConfidence: {
				firstName: number;
				lastName: number;
				dailyPay: number;
			};
		}>;
	};
} = {
	object: {
		employees: [
			{
				firstName: 'Juan',
				lastName: 'Pérez',
				dailyPay: 450,
				confidence: 0.95,
				fieldConfidence: {
					firstName: 0.98,
					lastName: 0.95,
					dailyPay: 0.9,
				},
			},
		],
	},
};

const mockGenerateObject = mock(async (args?: { schema?: { parse: (input: unknown) => unknown } }) => ({
	object: args?.schema
		? (args.schema.parse(mockGenerateObjectPayload.object) as typeof mockGenerateObjectPayload.object)
		: mockGenerateObjectPayload.object,
}));

mock.module('ai', () => ({
	generateObject: mockGenerateObject,
}));

mock.module('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: () => (modelId: string) => ({ modelId }),
}));

mock.module('@napi-rs/canvas', () => ({
	createCanvas: mockCreateCanvas,
}));

mock.module('pdfjs-dist/legacy/build/pdf.mjs', () => ({
	getDocument: mockPdfGetDocument,
}));

mock.module('sharp', () => ({
	default: mockSharp,
}));

afterAll(() => {
	mock.restore();
});

describe('document-ai service', () => {
	const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

	beforeEach(() => {
		mockGenerateObject.mockClear();
		mockPdfGetDocument.mockClear();
		mockPdfGetPage.mockClear();
		mockCreateCanvas.mockClear();
		mockSharp.mockClear();
		mockSharpRotate.mockClear();
		mockSharpResize.mockClear();
		mockSharpJpeg.mockClear();
		mockSharpToBuffer.mockClear();
		mockPdfPageCount = 0;
		mockGenerateObjectPayload = {
			object: {
				employees: [
					{
						firstName: 'Juan',
						lastName: 'Pérez',
						dailyPay: 450,
						confidence: 0.95,
						fieldConfidence: {
							firstName: 0.98,
							lastName: 0.95,
							dailyPay: 0.9,
						},
					},
				],
			},
		};
		process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
	});

	afterEach(() => {
		if (originalOpenRouterApiKey === undefined) {
			delete process.env.OPENROUTER_API_KEY;
			return;
		}

		process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
	});

	it('returns extracted employees from a base64 image', async () => {
		const fakeBase64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		const result = await extractEmployeesFromImage(fakeBase64, 'image/png');

		expect(result.employees).toHaveLength(1);
		expect(result.employees[0]?.firstName).toBe('Juan');
		expect(result.employees[0]?.lastName).toBe('Pérez');
		expect(result.employees[0]?.dailyPay).toBe(450);
		expect(result.employees[0]?.confidence).toBe(0.95);
		expect(mockGenerateObject).toHaveBeenCalledTimes(1);
	});

	it('normalizes null employee names from OCR output', async () => {
		mockGenerateObjectPayload = {
			object: {
				employees: [
					{
						firstName: null,
						lastName: null,
						dailyPay: null,
						confidence: 0.95,
						fieldConfidence: {
							firstName: 0.3,
							lastName: 0.4,
							dailyPay: 0.8,
						},
					},
				],
			},
		};
		const { extractEmployeesFromImage } = await import('./document-ai.js');
		const result = await extractEmployeesFromImage('fake-base64', 'image/png');

		expect(result.employees[0]?.firstName).toBe('');
		expect(result.employees[0]?.lastName).toBe('');
	});

	it('returns empty array when no employees are found', async () => {
		mockGenerateObject.mockResolvedValueOnce({
			object: {
				employees: [],
			},
		});
		const fakeBase64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		const result = await extractEmployeesFromImage(fakeBase64, 'image/png');

		expect(result.employees).toHaveLength(0);
	});

	it('processes a single image file and reports progress', async () => {
		const validImageBuffer = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
			'base64',
		);
		const progressUpdates: Array<{
			step: string;
			currentPage?: number;
			totalPages?: number;
			message: string;
		}> = [];
		const { processDocument } = await import('./document-ai.js');

		const result = await processDocument(validImageBuffer, 'image/png', (progress) => {
			progressUpdates.push(progress);
		});

		expect(result.employees).toHaveLength(1);
		expect(result.pagesProcessed).toBe(1);
		expect(progressUpdates.length).toBeGreaterThan(0);
		expect(progressUpdates[0]?.step).toBe('processing');
		expect(mockSharp).toHaveBeenCalledWith(validImageBuffer);
		expect(mockSharpRotate).toHaveBeenCalledTimes(1);
		expect(mockSharpResize).toHaveBeenCalledTimes(1);
		expect(mockSharpJpeg).toHaveBeenCalledTimes(1);
		expect(mockSharpToBuffer).toHaveBeenCalledTimes(1);
	});

	it('processes valid PDF pages one by one and reports the final page count', async () => {
		mockPdfPageCount = 2;
		const { processDocument } = await import('./document-ai.js');

		const result = await processDocument(Buffer.from('%PDF-1.4'), 'application/pdf');

		expect(result.pagesProcessed).toBe(2);
		expect(result.employees).toHaveLength(2);
		expect(mockPdfGetPage).toHaveBeenNthCalledWith(1, 1);
		expect(mockPdfGetPage).toHaveBeenNthCalledWith(2, 2);
		expect(mockGenerateObject).toHaveBeenCalledTimes(2);
	});

	it('stops rendering further PDF pages after the current extraction fails', async () => {
		mockPdfPageCount = 3;
		mockGenerateObject.mockRejectedValueOnce(new Error('OCR failed'));
		const { processDocument } = await import('./document-ai.js');

		await expect(processDocument(Buffer.from('%PDF-1.4'), 'application/pdf')).rejects.toThrow(
			'OCR failed',
		);
		expect(mockPdfGetPage).toHaveBeenCalledTimes(1);
	});

	it('rejects PDFs that exceed the maximum supported page count', async () => {
		mockPdfPageCount = MAX_PDF_PAGES + 5;
		const { processDocument } = await import('./document-ai.js');

		await expect(processDocument(Buffer.from('%PDF-1.4'), 'application/pdf')).rejects.toThrow(
			`El PDF excede el máximo permitido de ${MAX_PDF_PAGES} páginas.`,
		);
		expect(mockPdfGetPage).not.toHaveBeenCalled();
		expect(mockGenerateObject).not.toHaveBeenCalled();
	});
});
