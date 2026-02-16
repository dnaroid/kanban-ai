import { exec as execCallback, spawn } from "child_process";
import { promisify } from "util";

const exec = promisify(execCallback);

const DEFAULT_PORT = 4096;

export interface OpencodeServiceConfig {
	port?: number;
}

export class OpencodeService {
	private processRef: ReturnType<typeof spawn> | null = null;
	private port: number;
	private externalProcess = false;
	private isShuttingDown = false;

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

	public async stop(): Promise<void> {
		if (!this.processRef || this.externalProcess) {
			return;
		}

		this.isShuttingDown = true;
		const processRef = this.processRef;
		this.processRef = null;

		processRef.kill("SIGTERM");

		setTimeout(() => {
			if (!processRef.killed) {
				processRef.kill("SIGKILL");
			}
		}, 5_000).unref();

		await new Promise((resolve) => setTimeout(resolve, 6_000));
		this.isShuttingDown = false;
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
