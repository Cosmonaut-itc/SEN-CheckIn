import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: './apps/api/src/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: getDatabaseUrl(),
	},
});

function getDatabaseUrl(): string {
	const databaseUrl = process.env.SEN_DB_URL;
	if (!databaseUrl) {
		throw new Error(
			'SEN_DB_URL environment variable is required but not set. Please set it in your .env file or environment.',
		);
	}
	return databaseUrl;
}
