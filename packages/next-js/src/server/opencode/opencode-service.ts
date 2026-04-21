import type { ChildProcess } from "child_process";

const DEFAULT_PORT = 4096;

export interface OpencodeServiceConfig {
	port?: number;
}

type ProcessWithBuiltinModule = NodeJS.Process & {
	getBuiltinModule?: (id: string) => unknown;
};

function getBuiltinModule<T>(id: string): T {
	const getter = (process as ProcessWithBuiltinModule).getBuiltinModule;
	if (!getter) {
		throw new Error(
			`Node runtime does not support process.getBuiltinModule (${id})`,
		);
	}

	const mod = getter(id);
	if (!mod) {
		throw new Error(`Cannot load builtin module: ${id}`);
	}

	return mod as T;
}

export class OpencodeService {
	private processRef: ChildProcess | null = null;
	private port: number;
	private externalProcess = false;
	private isShuttingDown = false;
	private startupPromise: Promise<void> | null = null;

	constructor(config: OpencodeServiceConfig = {}) {
		this.port = config.port ?? DEFAULT_PORT;
	}

	public getPort(): number {
		return this.port;
	}

	public isExternal(): boolean {
		return this.externalProcess;
	}

	public async isRunning(port = this.port): Promise<boolean> {
		if (await this.isEndpointReachable(`http://127.0.0.1:${port}/health`)) {
			return true;
		}

		if (await this.isEndpointReachable(`http://127.0.0.1:${port}/`)) {
			return true;
		}

		return false;
	}

	private async isEndpointReachable(url: string): Promise<boolean> {
		try {
			await fetch(url, {
				signal: AbortSignal.timeout(2_000),
			});
			return true;
		} catch {
			return false;
		}
	}

	public async findRunningOpenCode(): Promise<number | null> {
		const exec = this.getExec();
		const knownPorts = [this.port, 4096, 3000, 8080, 4000];

		for (const candidatePort of knownPorts) {
			try {
				const { stdout } = await exec(
					`lsof -i :${candidatePort} -sTCP:LISTEN | grep opencode`,
				);
				if (stdout.trim()) {
					return candidatePort;
				}
			} catch {
				continue;
			}
		}

		try {
			const { stdout } = await exec('pgrep -f "opencode serve"');
			const pids = stdout
				.trim()
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0);

			for (const pid of pids) {
				try {
					const { stdout: lsofOutput } = await exec(
						`lsof -p ${pid} -a -i -sTCP:LISTEN`,
					);
					const match = lsofOutput.match(/:(\d+)\s+\(LISTEN\)/);
					if (!match) continue;

					const discoveredPort = Number.parseInt(match[1] ?? "", 10);
					if (!Number.isNaN(discoveredPort)) {
						return discoveredPort;
					}
				} catch {
					continue;
				}
			}
		} catch {
			return null;
		}

