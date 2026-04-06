import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGenerateObject = mock(async () => ({
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
}));

mock.module('ai', () => ({
	generateObject: mockGenerateObject,
}));

mock.module('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: () => (modelId: string) => ({ modelId }),
}));

describe('document-ai service', () => {
	const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

	beforeEach(() => {
		mockGenerateObject.mockClear();
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
	});
});
