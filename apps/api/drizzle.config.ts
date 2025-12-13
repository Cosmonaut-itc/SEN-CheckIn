import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Use relative paths so drizzle-kit does not double-prefix absolute paths
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});

/**
 * Retrieve the Postgres connection string from the environment.
 *
 * @returns {string} Database connection URL sourced from SEN_DB_URL.
 * @throws {Error} If SEN_DB_URL is missing.
 */
function getDatabaseUrl(): string {
  const databaseUrl = process.env.SEN_DB_URL;
  if (!databaseUrl) {
    throw new Error(
      'SEN_DB_URL environment variable is required but not set. Please set it in your .env file or environment.',
    );
  }
  return databaseUrl;
}
