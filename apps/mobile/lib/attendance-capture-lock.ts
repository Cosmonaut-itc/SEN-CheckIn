export interface AttendanceCaptureLockRef {
	current: boolean;
}

/**
 * Attempts to acquire the synchronous attendance capture lock.
 *
 * @param lockRef - Mutable lock ref shared by the scanner handlers
 * @param isProcessing - React state that reflects whether the UI is already processing
 * @returns True when the caller can start a new capture
 */
export function tryAcquireAttendanceCaptureLock(
	lockRef: AttendanceCaptureLockRef,
	isProcessing: boolean,
): boolean {
	if (isProcessing || lockRef.current) {
		return false;
	}

	lockRef.current = true;
	return true;
}

/**
 * Releases the synchronous attendance capture lock.
 *
 * @param lockRef - Mutable lock ref shared by the scanner handlers
 * @returns void
 */
export function releaseAttendanceCaptureLock(lockRef: AttendanceCaptureLockRef): void {
	lockRef.current = false;
}
