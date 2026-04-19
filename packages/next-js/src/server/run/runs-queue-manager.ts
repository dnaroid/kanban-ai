import { createLogger } from "@/lib/logger";
import type {
	SessionInspectionResult,
	SessionStartPreferences,
} from "@/server/opencode/session-manager";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskLinkRepo } from "@/server/repositories/task-link";
import { taskRepo } from "@/server/repositories/task";
import { boardRepo } from "@/server/repositories/board";
import {
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
	hydrateGenerationOutcomeContent,
	isNetworkError,
	type RunOutcomeMarker,
} from "@/server/run/run-session-interpreter";
import { RunFinalizer, type RunOutcome } from "@/server/run/run-finalizer";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import { PostRunWorkflowService } from "@/server/run/post-run-workflow-service";
import { RunReconciliationService } from "@/server/run/run-reconciliation-service";
import { ExecutionBootstrapService } from "@/server/run/execution-bootstrap-service";

const generationRunKind = "task-description-improve";
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
	private readonly runReconciliationService: RunReconciliationService;
	private readonly executionBootstrapService: ExecutionBootstrapService;
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

		this.runReconciliationService = new RunReconciliationService({
			sessionManager: this.sessionManager,
			runInteractionCoordinator: this.runInteractionCoordinator,
			runInputs: this.runInputs,
			isGenerationRun: (run) => this.isGenerationRun(run),
			finalizeRunFromSession: async (runId, status, outcome) =>
				this.finalizeRunFromSession(runId, status, outcome),
			runFinalizer: {
				staleRunFallbackMarker: (run) =>
					this.runFinalizer.staleRunFallbackMarker(run),
				syncRunWorkspaceState: async (run) =>
					this.runFinalizer.syncRunWorkspaceState(run),
			},
			applyTaskTransition: (run, trigger, outcomeContent) =>
				this.applyTaskTransition(run, trigger, outcomeContent),
			enqueue: (runId, input) => this.enqueue(runId, input),
			removeFromQueue: (runId) => this.removeFromQueue(runId),
			clearActiveRunSession: (runId) => {
				this.activeRunSessions.delete(runId);
			},
			tryFillTaskModelFromSession: (taskId, inspection) =>
				this.tryFillTaskModelFromSession(taskId, inspection),
			durationSec: (startedAt, finishedAt) =>
				this.durationSec(startedAt, finishedAt),
			staleRunThresholdMs: this.staleRunThresholdMs,
			getRunErrorText,
		});

		this.executionBootstrapService = new ExecutionBootstrapService({
			worktreeEnabled: this.worktreeEnabled,
			enqueue: (runId, input) => this.enqueue(runId, input),
			provisionRunWorkspace: async (input) =>
				this.vcsManager.provisionRunWorkspace(input),
			sendPrompt: async (sessionId, prompt) =>
				this.sessionManager.sendPrompt(sessionId, prompt),
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
			resumeRejectedTaskRun: async (task) =>
				this.executionBootstrapService.resumeRejectedTaskRun(task),
			enqueueExecutionForNextTask: async (taskId) =>
				this.executionBootstrapService.enqueueExecutionForNextTask(taskId),
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
				this.runReconciliationService.listActiveRunsForReconciliation(),
			listRecoverableRunsForProject: (taskIds) =>
				this.listRecoverableRunsForProject(taskIds),
			reconcileTaskStatuses: async (projectId, board, tasks) =>
				this.reconcileTaskStatuses(projectId, board, tasks),
			reconcileRun: async (runId) => {
				await this.runReconciliationService.reconcileRun(runId);
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
				await this.runReconciliationService.tryFinalizeFromSessionSnapshot(
					runId,
					sessionId,
				);
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
		await this.runReconciliationService.reconcileStaleRun(
			run,
			projectId,
			taskId,
		);
	}

	private listActiveRunsForReconciliation(): Run[] {
		return this.runReconciliationService.listActiveRunsForReconciliation();
	}

	private async reconcileRun(runId: string): Promise<void> {
		await this.runReconciliationService.reconcileRun(runId);
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
