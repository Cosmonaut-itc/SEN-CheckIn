import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

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

const db = drizzle(getDatabaseUrl());

export default db;
