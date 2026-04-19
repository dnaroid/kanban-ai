import { createLogger } from "@/lib/logger";

const log = createLogger("runs-queue");

interface PollingServiceConfig {
	pollingIntervalMs: number;
	watcherTtlMs: number;
	onPollProjectRuns: (projectId: string) => Promise<void>;
}

export class PollingService {
	private projectPollingTimer: ReturnType<typeof setInterval> | null = null;
	private readonly activeProjectBoardWatchers = new Map<
		string,
		Map<string, number>
	>();
	private readonly pollingIntervalMs: number;
	private readonly watcherTtlMs: number;
	private readonly onPollProjectRuns: (projectId: string) => Promise<void>;

	public constructor(config: PollingServiceConfig) {
		this.pollingIntervalMs = config.pollingIntervalMs;
		this.watcherTtlMs = config.watcherTtlMs;
		this.onPollProjectRuns = config.onPollProjectRuns;
	}

	public startProjectBoardPolling(projectId: string, viewerId: string): void {
		const normalizedProjectId = projectId.trim();
		const normalizedViewerId = viewerId.trim();
		if (normalizedProjectId.length === 0 || normalizedViewerId.length === 0) {
			return;
		}

		let viewers = this.activeProjectBoardWatchers.get(normalizedProjectId);
		if (!viewers) {
			viewers = new Map<string, number>();
			this.activeProjectBoardWatchers.set(normalizedProjectId, viewers);
		}

		viewers.set(normalizedViewerId, Date.now());
		this.ensureProjectPollingActive();
		void this.onPollProjectRuns(normalizedProjectId);
	}

	public stopProjectBoardPolling(projectId: string, viewerId: string): void {
		const viewers = this.activeProjectBoardWatchers.get(projectId.trim());
		if (!viewers) {
			return;
		}

		viewers.delete(viewerId.trim());
		if (viewers.size === 0) {
			this.activeProjectBoardWatchers.delete(projectId.trim());
		}

		if (this.activeProjectBoardWatchers.size === 0) {
			this.stopProjectPolling();
		}
	}

	private ensureProjectPollingActive(): void {
		if (this.projectPollingTimer) {
			return;
		}

		this.projectPollingTimer = setInterval(() => {
			void this.pollViewedProjects();
		}, this.pollingIntervalMs);
		log.info("Started project board reconciliation polling", {
			projects: this.activeProjectBoardWatchers.size,
		});
	}

	private stopProjectPolling(): void {
		if (!this.projectPollingTimer) {
			return;
		}

		clearInterval(this.projectPollingTimer);
		this.projectPollingTimer = null;
		log.info("Stopped project board reconciliation polling");
	}

	private async pollViewedProjects(): Promise<void> {
		this.pruneInactiveProjectBoardWatchers();
		if (this.activeProjectBoardWatchers.size === 0) {
			this.stopProjectPolling();
			return;
		}

		for (const projectId of this.activeProjectBoardWatchers.keys()) {
			await this.onPollProjectRuns(projectId);
		}
	}

	private pruneInactiveProjectBoardWatchers(): void {
		const cutoff = Date.now() - this.watcherTtlMs;
		for (const [
			projectId,
			viewers,
		] of this.activeProjectBoardWatchers.entries()) {
			for (const [viewerId, lastSeenAt] of viewers.entries()) {
				if (lastSeenAt >= cutoff) {
					continue;
				}

				viewers.delete(viewerId);
			}

			if (viewers.size === 0) {
				this.activeProjectBoardWatchers.delete(projectId);
			}
		}
	}
}
