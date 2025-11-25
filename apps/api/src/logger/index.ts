/**
 * Logger utility for the SEN CheckIn API.
 * Provides structured logging with configurable levels and request/response tracking.
 *
 * @module logger
 */

import { format } from 'date-fns';

/**
 * Available log levels in order of severity.
 */
export const LogLevel = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
	SILENT: 4,
} as const;

/** Type representing valid log levels */
export type LogLevelKey = keyof typeof LogLevel;

/** Type representing log level numeric values */
export type LogLevelValue = (typeof LogLevel)[LogLevelKey];

/**
 * Configuration options for the logger.
 */
export interface LoggerConfig {
	/** Minimum log level to output (default: 'INFO') */
	level: LogLevelKey;
	/** Whether to include timestamps in logs (default: true) */
	timestamps: boolean;
	/** Whether to colorize output (default: true in development) */
	colorize: boolean;
	/** Application name to include in logs */
	appName: string;
}

/**
 * ANSI color codes for terminal output.
 */
const Colors = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
} as const;

/**
 * HTTP method colors for request logging.
 */
const MethodColors: Record<string, string> = {
	GET: Colors.green,
	POST: Colors.blue,
	PUT: Colors.yellow,
	PATCH: Colors.yellow,
	DELETE: Colors.red,
	OPTIONS: Colors.dim,
	HEAD: Colors.dim,
};

/**
 * Status code color mapping.
 *
 * @param status - HTTP status code
 * @returns ANSI color code
 */
function getStatusColor(status: number): string {
	if (status >= 500) return Colors.red;
	if (status >= 400) return Colors.yellow;
	if (status >= 300) return Colors.cyan;
	if (status >= 200) return Colors.green;
	return Colors.white;
}

/**
 * Default logger configuration.
 */
const defaultConfig: LoggerConfig = {
	level: process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG',
	timestamps: true,
	colorize: process.env.NODE_ENV !== 'production',
	appName: 'SEN-CheckIn-API',
};

/**
 * Current logger configuration.
 */
let currentConfig: LoggerConfig = { ...defaultConfig };

/**
 * Configures the logger with custom options.
 *
 * @param config - Partial configuration to merge with defaults
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
	currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current logger configuration.
 *
 * @returns Current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
	return { ...currentConfig };
}

/**
 * Formats a log message with optional timestamp and color.
 *
 * @param level - Log level
 * @param message - Log message
 * @param meta - Additional metadata
 * @returns Formatted log string
 */
function formatLog(level: LogLevelKey, message: string, meta?: Record<string, unknown>): string {
	const parts: string[] = [];
	const { timestamps, colorize, appName } = currentConfig;

	// Timestamp
	if (timestamps) {
		const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
		parts.push(colorize ? `${Colors.dim}[${timestamp}]${Colors.reset}` : `[${timestamp}]`);
	}

	// App name
	parts.push(colorize ? `${Colors.cyan}[${appName}]${Colors.reset}` : `[${appName}]`);

	// Level
	const levelColors: Record<LogLevelKey, string> = {
		DEBUG: Colors.magenta,
		INFO: Colors.green,
		WARN: Colors.yellow,
		ERROR: Colors.red,
		SILENT: Colors.dim,
	};

	const levelStr = level.padEnd(5);
	parts.push(colorize ? `${levelColors[level]}${levelStr}${Colors.reset}` : levelStr);

	// Message
	parts.push(message);

	// Metadata
	if (meta && Object.keys(meta).length > 0) {
		const metaStr = JSON.stringify(meta);
		parts.push(colorize ? `${Colors.dim}${metaStr}${Colors.reset}` : metaStr);
	}

	return parts.join(' ');
}

/**
 * Checks if a log level should be output based on current configuration.
 *
 * @param level - Log level to check
 * @returns Whether the level should be logged
 */
function shouldLog(level: LogLevelKey): boolean {
	return LogLevel[level] >= LogLevel[currentConfig.level];
}

/**
 * Logger instance with methods for each log level.
 */
export const logger = {
	/**
	 * Logs a debug message.
	 *
	 * @param message - Log message
	 * @param meta - Additional metadata
	 */
	debug(message: string, meta?: Record<string, unknown>): void {
		if (shouldLog('DEBUG')) {
			console.debug(formatLog('DEBUG', message, meta));
		}
	},

	/**
	 * Logs an info message.
	 *
	 * @param message - Log message
	 * @param meta - Additional metadata
	 */
	info(message: string, meta?: Record<string, unknown>): void {
		if (shouldLog('INFO')) {
			console.info(formatLog('INFO', message, meta));
		}
	},

	/**
	 * Logs a warning message.
	 *
	 * @param message - Log message
	 * @param meta - Additional metadata
	 */
	warn(message: string, meta?: Record<string, unknown>): void {
		if (shouldLog('WARN')) {
			console.warn(formatLog('WARN', message, meta));
		}
	},

	/**
	 * Logs an error message.
	 *
	 * @param message - Log message
	 * @param error - Error object to log
	 * @param meta - Additional metadata
	 */
	error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
		if (shouldLog('ERROR')) {
			const errorMeta: Record<string, unknown> = { ...meta };

			if (error instanceof Error) {
				errorMeta.errorName = error.name;
				errorMeta.errorMessage = error.message;
				if (process.env.NODE_ENV !== 'production') {
					errorMeta.stack = error.stack;
				}
			} else if (error !== undefined) {
				errorMeta.errorValue = String(error);
			}

			console.error(formatLog('ERROR', message, errorMeta));
		}
	},

	/**
	 * Logs an HTTP request.
	 *
	 * @param method - HTTP method
	 * @param path - Request path
	 * @param meta - Additional request metadata
	 */
	request(method: string, path: string, meta?: Record<string, unknown>): void {
		if (shouldLog('INFO')) {
			const { colorize } = currentConfig;
			const methodColor = MethodColors[method] ?? Colors.white;
			const methodStr = colorize ? `${methodColor}${method.padEnd(7)}${Colors.reset}` : method.padEnd(7);
			const message = `${methodStr} ${path}`;
			console.info(formatLog('INFO', message, meta));
		}
	},

	/**
	 * Logs an HTTP response.
	 *
	 * @param method - HTTP method
	 * @param path - Request path
	 * @param status - HTTP status code
	 * @param durationMs - Request duration in milliseconds
	 * @param meta - Additional response metadata
	 */
	response(
		method: string,
		path: string,
		status: number,
		durationMs: number,
		meta?: Record<string, unknown>,
	): void {
		if (shouldLog('INFO')) {
			const { colorize } = currentConfig;
			const methodColor = MethodColors[method] ?? Colors.white;
			const statusColor = getStatusColor(status);

			const methodStr = colorize ? `${methodColor}${method.padEnd(7)}${Colors.reset}` : method.padEnd(7);
			const statusStr = colorize ? `${statusColor}${status}${Colors.reset}` : String(status);
			const durationStr = colorize ? `${Colors.dim}${durationMs.toFixed(2)}ms${Colors.reset}` : `${durationMs.toFixed(2)}ms`;

			const message = `${methodStr} ${path} ${statusStr} ${durationStr}`;
			console.info(formatLog('INFO', message, meta));
		}
	},
};

export default logger;

