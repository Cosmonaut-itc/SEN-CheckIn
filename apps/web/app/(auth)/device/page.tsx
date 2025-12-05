import React from 'react';

import { DeviceClient } from './device-client';

interface DevicePageProps {
	searchParams: Promise<{ user_code?: string }>;
}

/**
 * Device verification entry point for /device.
 * Supports the default BetterAuth verification URI (/device?user_code=XXXX).
 */
export default async function DevicePage({
	searchParams,
}: DevicePageProps): Promise<React.ReactElement> {
	const resolved = await searchParams;
	const initialCode = resolved?.user_code ?? '';
	return <DeviceClient initialCode={initialCode} />;
}
