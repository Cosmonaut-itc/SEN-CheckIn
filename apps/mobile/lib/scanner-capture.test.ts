import type { AttendanceType } from './query-keys';
import { getCaptureAction } from './scanner-capture';

describe('getCaptureAction', () => {
	it('ignores check-out taps while a capture is already processing', () => {
		const action = getCaptureAction({
			attendanceType: 'CHECK_OUT',
			isProcessing: true,
		});

		expect(action).toBe('ignore');
	});

	it('opens the check-out reason sheet when check-out is idle', () => {
		const action = getCaptureAction({
			attendanceType: 'CHECK_OUT',
			isProcessing: false,
		});

		expect(action).toBe('open-check-out-reason');
	});

	it('starts capture immediately for non-check-out attendance types', () => {
		const supportedTypes: AttendanceType[] = ['CHECK_IN', 'CHECK_OUT_AUTHORIZED'];

		for (const attendanceType of supportedTypes) {
			const action = getCaptureAction({
				attendanceType,
				isProcessing: false,
			});

			expect(action).toBe('capture');
		}
	});
});
