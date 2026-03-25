import { beforeEach, describe, expect, it } from 'bun:test';

import {
	setSearchUsersByImageError,
	setSearchUsersByImageResult,
	setupRekognitionMocks,
} from './contract-mocks.js';

setupRekognitionMocks();

const DEFAULT_SEARCH_RESULT = {
	matched: false,
	userId: null,
	similarity: null,
	searchedFaceConfidence: 99,
	message: 'No matching user found above similarity threshold',
};

describe('contract Rekognition mocks', () => {
	beforeEach(() => {
		setSearchUsersByImageResult(DEFAULT_SEARCH_RESULT);
	});

	it('throws a forced Rekognition error only once before returning to the configured result', async () => {
		const { RekognitionServiceError, searchUsersByImage } = await import(
			'../services/rekognition.js'
		);
		const configuredSearchResult = {
			matched: true,
			userId: 'employee-1',
			similarity: 98,
			searchedFaceConfidence: 97,
		};
		setSearchUsersByImageResult(configuredSearchResult);
		setSearchUsersByImageError(
			new RekognitionServiceError(
				'forced upstream failure',
				'REKOGNITION_UPSTREAM_FAILURE',
				503,
			),
		);

		await expect(searchUsersByImage(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
			RekognitionServiceError,
		);
		await expect(searchUsersByImage(new Uint8Array([1, 2, 3]))).resolves.toMatchObject(
			configuredSearchResult,
		);
	});

	it('preserves client-facing fields for forced invalid-image errors', async () => {
		const { RekognitionServiceError, searchUsersByImage } = await import(
			'../services/rekognition.js'
		);
		setSearchUsersByImageError(
			new RekognitionServiceError(
				'invalid image format',
				'REKOGNITION_INVALID_IMAGE',
				400,
				'Invalid recognition image',
			),
		);

		await expect(searchUsersByImage(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
			errorCode: 'REKOGNITION_INVALID_IMAGE',
			httpStatus: 400,
			clientMessage: 'Invalid recognition image',
		});
	});
});
