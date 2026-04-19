import type {
	QueueMeta,
	QueueStats,
	ProviderQueueStats,
} from "@/server/run/runs-queue-types";

export class QueueManager {
	private readonly queues = new Map<string, string[]>();
	private readonly running = new Map<string, Set<string>>();
	private readonly queueMetaByQueueKey = new Map<string, QueueMeta>();
	private readonly queueKeyByRunId = new Map<string, string>();

	public hasRun(runId: string): boolean {
		return this.queueKeyByRunId.has(runId);
	}

	public enqueue(runId: string, queueKey: string, meta: QueueMeta): string[] {
		const queue = this.ensureQueue(queueKey);
		this.queueKeyByRunId.set(runId, queueKey);
		this.queueMetaByQueueKey.set(queueKey, meta);
		queue.push(runId);
		return queue;
	}

	public getQueueMeta(queueKey: string): QueueMeta | undefined {
		return this.queueMetaByQueueKey.get(queueKey);
	}

	public forEachQueue(
		visitor: (queueKey: string, queue: string[]) => void,
	): void {
		for (const [queueKey, queue] of this.queues.entries()) {
			visitor(queueKey, queue);
		}
	}

	public ensureRunning(queueKey: string): Set<string> {
		const existing = this.running.get(queueKey);
		if (existing) {
			return existing;
		}

		const next = new Set<string>();
		this.running.set(queueKey, next);
		return next;
	}

	public removeFromRunning(queueKey: string, runId: string): void {
		this.running.get(queueKey)?.delete(runId);
		this.queueKeyByRunId.delete(runId);
		this.cleanupQueueState(queueKey);
	}

	public completeRun(runId: string): void {
		const queueKey = this.queueKeyByRunId.get(runId);
		if (!queueKey) {
			return;
		}

		this.running.get(queueKey)?.delete(runId);
		this.queueKeyByRunId.delete(runId);
		this.cleanupQueueState(queueKey);
	}

	public removeRun(runId: string): void {
		const queueKey = this.queueKeyByRunId.get(runId);
		if (queueKey) {
			this.removeFromQueueByKey(queueKey, runId);
			this.queueKeyByRunId.delete(runId);
			this.cleanupQueueState(queueKey);
			return;
		}

		for (const [currentQueueKey, queue] of this.queues.entries()) {
			const index = queue.indexOf(runId);
			if (index < 0) {
				continue;
			}

			queue.splice(index, 1);
			this.cleanupQueueState(currentQueueKey);
			break;
		}
	}

	public hasQueuedRuns(): boolean {
		for (const queue of this.queues.values()) {
			if (queue.length > 0) {
				return true;
			}
		}

		return false;
	}

	public cleanupQueueState(queueKey: string): void {
		const queue = this.queues.get(queueKey);
		if (queue && queue.length === 0) {
			this.queues.delete(queueKey);
		}

		const running = this.running.get(queueKey);
		if (running && running.size === 0) {
			this.running.delete(queueKey);
		}

		if (!this.queues.has(queueKey) && !this.running.has(queueKey)) {
			this.queueMetaByQueueKey.delete(queueKey);
		}
	}

	public buildQueueKey(
		projectScope: string,
		providerKey: string,
		isGeneration: boolean,
	): string {
		const suffix = isGeneration ? ":gen" : "";
		return `${projectScope}\0${providerKey}${suffix}`;
	}

