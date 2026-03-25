import { deleteAsync } from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

/** Default max side used for recognition uploads. */
export const DEFAULT_RECOGNITION_IMAGE_MAX_SIDE_PX = 720;

/** Default JPEG compression used for recognition uploads. */
export const DEFAULT_RECOGNITION_IMAGE_COMPRESSION = 0.6;

/**
 * Minimal captured image shape required by the recognition preprocess pipeline.
 */
export interface RecognitionSourceImage {
	/** Local URI returned by the camera capture API. */
	uri: string;
	/** Captured image width in pixels. */
	width: number;
	/** Captured image height in pixels. */
	height: number;
}

/**
 * Processed image payload ready to send to the recognition API.
 */
export interface PreparedRecognitionImage {
	/** Local URI of the processed file for preview rendering. */
	previewUri: string;
	/** Base64 payload sent to the API. */
	base64: string;
	/** Approximate JSON payload size in bytes. */
	payloadBytes: number;
	/** Preprocessing duration in milliseconds. */
	preprocessMs: number;
}

/**
 * Builds a resize action that clamps the longest image side to the configured max size.
 *
 * @param source - Captured camera image metadata
 * @param maxSidePx - Maximum side length in pixels
 * @returns Expo ImageManipulator resize action
 */
function buildResizeAction(
	source: RecognitionSourceImage,
	maxSidePx: number,
): { resize: { width?: number; height?: number } } {
	if (source.width >= source.height) {
		return {
			resize: {
				width: Math.min(source.width, maxSidePx),
			},
		};
	}

	return {
		resize: {
			height: Math.min(source.height, maxSidePx),
		},
	};
}

/**
 * Resizes and recompresses a camera photo before converting it to the final Base64 payload.
 *
 * @param source - Captured camera photo metadata
 * @returns Processed image payload ready for upload
 * @throws Error when the processed image cannot be converted to Base64
 */
export async function prepareRecognitionImage(
	source: RecognitionSourceImage,
): Promise<PreparedRecognitionImage> {
	const startedAt = performance.now();
	const processedImage = await manipulateAsync(
		source.uri,
		[buildResizeAction(source, DEFAULT_RECOGNITION_IMAGE_MAX_SIDE_PX)],
		{
			base64: true,
			compress: DEFAULT_RECOGNITION_IMAGE_COMPRESSION,
			format: SaveFormat.JPEG,
		},
	);

	if (!processedImage.base64) {
		throw new Error('Processed recognition image is missing base64 data');
	}

	return {
		previewUri: processedImage.uri,
		base64: processedImage.base64,
		payloadBytes: JSON.stringify({ image: processedImage.base64 }).length,
		preprocessMs: performance.now() - startedAt,
	};
}

/**
 * Removes a temporary processed recognition image from the cache when it is no longer needed.
 *
 * @param uri - Local file URI to delete
 * @returns Promise that resolves when cleanup completes
 */
export async function cleanupRecognitionImage(uri: string | null | undefined): Promise<void> {
	if (!uri?.startsWith('file://')) {
		return;
	}

	try {
		await deleteAsync(uri, { idempotent: true });
	} catch (error) {
		console.warn('[recognition-image] Failed to delete temporary processed image', error);
	}
}
