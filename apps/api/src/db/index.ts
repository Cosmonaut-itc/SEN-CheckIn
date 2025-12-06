import 'dotenv/config';
import '../utils/disable-pg-native.js';
import * as schema from './schema.js';

const { drizzle } = await import('drizzle-orm/node-postgres');

/**
 * Gets the database connection URL from environment variables.
 * @throws {Error} If SEN_DB_URL is not set
 * @returns {string} The database connection URL
 */
function getDatabaseUrl(): string {
	const databaseUrl = process.env.SEN_DB_URL;
	if (!databaseUrl) {
		throw new Error(
			'DATABASE_URL environment variable is required but not set. Please set it in your .env file or environment.',
		);
	}
	return databaseUrl;
}

/**
 * Drizzle ORM database instance configured with the full schema.
 * Required for Better Auth's Drizzle adapter to work properly.
 */
const db = drizzle(getDatabaseUrl(), { schema });

export default db;