	public getQueueStats(
		resolveProviderConcurrency: (
			providerKey: string,
			isGeneration?: boolean,
		) => number,
	): QueueStats {
		const queueKeys = new Set<string>([
			...this.queues.keys(),
			...this.running.keys(),
		]);

		const providerStatsByProviderKey = new Map<string, ProviderQueueStats>();
		const projectStatsByProjectScope = new Map<
			string,
			{
				queued: number;
				running: number;
				providers: Map<string, ProviderQueueStats>;
			}
		>();

		for (const queueKey of queueKeys) {
			const meta = this.queueMetaByQueueKey.get(queueKey);
			if (!meta) {
				continue;
			}

			const queue = this.queues.get(queueKey) ?? [];
			const running = this.running.get(queueKey);
			const queuedCount = queue.length;
			const runningCount = running?.size ?? 0;
			const concurrency = resolveProviderConcurrency(
				meta.providerKey,
				meta.isGeneration,
			);

			const providerStats = providerStatsByProviderKey.get(
				meta.providerKey,
			) ?? {
				providerKey: meta.providerKey,
				queued: 0,
				running: 0,
				concurrency,
			};
			providerStats.queued += queuedCount;
			providerStats.running += runningCount;
			providerStatsByProviderKey.set(meta.providerKey, providerStats);

			const projectStats = projectStatsByProjectScope.get(
				meta.projectScope,
			) ?? {
				queued: 0,
				running: 0,
				providers: new Map<string, ProviderQueueStats>(),
			};
			projectStats.queued += queuedCount;
			projectStats.running += runningCount;

			const projectProviderStats = projectStats.providers.get(
				meta.providerKey,
			) ?? {
				providerKey: meta.providerKey,
				queued: 0,
				running: 0,
				concurrency,
			};
			projectProviderStats.queued += queuedCount;
			projectProviderStats.running += runningCount;
			projectStats.providers.set(meta.providerKey, projectProviderStats);
			projectStatsByProjectScope.set(meta.projectScope, projectStats);
		}

		const providers = [...providerStatsByProviderKey.values()].sort((a, b) => {
			if (a.providerKey < b.providerKey) {
				return -1;
			}
			if (a.providerKey > b.providerKey) {
				return 1;
			}
			return 0;
		});

		const byProject = [...projectStatsByProjectScope.entries()]
			.map(([projectScope, stats]) => ({
				projectScope,
				queued: stats.queued,
				running: stats.running,
				providers: [...stats.providers.values()].sort((a, b) => {
					if (a.providerKey < b.providerKey) {
						return -1;
					}
					if (a.providerKey > b.providerKey) {
						return 1;
					}
					return 0;
				}),
			}))
			.sort((a, b) => {
				if (a.projectScope < b.projectScope) {
					return -1;
				}
				if (a.projectScope > b.projectScope) {
					return 1;
				}
				return 0;
			});

		const totalQueued = providers.reduce((sum, item) => sum + item.queued, 0);
		const totalRunning = providers.reduce((sum, item) => sum + item.running, 0);

		return {
			totalQueued,
			totalRunning,
			providers,
			byProject,
		};
	}

	public selectNextRunnableRun(
		queue: string[],
		canRunNow: (runId: string) => boolean,
		resolveRunPriorityScore: (runId: string) => number,
		resolveRunCreatedAtMs: (runId: string) => number,
		onOrphanedRun: (runId: string) => void,
	): string | null {
		let bestIndex = -1;
		let bestScore = Number.NEGATIVE_INFINITY;
		let bestCreatedAt = Number.POSITIVE_INFINITY;

		for (let index = 0; index < queue.length; index += 1) {
			const runId = queue[index];
			if (!canRunNow(runId)) {
				continue;
			}

			const score = resolveRunPriorityScore(runId);
			const safeCreatedAt = resolveRunCreatedAtMs(runId);

			if (
				score > bestScore ||
				(score === bestScore && safeCreatedAt < bestCreatedAt)
			) {
				bestIndex = index;
				bestScore = score;
				bestCreatedAt = safeCreatedAt;
			}
		}

		if (bestIndex < 0) {
			return null;
		}

		const [selected] = queue.splice(bestIndex, 1);
		if (!selected) {
			return null;
		}

		if (!this.queueKeyByRunId.has(selected)) {
			onOrphanedRun(selected);
			return null;
		}

		return selected;
	}

	private ensureQueue(queueKey: string): string[] {
		const existing = this.queues.get(queueKey);
		if (existing) {
			return existing;
		}

		const queue: string[] = [];
		this.queues.set(queueKey, queue);
		return queue;
	}

	private removeFromQueueByKey(queueKey: string, runId: string): void {
		const queue = this.queues.get(queueKey);
		if (!queue) {
			return;
		}

		const index = queue.indexOf(runId);
		if (index >= 0) {
			queue.splice(index, 1);
		}
	}
}
