import { createLogger } from "@/lib/logger";
import type {
	SessionInspectionResult,
	SessionStartPreferences,
} from "@/server/opencode/session-manager";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { roleRepo } from "@/server/repositories/role";
import { projectRepo } from "@/server/repositories/project";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskLinkRepo } from "@/server/repositories/task-link";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import {
	getTaskStateMachine,
	type TaskTransitionInput,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import { publishSseEvent } from "@/server/events/sse-broker";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import { QueueManager } from "@/server/run/queue-manager";
import { RunExecutor } from "@/server/run/run-executor";
import { RunReconciler } from "@/server/run/run-reconciler";
import { RetryManager } from "@/server/run/retry-manager";
import {
	createServices,
	type RqmContext,
} from "@/server/run/runs-queue-manager.factory";
import type { QueuedRunInput, QueueStats } from "@/server/run/runs-queue-types";
import type { TaskPriority } from "@/types/kanban";
import type { Run, RunStatus } from "@/types/ipc";
import type { Task } from "@/server/types";
import { isNetworkError } from "@/server/run/run-session-interpreter";
import { RunFinalizer, type RunOutcome } from "@/server/run/run-finalizer";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import { PostRunWorkflowService } from "@/server/run/post-run-workflow-service";
import { RunReconciliationService } from "@/server/run/run-reconciliation-service";
import { ExecutionBootstrapService } from "@/server/run/execution-bootstrap-service";
import { TaskStatusProjectionService } from "@/server/run/task-status-projection-service";
import { RunLiveSubscriptionService } from "@/server/run/run-live-subscription-service";

const generationRunKind = "task-description-improve";
const storyChatRunKind = "task-story-chat";
export type { QueueStats } from "@/server/run/runs-queue-types";
const dependencyReadyStatus = "done";

const runPriorityScore: Record<TaskPriority, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
};

const log = createLogger("runs-queue");
export { isNetworkError };

