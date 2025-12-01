import React from 'react';

import { DeviceClient } from '../device-client';

interface DeviceCodePageProps {
	params: { code: string };
	searchParams: Promise<{ user_code?: string }>;
}

/**
 * Device verification page that pre-fills the code from the URL segment (/device/XXXX-XXXX).
 */
export default async function DeviceCodePage({
	params,
	searchParams,
}: DeviceCodePageProps): Promise<React.ReactElement> {
	const resolved = await searchParams;
	const initialCode = resolved?.user_code ?? params.code ?? '';
	return <DeviceClient initialCode={initialCode} />;
}
