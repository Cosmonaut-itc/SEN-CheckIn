const mockManipulateAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
	manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
	SaveFormat: {
		JPEG: 'jpeg',
	},
}));

jest.mock('expo-file-system/legacy', () => ({
	deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

import { prepareRecognitionImage } from './recognition-image';

describe('prepareRecognitionImage', () => {
	beforeEach(() => {
		mockManipulateAsync.mockReset();
	});

	it('resizes landscape photos to the configured max width and returns payload diagnostics', async () => {
		mockManipulateAsync.mockResolvedValue({
			uri: 'file://processed.jpg',
			width: 720,
			height: 540,
			base64: 'compressed-base64',
		});

		const result = await prepareRecognitionImage({
			uri: 'file://original.jpg',
			width: 1200,
			height: 900,
		});

		expect(mockManipulateAsync).toHaveBeenCalledWith(
			'file://original.jpg',
			[{ resize: { width: 720 } }],
			{
				base64: true,
				compress: 0.6,
				format: 'jpeg',
			},
		);
		expect(result.base64).toBe('compressed-base64');
		expect(result.previewUri).toBe('file://processed.jpg');
		expect(result.payloadBytes).toBe(JSON.stringify({ image: 'compressed-base64' }).length);
		expect(result.preprocessMs).toBeGreaterThanOrEqual(0);
	});
});
