import { NextResponse } from 'next/server';

const SERVER_TIME_ZONE = 'America/Mexico_City';

/**
 * Returns the web server clock for client-side report flows.
 *
 * This route intentionally lives in the web app so browser calls to
 * `/api/server-time` do not depend on the generic upstream proxy.
 *
 * @returns JSON response with the current server instant and CDMX timezone contract
 */
export function GET(): NextResponse<{ data: { now: string; timeZone: string } }> {
	return NextResponse.json({
		data: {
			now: new Date().toISOString(),
			timeZone: SERVER_TIME_ZONE,
		},
	});
}
