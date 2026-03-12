import type { AttendanceType } from './query-keys';

export type CaptureAction = 'ignore' | 'open-check-out-reason' | 'capture';

export interface CaptureActionInput {
	attendanceType: AttendanceType;
	isProcessing: boolean;
}

/**
 * Resolves the next scanner action based on the attendance type and current processing state.
 *
 * @param input - Scanner flow state used to decide the next action
 * @returns The action that the scanner should execute next
 */
export function getCaptureAction(input: CaptureActionInput): CaptureAction {
	if (input.isProcessing) {
		return 'ignore';
	}

	if (input.attendanceType === 'CHECK_OUT') {
		return 'open-check-out-reason';
	}

	return 'capture';
}
