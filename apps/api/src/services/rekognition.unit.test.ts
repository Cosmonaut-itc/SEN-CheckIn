import { describe, expect, it } from 'bun:test';

/**
 * Restores process environment variables after a test callback finishes.
 *
 * @param callback - Test logic to run with temporary environment changes
 * @returns Promise resolving when the callback completes
 * @throws Re-throws any error raised by the callback
 */
async function withRestoredEnvironment(callback: () => Promise<void>): Promise<void> {
	const originalAwsRegion = process.env.AWS_REGION;
	const originalAwsRegionRkg = process.env.AWS_REGION_RKG;

	try {
		await callback();
	} finally {
		if (originalAwsRegion === undefined) {
			delete process.env.AWS_REGION;
		} else {
			process.env.AWS_REGION = originalAwsRegion;
		}

		if (originalAwsRegionRkg === undefined) {
			delete process.env.AWS_REGION_RKG;
		} else {
			process.env.AWS_REGION_RKG = originalAwsRegionRkg;
		}
	}
}

describe('rekognition service', () => {
	it('normalizes client setup failures for face searches', async () => {
		await withRestoredEnvironment(async () => {
			delete process.env.AWS_REGION;
			delete process.env.AWS_REGION_RKG;

			const { RekognitionServiceError, searchUsersByImage } = await import('./rekognition.js');
			const searchPromise = searchUsersByImage(new Uint8Array([1, 2, 3]));

			await expect(searchPromise).rejects.toBeInstanceOf(RekognitionServiceError);
			await expect(searchPromise).rejects.toMatchObject({
				errorCode: 'REKOGNITION_UPSTREAM_FAILURE',
				httpStatus: 503,
			});
		});
	});
});
