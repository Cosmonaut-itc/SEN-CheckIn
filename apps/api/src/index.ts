import { createApp } from './app.js';
import { logger } from './logger/index.js';

const hostname = process.env.HOST ?? '0.0.0.0';
const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;

const app = createApp();
const server = app.listen({ hostname, port });

export type { App } from './app.js';
export { createApp } from './app.js';

// Export error classes for use in routes
export * from './errors/index.js';

logger.info(`🦊 Elysia is running at ${hostname}:${server.server?.port ?? port}`);
