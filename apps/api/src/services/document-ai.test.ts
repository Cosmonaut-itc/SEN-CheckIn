import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

const { zodSchema: actualZodSchema, Output: actualOutput } = await import('ai');

const MAX_PDF_PAGES = 20;
const MAX_PDF_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface MockSharpChain {
	rotate: () => MockSharpChain;
	resize: () => MockSharpChain;
	jpeg: () => MockSharpChain;
	toBuffer: () => Promise<Buffer>;
}

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
const mockSharpRotate = mock(function (this: MockSharpChain) {
	return this;
});
const mockSharpResize = mock(function (this: MockSharpChain) {
	return this;
});
const mockSharpJpeg = mock(function (this: MockSharpChain) {
	return this;
});
const mockSharpToBuffer = mock(async () => Buffer.from('processed-image'));
const mockHeicConvert = mock(async () => new Uint8Array([0x48, 0x45, 0x49, 0x43]));
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
	output: {
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
	output: {
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

interface GenerateTextCall {
	messages?: unknown[];
	output?: {
		name?: string;
		parseCompleteOutput?: unknown;
		parsePartialOutput?: unknown;
	};
}

const mockOutputObject = mock((options: Parameters<typeof actualOutput.object>[0]) =>
	actualOutput.object(options),
);
const mockGenerateText = mock(async (args?: GenerateTextCall) => {
	void args;

	return {
		output: mockGenerateObjectPayload.output,
	};
});

mock.module('ai', () => ({
	generateText: mockGenerateText,
	Output: {
		object: mockOutputObject,
	},
}));

mock.module('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: () => (modelId: string) => ({ modelId }),
}));

mock.module('@napi-rs/canvas', () => ({
	createCanvas: mockCreateCanvas,
}));

