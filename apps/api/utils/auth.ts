import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from 'better-auth/plugins';
import db from '../src/db/index.js';

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg', // or "mysql", "sqlite"
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [apiKey()],
});
