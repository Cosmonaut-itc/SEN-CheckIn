/**
 * Elysia plugins for the SEN CheckIn API.
 * Re-exports all plugins for convenient importing.
 *
 * @module plugins
 */

export { errorHandlerPlugin, type ErrorResponse } from './error-handler.js';
export { loggerPlugin } from './logger.js';
export {
	authPlugin,
	apiKeyAuthPlugin,
	combinedAuthPlugin,
	type AuthUser,
	type AuthSession,
} from './auth.js';

