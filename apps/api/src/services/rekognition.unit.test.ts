import { beforeEach, describe, expect, it, mock } from 'bun:test';

const rekognitionSdkMockState: {
	error: Error | null;
	response: {
		UserMatches?: unknown[];
		SearchedFace?: unknown;
		$metadata: {
			attempts?: number;
		};
	};
} = {
	error: null,
	response: {
		UserMatches: [],
		SearchedFace: undefined,
		$metadata: {
			attempts: 1,
		},
	},
};

mock.module('@aws-sdk/client-rekognition', () => {
	class MockCommand {
		constructor(public readonly input?: unknown) {}
	}

	return {
		AssociateFacesCommand: MockCommand,
		CreateCollectionCommand: MockCommand,
		CreateUserCommand: MockCommand,
		DeleteFacesCommand: MockCommand,
		DeleteUserCommand: MockCommand,
		DisassociateFacesCommand: MockCommand,
		IndexFacesCommand: MockCommand,
		ListFacesCommand: MockCommand,
		SearchUsersByImageCommand: MockCommand,
		RekognitionClient: class {
			constructor() {}

			send(): Promise<typeof rekognitionSdkMockState.response> {
				if (rekognitionSdkMockState.error) {
					return Promise.reject(rekognitionSdkMockState.error);
				}

				return Promise.resolve(rekognitionSdkMockState.response);
			}
		},
	};
});

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
	const originalCollectionId = process.env.AWS_REKOGNITION_COLLECTION_ID;
	const originalCollectionIdRkg = process.env.AWS_REKOGNITION_COLLECTION_ID_RKG;

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

		if (originalCollectionId === undefined) {
			delete process.env.AWS_REKOGNITION_COLLECTION_ID;
		} else {
			process.env.AWS_REKOGNITION_COLLECTION_ID = originalCollectionId;
		}

		if (originalCollectionIdRkg === undefined) {
			delete process.env.AWS_REKOGNITION_COLLECTION_ID_RKG;
		} else {
			process.env.AWS_REKOGNITION_COLLECTION_ID_RKG = originalCollectionIdRkg;
		}
	}
}

describe('rekognition service', () => {
	beforeEach(async () => {
		rekognitionSdkMockState.error = null;
		rekognitionSdkMockState.response = {
			UserMatches: [],
			SearchedFace: undefined,
			$metadata: {
				attempts: 1,
			},
		};

		const { resetRekognitionClientForTests } = await import('./rekognition.js');
		resetRekognitionClientForTests();
	});

	it('normalizes client setup failures for face searches', async () => {
		await withRestoredEnvironment(async () => {
			process.env.AWS_REGION = 'us-east-1';
			delete process.env.AWS_REGION_RKG;
			delete process.env.AWS_REKOGNITION_COLLECTION_ID;
			delete process.env.AWS_REKOGNITION_COLLECTION_ID_RKG;

			const { RekognitionServiceError, searchUsersByImage } = await import('./rekognition.js');
			const searchPromise = searchUsersByImage(new Uint8Array([1, 2, 3]));

			await expect(searchPromise).rejects.toBeInstanceOf(RekognitionServiceError);
			await expect(searchPromise).rejects.toMatchObject({
				errorCode: 'REKOGNITION_UPSTREAM_FAILURE',
				httpStatus: 503,
			});
		});
	});

	it('classifies timeout-like upstream errors as retryable timeouts', async () => {
		await withRestoredEnvironment(async () => {
			process.env.AWS_REGION = 'us-east-1';
			delete process.env.AWS_REGION_RKG;
			process.env.AWS_REKOGNITION_COLLECTION_ID = 'test-collection';
			delete process.env.AWS_REKOGNITION_COLLECTION_ID_RKG;

			const timeoutError = new Error('upstream request timeout');
			timeoutError.name = 'TimeoutError';
			rekognitionSdkMockState.error = timeoutError;

			const { RekognitionServiceError, searchUsersByImage } = await import('./rekognition.js');
			const searchPromise = searchUsersByImage(new Uint8Array([1, 2, 3]));

			await expect(searchPromise).rejects.toBeInstanceOf(RekognitionServiceError);
			await expect(searchPromise).rejects.toMatchObject({
				errorCode: 'REKOGNITION_UPSTREAM_TIMEOUT',
				httpStatus: 504,
			});
		});
	});

	it('classifies invalid recognition images as non-retryable bad requests', async () => {
		await withRestoredEnvironment(async () => {
			process.env.AWS_REGION = 'us-east-1';
			delete process.env.AWS_REGION_RKG;
			process.env.AWS_REKOGNITION_COLLECTION_ID = 'test-collection';
			delete process.env.AWS_REKOGNITION_COLLECTION_ID_RKG;

			const invalidImageError = Object.assign(new Error('unsupported image format'), {
				name: 'InvalidImageFormatException',
				$metadata: {
					httpStatusCode: 400,
				},
			});
			rekognitionSdkMockState.error = invalidImageError;

			const { RekognitionServiceError, searchUsersByImage } = await import('./rekognition.js');
			const searchPromise = searchUsersByImage(new Uint8Array([1, 2, 3]));

			await expect(searchPromise).rejects.toBeInstanceOf(RekognitionServiceError);
			await expect(searchPromise).rejects.toMatchObject({
				errorCode: 'REKOGNITION_INVALID_IMAGE',
				httpStatus: 400,
				clientMessage: 'Invalid recognition image',
			});
		});
	});
});
