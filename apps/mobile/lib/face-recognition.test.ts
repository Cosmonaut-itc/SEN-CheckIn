const mockAuthedFetch = jest.fn();

jest.mock('./auth-client', () => ({
	authedFetch: (...args: unknown[]) => mockAuthedFetch(...args),
}));

jest.mock('./api', () => ({
	API_BASE_URL: 'https://api.example.com',
}));

import { FaceVerificationError, verifyFace } from './face-recognition';

describe('verifyFace', () => {
	beforeEach(() => {
		mockAuthedFetch.mockReset();
	});

	it('sends diagnostic headers and returns successful recognition payloads', async () => {
		mockAuthedFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				matched: false,
				match: null,
				employee: null,
				searchedFaceConfidence: 97,
			}),
		});

		const result = await verifyFace({
			imageBase64: 'base64-image',
			payloadBytes: 2048,
			platform: 'android',
			networkType: 'wifi',
		});

		expect(mockAuthedFetch).toHaveBeenCalledWith(
			'https://api.example.com/recognition/identify',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Type': 'application/json',
					'x-client-platform': 'android',
					'x-client-network-type': 'wifi',
				}),
			}),
		);
		expect(mockAuthedFetch.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.not.objectContaining({
					'x-image-payload-bytes': expect.any(String),
				}),
			}),
		);
		expect(result.matched).toBe(false);
	});

	it('throws a retryable error for retryable upstream failures', async () => {
		mockAuthedFetch.mockResolvedValue({
			ok: false,
			status: 503,
			headers: {
				get: (headerName: string) =>
					headerName.toLowerCase() === 'x-request-id' ? 'req-123' : null,
			},
			json: async () => ({
				errorCode: 'REKOGNITION_UPSTREAM_FAILURE',
				message: 'Face recognition service unavailable',
			}),
		});

		await expect(
			verifyFace({
				imageBase64: 'base64-image',
				payloadBytes: 2048,
				platform: 'android',
				networkType: 'wifi',
			}),
		).rejects.toEqual(
			expect.objectContaining<Partial<FaceVerificationError>>({
				retryable: true,
				status: 503,
				errorCode: 'REKOGNITION_UPSTREAM_FAILURE',
				requestId: 'req-123',
			}),
		);
	});

	it('throws a non-retryable error for invalid recognition image failures', async () => {
		mockAuthedFetch.mockResolvedValue({
			ok: false,
			status: 400,
			headers: {
				get: (headerName: string) =>
					headerName.toLowerCase() === 'x-request-id' ? 'req-400' : null,
			},
			json: async () => ({
				errorCode: 'REKOGNITION_INVALID_IMAGE',
				message: 'Invalid recognition image',
			}),
		});

		await expect(
			verifyFace({
				imageBase64: 'base64-image',
				payloadBytes: 2048,
				platform: 'android',
				networkType: 'wifi',
			}),
		).rejects.toEqual(
			expect.objectContaining<Partial<FaceVerificationError>>({
				retryable: false,
				status: 400,
				errorCode: 'REKOGNITION_INVALID_IMAGE',
				requestId: 'req-400',
			}),
		);
	});
});
