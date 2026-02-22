export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	context: string;
	message: string;
	data?: unknown;
}

export interface LogTransport {
	log(entry: LogEntry): void;
}

class ConsoleTransport implements LogTransport {
	private readonly levelColors: Record<LogLevel, string> = {
		debug: "\x1b[36m",
		info: "\x1b[32m",
		warn: "\x1b[33m",
		error: "\x1b[31m",
	};

	private readonly resetColor = "\x1b[0m";

	log(entry: LogEntry): void {
		const timestamp = entry.timestamp.toISOString();
		const color = this.levelColors[entry.level];
		const levelStr = entry.level.toUpperCase();

		const prefix = `${color}[${levelStr}]${this.resetColor} [${timestamp}] [${entry.context}]`;

		const consoleMethod = this.getConsoleMethod(entry.level);

		if (entry.data !== undefined) {
			consoleMethod(prefix, entry.message, entry.data);
		} else {
			consoleMethod(prefix, entry.message);
		}
	}

	private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
		switch (level) {
			case "debug":
				return console.debug;
			case "info":
				return console.info;
			case "warn":
				return console.warn;
			case "error":
				return console.error;
		}
	}
}

export interface LoggerConfig {
	minLevel?: LogLevel;
	transports?: LogTransport[];
}

export interface Logger {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
	/** Create a child logger with extended context */
	child(subContext: string): Logger;
}

class LoggerImpl implements Logger {
	private readonly context: string;
	private readonly config: Required<LoggerConfig>;

	constructor(context: string, config: Required<LoggerConfig>) {
		this.context = context;
		this.config = config;
	}

	private log(level: LogLevel, message: string, data?: unknown): void {
		if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			context: this.context,
			message,
			data,
		};

		for (const transport of this.config.transports) {
			transport.log(entry);
		}
	}

	debug(message: string, data?: unknown): void {
		this.log("debug", message, data);
	}

	info(message: string, data?: unknown): void {
		this.log("info", message, data);
	}

	warn(message: string, data?: unknown): void {
		this.log("warn", message, data);
	}

	error(message: string, data?: unknown): void {
		this.log("error", message, data);
	}

	child(subContext: string): Logger {
		return new LoggerImpl(`${this.context}:${subContext}`, this.config);
	}
}

let defaultConfig: Required<LoggerConfig> = {
	minLevel: (process.env.LOG_LEVEL as LogLevel) || "info",
	transports: [new ConsoleTransport()],
};

export function configureLogger(config: Partial<LoggerConfig>): void {
	defaultConfig = {
		...defaultConfig,
		...config,
	};
}

export function addTransport(transport: LogTransport): void {
	defaultConfig.transports.push(transport);
}

/**
 * Create a logger with the given context (typically file/class name)
 *
 * @example
 * ```ts
 * // In src/server/db/index.ts
 * const log = createLogger("db");
 *
 * log.info("Connection established");
 * log.debug("Query executed", { sql, duration });
 * log.error("Connection failed", error);
 *
 * // Child logger
 * const queryLog = log.child("query");
 * queryLog.debug("Executing query", { sql });
 * ```
 */
export function createLogger(
	context: string,
	config?: Partial<LoggerConfig>,
): Logger {
	const mergedConfig: Required<LoggerConfig> = {
		...defaultConfig,
		...config,
	};

	return new LoggerImpl(context, mergedConfig);
}

export { ConsoleTransport };
