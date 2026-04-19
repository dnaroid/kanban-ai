import { createLogger } from "@/lib/logger";
import { buildOpencodeStatusLine } from "@/lib/opencode-status";
import { buildTaskPrompt } from "@/server/run/prompts/task";
import type {
	SessionInspectionResult,
	SessionStartPreferences,
} from "@/server/opencode/session-manager";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { artifactRepo } from "@/server/repositories/artifact";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import type { AgentRolePreset } from "@/server/repositories/role";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskLinkRepo } from "@/server/repositories/task-link";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import {
	getWorkflowColumnIdBySystemKey,
	getWorkflowColumnSystemKey,
	getTaskStateMachine,
	type TaskTransitionInput,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { publishSseEvent } from "@/server/events/sse-broker";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import { QueueManager } from "@/server/run/queue-manager";
import { RunExecutor } from "@/server/run/run-executor";
import { RunReconciler } from "@/server/run/run-reconciler";
import { PollingService } from "@/server/run/polling-service";
import { RetryManager } from "@/server/run/retry-manager";
import type { QueuedRunInput, QueueStats } from "@/server/run/runs-queue-types";
import type { TaskPriority } from "@/types/kanban";
import type { Run, RunStatus } from "@/types/ipc";
import type { PollableBoardContext, Task } from "@/server/types";
import {
	deriveMetaStatus,
	findStoryContent,
	hydrateGenerationOutcomeContent,
	isNetworkError,
	toRunLastExecutionStatus,
	type RunOutcomeMarker,
} from "@/server/run/run-session-interpreter";
import { RunFinalizer, type RunOutcome } from "@/server/run/run-finalizer";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import { PostRunWorkflowService } from "@/server/run/post-run-workflow-service";

const generationRunKind = "task-description-improve";
export type { QueueStats } from "@/server/run/runs-queue-types";
const agentRoleTagPrefix = "agent:";
const dependencyReadyStatus = "done";

const runPriorityScore: Record<TaskPriority, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
};

const log = createLogger("runs-queue");
export { isNetworkError };