export function getRunErrorText(run: Run): string {
	const errorText = run.metadata?.errorText;
	if (typeof errorText !== "string") {
		return "";
	}

	return errorText.trim();
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

function pickString(
	object: Record<string, unknown> | null,
	keys: readonly string[],
): string | null {
	if (!object) {
		return null;
	}

	for (const key of keys) {
		const value = object[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

function normalizeProviderPart(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9:_./-]/g, "");

	return normalized.length > 0 ? normalized : null;
}

function buildProviderKey(roleId: string, presetJson: string | null): string {
	if (!presetJson || presetJson.trim().length === 0) {
		return `role:${roleId}`;
	}

	try {
		const parsed = JSON.parse(presetJson) as unknown;
		const root = asObject(parsed);
		const model = asObject(root?.model);
		const llm = asObject(root?.llm);

		const provider = normalizeProviderPart(
			pickString(root, [
				"provider",
				"modelProvider",
				"model_provider",
				"llmProvider",
			]) ??
				pickString(model, ["provider", "vendor"]) ??
				pickString(llm, ["provider", "vendor"]),
		);

		const modelName = normalizeProviderPart(
			pickString(root, ["model", "modelName", "model_name"]) ??
				pickString(model, ["name", "id", "model", "modelName"]),
		);

		if (provider && modelName) {
			return `${provider}:${modelName}`;
		}
		if (provider) {
			return provider;
		}
		if (modelName) {
			return `model:${modelName}`;
		}
	} catch {
		return `role:${roleId}`;
	}

	return `role:${roleId}`;
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
	if (!input) {
		return fallback;
	}

	const parsed = Number.parseInt(input, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function parseProviderConcurrencyConfig(
	raw: string | undefined,
): Map<string, number> {
	const result = new Map<string, number>();
	if (!raw || raw.trim().length === 0) {
		return result;
	}

	const entries = raw.split(",").map((entry) => entry.trim());
	for (const entry of entries) {
		if (!entry) {
			continue;
		}

		const separator = entry.indexOf("=");
		if (separator <= 0 || separator >= entry.length - 1) {
			continue;
		}

		const rawKey = entry.slice(0, separator).trim();
		const rawValue = entry.slice(separator + 1).trim();
		const key = normalizeProviderPart(rawKey);
		const value = parsePositiveInt(rawValue, 0);

		if (key && value > 0) {
			result.set(key, value);
		}
	}

	return result;
}

export class RunsQueueManager {
	private readonly queueManager = new QueueManager();
	private readonly runInputs = new Map<string, QueuedRunInput>();
	private readonly activeRunSessions = new Map<string, string>();
	private readonly opencodeService = getOpencodeService();
	private readonly sessionManager = getOpencodeSessionManager();
	private readonly stateMachine = getTaskStateMachine();
	private readonly vcsManager = getVcsManager();
	private readonly retryManager = new RetryManager();
	private readonly runReconciler: RunReconciler;
	private readonly runExecutor: RunExecutor;
	private readonly runFinalizer: RunFinalizer;
	private readonly runInteractionCoordinator: RunInteractionCoordinator;
	private readonly runReconciliationService: RunReconciliationService;
	private readonly executionBootstrapService: ExecutionBootstrapService;
	private readonly postRunWorkflowService: PostRunWorkflowService;
	private readonly taskStatusProjectionService: TaskStatusProjectionService;
	private readonly runLiveSubscriptionService: RunLiveSubscriptionService;
	private readonly defaultConcurrency = parsePositiveInt(
		process.env.RUNS_DEFAULT_CONCURRENCY,
		1,
	);
	private readonly generationDefaultConcurrency = parsePositiveInt(
		process.env.GENERATION_DEFAULT_CONCURRENCY,
		5,
	);
	private readonly providerConcurrency = parseProviderConcurrencyConfig(
		process.env.RUNS_PROVIDER_CONCURRENCY,
	);
	private readonly blockedRetryDelayMs = parsePositiveInt(
		process.env.RUNS_BLOCKED_RETRY_MS,
		5000,
	);
	private readonly maxRetryCount = parsePositiveInt(
		process.env.RUNS_MAX_RETRY_COUNT,
		3,
	);
	private readonly retryBaseDelayMs = parsePositiveInt(
		process.env.RUNS_RETRY_BASE_DELAY_MS,
		5000,
	);
	private readonly worktreeEnabled =
		process.env.RUNS_WORKTREE_ENABLED === "true";
	private draining = false;
	private readonly staleRunThresholdMs = 10 * 60 * 1000;
	private readonly manualStatusGraceMs = 15_000;
	private recoveryTimer: ReturnType<typeof setInterval> | null = null;
	private readonly recoveryIntervalMs = 30_000;
	private readonly recoveryStaleThresholdMs = 60_000;
	private startupPromise: Promise<void> | null = null;
	private startupCompleted = false;

	public constructor() {
		const services = createServices(this as unknown as RqmContext);
		this.runFinalizer = services.runFinalizer;
		this.runInteractionCoordinator = services.runInteractionCoordinator;
		this.runReconciliationService = services.runReconciliationService;
		this.executionBootstrapService = services.executionBootstrapService;
		this.postRunWorkflowService = services.postRunWorkflowService;
		this.taskStatusProjectionService = services.taskStatusProjectionService;
		this.runReconciler = services.runReconciler;
		this.runExecutor = services.runExecutor;
		this.runLiveSubscriptionService = services.runLiveSubscriptionService;

		queueMicrotask(() => {
			void this.ensureBootstrapped();
		});
	}

	private applyTaskTransition(
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
		hasSessionExisted: boolean = true,
	): void {
		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		const board =
			typeof boardRepo.getById === "function"
				? boardRepo.getById(task.boardId)
				: boardRepo.getByProjectId(task.projectId);
		if (!board) {
			return;
		}

		const input: TaskTransitionInput & {
			task: TaskTransitionInput["task"] & { tags: string };
		} = {
			task: {
				id: task.id,
				boardId: task.boardId,
				status: task.status,
				columnId: task.columnId,
				tags: task.tags,
			},
			board,
			trigger,
			runKind: run.metadata?.kind ?? null,
			outcomeContent,
			hasSessionExisted,
			isManualStatusGracePeriod: false,
		};

		const result = this.stateMachine.transition(input);
		if (result.action !== "update") {
			return;
		}

		taskRepo.update(task.id, result.patch);
		for (const effect of result.effects) {
			if (effect.type === "publishSse") {
				publishSseEvent("task:event", {
					taskId: task.id,
					boardId: task.boardId,
					projectId: effect.projectId,
					updatedAt: new Date().toISOString(),
				});
			}
		}
	}

	private extractSessionPreferencesFromPreset(
		presetJson: string | null | undefined,
	): SessionStartPreferences | undefined {
		if (!presetJson || presetJson.trim().length === 0) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(presetJson) as Record<string, unknown>;
			const nestedModel =
				typeof parsed.model === "object" && parsed.model
					? (parsed.model as Record<string, unknown>)
					: null;
			const nestedLlm =
				typeof parsed.llm === "object" && parsed.llm
					? (parsed.llm as Record<string, unknown>)
					: null;

			const rawModelName =
				(typeof parsed.modelName === "string" && parsed.modelName.trim()) ||
				(typeof parsed.model === "string" && parsed.model.trim()) ||
				(typeof nestedModel?.name === "string" && nestedModel.name.trim()) ||
				(typeof nestedModel?.id === "string" && nestedModel.id.trim()) ||
				undefined;

			const rawProvider =
				(typeof parsed.provider === "string" && parsed.provider.trim()) ||
				(typeof nestedModel?.provider === "string" &&
					nestedModel.provider.trim()) ||
				undefined;

			const explicitVariant =
				(typeof parsed.modelVariant === "string" &&
					parsed.modelVariant.trim()) ||
				(typeof parsed.variant === "string" && parsed.variant.trim()) ||
				(typeof nestedModel?.variant === "string" &&
					nestedModel.variant.trim()) ||
				undefined;

			const [modelWithoutVariant, modelVariantFromName] = rawModelName
				? rawModelName.split("#", 2)
				: [undefined, undefined];

			const normalizedModelName = modelWithoutVariant?.trim() || undefined;
			const preferredModelName = normalizedModelName
				? normalizedModelName.includes("/")
					? normalizedModelName
					: rawProvider
						? `${rawProvider}/${normalizedModelName}`
						: normalizedModelName
				: undefined;
			const preferredModelVariant =
				explicitVariant || modelVariantFromName?.trim() || undefined;

			const preferredLlmAgent =
				(typeof parsed.agent === "string" && parsed.agent.trim()) ||
				(typeof parsed.llmAgent === "string" && parsed.llmAgent.trim()) ||
				(typeof nestedLlm?.agent === "string" && nestedLlm.agent.trim()) ||
				undefined;

			if (!preferredModelName && !preferredModelVariant && !preferredLlmAgent) {
				return undefined;
			}

			return {
				preferredModelName,
				preferredModelVariant,
				preferredLlmAgent,
			};
		} catch {
			return undefined;
		}
	}

	public enqueue(runId: string, input: QueuedRunInput): void {
		if (this.queueManager.hasRun(runId)) {
			log.warn("Run already queued", { runId });
			return;
		}

		const providerKey = this.resolveProviderKey(runId);
		const projectScope = input.projectId ?? input.projectPath;
		const currentRun = runRepo.getById(runId);
		const isGeneration = currentRun ? this.isGenerationRun(currentRun) : false;
		const isInteractiveBucket = currentRun
			? this.isInteractiveRunBucket(currentRun)
			: false;
		const queueKey = this.queueManager.buildQueueKey(
			projectScope,
			providerKey,
			isInteractiveBucket,
		);

		this.runInputs.set(runId, input);
		this.queueManager.enqueue(runId, queueKey, {
			projectScope,
			providerKey,
			isGeneration: isInteractiveBucket,
		});
		if (currentRun && !isGeneration && !this.isStoryChatRun(currentRun)) {
			this.applyTaskTransition(currentRun, "run:start", "");
		}
		log.info("Run enqueued", {
			runId,
			projectScope,
			providerKey,
			projectPath: input.projectPath,
			isGeneration,
			isInteractiveBucket,
		});
		this.scheduleDrain();
	}

	public async cancel(runId: string): Promise<void> {
		log.info("Cancelling run", { runId });
		this.clearRetryTimer(runId);
		this.removeFromQueue(runId);

		const run = runRepo.getById(runId);
		if (!run) {
			log.warn("Run not found for cancel", { runId });
			return;
		}

		if (run.sessionId) {
			try {
				log.debug("Aborting OpenCode session", {
					runId,
					sessionId: run.sessionId,
				});
				await this.sessionManager.abortSession(run.sessionId);
			} catch (error) {
				log.error("Failed to abort OpenCode session during cancel", {
					runId,
					sessionId: run.sessionId,
					error,
				});
			}
		}

		const finishedAt = new Date().toISOString();
		let cancelled = runRepo.update(runId, {
			status: "cancelled",
			finishedAt,
			errorText: "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});
		cancelled = await this.runFinalizer.syncRunWorkspaceState(cancelled);

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "cancelled", message: "Run cancelled" },
		});
		publishRunUpdate(cancelled);
		this.applyTaskTransition(cancelled, "run:cancelled", "");

		this.activeRunSessions.delete(runId);
		void this.runLiveSubscriptionService.unsubscribe(runId);
	}

	public restoreActiveRunSubscriptions(): Promise<void> {
		return this.runLiveSubscriptionService.restoreActiveRunSubscriptions();
	}

	private startRecoveryLoop(): void {
		if (this.recoveryTimer) {
			return;
		}
		this.recoveryTimer = setInterval(() => {
			void this.runRecoveryPass();
		}, this.recoveryIntervalMs);
		log.info("Started active run recovery loop", {
			intervalMs: this.recoveryIntervalMs,
		});
	}

	private async runRecoveryPass(): Promise<void> {
		const activeRuns =
			this.runReconciliationService.listActiveRunsForReconciliation();
		const candidates = activeRuns.filter((run) => {
			const sessionId = run.sessionId?.trim();
			if (!sessionId) return false;

			const lastEventAt = this.runLiveSubscriptionService.getLastEventAt(
				run.id,
			);
			if (
				lastEventAt !== null &&
				Date.now() - lastEventAt < this.recoveryStaleThresholdMs
			) {
				return false;
			}

			return true;
		});

		if (candidates.length === 0) {
			return;
		}

		log.info("Recovery pass found candidates", {
			count: candidates.length,
		});

		for (const run of candidates) {
			try {
				await this.runReconciliationService.reconcileRun(run.id);
			} catch (error) {
				log.error("Recovery pass failed for run", {
					runId: run.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	public stopRecoveryLoop(): void {
		if (this.recoveryTimer) {
			clearInterval(this.recoveryTimer);
			this.recoveryTimer = null;
			log.info("Stopped active run recovery loop");
		}
	}

	public ensureBootstrapped(): Promise<void> {
		if (this.startupCompleted) {
			return Promise.resolve();
		}
		if (!this.startupPromise) {
			this.startupPromise = this.bootstrapRuntimeState()
				.then(() => {
					this.startupCompleted = true;
				})
				.finally(() => {
					this.startupPromise = null;
				});
		}
		return this.startupPromise;
	}

	private async bootstrapRuntimeState(): Promise<void> {
		try {
			log.info("startup bootstrap started");

			// B2: Start OpenCode service first
			await this.opencodeService.start();
			log.info("startup opencode service ready");

			// Restore active run subscriptions from DB
			await this.runLiveSubscriptionService.restoreActiveRunSubscriptions();
			log.info("startup active run subscriptions restored");

			const aliveSessions = await this.sessionManager.listAliveSessions();
			log.info("startup sessions discovered", {
				count: aliveSessions.length,
			});

			if (aliveSessions.length > 0) {
				const activeRuns =
					this.runReconciliationService.listActiveRunsForReconciliation();
				const recoverableFailedRuns = runRepo
					.listByStatus("failed")
					.filter((run) => {
						return (
							run.sessionId.trim().length > 0 &&
							getRunErrorText(run).toLowerCase() === "fetch failed"
						);
					});
				const relevantRuns = [...activeRuns, ...recoverableFailedRuns];
				const runsBySessionId = new Map<string, Run>();
				for (const run of relevantRuns) {
					const sid = run.sessionId?.trim();
					if (sid) {
						runsBySessionId.set(sid, run);
					}
				}

				let matchedCount = 0;
				let orphanCount = 0;
				for (const session of aliveSessions) {
					const matchedRun = runsBySessionId.get(session.sessionId);
					if (matchedRun) {
						await this.runLiveSubscriptionService.ensureSubscribed(
							matchedRun.id,
							session.sessionId,
						);
						matchedCount++;
					} else {
						orphanCount++;
						log.warn("startup orphan session found", {
							sessionId: session.sessionId,
							status: session.status,
							directory: session.directory,
						});
					}
				}
				log.info("startup session matching finished", {
					matchedCount,
					orphanCount,
				});
			}

			const projects = projectRepo.getAll();
			for (const project of projects) {
				await this.runReconciler.pollProjectRuns(project.id);
			}
			log.info("startup project reconciliation finished", {
				projectCount: projects.length,
			});

			// Start recovery loop ONLY after bootstrap completes
			this.startRecoveryLoop();
			log.info("startup recovery loop started");

			log.info("startup bootstrap completed");
		} catch (error) {
			log.error("startup bootstrap failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	public getQueueStats(): QueueStats {
		return this.queueManager.getQueueStats((providerKey, isGeneration) =>
			this.resolveProviderConcurrency(providerKey, isGeneration),
		);
	}

	private scheduleDrain(): void {
		if (this.draining) {
			return;
		}

		this.draining = true;
		queueMicrotask(() => {
			void this.drainQueue();
		});
	}

	private async drainQueue(): Promise<void> {
		this.draining = false;
		let progressed = true;

		while (progressed) {
			progressed = false;

			this.queueManager.forEachQueue((queueKey, queue) => {
				const meta = this.queueManager.getQueueMeta(queueKey);
				if (!meta) {
					return;
				}

				const running = this.queueManager.ensureRunning(queueKey);
				const concurrency = this.resolveProviderConcurrency(
					meta.providerKey,
					meta.isGeneration,
				);

				while (running.size < concurrency) {
					const runId = this.selectNextRunnableRun(queue);
					if (!runId) {
						this.queueManager.cleanupQueueState(queueKey);
						break;
					}

					running.add(runId);
					progressed = true;

					void this.executeRun(runId);
				}
			});
		}

		if (!progressed && this.queueManager.hasQueuedRuns()) {
			this.scheduleBlockedRetry();
		}
	}

	private async executeRun(runId: string): Promise<void> {
		await this.runExecutor.executeRun(runId);
	}

	private onRunExecutionCompleted(runId: string): void {
		this.queueManager.completeRun(runId);

		const pendingGeneratedTaskId =
			this.runFinalizer.consumePendingGeneratedExecutionTaskId(runId);
		if (pendingGeneratedTaskId) {
			queueMicrotask(() => {
				void this.executionBootstrapService.enqueueExecutionForGeneratedTask(
					pendingGeneratedTaskId,
				);
			});
		}

		this.scheduleDrain();
	}

	private scheduleRetryAfterNetworkError(
		runId: string,
		errorMessage: string,
	): boolean {
		const run = runRepo.getById(runId);
		if (!run) {
			return false;
		}

		if (run.sessionId?.trim()) {
			return false;
		}

		const currentRetryCount =
			typeof run.metadata?._retryCount === "number" &&
			Number.isFinite(run.metadata._retryCount)
				? run.metadata._retryCount
				: 0;
		if (currentRetryCount >= this.maxRetryCount) {
			return false;
		}

		const retryCount = currentRetryCount + 1;
		const delayMs = this.retryBaseDelayMs * Math.pow(2, currentRetryCount);
		const queuedRun = runRepo.update(runId, {
			status: "queued",
			startedAt: null,
			finishedAt: null,
			errorText: "",
			metadata: {
				...run.metadata,
				_retryCount: retryCount,
				_lastRetryError: errorMessage,
			},
		});
		publishRunUpdate(queuedRun);

		log.info("Scheduling retry for run after network error", {
			runId,
			retryCount,
			delayMs,
		});
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: {
				status: "queued",
				message: `Retrying after network error (attempt ${retryCount} of ${this.maxRetryCount})`,
			},
		});

		this.activeRunSessions.delete(runId);

		this.retryManager.setRunRetryTimer(runId, delayMs, () => {
			// Re-read from DB to guard against cancellation during the delay
			const current = runRepo.getById(runId);
			if (!current || current.status !== "queued") {
				return;
			}
			const input = this.runInputs.get(runId);
			if (input) {
				this.enqueue(runId, input);
			}
		});

		return true;
	}

	private async finalizeRunFromSession(
		runId: string,
		status: RunStatus,
		outcome: RunOutcome,
	): Promise<void> {
		await this.runFinalizer.finalizeRunFromSession(runId, status, outcome);
	}

	public async pollProjectRuns(projectId: string): Promise<void> {
		await this.runReconciler.pollProjectRuns(projectId);
	}

	private async applyInspectionResult(
		run: Run,
		sessionId: string,
		inspection: SessionInspectionResult,
	): Promise<void> {
		await this.runReconciliationService.applyInspectionResult(
			run,
			sessionId,
			inspection,
		);
	}

	private async failRunDuringReconciliation(
		run: Run,
		errorText: string,
		assistantContent: string,
	): Promise<void> {
		await this.runReconciliationService.failRunDuringReconciliation(
			run,
			errorText,
			assistantContent,
		);
	}

	private selectNextRunnableRun(queue: string[]): string | null {
		return this.queueManager.selectNextRunnableRun(
			queue,
			(runId) => {
				const run = runRepo.getById(runId);
				return run ? this.canRunNow(run) : false;
			},
			(runId) => {
				const run = runRepo.getById(runId);
				return run
					? this.resolveRunPriorityScore(run)
					: Number.NEGATIVE_INFINITY;
			},
			(runId) => {
				const run = runRepo.getById(runId);
				if (!run) {
					return Number.POSITIVE_INFINITY;
				}
				const createdAtMs = Date.parse(run.createdAt);
				return Number.isFinite(createdAtMs)
					? createdAtMs
					: Number.POSITIVE_INFINITY;
			},
			(runId) => {
				this.runInputs.delete(runId);
			},
		);
	}

	private canRunNow(run: Run): boolean {
		if (this.isGenerationRun(run) || this.isStoryChatRun(run)) {
			return true;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return true;
		}

		if (task.priority === "postpone") {
			return false;
		}

		return this.areDependenciesResolved(task.id);
	}

	private areDependenciesResolved(taskId: string): boolean {
		const links = taskLinkRepo.listByTaskId(taskId);
		const blockers = links.filter(
			(link) => link.linkType === "blocks" && link.toTaskId === taskId,
		);
		for (const blocker of blockers) {
			const blockerTask = taskRepo.getById(blocker.fromTaskId);
			if (!blockerTask) {
				continue;
			}

			if (blockerTask.status !== dependencyReadyStatus) {
				return false;
			}
		}

		return true;
	}

	private resolveRunPriorityScore(run: Run): number {
		if (this.isGenerationRun(run) || this.isStoryChatRun(run)) {
			return Number.MAX_SAFE_INTEGER;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return runPriorityScore.normal;
		}

		switch (task.priority) {
			case "postpone":
				return runPriorityScore.postpone;
			case "low":
				return runPriorityScore.low;
			case "normal":
				return runPriorityScore.normal;
			case "urgent":
				return runPriorityScore.urgent;
			default:
				return runPriorityScore.normal;
		}
	}

	private scheduleBlockedRetry(): void {
		this.retryManager.scheduleBlockedRetry(this.blockedRetryDelayMs, () => {
			this.scheduleDrain();
		});
	}

	public pickNextReadyTask(boardId: string): Task | null {
		return this.postRunWorkflowService.pickNextReadyTask(boardId);
	}

	public async startNextReadyTaskAfterMerge(
		mergedTaskId: string,
	): Promise<void> {
		await this.postRunWorkflowService.startNextReadyTaskAfterMerge(
			mergedTaskId,
		);
	}

	private isGenerationRun(run: Run): boolean {
		return run.metadata?.kind === generationRunKind;
	}

	private isStoryChatRun(run: Run): boolean {
		return run.metadata?.kind === storyChatRunKind;
	}

	private isInteractiveRunBucket(run: Run): boolean {
		return this.isGenerationRun(run) || this.isStoryChatRun(run);
	}

	private shouldAutoExecuteAfterGeneration(): boolean {
		return process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION === "1";
	}

	private async enqueueExecutionForGeneratedTask(
		taskId: string,
	): Promise<void> {
		await this.executionBootstrapService.enqueueExecutionForGeneratedTask(
			taskId,
		);
	}

	private transitionTaskToInProgress(task: Task): void {
		this.executionBootstrapService.transitionTaskToInProgress(task);
	}

	private listAllTaskRuns(taskId: string): Run[] {
		return this.executionBootstrapService.listAllTaskRuns(taskId);
	}

	private async resumeRejectedTaskRun(task: Task): Promise<boolean> {
		return this.executionBootstrapService.resumeRejectedTaskRun(task);
	}

	private async enqueueExecutionForNextTask(taskId: string): Promise<void> {
		await this.executionBootstrapService.enqueueExecutionForNextTask(taskId);
	}

	private toSessionPreferences(
		role:
			| {
					preferred_model_name?: string | null;
					preferred_model_variant?: string | null;
					preferred_llm_agent?: string | null;
			  }
			| null
			| undefined,
		presetJson?: string | null,
	): ReturnType<ExecutionBootstrapService["toSessionPreferences"]> {
		return this.executionBootstrapService.toSessionPreferences(
			role,
			presetJson,
		);
	}

	private getActiveTaskRunForTask(taskId: string): Run | null {
		return this.executionBootstrapService.getActiveTaskRunForTask(taskId);
	}

	private prepareTaskRunForTask(input: {
		taskId: string;
		roleId: string;
		mode: string;
		kind: string;
		contextSnapshotId: string;
	}): Run {
		return this.executionBootstrapService.prepareTaskRunForTask(input);
	}

	private getCurrentTaskRun(taskId: string): Run | null {
		return this.executionBootstrapService.getCurrentTaskRun(taskId);
	}

	private deleteRunHistory(runId: string): void {
		this.executionBootstrapService.deleteRunHistory(runId);
	}

	private parseTaskTags(rawTags: unknown): string[] {
		return this.executionBootstrapService.parseTaskTags(rawTags);
	}

	private resolveAssignedRoleIdFromTags(tags: string[]): string | null {
		return this.executionBootstrapService.resolveAssignedRoleIdFromTags(tags);
	}

	private parseRolePreset(
		rawPreset: string | null,
	): ReturnType<ExecutionBootstrapService["parseRolePreset"]> {
		return this.executionBootstrapService.parseRolePreset(rawPreset);
	}

	private async tryFinalizeFromSessionSnapshot(
		runId: string,
		sessionId: string,
	): Promise<void> {
		await this.runReconciliationService.tryFinalizeFromSessionSnapshot(
			runId,
			sessionId,
		);
	}

	private clearRetryTimer(runId: string): void {
		this.retryManager.clearRunRetryTimer(runId);
	}

	private removeFromQueue(runId: string): void {
		this.queueManager.removeRun(runId);
		this.runInputs.delete(runId);
		this.clearRetryTimer(runId);
	}

	private resolveProviderKey(runId: string): string {
		const run = runRepo.getById(runId);
		if (!run) {
			return "default";
		}

		const roleId = run.roleId ?? "default";
		const presetJson = roleRepo.getPresetJson(roleId);
		return buildProviderKey(roleId, presetJson);
	}

	private resolveProviderConcurrency(
		providerKey: string,
		isGeneration: boolean = false,
	): number {
		if (isGeneration) {
			return this.generationDefaultConcurrency;
		}

		const configured = this.providerConcurrency.get(providerKey);
		if (configured && configured > 0) {
			return configured;
		}

		return this.defaultConcurrency;
	}

	private durationSec(startedAt: string, finishedAt: string): number {
		const startMs = Date.parse(startedAt);
		const endMs = Date.parse(finishedAt);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
			return 0;
		}
		return Math.max(0, Math.round((endMs - startMs) / 1000));
	}

	private tryFillTaskModelFromSession(
		taskId: string,
		inspection: SessionInspectionResult,
	): void {
		const task = taskRepo.getById(taskId);
		if (!task || (task.modelName && task.modelName.trim().length > 0)) {
			return;
		}

		const assistantMsg = inspection.messages.find(
			(msg) =>
				msg.role === "assistant" &&
				msg.modelID &&
				msg.modelID.trim().length > 0 &&
				msg.providerID &&
				msg.providerID.trim().length > 0,
		);
		if (!assistantMsg) {
			return;
		}

		const modelName = `${assistantMsg.providerID}/${assistantMsg.modelID}`;
		const fullModelName = assistantMsg.variant
			? `${modelName}#${assistantMsg.variant}`
			: modelName;

		taskRepo.update(taskId, { modelName: fullModelName });
		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: new Date().toISOString(),
		});
		log.info("Auto-filled task model from session", {
			taskId,
			modelName: fullModelName,
		});
	}
}

let runsQueueManager: RunsQueueManager | null = null;

export function getRunsQueueManager(): RunsQueueManager {
	if (!runsQueueManager) {
		runsQueueManager = new RunsQueueManager();
	}

	return runsQueueManager;
}
