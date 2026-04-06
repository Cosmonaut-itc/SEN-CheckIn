import { createCanvas } from '@napi-rs/canvas';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import { z } from 'zod';

const EXTRACTION_MODEL_ID = 'openai/gpt-4o';
const MAX_IMAGE_DIMENSION = 2048;
const JPEG_QUALITY = 85;

const SYSTEM_PROMPT = `Analiza este documento y extrae todos los empleados que encuentres.
Para cada persona, extrae: nombre(s), apellido(s), y sueldo/salario si está visible.
El documento puede ser una nómina, lista de personal, recibo de pago, u otro documento laboral mexicano.
Si un campo no es legible o no existe, devuelve null para ese campo.
Asigna un score de confianza (0-1) a cada campo basado en qué tan legible/claro es el dato.
NO incluyas encabezados, totales, firmas, o datos que no sean personas reales.`;

export const extractedEmployeesSchema = z.object({
	employees: z.array(
		z.object({
			firstName: z.string(),
			lastName: z.string(),
			dailyPay: z.number().nullable(),
			confidence: z.number().min(0).max(1),
			fieldConfidence: z.object({
				firstName: z.number().min(0).max(1),
				lastName: z.number().min(0).max(1),
				dailyPay: z.number().min(0).max(1),
			}),
		}),
	),
});

export type ExtractedEmployee = z.infer<typeof extractedEmployeesSchema>['employees'][number];

export interface ExtractionResult {
	employees: ExtractedEmployee[];
}

export interface ProcessingProgress {
	step: 'uploading' | 'processing' | 'extracting';
	currentPage?: number;
	totalPages?: number;
	message: string;
}

type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Creates the OpenRouter model instance lazily so imports stay side-effect free.
 *
 * @returns Configured OpenRouter model for structured extraction
 * @throws {Error} When OPENROUTER_API_KEY is missing
 */
function getExtractionModel() {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY environment variable is required.');
	}

	const openrouter = createOpenRouter({ apiKey });
	return openrouter(EXTRACTION_MODEL_ID);
}

/**
 * Extracts employee data from a single image using structured AI output.
 *
 * @param base64Image - Base64-encoded image data
 * @param mimeType - Media type associated with the encoded image
 * @returns Structured employee extraction result
 */
export async function extractEmployeesFromImage(
	base64Image: string,
	mimeType: string,
): Promise<ExtractionResult> {
	const { object } = await generateObject({
		model: getExtractionModel(),
		schema: extractedEmployeesSchema,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'text', text: SYSTEM_PROMPT },
					{ type: 'image', image: base64Image, mediaType: mimeType },
				],
			},
		],
	});

	return { employees: object.employees };
}

/**
 * Converts an uploaded image into a normalized JPEG payload for the model.
 *
 * @param buffer - Raw source image buffer
 * @returns Base64-encoded processed JPEG image
 */
async function convertToProcessableImage(buffer: Buffer): Promise<string> {
	const processedBuffer = await sharp(buffer)
		.rotate()
		.resize({
			width: MAX_IMAGE_DIMENSION,
			height: MAX_IMAGE_DIMENSION,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();

	return processedBuffer.toString('base64');
}

/**
 * Renders each page of a PDF into a PNG image buffer.
 *
 * @param buffer - Raw PDF document buffer
 * @returns Image buffers for each rendered page
 */
async function extractPagesFromPdf(buffer: Buffer): Promise<Buffer[]> {
	const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
	const pages: Buffer[] = [];

	for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
		const page = await pdfDocument.getPage(pageIndex);
		const viewport = page.getViewport({ scale: 2 });
		const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
		const context = canvas.getContext('2d');

		await page.render({
			canvas: canvas as never,
			canvasContext: context as never,
			viewport,
		}).promise;

		pages.push(canvas.toBuffer('image/png'));
	}

	return pages;
}

/**
 * Processes an uploaded document and extracts employees from its contents.
 *
 * @param fileBuffer - Raw uploaded file buffer
 * @param mimeType - Uploaded file media type
 * @param onProgress - Optional callback for progress updates
 * @returns Extracted employees and processed page count
 */
export async function processDocument(
	fileBuffer: Buffer,
	mimeType: string,
	onProgress?: ProgressCallback,
): Promise<ExtractionResult & { pagesProcessed: number }> {
	if (mimeType === 'application/pdf') {
		onProgress?.({
			step: 'processing',
			message: 'Extrayendo páginas del PDF...',
		});

		const pageBuffers = await extractPagesFromPdf(fileBuffer);
		const employees: ExtractedEmployee[] = [];

		for (let pageIndex = 0; pageIndex < pageBuffers.length; pageIndex += 1) {
			onProgress?.({
				step: 'processing',
				currentPage: pageIndex + 1,
				totalPages: pageBuffers.length,
				message: `Procesando página ${pageIndex + 1} de ${pageBuffers.length}...`,
			});
			onProgress?.({
				step: 'extracting',
				currentPage: pageIndex + 1,
				totalPages: pageBuffers.length,
				message: `Extrayendo datos de la página ${pageIndex + 1}...`,
			});

			const base64Image = await convertToProcessableImage(pageBuffers[pageIndex] ?? Buffer.alloc(0));
			const result = await extractEmployeesFromImage(base64Image, 'image/jpeg');
			employees.push(...result.employees);
		}

		return {
			employees,
			pagesProcessed: pageBuffers.length,
		};
	}

	onProgress?.({
		step: 'processing',
		currentPage: 1,
		totalPages: 1,
		message: 'Procesando imagen...',
	});
	onProgress?.({
		step: 'extracting',
		currentPage: 1,
		totalPages: 1,
		message: 'Extrayendo datos del documento...',
	});

	const base64Image = await convertToProcessableImage(fileBuffer);
	const result = await extractEmployeesFromImage(base64Image, 'image/jpeg');

	return {
		employees: result.employees,
		pagesProcessed: 1,
	};
}
