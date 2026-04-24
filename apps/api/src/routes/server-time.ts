import { Elysia } from 'elysia';

const SERVER_TIME_ZONE = 'America/Mexico_City';

/**
 * Public server-time route used by clients that need API-clock decisions.
 *
 * @module routes/server-time
 */
export const serverTimeRoutes = new Elysia({ prefix: '/server-time' }).get('/', () => ({
	data: {
		now: new Date().toISOString(),
		timeZone: SERVER_TIME_ZONE,
	},
}));
