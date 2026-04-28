const SETTINGS_ACCESS_TTL_MS = 5 * 60 * 1000;

const settingsAccessGrantExpiresAtByDeviceId = new Map<string, number>();

/**
 * Grants temporary in-memory access to the settings screen for a device.
 *
 * @param deviceId - Device identifier receiving settings access
 * @returns No return value
 */
export function grantSettingsAccess(deviceId: string): void {
	settingsAccessGrantExpiresAtByDeviceId.set(deviceId, Date.now() + SETTINGS_ACCESS_TTL_MS);
}

/**
 * Checks whether a device currently has a valid in-memory settings grant.
 *
 * @param deviceId - Device identifier to check
 * @returns True when access was granted and has not expired
 */
export function hasSettingsAccessGrant(deviceId: string | null | undefined): boolean {
	if (!deviceId) {
		return false;
	}

	const expiresAt = settingsAccessGrantExpiresAtByDeviceId.get(deviceId);
	if (!expiresAt) {
		return false;
	}

	if (expiresAt <= Date.now()) {
		settingsAccessGrantExpiresAtByDeviceId.delete(deviceId);
		return false;
	}

	return true;
}

/**
 * Clears all in-memory settings access grants.
 *
 * @returns No return value
 */
export function clearSettingsAccessGrants(): void {
	settingsAccessGrantExpiresAtByDeviceId.clear();
}