function getRunErrorText(run: Run): string {
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
	private readonly pollingService: PollingService;
	private readonly runReconciler: RunReconciler;
	private readonly runExecutor: RunExecutor;
	private readonly runFinalizer: RunFinalizer;
	private readonly runInteractionCoordinator: RunInteractionCoordinator;
	private readonly postRunWorkflowService: PostRunWorkflowService;
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
	private readonly projectPollingIntervalMs = 5_000;
	private readonly projectBoardWatcherTtlMs = 15_000;
	private readonly staleRunThresholdMs = 10 * 60 * 1000;
	private readonly manualStatusGraceMs = 15_000;

	public constructor() {
		this.runFinalizer = new RunFinalizer({
			getRunById: (runId) => runRepo.getById(runId),
			updateRun: (runId, patch) => runRepo.update(runId, patch),
			createStatusEvent: (runId, status, message) => {
				runEventRepo.create({
					runId,
					eventType: "status",
					payload: { status, message },
				});
			},
			publishRunUpdate: (run) => {
				publishRunUpdate(run);
			},
			syncRunWorkspaceState: async (run) => {
				const vcsMetadata = await this.vcsManager.syncRunWorkspace(run);
				if (!vcsMetadata) {
					return run;
				}

				return runRepo.update(run.id, {
					metadata: {
						...(run.metadata ?? {}),
						vcs: vcsMetadata,
					},
				});
			},
			applyTaskTransition: (run, trigger, outcomeContent) => {
				this.applyTaskTransition(run, trigger, outcomeContent);
			},
			shouldAutoExecuteAfterGeneration: () =>
				this.shouldAutoExecuteAfterGeneration(),
			tryAutomaticMerge: async (run) =>
				this.postRunWorkflowService.tryAutomaticMerge(run),
			startNextReadyTaskAfterMerge: async (taskId) =>
				this.startNextReadyTaskAfterMerge(taskId),
			isGenerationRun: (run) => this.isGenerationRun(run),
			hydrateGenerationOutcomeContent: async (run, content) =>
				hydrateGenerationOutcomeContent(
					run,
					content,
					this.sessionManager,
					generationRunKind,
				),
			getDurationSec: (startedAt, finishedAt) =>
				this.durationSec(startedAt, finishedAt),
			clearSessionTracking: (runId) => {
				this.activeRunSessions.delete(runId);
			},
			clearRunInput: (runId) => {
				this.runInputs.delete(runId);
			},
			getRunErrorText,
		});

		this.runInteractionCoordinator = new RunInteractionCoordinator({
			getRunById: (runId) => runRepo.getById(runId),
			updateRun: (runId, patch) => runRepo.update(runId, patch),
			createRunEvent: (runId, eventType, payload) => {
				runEventRepo.create({ runId, eventType, payload });
			},
			listRunEvents: (runId, limit) => runEventRepo.listByRun(runId, limit),
			applyTaskTransition: (run, trigger, outcomeContent) => {
				this.applyTaskTransition(run, trigger, outcomeContent);
			},
			listPendingPermissions: async (sessionId) =>
				this.sessionManager.listPendingPermissions(sessionId),
			listPendingQuestions: async (sessionId) =>
				this.sessionManager.listPendingQuestions(sessionId),
			setActiveRunSession: (runId, sessionId) => {
				this.activeRunSessions.set(runId, sessionId);
			},
		});

		this.postRunWorkflowService = new PostRunWorkflowService({
			mergeRunWorkspace: async (run, mode) =>
				this.vcsManager.mergeRunWorkspace(run, mode),
			cleanupRunWorkspace: async (vcsMetadata) =>
				this.vcsManager.cleanupRunWorkspace(vcsMetadata),
			syncVcsMetadata: async (vcsMetadata) =>
				this.vcsManager.syncVcsMetadata(vcsMetadata),
			syncRunWorkspace: async (run) => this.vcsManager.syncRunWorkspace(run),
			updateRun: (runId, patch) => runRepo.update(runId, patch),
			createRunStatusEvent: (runId, payload) => {
				runEventRepo.create({ runId, eventType: "status", payload });
			},
			getTaskById: (taskId) => taskRepo.getById(taskId),
			getBoardById: (boardId) => boardRepo.getById(boardId),
			listTasksByBoard: (boardId) => taskRepo.listByBoard(boardId),
			listRunsByTask: (taskId) => runRepo.listByTask(taskId),
			isGenerationRun: (run) => this.isGenerationRun(run),
			areDependenciesResolved: (taskId) => this.areDependenciesResolved(taskId),
			resumeRejectedTaskRun: async (task) => this.resumeRejectedTaskRun(task),
			enqueueExecutionForNextTask: async (taskId) =>
				this.enqueueExecutionForNextTask(taskId),
		});

		this.pollingService = new PollingService({
			pollingIntervalMs: this.projectPollingIntervalMs,
			watcherTtlMs: this.projectBoardWatcherTtlMs,
			onPollProjectRuns: async (projectId) => {
				await this.pollProjectRuns(projectId);
			},
		});
		this.runReconciler = new RunReconciler({
			getPollableBoardContext: (projectId) =>
				this.getPollableBoardContext(projectId),
			listActiveRunsForReconciliation: () =>
				this.listActiveRunsForReconciliation(),
			listRecoverableRunsForProject: (taskIds) =>
				this.listRecoverableRunsForProject(taskIds),
			reconcileTaskStatuses: async (projectId, board, tasks) =>
				this.reconcileTaskStatuses(projectId, board, tasks),
			reconcileRun: async (runId) => {
				await this.reconcileRun(runId);
			},
		});
		this.runExecutor = new RunExecutor({
			opencodeService: this.opencodeService,
			sessionManager: this.sessionManager,
			runInputs: this.runInputs,
			activeRunSessions: this.activeRunSessions,
			isGenerationRun: (run) => this.isGenerationRun(run),
			applyTaskTransition: (run, trigger, outcomeContent) => {
				this.applyTaskTransition(run, trigger, outcomeContent);
			},
			tryFinalizeFromSessionSnapshot: async (runId, sessionId) => {
				await this.tryFinalizeFromSessionSnapshot(runId, sessionId);
			},
			scheduleRetryAfterNetworkError: (runId, errorMessage) =>
				this.scheduleRetryAfterNetworkError(runId, errorMessage),
			syncRunWorkspaceState: async (run) =>
				this.runFinalizer.syncRunWorkspaceState(run),
			isNetworkError,
			durationSec: (startedAt, finishedAt) =>
				this.durationSec(startedAt, finishedAt),
			onComplete: (runId) => this.onRunExecutionCompleted(runId),
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
		const queueKey = this.queueManager.buildQueueKey(
			projectScope,
			providerKey,
			isGeneration,
		);

		this.runInputs.set(runId, input);
		this.queueManager.enqueue(runId, queueKey, {
			projectScope,
			providerKey,
			isGeneration,
		});
		if (currentRun && !isGeneration) {
			this.applyTaskTransition(currentRun, "run:start", "");
		}
		log.info("Run enqueued", {
			runId,
			projectScope,
			providerKey,
			projectPath: input.projectPath,
			isGeneration,
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
				void this.enqueueExecutionForGeneratedTask(pendingGeneratedTaskId);
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

	public startProjectBoardPolling(projectId: string, viewerId: string): void {
		this.pollingService.startProjectBoardPolling(projectId, viewerId);
	}

	public stopProjectBoardPolling(projectId: string, viewerId: string): void {
		this.pollingService.stopProjectBoardPolling(projectId, viewerId);
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

	private listRecoverableRunsForProject(taskIds: Set<string>): Run[] {
		return runRepo
			.listByStatus("failed")
			.filter(
				(run) =>
					taskIds.has(run.taskId) &&
					run.sessionId.trim().length > 0 &&
					getRunErrorText(run).toLowerCase() === "fetch failed",
			);
	}

	private getPollableBoardContext(
		projectId: string,
	): PollableBoardContext | null {
		const board = boardRepo.getByProjectId(projectId);
		if (!board) {
			log.warn("Skipping task status reconciliation; board not found", {
				projectId,
			});
			return null;
		}

		const allTasks = taskRepo.listByBoard(board.id);
		const tasks = allTasks.filter((task) => {
			const columnKey = getWorkflowColumnSystemKey(board, task.columnId);
			return columnKey !== "deferred" && columnKey !== "closed";
		});

		return {
			board,
			allTaskIds: new Set(allTasks.map((task) => task.id)),
			tasks,
			taskIds: new Set(tasks.map((task) => task.id)),
		};
	}

	private async reconcileTaskStatuses(
		projectId: string,
		board: PollableBoardContext["board"],
		tasks: PollableBoardContext["tasks"],
	): Promise<void> {
		for (const task of tasks) {
			const timeSinceUpdate = Date.now() - Date.parse(task.updatedAt);
			if (timeSinceUpdate < this.manualStatusGraceMs) {
				continue;
			}

			const runs = [...runRepo.listByTask(task.id)].sort(
				(a, b) =>
					Date.parse(b.updatedAt ?? b.createdAt) -
					Date.parse(a.updatedAt ?? a.createdAt),
			);
			const activeRuns = runs.filter(
				(run) =>
					run.status === "queued" ||
					run.status === "running" ||
					run.status === "paused",
			);

			if (activeRuns.length > 0) {
				const nonStaleActiveRunExists = activeRuns.some(
					(run) => !this.isRunStale(run),
				);
				if (nonStaleActiveRunExists) {
					this.reconcileTaskWithActiveRuns(
						task,
						activeRuns.filter((run) => !this.isRunStale(run)),
					);
					continue;
				}

				for (const activeRun of activeRuns) {
					if (!this.isRunStale(activeRun)) {
						continue;
					}

					log.info(
						"Attempting to finalize stale run during task reconciliation",
						{
							projectId,
							taskId: task.id,
							runId: activeRun.id,
							runStatus: activeRun.status,
							startedAt: activeRun.startedAt,
						},
					);

					await this.reconcileStaleRun(activeRun, projectId, task.id);
				}
				continue;
			}

			const latestSettledRun = runs.find(
				(run) => run.status === "completed" || run.status === "failed",
			);
			if (!latestSettledRun) {
				if (
					task.status !== "running" &&
					task.status !== "generating" &&
					task.status !== "paused" &&
					task.status !== "question"
				) {
					continue;
				}

				log.info("Skipping stale task reconciliation without settled run", {
					projectId,
					taskId: task.id,
					status: task.status,
					columnId: task.columnId,
					columnKey: getWorkflowColumnSystemKey(board, task.columnId),
				});
				continue;
			}

			let derivedMarker: RunOutcomeMarker | null = null;
			let derivedContent = "";
			let source: "session" | "fallback" = "fallback";

			if (latestSettledRun.status === "completed") {
				const sessionId = latestSettledRun.sessionId.trim();
				if (sessionId.length > 0) {
					try {
						const inspection =
							await this.sessionManager.inspectSession(sessionId);
						const meta = deriveMetaStatus(inspection);

						if (meta.kind === "completed" || meta.kind === "failed") {
							derivedMarker = meta.marker;
							derivedContent = await this.runFinalizer.hydrateOutcomeContent(
								latestSettledRun,
								meta.content,
							);
							source = "session";
						} else {
							log.warn(
								"Task status reconciliation inspection did not yield a terminal marker",
								{
									projectId,
									taskId: task.id,
									runId: latestSettledRun.id,
									sessionId,
									inspectionKind: meta.kind,
								},
							);
						}
					} catch (error) {
						log.warn(
							"Failed to inspect session during task status reconciliation",
							{
								projectId,
								taskId: task.id,
								runId: latestSettledRun.id,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						);
					}
				}

				if (!derivedMarker) {
					derivedMarker =
						this.runFinalizer.staleRunFallbackMarker(latestSettledRun);
				}
			} else if (latestSettledRun.status === "failed") {
				const sessionId = latestSettledRun.sessionId.trim();
				const errorIsRecoverable =
					isNetworkError(getRunErrorText(latestSettledRun)) &&
					sessionId.length > 0;

				if (errorIsRecoverable) {
					try {
						const inspection =
							await this.sessionManager.inspectSession(sessionId);
						const meta = deriveMetaStatus(inspection);

						if (meta.kind === "completed" || meta.kind === "failed") {
							derivedMarker = meta.marker;
							derivedContent = meta.content;
							source = "session";
						} else {
							log.info(
								"Skipping task failure projection; recoverable failed run is still non-terminal",
								{
									projectId,
									taskId: task.id,
									runId: latestSettledRun.id,
									sessionId,
									inspectionKind: meta.kind,
								},
							);
							continue;
						}
					} catch (error) {
						log.warn(
							"Failed to inspect session for recoverable failed run during task reconciliation",
							{
								projectId,
								taskId: task.id,
								runId: latestSettledRun.id,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						);
						continue;
					}
				} else {
					derivedMarker = "fail";
				}
			}

			if (!derivedMarker) {
				continue;
			}

			try {
				const trigger = this.runFinalizer.resolveTriggerFromOutcome(
					latestSettledRun,
					latestSettledRun.status,
					{
						marker: derivedMarker,
						content: derivedContent,
					},
				);
				if (!trigger) {
					continue;
				}
				this.applyTaskTransition(latestSettledRun, trigger, derivedContent);
				log.info("Reconciled task status from latest settled run", {
					projectId,
					taskId: task.id,
					fromStatus: task.status,
					runId: latestSettledRun.id,
					runStatus: latestSettledRun.status,
					runKind: latestSettledRun.metadata?.kind ?? null,
					marker: derivedMarker,
					source,
				});
			} catch (error) {
				log.error("Failed to reconcile task status from latest settled run", {
					projectId,
					taskId: task.id,
					runId: latestSettledRun.id,
					marker: derivedMarker,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	private reconcileTaskWithActiveRuns(task: Task, activeRuns: Run[]): void {
		const runningRun = activeRuns.find((run) => run.status === "running");
		if (runningRun) {
			const nextStatus = this.isGenerationRun(runningRun)
				? "generating"
				: "running";
			if (task.status !== nextStatus) {
				this.applyTaskTransition(
					runningRun,
					this.isGenerationRun(runningRun) ? "generate:start" : "run:start",
					"",
				);
			}
			return;
		}

		const pausedRun = activeRuns.find((run) => run.status === "paused");
		if (pausedRun && task.status !== "question") {
			this.applyTaskTransition(
				pausedRun,
				"run:question",
				"Run paused awaiting input",
			);
		}
	}

	private isRunStale(run: Run): boolean {
		if (run.status !== "running") {
			return false;
		}

		const startedAt = run.startedAt ?? run.updatedAt ?? run.createdAt;
		const elapsedMs = Date.now() - Date.parse(startedAt);
		return elapsedMs > this.staleRunThresholdMs;
	}

	private async reconcileStaleRun(
		run: Run,
		projectId: string,
		taskId: string,
	): Promise<void> {
		const sessionId = run.sessionId.trim();
		if (sessionId.length === 0) {
			log.warn("Cannot reconcile stale run; no session ID", {
				projectId,
				taskId,
				runId: run.id,
			});
			return;
		}

		try {
			const inspection = await this.sessionManager.inspectSession(sessionId);
			if (inspection.probeStatus !== "alive") {
				log.warn(
					"Skipping stale run finalization; session probe is not confirmed alive",
					{
						projectId,
						taskId,
						runId: run.id,
						probeStatus: inspection.probeStatus,
					},
				);
				return;
			}
			const meta = deriveMetaStatus(inspection);

			if (meta.kind === "completed" || meta.kind === "failed") {
				const runStatus =
					meta.kind === "completed"
						? ("completed" as RunStatus)
						: ("failed" as RunStatus);
				await this.finalizeRunFromSession(run.id, runStatus, {
					marker: meta.marker,
					content: meta.content,
				});
				log.info("Finalized stale run during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
					runStatus,
					marker: meta.marker,
				});
				return;
			}

			if (meta.kind === "dead") {
				await this.failRunDuringReconciliation(
					run,
					"Session not found for stale run",
					"Session expired",
				);
				log.info("Failed stale run (session dead) during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
				});
				return;
			}

			log.info(
				"Stale run session alive but no completion marker; force-finalizing",
				{
					projectId,
					taskId,
					runId: run.id,
					inspectionKind: meta.kind,
					runKind: run.metadata?.kind ?? null,
				},
			);

			const fallbackMarker = this.runFinalizer.staleRunFallbackMarker(run);
			const fallbackContent = findStoryContent(inspection);
			await this.finalizeRunFromSession(run.id, "completed" as RunStatus, {
				marker: fallbackMarker,
				content: fallbackContent,
			});
			log.info("Force-finalized stale run with fallback marker", {
				projectId,
				taskId,
				runId: run.id,
				marker: fallbackMarker,
			});
		} catch (error) {
			log.error("Failed to reconcile stale run", {
				projectId,
				taskId,
				runId: run.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private listActiveRunsForReconciliation(): Run[] {
		const listByStatuses = (
			runRepo as { listByStatuses?: (statuses: string[]) => Run[] }
		).listByStatuses;
		if (typeof listByStatuses === "function") {
			return listByStatuses.call(runRepo, ["queued", "running", "paused"]);
		}

		return [
			...runRepo.listByStatus("queued"),
			...runRepo.listByStatus("running"),
			...runRepo.listByStatus("paused"),
		].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
	}

	private async reconcileRun(runId: string): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run) {
			return;
		}

		const isRecoverableFailedRun =
			run.status === "failed" &&
			run.sessionId.trim().length > 0 &&
			getRunErrorText(run).toLowerCase() === "fetch failed";

		if (
			run.status !== "queued" &&
			run.status !== "running" &&
			run.status !== "paused" &&
			!isRecoverableFailedRun
		) {
			return;
		}

		const sessionId = run.sessionId.trim();
		if (run.status === "queued" && sessionId.length === 0) {
			const runInput = this.runInputs.get(run.id);
			if (!runInput) {
				log.warn("Failing queued run; input lost during reconciliation", {
					runId: run.id,
				});
				await this.failRunDuringReconciliation(
					run,
					"Run input lost on restart",
					"Run input lost on restart",
				);
				return;
			}

			log.info("Re-enqueueing queued run during reconciliation", {
				runId: run.id,
				projectId: runInput.projectId,
				projectPath: runInput.projectPath,
			});
			this.enqueue(run.id, runInput);
			return;
		}

		if (sessionId.length === 0) {
			log.warn("Skipping reconciliation for active run without session", {
				runId: run.id,
				status: run.status,
			});
			return;
		}

		log.info("Inspecting run session during reconciliation", {
			runId: run.id,
			status: run.status,
			sessionId,
		});
		const inspection = await this.sessionManager.inspectSession(sessionId);
		await this.applyInspectionResult(run, sessionId, inspection);
	}

	private async applyInspectionResult(
		run: Run,
		sessionId: string,
		inspection: SessionInspectionResult,
	): Promise<void> {
		const meta = deriveMetaStatus(inspection);
		const observedRun = runRepo.update(run.id, {
			metadata: {
				...(run.metadata ?? {}),
				lastExecutionStatus: toRunLastExecutionStatus(meta, sessionId),
			},
		});

		if (!this.isGenerationRun(run)) {
			this.tryFillTaskModelFromSession(run.taskId, inspection);
		}

		switch (meta.kind) {
			case "completed":
			case "failed": {
				const runStatus =
					meta.kind === "completed"
						? ("completed" as RunStatus)
						: ("failed" as RunStatus);
				await this.finalizeRunFromSession(observedRun.id, runStatus, {
					marker: meta.marker,
					content: meta.content,
				});
				return;
			}
			case "dead":
				await this.failRunDuringReconciliation(
					observedRun,
					"Session not found during reconciliation",
					"Session not found",
				);
				return;
			case "running":
				break;
			case "permission": {
				const nextRun =
					this.runInteractionCoordinator.ensureRunPausedForPermission(
						observedRun,
						meta.permission,
					);
				this.runInteractionCoordinator.attachReconciledSession(
					nextRun.id,
					sessionId,
				);
				return;
			}
			case "question": {
				const nextRun =
					this.runInteractionCoordinator.ensureRunPausedForQuestion(
						observedRun,
						meta.questions[0],
					);
				this.runInteractionCoordinator.attachReconciledSession(
					nextRun.id,
					sessionId,
				);
				return;
			}
		}

		if (
			observedRun.status === "running" &&
			this.isRunStale(observedRun) &&
			inspection.probeStatus === "alive"
		) {
			const fallbackMarker =
				this.runFinalizer.staleRunFallbackMarker(observedRun);
			await this.finalizeRunFromSession(observedRun.id, "completed", {
				marker: fallbackMarker,
				content: "",
			});
			log.info("Force-finalized stale running run during reconciliation", {
				runId: observedRun.id,
				sessionId,
				marker: fallbackMarker,
				runKind: observedRun.metadata?.kind ?? null,
			});
			return;
		}

		if (observedRun.status === "paused") {
			await this.runInteractionCoordinator.reconcilePausedRun(
				observedRun.id,
				sessionId,
			);
			this.runInteractionCoordinator.attachReconciledSession(
				observedRun.id,
				sessionId,
			);
			return;
		}

		if (observedRun.status === "queued") {
			const startedAt = run.startedAt ?? new Date().toISOString();
			const resumedRun = runRepo.update(observedRun.id, {
				status: "running",
				startedAt,
				errorText: "",
				metadata: {
					...(observedRun.metadata ?? {}),
					lastExecutionStatus: {
						kind: "running",
						sessionId,
						updatedAt: startedAt,
					},
				},
			});
			runEventRepo.create({
				runId: observedRun.id,
				eventType: "status",
				payload: {
					status: "running",
					message: "Run resumed during reconciliation",
				},
			});
			publishRunUpdate(resumedRun);
			this.applyTaskTransition(
				resumedRun,
				"run:answer",
				"Run resumed during reconciliation",
			);
			log.info("Reattached queued run as running during reconciliation", {
				runId: observedRun.id,
				sessionId,
			});
			this.runInteractionCoordinator.attachReconciledSession(
				resumedRun.id,
				sessionId,
			);
			return;
		}

		log.info("Reattached active run during reconciliation", {
			runId: observedRun.id,
			sessionId,
			status: observedRun.status,
		});
		this.runInteractionCoordinator.attachReconciledSession(
			observedRun.id,
			sessionId,
		);
	}

	private async failRunDuringReconciliation(
		run: Run,
		errorText: string,
		assistantContent: string,
	): Promise<void> {
		const finishedAt = new Date().toISOString();
		let failedRun = runRepo.update(run.id, {
			status: "failed",
			finishedAt,
			errorText,
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
			metadata: {
				...(run.metadata ?? {}),
				lastExecutionStatus: {
					kind: "failed",
					content: assistantContent,
					sessionId: run.sessionId.trim() || undefined,
					updatedAt: finishedAt,
				},
			},
		});
		failedRun = await this.runFinalizer.syncRunWorkspaceState(failedRun);

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: {
				status: "failed",
				message: errorText,
			},
		});
		publishRunUpdate(failedRun);
		this.applyTaskTransition(
			failedRun,
			this.isGenerationRun(failedRun) ? "generate:fail" : "run:fail",
			assistantContent,
		);

		this.activeRunSessions.delete(run.id);
		this.removeFromQueue(run.id);
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
		if (this.isGenerationRun(run)) {
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
		if (this.isGenerationRun(run)) {
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

	private shouldAutoExecuteAfterGeneration(): boolean {
		return process.env.RUNS_AUTO_EXECUTE_AFTER_GENERATION === "1";
	}

	private async enqueueExecutionForGeneratedTask(
		taskId: string,
	): Promise<void> {
		const task = taskRepo.getById(taskId);
		if (!task) {
			log.warn("Skipping execution enqueue after generation; task not found", {
				taskId,
			});
			return;
		}

		if (task.priority === "postpone") {
			log.info("Skipping execution enqueue for postponed task", {
				taskId,
			});
			return;
		}

		const activeExecutionRun = this.getActiveTaskRunForTask(task.id);
		if (activeExecutionRun) {
			log.info("Execution run already active for task", {
				taskId: task.id,
				runId: activeExecutionRun.id,
				status: activeExecutionRun.status,
			});
			return;
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.warn("Skipping execution enqueue; project not found", {
				taskId: task.id,
				projectId: task.projectId,
			});
			return;
		}

		const availableRoles = roleRepo.listWithPresets();
		const taskTags = this.parseTaskTags(task.tags);
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(taskTags);
		const roleId = assignedRoleId ?? availableRoles[0]?.id;
		if (!roleId) {
			log.warn("Skipping execution enqueue; no roles configured", {
				taskId: task.id,
			});
			return;
		}

		const selectedRole =
			availableRoles.find((role) => role.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Execution queued after BA story generation for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: "execute",
				roleId,
				reason: "generated-story-ready",
			},
		});

		const executionRun = this.prepareTaskRunForTask({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: "task-run",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: executionRun.id,
			eventType: "status",
			payload: {
				status: executionRun.status,
				message: "Execution run queued after BA story generation",
			},
		});
		publishRunUpdate(executionRun);

		let queuedExecutionRun = executionRun;
		let executionProjectPath = project.path;
		if (this.worktreeEnabled) {
			try {
				const vcsMetadata = await this.vcsManager.provisionRunWorkspace({
					projectPath: project.path,
					runId: executionRun.id,
					taskId: task.id,
					taskTitle: task.title,
				});
				queuedExecutionRun = runRepo.update(executionRun.id, {
					metadata: {
						...(executionRun.metadata ?? {}),
						vcs: vcsMetadata,
					},
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: queuedExecutionRun.status,
						message: `Worktree ready: ${vcsMetadata.branchName}`,
						worktreePath: vcsMetadata.worktreePath,
					},
				});
				publishRunUpdate(queuedExecutionRun);
				executionProjectPath = vcsMetadata.worktreePath;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to provision git worktree";
				const failedRun = runRepo.update(executionRun.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: message,
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: "failed",
						message,
					},
				});
				publishRunUpdate(failedRun);
				return;
			}
		}

		this.enqueue(queuedExecutionRun.id, {
			projectPath: executionProjectPath,
			projectId: project.id,
			sessionTitle: task.title.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: executionProjectPath,
				},
				{
					id: roleId,
					name: selectedRole?.name ?? roleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			),
		});
	}

	private transitionTaskToInProgress(task: Task): void {
		const board =
			boardRepo.getById(task.boardId) ??
			boardRepo.getByProjectId(task.projectId);

		if (board) {
			const inProgressColumnId = getWorkflowColumnIdBySystemKey(
				board,
				"in_progress",
			);
			if (inProgressColumnId) {
				const existingInColumn = taskRepo
					.listByBoard(board.id)
					.filter((item) => item.columnId === inProgressColumnId).length;
				taskRepo.update(task.id, {
					status: "running",
					columnId: inProgressColumnId,
					orderInColumn: existingInColumn,
				});
			} else {
				taskRepo.update(task.id, { status: "running" });
			}
		} else {
			taskRepo.update(task.id, { status: "running" });
		}

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: new Date().toISOString(),
		});
	}

	private listAllTaskRuns(taskId: string): Run[] {
		const repository = runRepo as typeof runRepo & {
			listAllByTask?: (taskId: string) => Run[];
		};

		if (typeof repository.listAllByTask === "function") {
			return repository.listAllByTask(taskId);
		}

		return repository.listByTask(taskId);
	}

	private isExecutionRun(run: Run): boolean {
		return (run.metadata?.kind ?? "task-run") === "task-run";
	}

	private async resumeRejectedTaskRun(task: Task): Promise<boolean> {
		if (task.status !== "rejected" || !task.qaReport) {
			return false;
		}

		const completedRun = this.listAllTaskRuns(task.id).find(
			(run) =>
				this.isExecutionRun(run) &&
				run.status === "completed" &&
				typeof run.sessionId === "string" &&
				run.sessionId.trim().length > 0,
		);
		if (!completedRun?.sessionId) {
			return false;
		}

		const board =
			boardRepo.getById(task.boardId) ??
			boardRepo.getByProjectId(task.projectId);
		if (!board) {
			return false;
		}

		const qaMessage = [
			"",
			"This task did not pass QA review. Reasons:",
			task.qaReport,
			"",
			"Fix ALL issues listed above. Do NOT skip any item.",
			"",
			`When done, output exactly one status line: ${buildOpencodeStatusLine("done")} or ${buildOpencodeStatusLine("fail")} or ${buildOpencodeStatusLine("question")}`,
		].join("\n");

		await this.sessionManager.sendPrompt(completedRun.sessionId, qaMessage);

		const resumedAt = new Date().toISOString();
		const resumedRun = runRepo.update(completedRun.id, {
			status: "running",
			startedAt: resumedAt,
			finishedAt: null,
			errorText: "",
			metadata: {
				...(completedRun.metadata ?? {}),
				lastExecutionStatus: {
					kind: "running",
					sessionId: completedRun.sessionId,
					updatedAt: resumedAt,
				},
			},
		});

		const inProgressColumnId = getWorkflowColumnIdBySystemKey(
			board,
			"in_progress",
		);
		if (inProgressColumnId) {
			const existingInColumn = taskRepo
				.listByBoard(board.id)
				.filter((item) => item.columnId === inProgressColumnId).length;
			taskRepo.update(task.id, {
				status: "running",
				columnId: inProgressColumnId,
				orderInColumn: existingInColumn,
				qaReport: null,
			});
		} else {
			taskRepo.update(task.id, {
				status: "running",
				qaReport: null,
			});
		}

		runEventRepo.create({
			runId: resumedRun.id,
			eventType: "status",
			payload: {
				status: "running",
				message: "Execution run resumed after QA rejection",
			},
		});
		publishRunUpdate(resumedRun);
		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:updated",
			updatedAt: resumedAt,
		});

		return true;
	}

	private async enqueueExecutionForNextTask(taskId: string): Promise<void> {
		const task = taskRepo.getById(taskId);
		if (!task) {
			log.warn("enqueueExecutionForNextTask: task not found", { taskId });
			return;
		}

		if (task.priority === "postpone") {
			log.info("enqueueExecutionForNextTask: skipping postponed task", {
				taskId,
			});
			return;
		}

		const activeExecutionRun = this.getActiveTaskRunForTask(task.id);
		if (activeExecutionRun) {
			log.info("enqueueExecutionForNextTask: execution run already active", {
				taskId: task.id,
				runId: activeExecutionRun.id,
				status: activeExecutionRun.status,
			});
			return;
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			log.warn("enqueueExecutionForNextTask: project not found", {
				taskId: task.id,
				projectId: task.projectId,
			});
			return;
		}

		const availableRoles = roleRepo.listWithPresets();
		const taskTags = this.parseTaskTags(task.tags);
		const assignedRoleId = this.resolveAssignedRoleIdFromTags(taskTags);
		const roleId = assignedRoleId ?? availableRoles[0]?.id;
		if (!roleId) {
			log.warn("enqueueExecutionForNextTask: no roles configured", {
				taskId: task.id,
			});
			return;
		}

		const selectedRole =
			availableRoles.find((role) => role.id === roleId) ?? null;
		const selectedRolePreset = this.parseRolePreset(
			roleRepo.getPresetJson(roleId),
		);

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Auto-started after merge for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: "execute",
				roleId,
				reason: "auto-start-after-merge",
			},
		});

		const executionRun = this.prepareTaskRunForTask({
			taskId: task.id,
			roleId,
			mode: "execute",
			kind: "task-run",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: executionRun.id,
			eventType: "status",
			payload: {
				status: executionRun.status,
				message: "Execution run auto-started after previous task merge",
			},
		});
		publishRunUpdate(executionRun);

		let queuedExecutionRun = executionRun;
		let executionProjectPath = project.path;
		if (this.worktreeEnabled) {
			try {
				const vcsMetadata = await this.vcsManager.provisionRunWorkspace({
					projectPath: project.path,
					runId: executionRun.id,
					taskId: task.id,
					taskTitle: task.title,
				});
				queuedExecutionRun = runRepo.update(executionRun.id, {
					metadata: {
						...(executionRun.metadata ?? {}),
						vcs: vcsMetadata,
					},
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: queuedExecutionRun.status,
						message: `Worktree ready: ${vcsMetadata.branchName}`,
						worktreePath: vcsMetadata.worktreePath,
					},
				});
				publishRunUpdate(queuedExecutionRun);
				executionProjectPath = vcsMetadata.worktreePath;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to provision git worktree";
				const failedRun = runRepo.update(executionRun.id, {
					status: "failed",
					finishedAt: new Date().toISOString(),
					errorText: message,
				});
				runEventRepo.create({
					runId: executionRun.id,
					eventType: "status",
					payload: {
						status: "failed",
						message,
					},
				});
				publishRunUpdate(failedRun);
				return;
			}
		}

		this.transitionTaskToInProgress(task);

		this.enqueue(queuedExecutionRun.id, {
			projectPath: executionProjectPath,
			projectId: project.id,
			sessionTitle: task.title.slice(0, 120),
			sessionPreferences: this.toSessionPreferences(
				selectedRole,
				selectedRole?.preset_json,
			),
			prompt: buildTaskPrompt(
				{ title: task.title, description: task.description },
				{
					id: project.id,
					path: executionProjectPath,
				},
				{
					id: roleId,
					name: selectedRole?.name ?? roleId,
					systemPrompt: selectedRolePreset?.systemPrompt,
					skills: selectedRolePreset?.skills,
				},
			),
		});
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
	): SessionStartPreferences | undefined {
		const fromPreset = this.extractSessionPreferencesFromPreset(presetJson);

		const modelName =
			role?.preferred_model_name?.trim() || fromPreset?.preferredModelName;
		const modelVariant =
			role?.preferred_model_variant?.trim() ||
			fromPreset?.preferredModelVariant;
		const llmAgent =
			role?.preferred_llm_agent?.trim() || fromPreset?.preferredLlmAgent;

		if (!modelName && !modelVariant && !llmAgent) {
			return undefined;
		}

		return {
			preferredModelName: modelName,
			preferredModelVariant: modelVariant,
			preferredLlmAgent: llmAgent,
		};
	}

	private getActiveTaskRunForTask(taskId: string): Run | null {
		const run = this.getCurrentTaskRun(taskId);
		if (!run) {
			return null;
		}

		return run.status === "queued" ||
			run.status === "running" ||
			run.status === "paused"
			? run
			: null;
	}

	private prepareTaskRunForTask(input: {
		taskId: string;
		roleId: string;
		mode: string;
		kind: string;
		contextSnapshotId: string;
	}): Run {
		const existingRuns = this.listAllTaskRuns(input.taskId);
		const currentRun = existingRuns[0] ?? null;

		if (!currentRun) {
			return runRepo.create({
				taskId: input.taskId,
				roleId: input.roleId,
				mode: input.mode,
				kind: input.kind,
				contextSnapshotId: input.contextSnapshotId,
				metadata: {},
			});
		}

		this.deleteRunHistory(currentRun.id);

		const resetRun = runRepo.update(currentRun.id, {
			status: "queued",
			sessionId: "",
			startedAt: null,
			finishedAt: null,
			errorText: "",
			mode: input.mode,
			roleId: input.roleId,
			kind: input.kind,
			budget: {},
			tokensIn: 0,
			tokensOut: 0,
			costUsd: 0,
			durationSec: 0,
			metadata: {},
		});

		for (const run of existingRuns.slice(1)) {
			this.deleteRunHistory(run.id);
			runRepo.delete(run.id);
		}

		const repository = runRepo as {
			deleteAllExceptTaskRun?: (taskId: string, keepRunId: string) => void;
		};
		repository.deleteAllExceptTaskRun?.(input.taskId, resetRun.id);
		return resetRun;
	}

	private getCurrentTaskRun(taskId: string): Run | null {
		const repository = runRepo as {
			getByTask?: (taskId: string) => Run | null;
			listByTask: (taskId: string) => Run[];
		};

		if (typeof repository.getByTask === "function") {
			return repository.getByTask(taskId);
		}

		return repository.listByTask(taskId)[0] ?? null;
	}

	private deleteRunHistory(runId: string): void {
		const eventRepository = runEventRepo as {
			deleteByRun?: (runId: string) => void;
		};
		const artifactsRepository = artifactRepo as {
			deleteByRun?: (runId: string) => void;
		};

		eventRepository.deleteByRun?.(runId);
		artifactsRepository.deleteByRun?.(runId);
	}

	private parseTaskTags(rawTags: unknown): string[] {
		if (typeof rawTags !== "string" || rawTags.trim().length === 0) {
			return [];
		}

		try {
			const parsed = JSON.parse(rawTags) as unknown;
			if (!Array.isArray(parsed)) {
				return [];
			}

			return parsed
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
		} catch {
			return [];
		}
	}

	private resolveAssignedRoleIdFromTags(tags: string[]): string | null {
		const roleTag = tags.find((tag) =>
			tag.toLowerCase().startsWith(agentRoleTagPrefix),
		);
		if (!roleTag) {
			return null;
		}

		const roleId = roleTag.slice(agentRoleTagPrefix.length).trim();
		if (roleId.length === 0) {
			return null;
		}

		if (!roleRepo.list().some((role) => role.id === roleId)) {
			return null;
		}

		return roleId;
	}

	private parseRolePreset(rawPreset: string | null): AgentRolePreset | null {
		if (!rawPreset) {
			return null;
		}

		try {
			const parsed = JSON.parse(rawPreset) as Partial<AgentRolePreset>;
			return {
				version: parsed.version ?? "1.0",
				provider: parsed.provider ?? "",
				modelName: parsed.modelName ?? "",
				skills: Array.isArray(parsed.skills)
					? parsed.skills.filter(
							(skill): skill is string => typeof skill === "string",
						)
					: [],
				systemPrompt:
					typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "",
				mustDo: Array.isArray(parsed.mustDo)
					? parsed.mustDo.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
				outputContract: Array.isArray(parsed.outputContract)
					? parsed.outputContract.filter(
							(item): item is string => typeof item === "string",
						)
					: [],
			};
		} catch {
			return null;
		}
	}

	private async tryFinalizeFromSessionSnapshot(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run || (run.status !== "running" && run.status !== "queued")) {
			return;
		}

		const inspection = await this.sessionManager.inspectSession(sessionId);
		const meta = deriveMetaStatus(inspection);

		if (meta.kind === "completed" || meta.kind === "failed") {
			const runStatus =
				meta.kind === "completed"
					? ("completed" as RunStatus)
					: ("failed" as RunStatus);
			await this.finalizeRunFromSession(runId, runStatus, {
				marker: meta.marker,
				content: meta.content,
			});
		}
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