mock.module('heic-convert', () => ({
	default: mockHeicConvert,
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
		mockGenerateText.mockClear();
		mockOutputObject.mockClear();
		mockPdfGetDocument.mockClear();
		mockPdfGetPage.mockClear();
		mockCreateCanvas.mockClear();
		mockSharp.mockClear();
		mockSharpRotate.mockClear();
		mockSharpResize.mockClear();
		mockSharpJpeg.mockClear();
		mockSharpToBuffer.mockClear();
		mockHeicConvert.mockClear();
		mockPdfPageCount = 0;
		mockGenerateObjectPayload = {
			output: {
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
		expect(mockGenerateText).toHaveBeenCalledTimes(1);
		expect(mockOutputObject).toHaveBeenCalledTimes(1);
	});

	it('normalizes null employee names from OCR output', async () => {
		mockGenerateObjectPayload = {
			output: {
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

	it('builds a structured output schema with required nullable employee name fields', async () => {
		const { extractedEmployeesResponseSchema } = await import('./document-ai.js');
		const jsonSchema = (await Promise.resolve(actualZodSchema(extractedEmployeesResponseSchema).jsonSchema)) as {
			properties?: {
				employees?: {
					items?: {
						properties?: {
							firstName?: { type?: string | string[] };
							lastName?: { type?: string | string[] };
						};
						required?: string[];
					};
				};
			};
		};
		const employeeItemSchema = jsonSchema.properties?.employees?.items;
		const requiredFields = Array.isArray(employeeItemSchema?.required)
			? employeeItemSchema.required
			: [];
		const firstNameTypes = employeeItemSchema?.properties?.firstName?.type;
		const lastNameTypes = employeeItemSchema?.properties?.lastName?.type;

		expect(requiredFields).toContain('firstName');
		expect(requiredFields).toContain('lastName');
		expect(firstNameTypes).toEqual(expect.arrayContaining(['string', 'null']));
		expect(lastNameTypes).toEqual(expect.arrayContaining(['string', 'null']));
	});

	it('returns empty array when no employees are found', async () => {
		mockGenerateText.mockResolvedValueOnce({
			output: {
				employees: [],
			},
		});
		const fakeBase64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		const result = await extractEmployeesFromImage(fakeBase64, 'image/png');

		expect(result.employees).toHaveLength(0);
	});

	it('uses AI SDK v6 Output.object structured output', async () => {
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		await extractEmployeesFromImage('fake-base64', 'image/png');

		expect(mockGenerateText).toHaveBeenCalledTimes(1);
		expect(mockGenerateText.mock.calls.at(0)?.[0]).toMatchObject({
			output: {
				name: 'object',
				parseCompleteOutput: expect.any(Function),
				parsePartialOutput: expect.any(Function),
			},
		});
	});

	it('sends a multimodal user message with the original image mime type', async () => {
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		await extractEmployeesFromImage('fake-base64', 'image/png');

		expect(mockGenerateText.mock.calls.at(0)?.[0]).toMatchObject({
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text' },
						{
							type: 'image',
							image: 'fake-base64',
							mediaType: 'image/png',
						},
					],
				},
			],
		});
	});

	it('fails fast when OPENROUTER_API_KEY is missing', async () => {
		delete process.env.OPENROUTER_API_KEY;
		const { extractEmployeesFromImage } = await import('./document-ai.js');

		await expect(extractEmployeesFromImage('fake-base64', 'image/png')).rejects.toThrow(
			'OPENROUTER_API_KEY environment variable is required.',
		);
		expect(mockGenerateText).not.toHaveBeenCalled();
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

	it('converts HEIC images to JPEG before sending them to AI SDK', async () => {
		const heicBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
		const { processDocument } = await import('./document-ai.js');

		const result = await processDocument(heicBuffer, 'image/heic');

		expect(result.pagesProcessed).toBe(1);
		expect(mockHeicConvert).toHaveBeenCalledTimes(1);
		expect(mockSharp).toHaveBeenCalledWith(Buffer.from([0x48, 0x45, 0x49, 0x43]));
		expect(mockGenerateText.mock.calls.at(0)?.[0]).toMatchObject({
			messages: [
				{
					content: [
						{ type: 'text' },
						{ type: 'image', mediaType: 'image/jpeg' },
					],
				},
			],
		});
	});

	it('propagates HEIC conversion failures without calling AI SDK', async () => {
		mockHeicConvert.mockRejectedValueOnce(new Error('HEIC conversion failed'));
		const { processDocument } = await import('./document-ai.js');

		await expect(processDocument(Buffer.from([0x01, 0x02]), 'image/heif')).rejects.toThrow(
			'HEIC conversion failed',
		);
		expect(mockGenerateText).not.toHaveBeenCalled();
	});

	it('processes valid PDF pages one by one and reports the final page count', async () => {
		mockPdfPageCount = 2;
		const { processDocument } = await import('./document-ai.js');

		const result = await processDocument(Buffer.from('%PDF-1.4'), 'application/pdf');

		expect(result.pagesProcessed).toBe(2);
		expect(result.employees).toHaveLength(2);
		expect(mockPdfGetPage).toHaveBeenNthCalledWith(1, 1);
		expect(mockPdfGetPage).toHaveBeenNthCalledWith(2, 2);
		expect(mockGenerateText).toHaveBeenCalledTimes(2);
	});

	it('stops rendering further PDF pages after the current extraction fails', async () => {
		mockPdfPageCount = 3;
		mockGenerateText.mockRejectedValueOnce(new Error('OCR failed'));
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
		expect(mockGenerateText).not.toHaveBeenCalled();
	});

	it('rejects oversized PDFs before loading them with pdfjs', async () => {
		const { processDocument } = await import('./document-ai.js');

		await expect(
			processDocument(Buffer.alloc(MAX_PDF_FILE_SIZE_BYTES + 1), 'application/pdf'),
		).rejects.toThrow('El PDF excede el tamaño máximo permitido de 10MB.');
		expect(mockPdfGetDocument).not.toHaveBeenCalled();
		expect(mockGenerateText).not.toHaveBeenCalled();
	});

	it('rejects unsupported mime types before processing them as images', async () => {
		const { processDocument } = await import('./document-ai.js');

		await expect(processDocument(Buffer.from('plain-text'), 'text/plain')).rejects.toThrow(
			'Formato no soportado. Usa JPG, PNG, HEIC o PDF.',
		);
		expect(mockSharp).not.toHaveBeenCalled();
		expect(mockGenerateText).not.toHaveBeenCalled();
	});
});
