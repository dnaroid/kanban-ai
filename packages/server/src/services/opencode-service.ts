import { spawn, type ChildProcess } from "node:child_process";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface OpencodeServiceConfig {
	port: number;
	logFile?: string;
}

export class OpencodeService {
	private process: ChildProcess | null = null;
	private config: OpencodeServiceConfig;
	private isShuttingDown = false;
	private isExternalProcess = false;

	constructor(config: OpencodeServiceConfig) {
		this.config = config;
	}

	/**
	 * Проверяет, запущен ли opencode serve на указанном порту через health endpoint
	 */
	async isRunning(port?: number): Promise<boolean> {
		const checkPort = port ?? this.config.port;
		try {
			const response = await fetch(`http://127.0.0.1:${checkPort}/health`, {
				method: "GET",
				signal: AbortSignal.timeout(2000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Ищет запущенный процесс opencode serve через lsof
	 * Возвращает порт если найден, null если не найден
	 */
	async findRunningOpenCode(): Promise<number | null> {
		try {
			const commonPorts = [4096, 3000, 8080, 4000];

			for (const port of commonPorts) {
				const { stdout } = await execAsync(
					`lsof -i :${port} -sTCP:LISTEN 2>/dev/null || true`,
				);
				if (stdout.toLowerCase().includes("opencode")) {
					console.log(
						`[OpencodeService] Найден запущенный opencode serve на порту ${port}`,
					);
					return port;
				}
			}

			const { stdout: pgrepOut } = await execAsync(
				`pgrep -f "opencode serve" 2>/dev/null || true`,
			);
			const pids = pgrepOut
				.trim()
				.split("\n")
				.filter((p) => p);

			for (const pid of pids) {
				const { stdout: lsofOut } = await execAsync(
					`lsof -p ${pid} -a -i -sTCP:LISTEN 2>/dev/null || true`,
				);
				const portMatch = lsofOut.match(/:(\d+)\s+\(LISTEN\)/);
				if (portMatch) {
					const port = Number.parseInt(portMatch[1], 10);
					console.log(
						`[OpencodeService] Найден opencode serve (PID ${pid}) на порту ${port}`,
					);
					return port;
				}
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Возвращает текущий порт сервиса
	 */
	getPort(): number {
		return this.config.port;
	}

	/**
	 * Проверяет, является ли процесс внешним (не нами запущенным)
	 */
	isExternal(): boolean {
		return this.isExternalProcess;
	}

	async start(): Promise<void> {
		const existingPort = await this.findRunningOpenCode();
		if (existingPort !== null) {
			if (await this.isRunning(existingPort)) {
				this.config.port = existingPort;
				this.isExternalProcess = true;
				console.log(
					`[OpencodeService] Переиспользуем существующий opencode serve на порту ${existingPort}`,
				);
				return;
			}
		}

		if (await this.isRunning()) {
			this.isExternalProcess = true;
			console.log(
				`[OpencodeService] OpenCode сервер уже запущен на порту ${this.config.port}`,
			);
			return;
		}

		console.log(
			`[OpencodeService] Запуск OpenCode сервера на порту ${this.config.port}...`,
		);

		const args = ["serve", "--port", this.config.port.toString()];

		this.process = spawn("opencode", args, {
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		this.process.stdout?.on("data", (data) => {
			const output = data.toString().trim();
			if (output) {
				console.log(`[OpenCode] ${output}`);
			}
		});

		this.process.stderr?.on("data", (data) => {
			const error = data.toString().trim();
			if (error) {
				console.error(`[OpenCode Error] ${error}`);
			}
		});

		this.process.on("error", (error) => {
			console.error(`[OpencodeService] Ошибка запуска: ${error}`);
		});

		this.process.on("exit", (code) => {
			if (!this.isShuttingDown) {
				console.log(`[OpencodeService] Процесс завершился с кодом: ${code}`);
			}
			this.process = null;
		});

		// Ждём запуска сервера
		await new Promise((resolve) => setTimeout(resolve, 3000));

		if (!(await this.isRunning())) {
			throw new Error(
				`Не удалось запустить OpenCode сервер на порту ${this.config.port}`,
			);
		}

		console.log(`[OpencodeService] OpenCode сервер успешно запущен`);
	}

	async stop(): Promise<void> {
		if (!this.process) {
			console.log("[OpencodeService] Процесс не запущен");
			return;
		}

		this.isShuttingDown = true;
		console.log("[OpencodeService] Остановка OpenCode сервера...");

		this.process.kill("SIGTERM");

		setTimeout(() => {
			if (this.process && !this.process.killed) {
				console.log("[OpencodeService] Принудительная остановка...");
				this.process.kill("SIGKILL");
			}
		}, 5000);

		await new Promise((resolve) => setTimeout(resolve, 6000));

		console.log("[OpencodeService] OpenCode сервер остановлен");
	}

	async shutdown(): Promise<void> {
		console.log("[OpencodeService] Graceful shutdown...");
		await this.stop();
	}
}

let serviceInstance: OpencodeService | null = null;

export function createOpencodeService(
	config: OpencodeServiceConfig,
): OpencodeService {
	if (serviceInstance) {
		return serviceInstance;
	}

	serviceInstance = new OpencodeService(config);
	return serviceInstance;
}