		return null;
	}

	public async start(): Promise<void> {
		if (process.env.AI_RUNTIME_MODE === "fake") {
			return;
		}

		if (this.startupPromise) {
			await this.startupPromise;
			return;
		}

		this.startupPromise = this.startInternal().catch((error: unknown) => {
			this.startupPromise = null;
			throw error;
		});

		await this.startupPromise;
	}

	private async startInternal(): Promise<void> {
		const { spawn } =
			getBuiltinModule<typeof import("child_process")>("child_process");

		const runningPort = await this.findRunningOpenCode();
		if (runningPort !== null && (await this.isRunning(runningPort))) {
			this.port = runningPort;
			this.externalProcess = true;
			return;
		}

		if (await this.isRunning()) {
			this.externalProcess = true;
			return;
		}

		this.processRef = spawn(
			"opencode",
			["serve", "--port", String(this.port)],
			{
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
				env: process.env,
			},
		);

		this.externalProcess = false;

		this.processRef.unref();
		this.processRef.once("error", (error) => {
			if (!this.isShuttingDown) {
				console.error(
					"[opencode-service] failed to start opencode serve",
					error,
				);
			}
		});

		this.processRef.once("exit", (code, signal) => {
			if (!this.isShuttingDown) {
				console.warn(
					`[opencode-service] opencode serve exited (code=${code}, signal=${signal})`,
				);
			}
		});

		const maxAttempts = 15;
		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			if (await this.isRunning()) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1_000));
		}

		const discoveredPort = await this.findRunningOpenCode();
		if (discoveredPort !== null && (await this.isRunning(discoveredPort))) {
			this.port = discoveredPort;
			this.externalProcess = true;
			this.processRef = null;
			return;
		}

		if (!(await this.isRunning())) {
			throw new Error(
				`Failed to start opencode serve on port ${this.port} (healthcheck failed)`,
			);
		}
	}

	private getExec(): (
		command: string,
	) => Promise<{ stdout: string; stderr: string }> {
		const childProcess =
			getBuiltinModule<typeof import("child_process")>("child_process");
		const util = getBuiltinModule<typeof import("util")>("util");
		return util.promisify(childProcess.exec);
	}

	private getErrorCode(error: unknown): string | null {
		if (typeof error !== "object" || error === null || !("code" in error)) {
			return null;
		}

		const code = error.code;
		return typeof code === "string" ? code : null;
	}

	private isPidAlive(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			if (this.getErrorCode(error) === "ESRCH") {
				return false;
			}

			throw error;
		}
	}

	private async waitForPidExit(
		pid: number,
		attempts: number,
		delayMs: number,
	): Promise<boolean> {
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			if (!this.isPidAlive(pid)) {
				return true;
			}

			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}

		return !this.isPidAlive(pid);
	}

	private async terminatePid(pid: number): Promise<void> {
		try {
			process.kill(pid, "SIGTERM");
		} catch (error) {
			if (this.getErrorCode(error) === "ESRCH") {
				return;
			}

			throw error;
		}

		if (await this.waitForPidExit(pid, 30, 200)) {
			return;
		}

		try {
			process.kill(pid, "SIGKILL");
		} catch (error) {
			if (this.getErrorCode(error) === "ESRCH") {
				return;
			}

			throw error;
		}

		await this.waitForPidExit(pid, 15, 200);
	}

	private async listRunningOpenCodePids(): Promise<number[]> {
		const exec = this.getExec();

		try {
			const { stdout } = await exec('pgrep -f "opencode serve"');
			const pidSet = new Set<number>();

			for (const line of stdout.split("\n")) {
				const pid = Number.parseInt(line.trim(), 10);
				if (!Number.isNaN(pid) && pid > 0 && pid !== process.pid) {
					pidSet.add(pid);
				}
			}

			return [...pidSet];
		} catch {
			return [];
		}
	}

	public async stop(): Promise<void> {
		this.startupPromise = null;
		const processRef = this.processRef;
		const shouldStopManagedProcess = !!processRef && !this.externalProcess;
		const shouldStopDiscoveredProcess = this.externalProcess || !processRef;

		this.isShuttingDown = true;
		this.processRef = null;

		try {
			if (shouldStopManagedProcess && processRef) {
				if (typeof processRef.pid === "number") {
					await this.terminatePid(processRef.pid);
				} else {
					processRef.kill("SIGTERM");
					await new Promise((resolve) => setTimeout(resolve, 1_000));
				}
			}

			if (shouldStopDiscoveredProcess) {
				const pids = await this.listRunningOpenCodePids();
				for (const pid of pids) {
					await this.terminatePid(pid);
				}
			}
		} finally {
			this.externalProcess = false;
			this.isShuttingDown = false;
		}
	}
}

let serviceInstance: OpencodeService | null = null;

export function getOpencodeService(
	config: OpencodeServiceConfig = {},
): OpencodeService {
	if (!serviceInstance) {
		serviceInstance = new OpencodeService(config);
	}
	return serviceInstance;
}
