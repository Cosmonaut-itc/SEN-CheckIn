import {
	releaseAttendanceCaptureLock,
	tryAcquireAttendanceCaptureLock,
} from './attendance-capture-lock';

describe('attendance-capture-lock', () => {
	it('does not acquire the lock when processing state is already active', () => {
		const lockRef = { current: false };

		const acquired = tryAcquireAttendanceCaptureLock(lockRef, true);

		expect(acquired).toBe(false);
		expect(lockRef.current).toBe(false);
	});

	it('blocks repeated capture starts until the lock is released', () => {
		const lockRef = { current: false };

		expect(tryAcquireAttendanceCaptureLock(lockRef, false)).toBe(true);
		expect(tryAcquireAttendanceCaptureLock(lockRef, false)).toBe(false);

		releaseAttendanceCaptureLock(lockRef);

		expect(tryAcquireAttendanceCaptureLock(lockRef, false)).toBe(true);
	});
});
